/* 都道府県の絞り込み。検索画面だけでなく検索結果画面でも使えること。
   2026-09-18 に「結果画面から都道府県が消えている」と報告があった箇所。 */
import { open, company, call, listedCompanies, selectOptions, makeReporter } from './harness.mjs'

const ITEMS = [
  company('a', 'A_東京', { prefecture: '東京都', status: '架電済', callHistory: [call('梶田 祐守', '担当者不在', '2026-09-10T01:00:00.000Z')] }),
  company('b', 'B_大阪', { prefecture: '大阪府', status: '架電済', callHistory: [call('美藤 陸', '不通', '2026-09-10T01:00:00.000Z')] }),
  company('c', 'C_大阪2', { prefecture: '大阪府' }),
  company('d', 'D_北海道', { prefecture: '北海道', status: 'アポ確定', callHistory: [call('梶田 祐守', 'アポ獲得', '2026-09-11T01:00:00.000Z')] }),
]

const { page, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('都道府県の絞り込み')

check('検索画面に都道府県がある', (await page.getByText('都道府県', { exact: true }).count()) > 0)

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
await page.getByRole('button', { name: /絞り込み/ }).first().click()
await page.waitForTimeout(600)
check('検索結果画面にも都道府県がある', (await page.getByText('都道府県', { exact: true }).count()) > 0)

await selectOptions(page, '都道府県', ['大阪府'])
await page.waitForTimeout(700)
const got = await listedCompanies(page)
check('大阪府で絞れる', JSON.stringify(got) === JSON.stringify(['B_大阪', 'C_大阪2']), JSON.stringify(got))

// 企業カードにエリアが出ること
const areaShown = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('div.bg-white.rounded-xl.border')]
  const card = cards.find(el => (el.textContent || '').includes('B_大阪'))
  if (!card) return null
  const labels = [...card.querySelectorAll('span')].map(s => s.textContent.trim())
  const i = labels.indexOf('エリア')
  return i >= 0 ? labels[i + 1] : null
})
check('企業カードにエリアが出る', areaShown === '大阪府', String(areaShown))

done(errs)
await close()
