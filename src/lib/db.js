import { supabase } from './supabase'

// PostgREST の .in() は全IDをGETのURLに並べるため、件数が増えると 400 になる。
// 実測では 500件=OK / 800件=400 Bad Request。安全側に倒して200件ずつ処理する。
const CHUNK = 200

async function upsertRows(table, items, { withTimestamp = true } = {}) {
  if (!supabase || !items.length) return
  const rows = items.map(item => {
    const row = { id: item.id, data: item }
    if (withTimestamp) row.updated_at = new Date().toISOString()
    return row
  })
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK))
    // throw することで、呼び出し側の送信キューが再送できる。
    // console.warn だけだと失敗が誰にも見えず、記録が黙って消える。
    if (error) throw new Error(`保存に失敗しました: ${error.message}`)
  }
}

// 履歴エントリの同一判定。id があればそれを使う。
// 「date|caller」だけで判定すると、同じ人が同じ日に同じ会社へ2回架電したとき
// 2件目が重複扱いで消えてしまう。
export const historyKey = c => (c && c.id ? `#${c.id}` : `${c && c.date}|${c && c.caller}`)

// call_logs の1行を組み立てる。
// dedup_key は supabase/migrations/001_call_logs.sql のバックフィルと同じ規則にすること。
function toCallLogRow(item, entry, index) {
  const d = (entry && (entry.date || entry.calledAt)) || ''
  return {
    teleapo_item_id: item.id,
    company_name: item.companyName || null,
    entry_id: (entry && entry.id) || null,
    dedup_key: `${item.id}|${(entry && entry.id) || `pos:${index + 1}`}`,
    caller: (entry && (entry.caller || entry.calledBy)) || '',
    // 日時が読めないものは捏造せず null。誤った集計より欠測のほうが良い。
    called_at: /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(d) ? d : null,
    result: (entry && entry.result) || null,
    call_type: (entry && entry.callType) || null,
    call_content: (entry && entry.callContent) || null,
    memo: (entry && entry.note) || null,
    rejection_reason: (entry && entry.rejectionReason) || null,
    raw: entry,
    source: 'app',
  }
}

// teleapo_items専用: サーバー側のcallHistoryとマージしてから保存する
async function upsertTeleapoWithMerge(items) {
  if (!supabase || !items.length) return

  // ── サーバーの現在値を取る ──
  const ids = items.map(i => i.id)
  const serverMap = {}
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('teleapo_items')
      .select('id, data')
      .in('id', ids.slice(i, i + CHUNK))
    // ここで error を握り潰すと「サーバーには何も無かった」と誤解して
    // マージせずに丸ごと上書きしてしまう。必ず止める。
    if (error) throw new Error(`既存データの取得に失敗したため保存を中止しました: ${error.message}`)
    for (const r of data) serverMap[r.id] = r.data
  }

  // ── マージ。ついでに「今回増えた履歴」を拾う ──
  const newLogs = []
  const rows = items.map(item => {
    const serverItem = serverMap[item.id]
    let callHistory = item.callHistory || []

    // 人が消した記録の印。これが無いと、下のマージでサーバー側から復活してしまう。
    const deleted = new Set([
      ...(item.deletedCalls || []),
      ...((serverItem && serverItem.deletedCalls) || []),
    ])
    if (deleted.size) callHistory = callHistory.filter(c => !deleted.has(historyKey(c)))

    const serverKeys = new Set(((serverItem && serverItem.callHistory) || []).map(historyKey))
    ;(item.callHistory || []).forEach((c, i) => {
      if (!serverKeys.has(historyKey(c)) && !deleted.has(historyKey(c))) newLogs.push(toCallLogRow(item, c, i))
    })

    if (serverItem?.callHistory?.length) {
      const keys = new Set(callHistory.map(historyKey))
      for (const c of serverItem.callHistory) {
        const k = historyKey(c)
        // 消された記録は戻さない。それ以外は、他の人が同時に入れた記録なので残す。
        if (!keys.has(k) && !deleted.has(k)) {
          callHistory = [...callHistory, c]
          keys.add(k)
        }
      }
      callHistory = callHistory.slice().sort((a, b) => String(a?.date).localeCompare(String(b?.date)))
    }

    return {
      id: item.id,
      data: { ...item, callHistory, ...(deleted.size ? { deletedCalls: [...deleted] } : {}) },
      updated_at: new Date().toISOString(),
    }
  })

  // ── 本体より先に追記専用テーブルへ入れる ──
  // 本体の保存が失敗しても架電記録そのものは残る。
  // ここが失敗しても本体の保存は止めない（call_logs は保険であって主ではない）。
  for (let i = 0; i < newLogs.length; i += CHUNK) {
    try {
      const { error } = await supabase
        .from('call_logs')
        .upsert(newLogs.slice(i, i + CHUNK), { onConflict: 'dedup_key', ignoreDuplicates: true })
      if (error) console.warn('[db:call_logs] 架電履歴の追記に失敗:', error.message)
    } catch (e) {
      console.warn('[db:call_logs] 架電履歴の追記に失敗:', e && e.message)
    }
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('teleapo_items').upsert(rows.slice(i, i + CHUNK))
    if (error) throw new Error(`保存に失敗しました: ${error.message}`)
  }
}

