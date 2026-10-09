/* 日付をまたいだKeepは、書き換えずに「外れている」ように見せる。
   2026-10-08 に、朝いちばんの一括書き換え（134社）で古い内容が
   まとめて書き戻され、アポ確定1社・架電済2社が巻き戻った。
   書かなければ巻き込みは起きない。 */
import { open, company, call, makeReporter } from './harness.mjs'

const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString()
const today = new Date().toISOString()

const ITEMS = [
  // 昨日のKeep（期限切れ）
  company('a', 'A_昨日のKeep', { status: '架電済', isKept: true, keptBy: '美藤 陸', keptAt: yesterday,
    keepHistory: [{ id: 'k1', date: yesterday, by: '美藤 陸' }],
    callHistory: [call('美藤 陸', '担当者不在', '2026-10-07T04:00:00.000Z')] }),
  // 今日のKeep（有効）
  company('b', 'B_今日のKeep', { status: '架電済', isKept: true, keptBy: 'テスト太郎', keptAt: today,
    keepHistory: [{ id: 'k2', date: today, by: 'テスト太郎' }],
    callHistory: [call('美藤 陸', '不通', '2026-10-08T04:00:00.000Z')] }),
  company('c', 'C_Keepなし', { status: '架電済',
    callHistory: [call('美藤 陸', '不通', '2026-10-08T04:00:00.000Z')] }),
]

const { page, writes, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('期限切れKeepの扱い')

// 起動しただけで保存が走らないこと（ここが今回の肝）
await page.waitForTimeout(6000)
const saved = writes.filter(w => w.table === 'teleapo_items')
check('起動しただけでは1社も保存しない', saved.length === 0, `${saved.length}回`)

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
const card = n => page.locator('div.bg-white.rounded-xl.border').filter({ hasText: n }).first()

check('昨日のKeepは外れて見える',
  (await card('A_昨日のKeep').getByRole('button', { name: 'Keep', exact: true }).count()) === 1,
  (await card('A_昨日のKeep').innerText()).replace(/\s+/g, ' ').slice(0, 50))
// 今日のKeepは自分のものなので「Keep解除」と出る（＝有効なまま）
check('今日のKeepは有効なまま',
  (await card('B_今日のKeep').getByRole('button', { name: 'Keep解除' }).count()) === 1,
  (await card('B_今日のKeep').innerText()).replace(/\s+/g, ' ').slice(0, 40))

// 期限切れKeepの企業で絞り込み（Keep中のみ）には出ない
await page.getByText('検索に戻る').first().click()
await page.waitForTimeout(600)
const sel = page.locator('div').filter({ has: page.locator('label', { hasText: 'Keep状態' }) }).last().locator('select').first()
await sel.selectOption({ label: 'Keep中のみ' })
await page.waitForTimeout(300)
await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
const names = (await page.locator('div.bg-white.rounded-xl')
  .filter({ has: page.locator('a[href*="google.com/search"]') }).allInnerTexts())
  .map(t => t.split('\n')[0].trim()).sort()
check('「Keep中のみ」に昨日のKeepは出ない', JSON.stringify(names) === JSON.stringify(['B_今日のKeep']), JSON.stringify(names))

done(errs)
await close()
