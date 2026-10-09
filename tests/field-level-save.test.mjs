/* 保存は「自分が変えた項目」だけを送る。
   行まるごと送っていたため、架電を記録しただけで担当者名が消える事故が
   実際に起きていた（2026-10-02 ミサワホーム不動産ほか）。
   画面が古いままの項目は、相手の最新のまま残らなければならない。 */
import { open, company, call, makeReporter } from './harness.mjs'

/* 自分の画面が持っている内容（担当者名もメモも古い） */
const mine = [company('a', 'A社', { status: '架電済', contactName: '鈴木', memo: '古いメモ',
  callHistory: [call('美藤 陸', '担当者不在', '2026-10-01T02:00:00.000Z')] })]

/* サーバー側では、別の人が担当者名とメモを更新済み */
const onServer = JSON.parse(JSON.stringify(mine[0]))
onServer.contactName = '新卒担当：池内・常盤・根来'
onServer.memo = '他の人が書いた最新のメモ'
onServer.prefecture = '大阪府'

const { page, writes, errs, close } = await open('dist', mine, { serverSide: { a: onServer } })
const { check, done } = makeReporter('変えた項目だけ保存する')

const sent = () => writes.filter(w => w.table === 'teleapo_items')
  .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)
  .map(x => x.data || x).filter(d => d && d.companyName === 'A社').pop()

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
const card = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'A社' }).first()
await card.getByRole('button', { name: '架電を記録' }).click()
await page.waitForTimeout(600)
await page.locator('select').filter({ has: page.locator('option', { hasText: '不通' }) }).first().selectOption('不通')
await page.waitForTimeout(200)
await page.getByRole('button', { name: /保存|記録する/ }).last().click()
await page.waitForTimeout(3500)

const row = sent()
check('架電記録は保存される', !!row && (row.callHistory || []).some(c => c.result === '不通'),
  row ? `${(row.callHistory || []).length}件` : 'なし')
check('担当者名が消えない（他の人の最新が残る）', row?.contactName === '新卒担当：池内・常盤・根来',
  String(row?.contactName))
check('メモも消えない', row?.memo === '他の人が書いた最新のメモ', String(row?.memo))
check('触っていない項目も相手の最新のまま', row?.prefecture === '大阪府', String(row?.prefecture))
check('送信に余計な印が混ざらない', row && !('__changed' in row), Object.keys(row || {}).filter(k => k.startsWith('__')).join() || 'なし')

done(errs)
await close()
