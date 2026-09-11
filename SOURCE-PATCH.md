# 架電記録消失バグ ソース側修正手順

**この対応が必要な理由**

2026-09-10 の緊急対応では、稼働中のソースが GitHub に無かったため
`gh-pages` のビルド成果物 (`assets/index-*.js`) を直接パッチして配信しました
（`tools/patch-bundle.js` に再現可能な形で残してあります）。

**手元のソースからそのまま `npm run build` して deploy すると、この修正は消えます。**
以下をローカルのソースに反映してから deploy してください。

---

## 前提：何が壊れていたか

本番DBの実測で、ステータスが「架電済／アポ確定」なのに `callHistory` が空の行が **447件**ありました。
原因は4つで、どれか1つを直しても止まりません。

| | 不具合 | 影響 |
|---|---|---|
| P1 | デバウンスの比較基準が送信前に進む | 1.5秒以内の連続操作で先の記録が送信されない |
| P2 | 起動時に全件 upsert | 毎起動で9,647行をクライアントのスナップショットで上書き |
| P3 | `.in()` が600件超で400。かつ `error` 未確認 | マージが無言で失敗し素の上書きに戻る |
| P4 | 失敗が `console.warn` のみ | 成功と失敗が見分けられず、再試行もされない |
| P5 | 離脱時のフラッシュが無い | 記録直後にタブを閉じると消える |

---

## 1. `src/lib/db.js`

### 1-1. teleapo_items の upsert（P3 / P4）

