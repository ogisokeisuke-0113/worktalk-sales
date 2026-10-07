/**
 * 配信中の版を全員にすぐ知らせる
 *
 * GitHub Pages は index.html を10分キャッシュし、クエリを足しても
 * キャッシュを返す（実測: ?v=ランダム でも x-cache: HIT）。
 * そのため「新しい版が出た」と気づくまで最大10分かかっていた。
 *
 * そこで、新しい版を読み込んだ画面が Supabase に自分の版を書き、
 * 他の画面はそれを見て気づく。配信経路を通らないので待ち時間が無い。
 *
 * 版の比較はビルド時刻（数）で行う。ファイル名のハッシュだと前後が
 * 分からず、古い画面が自分を最新として知らせて更新が往復しかねない。
 */
import { supabase } from './supabase'

const ROW_ID = 'app_version'

/* ビルド時に埋め込まれる。開発サーバーでは未定義になる */
export const BUILD_ID = Number(typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 0) || 0

export async function readPublishedVersion() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('app_settings').select('data').eq('id', ROW_ID).maybeSingle()
  if (error || !data) return null
  const v = Number(data.data?.buildId) || 0
  return v ? { buildId: v, asset: data.data?.asset || '' } : null
}

/* 自分のほうが新しいときだけ知らせる。古い画面は書かない。 */
export async function announceVersion(asset) {
  if (!supabase || !BUILD_ID) return false
  try {
    const cur = await readPublishedVersion()
    if (cur && cur.buildId >= BUILD_ID) return false
    const { error } = await supabase.from('app_settings').upsert({
      id: ROW_ID,
      data: { buildId: BUILD_ID, asset: asset || '', at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    if (error) { console.warn('[version] 知らせられませんでした:', error.message); return false }
    console.info(`[version] この版(${BUILD_ID})を最新として登録しました`)
    return true
  } catch (e) {
    console.warn('[version] 知らせられませんでした:', e && e.message)
    return false
  }
}

/* 自分より新しい版が出ていれば、その版を返す。無ければ null。
   呼び出し側が「どの版を目指して再読み込みしたか」を記録できるよう、
   true/false ではなく中身を返す。これが無いと、登録がおかしいときに
   再読み込みが無限に往復する。 */
export async function outdatedVersion() {
  if (!BUILD_ID) return null
  const cur = await readPublishedVersion()
  return cur && cur.buildId > BUILD_ID ? cur : null
}
