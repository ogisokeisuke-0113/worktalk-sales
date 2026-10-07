#!/usr/bin/env node
/**
 * 配信した版を Supabase に登録して、開きっぱなしの画面へすぐ知らせる
 *
 * GitHub Pages は index.html を10分キャッシュし、クエリを足してもキャッシュを返す。
 * そのため配信を見に行く方法だけでは、気づくまで最大10分かかる。
 * ここで「今の最新はこれ」を直接書いておけば、各画面が30秒おきに見て
 * すぐ更新に入る。誰かがアプリを開くのを待たなくてよくなる。
 *
 * 使い方（配信が反映されたあとに実行）:
 *   node tools/announce-version.mjs
 *
 * 鍵は macOS キーチェーンから読む。ファイルにも引数にも書かない。
 *   security add-generic-password -a salesboard -s supabase-service-role -w '<key>'
 */
import { execSync } from 'child_process'

const SUPABASE_URL = 'https://antqewvlzfonsakgndxt.supabase.co'
const SITE = 'https://ogisokeisuke-0113.github.io/worktalk-sales/'

function key() {
  try {
    return execSync("security find-generic-password -a salesboard -s supabase-service-role -w",
      { encoding: 'utf8' }).trim()
  } catch {
    console.error('キーチェーンに鍵がありません（-a salesboard -s supabase-service-role）')
    process.exit(1)
  }
}

/* 配信中のエントリのファイル名 */
async function deployedAsset() {
  const res = await fetch(`${SITE}?cb=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`index.html を取得できません (${res.status})`)
  const m = (await res.text()).match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)
  if (!m) throw new Error('index.html からファイル名を読み取れません')
  return m[1]
}

/* gh-pages の最新コミットが指す元コミットの時刻。CI が埋め込む BUILD_ID と同じ値になる */
function deployedBuildId() {
  execSync('git fetch -q origin gh-pages', { stdio: 'ignore' })
  const msg = execSync('git log -1 --format=%s origin/gh-pages', { encoding: 'utf8' }).trim()
  const sha = (msg.match(/^deploy:\s*([0-9a-f]{7,40})/) || [])[1]
  if (!sha) throw new Error(`gh-pages のコミットから元コミットを読み取れません: ${msg}`)
  return Number(execSync(`git log -1 --format=%ct ${sha}`, { encoding: 'utf8' }).trim())
}

const K = key()
const headers = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }

const asset = await deployedAsset()
const buildId = deployedBuildId()

/* 配信中のファイルと、これから登録する版が食い違っていないか確かめる。
   配信が途中だと、古い版を最新として登録してしまう。 */
const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?id=eq.app_version&select=data`, { headers })
const cur = (await res.json())[0]?.data
if (cur && Number(cur.buildId) > buildId) {
  console.log(`登録済みのほうが新しいので何もしません（登録=${cur.buildId} / 今回=${buildId}）`)
  process.exit(0)
}
if (cur && Number(cur.buildId) === buildId && cur.asset === asset) {
  console.log(`すでに登録済みです（${asset} / ${buildId}）`)
  process.exit(0)
}

const put = await fetch(`${SUPABASE_URL}/rest/v1/app_settings`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    id: 'app_version',
    data: { buildId, asset, at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }),
})
if (!put.ok) { console.error('登録に失敗:', put.status, await put.text()); process.exit(1) }
console.log(`登録しました: ${asset} / buildId=${buildId}`)
console.log('開きっぱなしの画面には30秒以内に更新の案内が出ます')