```js
const CHUNK = 200   // .in() は600件超で 400 Bad Request になる（実測値）

async function upsertTeleapoItems(items) {
  if (!supabase || !items.length) return

  // ── 既存の callHistory を取りに行く ──
  const ids = items.map(i => i.id)
  const existing = {}
  for (let k = 0; k < ids.length; k += CHUNK) {
    const { data, error } = await supabase
      .from('teleapo_items').select('id, data').in('id', ids.slice(k, k + CHUNK))
    // ここで error を握り潰すと「サーバーは空」と誤解して丸ごと上書きしてしまう
    if (error) throw new Error(`既存データの取得に失敗したため保存を中止しました: ${error.message}`)
    data.forEach(r => { existing[r.id] = r.data })
  }

  // ── マージ。重複判定はエントリの id を優先する ──
  //    date|caller だと、同じ人が同じ日に同じ会社へ2回架電したとき2件目が消える
  const keyOf = e => (e && e.id ? `#${e.id}` : `${e && e.date}|${e && e.caller}`)

  const rows = items.map(item => {
    const remote = existing[item.id]
    let history = item.callHistory || []
    if (remote?.callHistory?.length) {
      const seen = new Set(history.map(keyOf))
      for (const e of remote.callHistory) {
        if (!seen.has(keyOf(e))) { history = [...history, e]; seen.add(keyOf(e)) }
      }
      history = history.slice().sort((a, b) => String(a?.date).localeCompare(String(b?.date)))
    }
    return { id: item.id, data: { ...item, callHistory: history }, updated_at: new Date().toISOString() }
  })

  for (let k = 0; k < rows.length; k += CHUNK) {
    const { error } = await supabase.from('teleapo_items').upsert(rows.slice(k, k + CHUNK))
    // throw することで、呼び出し側（送信キュー）が再送できる
    if (error) throw new Error(`保存に失敗しました: ${error.message}`)
  }
}
```

### 1-2. delete も同様に（P3 / P4）

```js
async function deleteRows(table, ids) {
  if (!supabase || !ids.length) return
  for (let k = 0; k < ids.length; k += CHUNK) {
    const { error } = await supabase.from(table).delete().in('id', ids.slice(k, k + CHUNK))
    if (error) throw new Error(`削除に失敗しました: ${error.message}`)
  }
}
```

---

## 2. `src/lib/saveQueue.js`（新規）

送信キュー。**基準（baseline）を送信成功後にだけ進める**のが要点です。
ここが元の不具合の核心でした。

```js
export function createSaveQueue({ name, api, table, url, key }) {
  const q = {
    baseline: null,   // 最後に「送信に成功した」状態
    latest: null,     // 最新の state
    hot: new Set(),   // 架電履歴が増えた企業のid（離脱時に優先して送る）
    flushing: false, timer: null, dueAt: 0, fail: 0,
  }

  const emit = (state, d = {}) =>
    window.dispatchEvent(new CustomEvent('wt-save', { detail: { state, queue: name, ...d } }))

  function schedule(ms = 1500, force = false) {
    const due = Date.now() + ms
    if (q.timer) { if (!force || due >= q.dueAt) return; clearTimeout(q.timer) }
    q.dueAt = due
    q.timer = setTimeout(() => { q.timer = null; flush() }, ms)
  }

  // 重い JSON.stringify 比較はフラッシュ時に1回だけ（9,647件あるので毎回やると重い）
  function diff() {
    const base = q.baseline || [], cur = q.latest || []
    const bm = new Map(base.map(x => [x.id, x]))
    const changed = cur.filter(it => {
      const bf = bm.get(it.id)
      return !bf || JSON.stringify(bf) !== JSON.stringify(it)
    })
    const ids = new Set(cur.map(x => x.id))
    const dels = base.filter(x => !ids.has(x.id)).map(x => x.id)
    return { changed, dels, snapshot: cur }
  }

  async function flush() {
    if (q.flushing) { schedule(400, true); return }
    if (!q.latest) return
    const d = diff()
    if (!d.changed.length && !d.dels.length) { q.baseline = d.snapshot; q.hot.clear(); return }

    q.flushing = true
    emit('saving', { n: d.changed.length })
    try {
      if (d.changed.length) await api.upsert(d.changed)
      if (d.dels.length) await api.delete(d.dels)
      q.baseline = d.snapshot          // ★ 成功して初めて基準を進める
      q.hot.clear(); q.fail = 0
      emit('saved', { n: d.changed.length })
      if (q.latest !== d.snapshot) schedule(400, true)
    } catch (err) {
      q.fail++                         // ★ 基準を進めないので次回も同じ差分が再送される
      console.warn(`[wt-save:${name}] 保存に失敗、再試行します:`, err.message)
      emit('error', { msg: err.message, n: d.changed.length, fail: q.fail })
      schedule(Math.min(30000, 1500 * 2 ** Math.min(q.fail, 4)), true)
    } finally { q.flushing = false }
  }

  // 離脱時の最後の一押し。sendBeacon は apikey ヘッダを付けられないので fetch(keepalive)
  function flushSync() {
    if (!q.hot.size || !q.latest) return
    const byId = new Map(q.latest.map(x => [x.id, x]))
    const rows = [...q.hot].map(id => byId.get(id)).filter(Boolean)
      .map(x => ({ id: x.id, data: x, updated_at: new Date().toISOString() }))
    if (!rows.length) return
    const body = JSON.stringify(rows)
    if (body.length > 60000) return    // keepalive の上限は64KB
    fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST', keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${key}`,
                 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body,
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flush(); flushSync() }
  })
  window.addEventListener('pagehide', flushSync)
  window.addEventListener('beforeunload', ev => {
    if (q.baseline === q.latest) return
    flushSync()
    if (q.fail > 0) { ev.preventDefault(); ev.returnValue = '' }
  })

  // state が変わるたびに呼ぶ。ここでは件数比較しかしない（軽い）
  function enqueue(prev, next) {
    if (!q.baseline) q.baseline = prev
    q.latest = next
    const m = new Map(prev.map(x => [x.id, x]))
    let urgent = next.length < prev.length
    for (const it of next) {
      const bf = m.get(it.id)
      const a = (it.callHistory || []).length
      const b = (bf?.callHistory || []).length
      // 架電履歴が増えた＝「架電を記録」。人が押した一点物なので待たずに送る
      if (a > b || (!bf && a > 0)) { q.hot.add(it.id); urgent = true }
    }
    urgent ? schedule(0, true) : schedule(1500)
  }

  return { enqueue, flush, flushSync, state: q }
}
```

---

## 3. `src/App.jsx`

### 3-1. 保存 effect をキュー方式へ（P1 / P5）

```js
const teleapoQueue = useRef(null)
if (!teleapoQueue.current) teleapoQueue.current = createSaveQueue({
  name: 'teleapo', api: db.teleapoItems, table: 'teleapo_items',
  url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY,
})

