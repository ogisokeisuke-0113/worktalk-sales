/* 架電結果の絞り込み。
   「未架電（履歴なし）」は結果の値ではなく「履歴が0件」なので、
   他の結果と OR で組み合わせられること。2026-09-17 にここが壊れて全件表示になった。 */
import { open, company, call, listedCompanies, selectOptions, makeReporter } from './harness.mjs'

const h = (result) => [call('梶田 祐守', result, '2026-09-10T01:00:00.000Z')]
const ITEMS = [
  company('a', 'A_未架電'),
  company('b', 'B_不在', { status: '架電済', callHistory: h('担当者不在') }),
  company('c', 'C_不通', { status: '架電済', callHistory: h('不通') }),
  company('d', 'D_断り', { status: '架電済', callHistory: h('断り') }),
  company('e', 'E_アポ獲得', { status: 'アポ確定', callHistory: h('アポ獲得') }),
  company('f', 'F_未架電2'),
  company('g', 'G_復元', { status: '架電済', callHistory: h('（復元・要確認）') }),
  company('i', 'I_旧不在', { status: '架電済', callHistory: h('不在') }),
]

const { page, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('架電結果の絞り込み')

async function search(values) {
  if (await page.getByText('検索に戻る').count()) {
    await page.getByText('検索に戻る').first().click()
    await page.waitForTimeout(500)
  }
  await selectOptions(page, '架電結果', values)
  await page.getByRole('button', { name: '検索する' }).first().click()
  await page.waitForTimeout(900)
  return listedCompanies(page)
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

let got = await search(['未架電（履歴なし）'])
check('未架電のみ', eq(got, ['A_未架電', 'F_未架電2']), JSON.stringify(got))

got = await search(['担当者不在', '不通'])
check('担当者不在＋不通', eq(got, ['B_不在', 'C_不通']), JSON.stringify(got))

got = await search(['未架電（履歴なし）', '担当者不在', '不通'])
check('未架電＋担当者不在＋不通', eq(got, ['A_未架電', 'B_不在', 'C_不通', 'F_未架電2']), JSON.stringify(got))

got = await search(['（復元・要確認）'])
check('復元データのみ', eq(got, ['G_復元']), JSON.stringify(got))

got = await search(['不在'])
check('旧表記「不在」は担当者不在と別物', eq(got, ['I_旧不在']), JSON.stringify(got))

got = await search(['（復元・要確認）', '担当者不在'])
check('復元＋担当者不在', eq(got, ['B_不在', 'G_復元']), JSON.stringify(got))

done(errs)
await close()
