/* tests/*.test.mjs をすべて実行する。1本でも落ちたら異常終了する（＝CIで配信を止める）。
 *
 * 1本ずつ順番に流すと、配信までの待ち時間の大半をここが占める（実測281秒）。
 * どのテストも自分専用のサーバーとブラウザを立てて他に触らないので、
 * 同時に流して問題ない。出力は混ざらないよう、本ごとにまとめて出す。 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'

const dir = path.dirname(new URL(import.meta.url).pathname)
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort()
if (!files.length) { console.error('テストが1本もありません'); process.exit(1) }

/* 同時に動かす数。CPUが少ない環境で欲張ると、待ち時間が延びて逆に不安定になる。 */
const LIMIT = Math.max(2, Math.min(5, (os.cpus()?.length || 2) * 2))

function run(file) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(dir, file)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { out += d })
    p.on('close', code => resolve({ file, code, out }))
  })
}

const started = Date.now()
const queue = [...files]
const results = []
await Promise.all(Array.from({ length: Math.min(LIMIT, queue.length) }, async () => {
  while (queue.length) {
    const f = queue.shift()
    results.push(await run(f))
  }
}))

results.sort((a, b) => a.file.localeCompare(b.file))
for (const r of results) process.stdout.write(r.out)

const failed = results.filter(r => r.code !== 0)
console.log(`\n────────────────────────`)
console.log(`${files.length - failed.length}/${files.length} ファイル通過（同時実行 ${LIMIT}・${((Date.now() - started) / 1000).toFixed(0)}秒）`)
for (const r of failed) console.log(`  ✗ ${r.file}`)
process.exit(failed.length ? 1 : 0)
