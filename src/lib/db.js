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

async function deleteRows(table, ids) {
  if (!supabase || !ids.length) return
  const { error } = await supabase.from(table).delete().in('id', ids)
  if (error) console.warn(`[db:${table}] delete error:`, error.message)
}

async function fetchRows(table) {
  if (!supabase) return null
  const { data, error } = await supabase.from(table).select('data')
  if (error) { console.warn(`[db:${table}] fetch error:`, error.message); return null }
  return data.map(r => r.data)
}

export const db = {
  proposals: {
    upsert: items => upsertRows('proposals', items),
    delete: ids => deleteRows('proposals', ids),
    fetchAll: () => fetchRows('proposals'),
  },
  teleapoItems: {
    upsert: items => upsertRows('teleapo_items', items),
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