async function deleteRows(table, ids) {
  if (!supabase || !ids.length) return
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await supabase.from(table).delete().in('id', ids.slice(i, i + CHUNK))
    if (error) throw new Error(`削除に失敗しました: ${error.message}`)
  }
}

async function fetchRows(table) {
  if (!supabase) return null
  const PAGE = 1000
  let all = [], from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select('data').range(from, from + PAGE - 1)
    if (error) { console.warn(`[db:${table}] fetch error:`, error.message); return null }
    if (!data || data.length === 0) break
    all = all.concat(data.map(r => r.data))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

/**
 * 前回以降に変わった行だけを取る。
 *
 * Realtime は「つながっている間」の変更しか届かない。
 * スリープ・Wi-Fi切替・タブ放置で接続が切れると、その間の変更は永久に来ない。
 * これが「再読み込みするまで古いまま」の正体なので、ここで穴を埋める。
 *
 * 次回の起点は、サーバーが返した updated_at の最大値を使う。
 * 端末の時計を使うと、ズレている人の分だけ取りこぼす。
 */
/** いまサーバーにある最新の updated_at。差分同期の起点に使う。 */
async function latestStamp(table) {
  if (!supabase) return null
  const { data, error } = await supabase.from(table)
    .select('updated_at').order('updated_at', { ascending: false }).limit(1)
  if (error || !data?.length) return null
  return data[0].updated_at
}

async function fetchRowsSince(table, since) {
  if (!supabase) return null
  const PAGE = 500
  let rows = [], cursor = since
  for (let guard = 0; guard < 40; guard++) {
    let q = supabase.from(table).select('id,data,updated_at').order('updated_at', { ascending: true }).limit(PAGE)
    if (cursor) q = q.gt('updated_at', cursor)
    const { data, error } = await q
    if (error) { console.warn(`[db:${table}] 差分取得に失敗:`, error.message); return null }
    if (!data || !data.length) break
    rows = rows.concat(data)
    cursor = data[data.length - 1].updated_at
    if (data.length < PAGE) break
  }
  return { rows, cursor: cursor || since }
}

export const db = {
  proposals: {
    upsert: items => upsertRows('proposals', items),
    delete: ids => deleteRows('proposals', ids),
    fetchAll: () => fetchRows('proposals'),
    fetchSince: since => fetchRowsSince('proposals', since),
    latestStamp: () => latestStamp('proposals'),
  },
  teleapoItems: {
    upsert: items => upsertTeleapoWithMerge(items),
    delete: ids => deleteRows('teleapo_items', ids),
    fetchAll: () => fetchRows('teleapo_items'),
    fetchSince: since => fetchRowsSince('teleapo_items', since),
    latestStamp: () => latestStamp('teleapo_items'),
  },
  users: {
    upsert: items => upsertRows('users', items, { withTimestamp: false }),
    fetchAll: () => fetchRows('users'),
  },
  downloadLeads: {
    upsert: items => upsertRows('download_leads', items),
    fetchAll: () => fetchRows('download_leads'),
  },
  settings: {
    async get() {
      if (!supabase) return null
      const { data, error } = await supabase.from('app_settings').select('data').eq('id', 'default').maybeSingle()
      if (error || !data) return null
      return data.data
    },
    async set(val) {
      if (!supabase) return
      const { error } = await supabase.from('app_settings').upsert({
        id: 'default',
        data: val,
        updated_at: new Date().toISOString(),
      })
      if (error) console.warn('[db:settings] set error:', error.message)
    },
  },
}
