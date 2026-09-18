/* 担当確定（アポ獲得を記録した人）と最終架電者（最後に架電した人）の表示。
   固定の「担当営業」割当は 2026-09-16 に廃止した。 */
import { open, company, call, listedCompanies, selectOptions, makeReporter } from './harness.mjs'

const ITEMS = [
  // アポ獲得を記録したのは美藤。そのあと梶田が架電しても担当確定は美藤のまま
  company('a', 'A_アポ確定', { salesRep: '石本 善大', status: 'アポ確定', callHistory: [
    call('美藤 陸', 'アポ獲得', '2026-09-01T01:00:00.000Z'),
    call('梶田 祐守', '担当者不在', '2026-09-05T01:00:00.000Z')] }),
  // 旧データ：アポ確定だがアポ獲得の記録が無い → 従来の担当営業を使う
  company('b', 'B_アポ確定_記録なし', { salesRep: '石本 善大', status: 'アポ確定' }),
  company('c', 'C_架電済', { salesRep: '美藤 陸', status: '架電済', callHistory: [
    call('美藤 陸', '不通', '2026-09-01T01:00:00.000Z'),
    call('梶田 祐守', '担当者不在', '2026-09-08T01:00:00.000Z')] }),
  // 担当営業が入っていても、架電記録が無ければ何も出さない
  company('d', 'D_未架電', { salesRep: '梶田 祐守' }),
  company('e', 'E_名前なし', { status: '架電済', callHistory: [call('', '不通', '2026-09-02T01:00:00.000Z')] }),
]

const { page, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('担当確定・最終架電者')

check('絞り込みに「担当営業」が無い', (await page.getByText('担当営業', { exact: true }).count()) === 0)
check('絞り込みに「最終架電者・担当確定」がある', (await page.getByText('最終架電者・担当確定').count()) > 0)

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)

const cards = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('div.bg-white.rounded-xl.border').forEach(el => {
    const name = el.querySelector('a,span')?.textContent?.trim() || ''
    if (!/^[A-E]_/.test(name)) return
    const chips = [...el.querySelectorAll('span')].map(s => s.textContent.trim())
    out.push({ name, chip: chips.find(t => /^(担当確定|最終架電者)/.test(t)) || null })
  })
  return out
})
const by = n => cards.find(c => c.name === n) || {}
check('アポ確定 → アポ獲得を記録した人', by('A_アポ確定').chip === '担当確定 美藤 陸', by('A_アポ確定').chip || 'なし')
check('アポ獲得の記録なし → 旧担当を表示', by('B_アポ確定_記録なし').chip === '担当確定 石本 善大', by('B_アポ確定_記録なし').chip || 'なし')
check('架電済 → 最後に架電した人', by('C_架電済').chip === '最終架電者 梶田 祐守', by('C_架電済').chip || 'なし')
check('未架電 → 何も出さない', by('D_未架電').chip === null, by('D_未架電').chip || 'なし')
check('架電者名が空 → 何も出さない', by('E_名前なし').chip === null, by('E_名前なし').chip || 'なし')

await page.getByText('検索に戻る').first().click()
await page.waitForTimeout(600)
await selectOptions(page, '最終架電者・担当確定', ['梶田 祐守'])
await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
const got = await listedCompanies(page)
check('最終架電者で絞れる', JSON.stringify(got) === JSON.stringify(['C_架電済']), JSON.stringify(got))

const modalBtn = page.getByRole('button', { name: '新規追加' }).first()
if (await modalBtn.count()) { await modalBtn.click(); await page.waitForTimeout(600) }
check('編集画面に担当営業欄が無い', (await page.locator('label').filter({ hasText: '担当営業' }).count()) === 0)

done(errs)
await close()
