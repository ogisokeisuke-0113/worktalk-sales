/* 次回架電予定日。
   2026-09-29 の報告：「登録して記録するを押したが残らない」。
   ・架電記録の編集画面から入れると、どこにも反映されずに捨てられていた
   ・空にしても古い日付が残り続けた
   入力欄には今の値を出しておき、そのまま反映する（触らなければ変わらない）。 */
import { open, company, call, makeReporter } from './harness.mjs'

const hist = [call('美藤 陸', '不通', '2026-09-01T02:00:00.000Z', { note: 'もとのメモ' })]
const ITEMS = [
  company('a', 'A_一覧から', { status: '架電済', callHistory: JSON.parse(JSON.stringify(hist)) }),
  company('b', 'B_詳細から', { status: '架電済', callHistory: JSON.parse(JSON.stringify(hist)) }),
  company('c', 'C_編集から', { status: '架電済', callHistory: JSON.parse(JSON.stringify(hist)) }),
  company('d', 'D_空にする', { status: '架電済', nextCallDate: '2026-09-10', callHistory: JSON.parse(JSON.stringify(hist)) }),
  company('e', 'E_触らない', { status: '架電済', nextCallDate: '2026-10-31', callHistory: JSON.parse(JSON.stringify(hist)) }),
]

const { page, writes, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('次回架電予定日')

const row = n => writes.filter(w => w.table === 'teleapo_items')
  .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)
  .map(x => x.data || x).filter(d => d && d.companyName === n).pop()
const dateIn = (scope, label) => scope.locator('div')
  .filter({ has: page.locator('label', { hasText: label }) }).last().locator('input[type=date]').first()
const closeOverlays = async () => {
  for (let i = 0; i < 4; i++) {
    const ov = page.locator('div.fixed.inset-0')
    if (!(await ov.count())) break
    await ov.first().click({ position: { x: 5, y: 400 }, force: true }).catch(() => {})
    await page.waitForTimeout(350)
  }
}
async function recordFromCard(name, { date, result = '担当者不在' } = {}) {
  const card = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: name }).first()
  await card.getByRole('button', { name: '架電を記録' }).click()
  await page.waitForTimeout(600)
  const m = page.locator('div.fixed.inset-0').last()
  await m.locator('select').filter({ has: page.locator('option', { hasText: result }) }).first().selectOption(result)
  if (date !== undefined) { await dateIn(m, '次回架電予定日').fill(date); await page.waitForTimeout(200) }
  await m.getByRole('button', { name: /保存|記録する/ }).last().click()
  await page.waitForTimeout(3000)
}

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)

await recordFromCard('A_一覧から', { date: '2026-10-15' })
check('一覧から記録：保存される', row('A_一覧から')?.nextCallDate === '2026-10-15', String(row('A_一覧から')?.nextCallDate))

/* 詳細パネルから記録 */
await page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'B_詳細から' }).first()
  .getByRole('button', { name: '詳細' }).click()
await page.waitForTimeout(700)
{
  const panel = page.locator('div.fixed.inset-0')
  await panel.getByRole('button', { name: /架電を記録/ }).first().click()
  await page.waitForTimeout(600)
  const m = page.locator('div.fixed.inset-0').last()
  await m.locator('select').filter({ has: page.locator('option', { hasText: '担当者不在' }) }).first().selectOption('担当者不在')
  await dateIn(m, '次回架電予定日').fill('2026-10-20')
  await page.waitForTimeout(200)
  await m.getByRole('button', { name: /保存|記録する/ }).last().click()
  await page.waitForTimeout(3000)
  check('詳細から記録：保存される', row('B_詳細から')?.nextCallDate === '2026-10-20', String(row('B_詳細から')?.nextCallDate))
}
await closeOverlays()

/* 架電記録の「編集」から設定（今回の不具合） */
await page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'C_編集から' }).first()
  .getByRole('button', { name: '詳細' }).click()
await page.waitForTimeout(700)
{
  const panel = page.locator('div.fixed.inset-0')
  await panel.locator('div.border.border-slate-200.rounded-lg').filter({ hasText: 'もとのメモ' }).first()
    .getByRole('button', { name: '編集' }).click()
  await page.waitForTimeout(700)
  const m = page.locator('div.fixed.inset-0').last()
  await dateIn(m, '次回架電予定日').fill('2026-10-25')
  await page.waitForTimeout(200)
  await m.getByRole('button', { name: /保存|記録する/ }).last().click()
  await page.waitForTimeout(3000)
  const r = row('C_編集から')
  check('編集から設定：保存される', r?.nextCallDate === '2026-10-25', String(r?.nextCallDate))
  const entry = (r?.callHistory || []).find(c => c.note === 'もとのメモ')
  check('編集：予定日を架電記録に混ぜない', entry && !('nextCallDate' in entry), entry ? Object.keys(entry).filter(k => k === 'nextCallDate').join() || 'OK' : 'なし')
}
await closeOverlays()

/* 空にして消す */
await recordFromCard('D_空にする', { date: '' })
check('空にすると消える', row('D_空にする') && !String(row('D_空にする').nextCallDate || '').trim(), String(row('D_空にする')?.nextCallDate))

/* 触らなければ変わらない */
await recordFromCard('E_触らない')
check('触らなければ今の予定日が残る', row('E_触らない')?.nextCallDate === '2026-10-31', String(row('E_触らない')?.nextCallDate))

done(errs)
await close()
