/* ブックマークを複数のリストに分け、名前も変えられること。
   1社は1つのリストにだけ入る（別リストを選ぶと移動）。 */
import { open, company, makeReporter } from './harness.mjs'

const ITEMS = [
  company('a', 'A_りんご'),
  company('b', 'B_みかん'),
  company('c', 'C_ぶどう'),
]
const store = { rows: [] }

const { page, errs, close } = await open('dist', ITEMS, { bookmarks: store })
const { check, done } = makeReporter('ブックマークの複数リスト')

const mine = () => store.rows.filter(r => r.user_id === 'a1')
const of = name => mine().find(r => r.company_name === name)
const card = name => page.locator('div.bg-white.rounded-xl.border').filter({ hasText: name }).first()
const star = name => card(name).locator('button', { hasText: /^[★☆]/ }).first()

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)

/* ① リストが無いうちは、押すだけで既定のリストに入る */
await star('A_りんご').click()
await page.waitForTimeout(1500)
check('はじめの1件は既定のリストに入る', of('A_りんご')?.list_name === 'マイリスト', String(of('A_りんご')?.list_name))

/* ② 新しいリストを作って入れる */
page.once('dialog', d => d.accept('10月アプローチ'))
await star('B_みかん').click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /＋ 新しいリスト/ }).first().click()
await page.waitForTimeout(1500)
check('新しいリストを作って入れられる', of('B_みかん')?.list_name === '10月アプローチ', String(of('B_みかん')?.list_name))
check('先に入れた分は動かない', of('A_りんご')?.list_name === 'マイリスト', String(of('A_りんご')?.list_name))

/* ③ 既存のリストを選んで入れる */
await star('C_ぶどう').click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /^　?10月アプローチ$/ }).first().click()
await page.waitForTimeout(1500)
check('既存のリストを選んで入れられる', of('C_ぶどう')?.list_name === '10月アプローチ', String(of('C_ぶどう')?.list_name))

/* ④ 別のリストへ移す（1社は1リストなので増えない） */
await star('C_ぶどう').click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /^　?マイリスト$/ }).first().click()
await page.waitForTimeout(1500)
check('別のリストへ移せる', of('C_ぶどう')?.list_name === 'マイリスト', String(of('C_ぶどう')?.list_name))
check('移動しても件数は増えない', mine().length === 3, `${mine().length}件`)

/* ⑤ カードに今のリスト名が出る */
check('カードにリスト名が出る', (await card('B_みかん').innerText()).includes('10月アプローチ'))

/* ⑥ 絞り込みがリスト単位になっている */
await page.getByText('検索に戻る').first().click()
await page.waitForTimeout(700)
check('絞り込みにリストが並ぶ', (await page.getByText('10月アプローチ').count()) > 0 && (await page.getByText('マイリスト').count()) > 0)

/* ⑦ リスト名を変更できる */
page.once('dialog', d => d.accept('11月アプローチ'))
const row = page.locator('span').filter({ hasText: '10月アプローチ' }).last()
await row.getByRole('button', { name: '✎' }).click()
await page.waitForTimeout(1800)
check('リスト名を変更できる', of('B_みかん')?.list_name === '11月アプローチ', String(of('B_みかん')?.list_name))
check('他のリストは変わらない', of('A_りんご')?.list_name === 'マイリスト', String(of('A_りんご')?.list_name))

/* ⑧ リスト単位で絞り込める */
{
  const label = page.locator('label').filter({ hasText: '11月アプローチ' }).first()
  await label.locator('input[type=checkbox]').check()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '検索する' }).first().click()
  await page.waitForTimeout(900)
  const names = (await page.locator('div.bg-white.rounded-xl')
    .filter({ has: page.locator('a[href*="google.com/search"]') }).allInnerTexts())
    .map(t => t.split('\n')[0].trim()).sort()
  check('リストで絞り込める', JSON.stringify(names) === JSON.stringify(['B_みかん']), JSON.stringify(names))
}

done(errs)
await close()
