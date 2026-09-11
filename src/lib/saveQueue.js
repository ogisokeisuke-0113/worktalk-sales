/**
 * Supabase への送信キュー
 *
 * これが無かったときに何が起きていたか:
 *
 *   const prev = prevRef.current
 *   prevRef.current = items      // ← 送信前にここで比較基準が進む
 *   const timer = setTimeout(送信, 1500)
 *   return () => clearTimeout(timer)   // ← 次の変更で問答無用にキャンセル
 *
 * 1.5秒以内に2回目の変更が来ると、1回目のタイマーはキャンセルされ、
 * 次に走るときの基準は「すでに1回目の変更を含んだ状態」になっている。
 * 結果、1回目は「変更なし」と判定されて二度と送られない。
 * テレアポの連続作業では日常的に踏み、実際に架電記録が447件消えた。
 *
 * このキューの要点は一つだけ:
 *   ★ 比較基準(baseline)は、送信に成功したときにだけ進める。
 */

const DEFAULT_DELAY = 1500

export function createSaveQueue({ name, api, table, url, key }) {
  const q = {
    name,
    baseline: null,   // 最後に「送信に成功した」状態
    latest: null,     // 最新の state
    hot: new Set(),   // 架電履歴が増えた企業のid（離脱時に優先して送る）
    flushing: false,
    timer: null,
    dueAt: 0,
    fail: 0,
  }

  const emit = (state, detail = {}) => {
    try {
      window.dispatchEvent(new CustomEvent('wt-save', { detail: { state, queue: name, ...detail } }))
    } catch { /* 画面が無い環境では何もしない */ }
  }

  function schedule(ms = DEFAULT_DELAY, force = false) {
    const due = Date.now() + ms
    if (q.timer) {
      if (!force || due >= q.dueAt) return
      clearTimeout(q.timer)
    }
    q.dueAt = due
    q.timer = setTimeout(() => { q.timer = null; flush() }, ms)
  }

  // 重い JSON.stringify 比較はフラッシュ時に1回だけ行う。
  // 9,647件あるので、state が変わるたびにやると描画が詰まる。
  function diff() {
    const base = q.baseline || []
    const cur = q.latest || []
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
    if (!d.changed.length && !d.dels.length) {
      q.baseline = d.snapshot
      q.hot.clear()
      return
    }

    q.flushing = true
    emit('saving', { n: d.changed.length })
    try {
      if (d.changed.length) await api.upsert(d.changed)
      if (d.dels.length) await api.delete(d.dels)

      // ★ 送信に成功して初めて基準を進める
      q.baseline = d.snapshot
      q.hot.clear()
      q.fail = 0
      emit('saved', { n: d.changed.length })

      // 送信中に更に変更が入っていたら続けて送る
      if (q.latest !== d.snapshot) schedule(400, true)
    } catch (err) {
      // 基準を進めないので、次のフラッシュでも同じ差分が再送される
      q.fail++
      const msg = (err && err.message) || ''
      // ログインしていない／セッション切れは、再試行しても永久に通らない。
      // 「再試行中」と出し続けると気づけないので、はっきり分けて伝える。
      const isAuth = /JWT|not authorized|permission denied|401|403|row-level security/i.test(msg)
      console.warn(`[wt-save:${name}] 保存に失敗、再試行します:`, msg)
      emit(isAuth ? 'authError' : 'error', { msg, n: d.changed.length, fail: q.fail })
      schedule(Math.min(30000, DEFAULT_DELAY * 2 ** Math.min(q.fail, 4)), true)
    } finally {
      q.flushing = false
    }
  }

  // 離脱時の最後の一押し。
  // sendBeacon は apikey ヘッダを付けられないので fetch(keepalive) を使う。
  function flushSync() {
    if (!q.hot.size || !q.latest) return
    try {
      const byId = new Map(q.latest.map(x => [x.id, x]))
      const rows = [...q.hot]
        .map(id => byId.get(id))
        .filter(Boolean)
        .map(x => ({ id: x.id, data: x, updated_at: new Date().toISOString() }))
      if (!rows.length) return
      const body = JSON.stringify(rows)
      if (body.length > 60000) return   // keepalive の上限は64KB
      fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body,
      })
    } catch { /* 離脱中なので失敗しても打つ手はない */ }
  }

  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { flush(); flushSync() }
    })
    window.addEventListener('pagehide', flushSync)
    window.addEventListener('beforeunload', ev => {
      if (q.baseline === q.latest) return
      flushSync()
      // 保存に失敗し続けている場合だけ引き止める
      if (q.fail > 0) { ev.preventDefault(); ev.returnValue = '' }
    })
  } catch { /* 画面が無い環境では何もしない */ }

  // state が変わるたびに呼ぶ。ここでは件数の比較しかしないので軽い。
  function enqueue(prev, next) {
    if (!q.baseline) q.baseline = prev
    q.latest = next

    const m = new Map(prev.map(x => [x.id, x]))
    let urgent = next.length < prev.length
    for (const it of next) {
      const before = m.get(it.id)
      const a = (it.callHistory || []).length
      const b = (before?.callHistory || []).length
      // 架電履歴が増えた＝「架電を記録」。人が押した一点物なので待たずに送る。
      if (a > b || (!before && a > 0)) { q.hot.add(it.id); urgent = true }
    }
    urgent ? schedule(0, true) : schedule(DEFAULT_DELAY)
  }

  // その行に未送信の変更を持っているか。
  // 持っている行は、他人の更新が届いても上書きしない。
  function isDirty(id) {
    if (!q.baseline || !q.latest || q.baseline === q.latest) return false
    const a = q.latest.find(x => x.id === id)
    if (!a) return false
    const b = q.baseline.find(x => x.id === id)
    return !b || JSON.stringify(a) !== JSON.stringify(b)
  }

  // Realtime で届いた行を反映する
  function applyRemote(setItems, row) {
    if (!row || !row.id || !row.data) return
    if (q.hot.has(row.id) || isDirty(row.id)) return
    const d = row.data
    setItems(list => {
      const idx = list.findIndex(x => x.id === row.id)
      if (idx >= 0 && JSON.stringify(list[idx]) === JSON.stringify(d)) return list
      // 比較基準にも同じ行を入れる。入れないと「自分が変更した」と誤判定して送り返してしまう。
      if (q.baseline) {
        const bi = q.baseline.findIndex(x => x.id === row.id)
        q.baseline = bi >= 0
          ? [...q.baseline.slice(0, bi), d, ...q.baseline.slice(bi + 1)]
          : [...q.baseline, d]
      }
      return idx >= 0 ? [...list.slice(0, idx), d, ...list.slice(idx + 1)] : [...list, d]
    })
  }

  // サーバーから取り直した / キャッシュから復元したときに基準ごと差し替える。
  // これをやらないと「キャッシュとサーバーの差」を自分の変更と誤認して
  // 他の人の更新を巻き戻してしまう。
  function resetBaseline(items) {
    q.baseline = items
    q.latest = items
    q.hot.clear()
  }

  const handle = { enqueue, flush, flushSync, applyRemote, resetBaseline, state: q }
  // 保存インジケータから「即時再送」できるように登録しておく
  try { (globalThis.__wtQueues || (globalThis.__wtQueues = {}))[name] = handle } catch { /* noop */ }
  return handle
}

/**
 * teleapo_items / proposals の変更を購読する。
 * publication が未設定でも例外を投げない（イベントが届かないだけ）。
 */
export function subscribeChanges(supabase, table, queue, setItems) {
  try {
    const g = globalThis.__wtSubs || (globalThis.__wtSubs = {})
    if (g[table]) return g[table]
    g[table] = supabase
      .channel(`wt-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
        const isDelete = payload && (payload.eventType === 'DELETE' || payload.event === 'DELETE')
        if (isDelete) {
          // 画面からは消さない。取り違えて消すと被害が大きいので、
          // 「消えているので再読み込みしてください」と知らせるだけにする。
          try {
            window.dispatchEvent(new CustomEvent('wt-save', {
              detail: { state: 'staleDelete', queue: table },
            }))
          } catch { /* noop */ }
          return
        }
        if (payload && payload.new) queue.applyRemote(setItems, payload.new)
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') console.info(`[realtime] ${table} の購読を開始しました`)
      })
    return g[table]
  } catch (e) {
    console.warn('[realtime] 購読に失敗:', e && e.message)
  }
}
