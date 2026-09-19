/* 架電記録の編集・削除。日付も直せること。 */
import { open, company, call, makeReporter } from './harness.mjs'

const ITEMS = [
  company('a', 'A_編集対象', { status: '架電済', callHistory: [
    call('美藤 陸', '不通', '2026-09-01T02:00:00.000Z', { note: '最初のメモ' }),
    call('梶田 祐守', '担当者不在', '2026-09-10T02:00:00.000Z', { note: 'あとのメモ' }),
  ] }),
]

const { page, writes, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('架電記録の編集・削除')

const sent = () => writes.filter(w => w.table === 'teleapo_items')
  .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)
  .map(x => x.data || x).filter(d => d && d.companyName === 'A_編集対象').pop()

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
await page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'A_編集対象' }).first()
  .getByRole('button', { name: '詳細' }).click()
await page.waitForTimeout(700)

const panel = page.locator('div.fixed.inset-0')
// 履歴カードは枠線付きの小さいカード。詳細パネル上部の「編集」と混ざらないよう絞る
const entry = note => panel.locator('div.border.border-slate-200.rounded-lg').filter({ hasText: note }).first()
check('履歴に編集ボタンが出る', (await entry('あとのメモ').getByRole('button', { name: '編集' }).count()) === 1)

await entry('あとのメモ').getByRole('button', { name: '編集' }).click()
await page.waitForTimeout(700)
// 記録モーダルは詳細パネルの後ろに描画されるので最後の fixed 要素
const modal = page.locator('div.fixed.inset-0').last()
check('編集モードで開く', (await page.getByText('架電記録を編集').count()) > 0)

const dateInput = modal.locator('input[type=date]').first()
check('元の日付が入っている', (await dateInput.inputValue()) === '2026-09-10', await dateInput.inputValue())

await dateInput.fill('2026-09-05')
await modal.locator('select').filter({ has: page.locator('option', { hasText: '不通' }) }).first().selectOption('不通')
await modal.locator('textarea').first().fill('直したメモ')
await page.waitForTimeout(200)
await modal.getByRole('button', { name: /保存|記録する/ }).last().click()
await page.waitForTimeout(2500)

let row = sent()
let edited = (row?.callHistory || []).find(c => c.note === '直したメモ')
check('内容が更新される', !!edited, edited ? `${edited.result} / ${edited.note}` : 'なし')
check('日付が更新される', String(edited?.date || '').slice(0, 10) === '2026-09-05', String(edited?.date || '').slice(0, 10))
check('記録した人は変わらない', edited?.caller === '梶田 祐守', String(edited?.caller))
check('件数は増えない', (row?.callHistory || []).length === 2, `${(row?.callHistory || []).length}件`)
check('もう一方は変わらない', (row?.callHistory || []).some(c => c.note === '最初のメモ'))

// 削除
page.on('dialog', d => d.accept())
await entry('最初のメモ').getByRole('button', { name: '削除' }).click()
await page.waitForTimeout(800)
await page.waitForTimeout(6000)
console.log('  [debug] キュー=', JSON.stringify(await page.evaluate(() => {
  const qs = globalThis.__wtQueues || {}
  const out = {}
  for (const [k, q] of Object.entries(qs)) {
    out[k] = { n: (q.latest || []).length, keys: Object.keys((q.latest || [])[0] || {}).slice(0, 6),
      sample: JSON.stringify(((q.latest || [])[0] || {})).slice(0, 120) }
  }
  return out
})))
await page.waitForTimeout(2500)
row = sent()
check('削除の印が残る', Array.isArray(row?.deletedCalls) && row.deletedCalls.length === 1, JSON.stringify(row?.deletedCalls))
check('削除すると1件減る', (row?.callHistory || []).length === 1, `${(row?.callHistory || []).length}件`)
check('残るのは削除していない方', (row?.callHistory || [])[0]?.note === '直したメモ',
  String((row?.callHistory || [])[0]?.note))

done(errs)
await close()
