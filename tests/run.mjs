/* tests/*.test.mjs をすべて実行する。1本でも落ちたら異常終了する（＝CIで配信を止める）。 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

const dir = path.dirname(new URL(import.meta.url).pathname)
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort()
if (!files.length) { console.error('テストが1本もありません'); process.exit(1) }

let failed = 0
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' })
  if (r.status !== 0) failed++
}
console.log(`\n────────────────────────\n${files.length - failed}/${files.length} ファイル通過`)
process.exit(failed ? 1 : 0)
