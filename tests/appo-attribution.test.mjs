/* ダッシュボードのアポ獲得件数は「獲得を記録した本人」の実績として数える。
   2026-10-02 の報告：9/28〜10/2で全体10件なのに、担当で絞ると梶田7＋美藤5＝12。
   梶田が過去に架電しただけの企業（アポを取ったのは美藤）まで梶田に計上されていた。 */
import { open, company, call, makeReporter } from './harness.mjs'

const ITEMS = [
  // 梶田が取ったアポ
  company('a', 'A_梶田が獲得', { status: 'アポ確定', callHistory: [
    call('梶田 祐守', 'アポ獲得', '2026-09-29T02:00:00.000Z')] }),
  // 美藤が取ったアポ
  company('b', 'B_美藤が獲得', { status: 'アポ確定', callHistory: [
    call('美藤 陸', 'アポ獲得', '2026-09-30T02:00:00.000Z')] }),
  // 梶田が先に架電し、美藤が獲得した企業（今回の二重計上の原因）
  company('c', 'C_梶田も架電_美藤が獲得', { status: 'アポ確定', salesRep: '梶田 祐守', callHistory: [
    call('梶田 祐守', '担当者不在', '2026-09-20T02:00:00.000Z'),
    call('美藤 陸', 'アポ獲得', '2026-10-01T02:00:00.000Z')] }),
  // 期間外のアポ
  company('d', 'D_期間外', { status: 'アポ確定', callHistory: [
    call('梶田 祐守', 'アポ獲得', '2026-08-15T02:00:00.000Z')] }),
]

// ダッシュボードの担当フィルタは利用者一覧から作られる
const USERS = [
  { id: 'u1', name: '梶田 祐守' },
  { id: 'u2', name: '美藤 陸' },
]
const { page, errs, close } = await open('dist', ITEMS, { users: USERS })
const { check, done } = makeReporter('アポ獲得の担当別集計')

await page.getByRole('button', { name: 'ダッシュボード', exact: true }).first().click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'テレアポ', exact: true }).last().click()
await page.waitForTimeout(1200)

// ダッシュボードの期間欄（テレアポ一覧側の日付欄と混ざらないよう絞る）
const panel = page.locator('div').filter({ hasText: /^ダッシュボード/ }).first()
const dateInputs = page.locator('input[type=date]:visible')
await dateInputs.nth(0).fill('2026-09-28')
await dateInputs.nth(1).fill('2026-10-02')
await page.waitForTimeout(1200)

/* KPIカード「アポ獲得」の数字を読む */
async function appoCount() {
  return await page.evaluate(() => {
    // KPIカードは「アポ獲得 <数> 社 獲得率 …」という並び
    // KPIカードは「アポ獲得 <数> 社」。この並びはここだけ
    const m = (document.body.textContent || '').match(/アポ獲得\s*(\d+)\s*社/)
    return m ? Number(m[1]) : null
  })
}
const all = await appoCount()
check('担当で絞らない：全体の件数', all === 3, `${all}件（期待3）`)

/* 担当で絞る */
async function pickRep(name) {
  // 担当の絞り込みは「全担当」ボタン
  const trigger = page.getByRole('button', { name: /全担当|件選択中|梶田|美藤/ }).first()
  await trigger.click()
  await page.waitForTimeout(400)
  const panel = page.locator('div.absolute').filter({ hasText: '梶田 祐守' }).first()
  const clear = panel.getByRole('button', { name: 'すべて解除' })
  if (await clear.count()) { await clear.click(); await page.waitForTimeout(250) }
  await panel.locator('label').filter({ has: page.getByText(name, { exact: true }) })
    .first().locator('input[type=checkbox]').check()
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.waitForTimeout(1000)
}
await pickRep('梶田 祐守')
const kajita = await appoCount()
check('梶田で絞る：自分が獲得した分だけ', kajita === 1, `${kajita}件（期待1・架電しただけの企業は数えない）`)

await pickRep('美藤 陸')
const bito = await appoCount()
check('美藤で絞る：自分が獲得した分だけ', bito === 2, `${bito}件（期待2）`)

check('担当別の合計が全体と一致する', kajita + bito === all, `${kajita}+${bito}=${kajita + bito} / 全体${all}`)

done(errs)
await close()
