/* 差分同期。
   Realtime が切れている間に他の人が入れた記録を、再読み込みせずに拾えること。
   スリープや通信断のあと「SRするまで古いまま」だったのを埋めるための仕組み。 */
import { open, company, call, makeReporter } from './harness.mjs'

const base = [
  company('a', 'A_他の人が更新', { status: '架電済', callHistory: [call('美藤 陸', '不通', '2026-09-01T02:00:00.000Z')] }),
  company('b', 'B_変更なし', { status: '未架電' }),
]

// 他の人が入れた更新（サーバー側の台帳）
const updated = JSON.parse(JSON.stringify(base[0]))
updated.callHistory.push(call('梶田 祐守', '担当者接触', '2026-09-19T02:00:00.000Z', { note: '他の人のメモ' }))
updated.status = '架電済'

const live = {
  stamp: '2026-09-19T00:00:00.000Z',
  rows: [{ id: 'a', data: updated, updated_at: '2026-09-19T03:00:00.000Z' }],
}

const { page, errs, close } = await open('dist', base, { live })
const { check, done } = makeReporter('差分同期')

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
const card = () => page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'A_他の人が更新' }).first()
check('最初は他の人のメモが見えない', !(await card().innerText()).includes('他の人のメモ'))

// 画面を離れて戻る＝スリープ明け相当。待たずに取りに行くはず
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
})
await page.waitForTimeout(3000)

const text = await card().innerText()
check('再読み込みせずに他の人の記録が出る', text.includes('他の人のメモ'), text.includes('他の人のメモ') ? 'OK' : text.slice(0, 60))
check('架電回数も増える', /架電\s*2回/.test(text.replace(/\s+/g, ' ')), text.replace(/\s+/g, ' ').match(/架電 \d+回/)?.[0] || '不明')
check('関係ない企業は残る', (await page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'B_変更なし' }).count()) === 1)

/* 自分が入れたばかりで、まだ送れていない記録を差分同期が消さないこと。
   ここを踏むと架電記録が消える。過去に実際に起きた事故と同じ形になる。 */
{
  const mine = [company('c', 'C_自分の記録', { status: '架電済', callHistory: [call('美藤 陸', '不通', '2026-09-01T02:00:00.000Z')] })]
  // サーバー側には自分の記録が入っていない版がある（他の人が別の項目を直した想定）
  const serverSide = JSON.parse(JSON.stringify(mine[0]))
  serverSide.memo = '他の人が書いたメモ'
  const live2 = { stamp: '2026-09-19T00:00:00.000Z',
    rows: [{ id: 'c', data: serverSide, updated_at: '2026-09-19T03:00:00.000Z' }] }

  const { page: p2, errs: e2, close: c2 } = await open('dist', mine, { live: live2, failWrites: true })
  await p2.getByRole('button', { name: '検索する' }).first().click()
  await p2.waitForTimeout(900)
  const card2 = p2.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'C_自分の記録' }).first()
  await card2.getByRole('button', { name: '架電を記録' }).click()
  await p2.waitForTimeout(600)
  await p2.locator('select').filter({ has: p2.locator('option', { hasText: '資料送付' }) }).first().selectOption('資料送付')
  await p2.waitForTimeout(200)
  await p2.getByRole('button', { name: /保存|記録する/ }).last().click()
  await p2.waitForTimeout(2500)

  await p2.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await p2.waitForTimeout(3000)
  const t2 = (await p2.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'C_自分の記録' }).first().innerText()).replace(/\s+/g, ' ')
  check('未送信の自分の記録を消さない', /架電 2回/.test(t2), t2.match(/架電 \d+回/)?.[0] || t2.slice(0, 60))
  errs.push(...e2)
  await c2()
}

done(errs)
await close()