useEffect(() => {
  if (!isSupabaseEnabled) return
  const prev = prevTeleapoRef.current
  prevTeleapoRef.current = teleapoItems
  if (!prev) return
  teleapoQueue.current.enqueue(prev, teleapoItems)
}, [teleapoItems])
```

提案リスト（`proposals`）もまったく同じ欠陥を持っているので、同様に置き換えてください。

### 3-2. 起動時の全件 upsert を止める（P2）

`doStartupSync` の中で、**state と同時に比較基準も更新**します。
これをやらないと、取得直後に全件が「変更あり」と判定されて丸ごと上書きされます。

```js
if (remoteProposals) {
  const merged = mergeById(prevProposalsRef.current ?? [], remoteProposals)
  prevProposalsRef.current = merged        // ★ 基準も同時に更新して差分をゼロにする
  setProposals(merged)
}
if (remoteTeleapo) {
  const merged = mergeById(prevTeleapoRef.current ?? [], remoteTeleapo)
  prevTeleapoRef.current = merged          // ★
  setTeleapoItems(merged)
}
```

### 3-3. 保存インジケータ（P4）

`wt-save` イベントを拾って「保存中／保存しました／保存できていません（再試行中）」を出します。
成功と失敗が見た目で同じだったことが、この不具合の発見を遅らせました。
配信中のバンドルには `tools/patch-bundle.js` の `INDICATOR` にある実装が入っています。

---

## 4. 検証

`tools/e2e.js` に、Supabase REST を全てモックした実ブラウザテストがあります（本番DBには触れません）。

```
node tools/e2e.js dist/assets/index-XXXX.js "確認"
SCENARIO=coldstart  node tools/e2e.js dist/assets/index-XXXX.js
SCENARIO=failretry  node tools/e2e.js dist/assets/index-XXXX.js
SCENARIO=unload     node tools/e2e.js dist/assets/index-XXXX.js
```

修正前後の結果（2026-09-10 実測）:

| シナリオ | 修正前 | 修正後 |
|---|---|---|
| 1.9秒で2社に連続記録 | アルファ商事が**消失** | 両方保存 |
| キャッシュ無しで起動 | 全件（本番9,647行）を上書き | 上書き0行 |
| 通信エラー2回 | **完全に消失** | 再試行して両方保存 |
| 記録直後に離脱 | **消失** | 即時送信で保存 |
| 9,647件での操作速度 | 5,917ms | 5,970ms（差なし） |

---

## 5. このあとやること

1. **`call_logs` テーブルへの二重書き**（`supabase/migrations/001_call_logs.sql`）
   架電履歴を INSERT だけのテーブルに切り出せば、行が競合しないので上書きも取りこぼしも原理的に起こらない。
2. **Realtime購読** — 開きっぱなしのタブが古いスナップショットを持ち続ける状態を無くす。
3. **localStorage の全件キャッシュを廃止** — 実測6.14MBで上限5MBを超えており、毎回保存に失敗している。
4. **RLSの見直し** — 現在、認証なしで9,647社の企業名・電話番号・商談メモが読み書きできる状態。
5. **稼働中のソースを `main` に push** — 今回、解析のために難読化されたバンドルを読む必要があった。
