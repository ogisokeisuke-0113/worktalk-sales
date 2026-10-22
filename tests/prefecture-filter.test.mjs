/* 都道府県の絞り込み。検索画面だけでなく検索結果画面でも使えること。
   2026-09-18 に「結果画面から都道府県が消えている」と報告があった箇所。 */
import { open, company, call, listedCompanies, selectOptions, makeReporter } from './harness.mjs'

const ITEMS = [
  company('a', 'A_東京', { prefecture: '東京都', status: '架電済', callHistory: [call('梶田 祐守', '担当者不在', '2026-09-10T01:00:00.000Z')] }),
  company('b', 'B_大阪', { prefecture: '大阪府', status: '架電済', callHistory: [call('美藤 陸', '不通', '2026-09-10T01:00:00.000Z')] }),
  company('c', 'C_大阪2', { prefecture: '大阪府' }),
  company('e', 'E_未設定', { prefecture: '' }),
  company('f', 'F_未設定2', { prefecture: '  ' }),
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

/* 都道府県が入っていない企業を抜き出せること */
await selectOptions(page, '都道府県', ['未設定'])
await page.waitForTimeout(800)
const none = await listedCompanies(page)
check('「未設定」で空の企業だけ出る', JSON.stringify(none) === JSON.stringify(['E_未設定', 'F_未設定2']), JSON.stringify(none))

await selectOptions(page, '都道府県', ['未設定', '北海道'])
await page.waitForTimeout(800)
const both = await listedCompanies(page)
check('未設定と県を同時に選べる', JSON.stringify(both) === JSON.stringify(['D_北海道', 'E_未設定', 'F_未設定2']), JSON.stringify(both))

{
  // 候補の中身を確かめるためパネルを開く
  const wrap = page.locator('div').filter({ has: page.locator('label', { hasText: '都道府県' }) }).last()
  await wrap.locator('button').first().click()
  await page.waitForTimeout(400)
  const opts = (await wrap.locator('div.absolute').locator('label').allInnerTexts()).map(t => t.trim())
  check('候補は47都道府県＋未設定の48件', opts.length === 48, `${opts.length}件`)
  check('先頭が未設定で、最後は沖縄県', opts[0] === '未設定' && opts[opts.length - 1] === '沖縄県',
    `${opts[0]} … ${opts[opts.length - 1]}`)
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.waitForTimeout(300)
}

await selectOptions(page, '都道府県', ['大阪府'])
await page.waitForTimeout(800)

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

// 企業編集の都道府県がドロップダウンで、47件そろっていること
await page.getByText('検索に戻る').first().click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: '新規追加' }).first().click()
await page.waitForTimeout(700)
const pref = await page.evaluate(() => {
  // 企業編集モーダル側の見出しは「エリア（都道府県）」
  const label = [...document.querySelectorAll('label')].find(l => l.textContent.trim() === 'エリア（都道府県）')
  const field = label?.parentElement?.querySelector('select, input')
  if (!field) return null
  return {
    tag: field.tagName,
    options: field.tagName === 'SELECT' ? [...field.options].map(o => o.value) : null,
  }
})
check('都道府県が選択式になっている', pref?.tag === 'SELECT', String(pref?.tag))
check('47都道府県そろっている', pref?.options?.filter(Boolean).length === 47, `${pref?.options?.filter(Boolean).length}件`)
check('先頭は未設定', pref?.options?.[0] === '', JSON.stringify(pref?.options?.slice(0, 3)))

done(errs)
await close()
