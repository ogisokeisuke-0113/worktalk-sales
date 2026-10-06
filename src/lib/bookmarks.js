import { supabase } from './supabase'

/**
 * ブックマーク
 *
 * teleapo_items.data の中ではなく専用テーブルに持つ。
 * 1社=1行のJSONを丸ごと差し替える構造だと、2人が同時に別々の企業を
 * ブックマークしたときに後勝ちで相手のぶんが消える。
 * 1人1社で1行なら行が競合しないので起きない。
 */

/* 既定のリスト名。初めてブックマークしたときはこの名前で作られる。 */
export const DEFAULT_LIST = 'マイリスト'

export async function fetchBookmarks() {
  if (!supabase) return []
  const PAGE = 1000
  let all = [], from = 0
  while (true) {
    const { data, error } = await supabase
      .from('teleapo_bookmarks')
      .select('id, teleapo_item_id, company_name, user_id, user_name, note, list_name, created_at')
      .range(from, from + PAGE - 1)
    if (error) { console.warn('[bookmarks] 取得に失敗:', error.message); return all }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

export async function addBookmark({ item, user, note = '', listName = DEFAULT_LIST }) {
  if (!supabase) return null
  const row = {
    teleapo_item_id: item.id,
    company_name: item.companyName || null,
    user_id: user.authId,
    user_name: user.name || '',
    note: note || null,
    list_name: String(listName || DEFAULT_LIST).trim() || DEFAULT_LIST,
  }
  const { data, error } = await supabase
    .from('teleapo_bookmarks')
    .upsert(row, { onConflict: 'teleapo_item_id,user_id' })
    .select()
    .maybeSingle()
  if (error) throw new Error(`ブックマークに追加できませんでした: ${error.message}`)
  return data
}

export async function removeBookmark({ itemId, user }) {
  if (!supabase) return
  const { error } = await supabase
    .from('teleapo_bookmarks')
    .delete()
    .eq('teleapo_item_id', itemId)
    .eq('user_id', user.authId)
  if (error) throw new Error(`ブックマークを外せませんでした: ${error.message}`)
}

export async function updateBookmarkNote({ itemId, user, note }) {
  if (!supabase) return
  const { error } = await supabase
    .from('teleapo_bookmarks')
    .update({ note: note || null })
    .eq('teleapo_item_id', itemId)
    .eq('user_id', user.authId)
  if (error) throw new Error(`メモを保存できませんでした: ${error.message}`)
}

/* 企業を別のリストへ移す。1社は1リストなので、行の付け替えではなく名前の差し替え。 */
export async function moveBookmark({ itemId, user, listName }) {
  if (!supabase) return
  const { error } = await supabase
    .from('teleapo_bookmarks')
    .update({ list_name: String(listName || DEFAULT_LIST).trim() || DEFAULT_LIST })
    .eq('teleapo_item_id', itemId)
    .eq('user_id', user.authId)
  if (error) throw new Error(`リストを変更できませんでした: ${error.message}`)
}

/* リスト名を変える。自分の同じ名前の行をまとめて付け替える。 */
export async function renameBookmarkList({ user, from, to }) {
  if (!supabase) return
  const next = String(to || '').trim()
  if (!next) throw new Error('リスト名を入力してください')
  const { error } = await supabase
    .from('teleapo_bookmarks')
    .update({ list_name: next })
    .eq('user_id', user.authId)
    .eq('list_name', from)
  if (error) throw new Error(`リスト名を変更できませんでした: ${error.message}`)
}

/** 他の人の付け外しをその場で反映する */
export function subscribeBookmarks(onChange) {
  if (!supabase) return
  try {
    const g = globalThis.__wtBmSub
    if (g) return g
    globalThis.__wtBmSub = supabase
      .channel('wt-bookmarks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teleapo_bookmarks' }, onChange)
      .subscribe()
    return globalThis.__wtBmSub
  } catch (e) {
    console.warn('[bookmarks] 購読に失敗:', e && e.message)
  }
}
