/* 企業を登録するとき、固定電話の市外局番から都道府県を自動で埋める。
   すでに値が入っているときと、県をまたぐ局番のときは触らない。 */
import { open, company, makeReporter } from './harness.mjs'

const { page, errs, close } = await open('dist', [company('a', 'A_既存')])
const { check, done } = makeReporter('電話番号から都道府県を自動入力')

async function openModal() {
  const btn = page.getByRole('button', { name: '新規追加' }).first()
  await btn.click()
  await page.waitForTimeout(700)
}
const field = (label) => page.locator('div.fixed').locator('div')
  .filter({ has: page.locator('label', { hasText: label }) }).last()
const prefValue = () => field('エリア（都道府県）').locator('select').first().inputValue()

async function typePhone(v) {
  await field('代表電話番号').locator('input').first().fill(v)
  await page.waitForTimeout(400)
}

await openModal()
await typePhone('03-5348-8101')
check('03 → 東京都', (await prefValue()) === '東京都', await prefValue())

await typePhone('092-483-8777')
check('すでに入っていれば上書きしない', (await prefValue()) === '東京都', await prefValue())

// 入れ直して別の県
await field('エリア（都道府県）').locator('select').first().selectOption('')
await page.waitForTimeout(200)
await typePhone('011-747-2466')
check('011 → 北海道', (await prefValue()) === '北海道', await prefValue())

await field('エリア（都道府県）').locator('select').first().selectOption('')
await page.waitForTimeout(200)
await typePhone('06-6252-7676')
check('06（大阪/兵庫にまたがる）は推測しない', (await prefValue()) === '', `"${await prefValue()}"`)

await typePhone('090-1234-5678')
check('携帯は推測しない', (await prefValue()) === '', `"${await prefValue()}"`)

await typePhone('0120-123-456')
check('フリーダイヤルは推測しない', (await prefValue()) === '', `"${await prefValue()}"`)

await typePhone('０５２-414-6590')
check('全角でも判定する（052 → 愛知県）', (await prefValue()) === '愛知県', await prefValue())

done(errs)
await close()
