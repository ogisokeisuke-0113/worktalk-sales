import { supabase } from './supabase'

async function upsertRows(table, items, { withTimestamp = true } = {}) {
  if (!supabase || !items.length) return
  const rows = items.map(item => {
    const row = { id: item.id, data: item }
    if (withTimestamp) row.updated_at = new Date().toISOString()
    return row
  })
  const { error } = await supabase.from(table).upsert(rows)
  if (error) console.warn(`[db:${table}] upsert error:`, error.message)
}

// teleapo_items専用: サーバー側のcallHistoryとマージしてから保存する
async function upsertTeleapoWithMerge(items) {
  if (!supabase || !items.length) return
  const ids = items.map(i => i.id)
  const { data: serverRows } = await supabase
    .from('teleapo_items')
    .select('id, data')
    .in('id', ids)

  const serverMap = {}
  if (serverRows) {
    for (const r of serverRows) serverMap[r.id] = r.data
  }

  const rows = items.map(item => {
    const serverItem = serverMap[item.id]
    let callHistory = item.callHistory || []

    if (serverItem?.callHistory?.length) {
      const keys = new Set(callHistory.map(c => `${c.date}|${c.caller}`))
      for (const c of serverItem.callHistory) {
        if (!keys.has(`${c.date}|${c.caller}`)) {
          callHistory = [...callHistory, c]
          keys.add(`${c.date}|${c.caller}`)
        }
      }
    }

    return {
      id: item.id,
      data: { ...item, callHistory },
      updated_at: new Date().toISOString(),
    }
  })

  const { error } = await supabase.from('teleapo_items').upsert(rows)
  if (error) console.warn('[db:teleapo_items] upsert error:', error.message)
}

async function deleteRows(table, ids) {
  if (!supabase || !ids.length) return
  const { error } = await supabase.from(table).delete().in('id', ids)
  if (error) console.warn(`[db:${table}] delete error:`, error.message)
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

export const db = {
  proposals: {
    upsert: items => upsertRows('proposals', items),
    delete: ids => deleteRows('proposals', ids),
    fetchAll: () => fetchRows('proposals'),
  },
  teleapoItems: {
    upsert: items => upsertTeleapoWithMerge(items),
    delete: ids => deleteRows('teleapo_items', ids),
    fetchAll: () => fetchRows('teleapo_items'),
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
