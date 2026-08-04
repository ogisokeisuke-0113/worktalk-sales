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

// email_events は平坦カラム構造（data JSONB ではない）なので専用フェッチ
// occurred_at DESC で最新から取得、直近5000件まで
async function fetchEmailEvents(limit = 5000) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('email_events')
    .select('id,teleapo_item_id,email,event_type,occurred_at,sg_message_id,sg_event_id,url,metadata')
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) { console.warn('[db:email_events] fetch error:', error.message); return null }
  return data
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
  emailEvents: {
    // INSERT はフロントから行わない（GAS 経由で SendGrid Event Webhook が書き込む）
    fetchAll: () => fetchEmailEvents(),
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
