/**
 * 大きな一覧（提案リスト・テレアポリスト）のローカルキャッシュ
 *
 * localStorage は上限が概ね5MBで、テレアポ9,647件の実測が4.22MB。
 * 残り2割を切っており、企業を1,800社ほど足した時点で保存が失敗しはじめる。
 * しかも localStorage.setItem は失敗しても例外を投げるだけなので、
 * 気づかないまま「キャッシュが古いまま」になる。
 *
 * IndexedDB は数百MB使えるうえ、値をそのまま（文字列化せずに）置ける。
 *
 * あくまで初回表示を速くするための保険で、正はいつも Supabase 側。
 * 読めなくてもアプリは動く。
 */

const DB_NAME = 'worktalk_cache'
const STORE = 'lists'
const VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB が使えません')); return }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch(e => { dbPromise = null; throw e })
  return dbPromise
}

export async function cacheGet(key) {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[cache] 読み込めませんでした:', e && e.message)
    return null
  }
}

export async function cacheSet(key, value) {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('[cache] 保存できませんでした:', e && e.message)
  }
}

/** localStorage に残っている旧キャッシュを片付ける（容量を空ける） */
export function dropLegacyCache() {
  for (const k of ['worktalk_proposals', 'worktalk_teleapo']) {
    try { localStorage.removeItem(k) } catch { /* noop */ }
  }
}
