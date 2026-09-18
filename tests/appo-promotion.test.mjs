/* 架電記録で「アポ獲得」を選んだら、そのまま提案リストへ入るまでを自動化する。
   2026-09-18 まで、一覧から記録すると ReferenceError: handlePromote is not defined で
   止まっており、手で「アポ確定」を押す運用になっていた。
   画面遷移の影響を受けないよう、シナリオごとに新しいセッションで確かめる。 */
import { open, company, call, makeReporter } from './harness.mjs'

const base = (id, name, status, history) => company(id, name, { status, callHistory: history })
const oneCall = [call('美藤 陸', '不通', '2026-09-01T01:00:00.000Z')]

const { check, done } = makeReporter('アポ獲得→提案リストへ自動反映')
const allErrs = []

const rowsOf = (writes, table) => writes.filter(w => w.table === table)
  .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)

async function recordFromList(page, name, result) {
  await page.getByRole('button', { name: '検索する' }).first().click()
  await page.waitForTimeout(900)
  const card = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: name }).first()
  await card.getByRole('button', { name: '架電を記録' }).click()
  await page.waitForTimeout(600)
  await page.locator('select').filter({ has: page.locator('option', { hasText: result }) })
    .first().selectOption(result)
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /保存|記録する/ }).last().click()
  await page.waitForTimeout(2500)
}

/* ① 一覧のカードから「アポ獲得」を記録する */
{
  const items = [base('d', 'D_一覧から', '架電済', oneCall)]
  const { page, writes, errs, close } = await open('dist', items)
  await recordFromList(page, 'D_一覧から', 'アポ獲得')
  const row = rowsOf(writes, 'teleapo_items').map(x => x.data || x).filter(d => d?.companyName === 'D_一覧から').pop()
  check('一覧から：架電記録が保存される', !!row && (row.callHistory || []).some(c => c.result === 'アポ獲得'))
  check('一覧から：アポ確定になる', row?.status === 'アポ確定', String(row?.status))
  check('一覧から：提案リストに入る', rowsOf(writes, 'proposals').length === 1, `${rowsOf(writes, 'proposals').length}件`)
  allErrs.push(...errs)
  await close()
}

/* ② 詳細パネルから「アポ獲得」を記録する */
{
  const items = [base('c', 'C_詳細から', '架電済', oneCall)]
  const { page, writes, errs, close } = await open('dist', items)
  await page.getByRole('button', { name: '検索する' }).first().click()
  await page.waitForTimeout(900)
  await page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'C_詳細から' }).first()
    .getByRole('button', { name: '詳細' }).click()
  await page.waitForTimeout(700)
  // 背面のカードにも同じボタンがあるので、詳細パネル内に絞る
  const panel = page.locator('div.fixed.inset-0')
  await panel.getByRole('button', { name: /架電を記録/ }).first().click()
  await page.waitForTimeout(600)
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'アポ獲得' }) })
    .first().selectOption('アポ獲得')
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /保存|記録する/ }).last().click()
  await page.waitForTimeout(2500)
  const row = rowsOf(writes, 'teleapo_items').map(x => x.data || x).filter(d => d?.companyName === 'C_詳細から').pop()
  check('詳細から：アポ確定になる', row?.status === 'アポ確定', String(row?.status))
  check('詳細から：提案リストに入る', rowsOf(writes, 'proposals').length === 1, `${rowsOf(writes, 'proposals').length}件`)
  allErrs.push(...errs)
  await close()
}

/* ③ アポ確定の企業には架電記録ボタンを出さない（二重に昇格させない） */
{
  const items = [base('e', 'E_既にアポ確定', 'アポ確定', [call('美藤 陸', 'アポ獲得', '2026-09-01T01:00:00.000Z')])]
  const { page, writes, errs, close } = await open('dist', items)
  await page.getByRole('button', { name: '検索する' }).first().click()
  await page.waitForTimeout(900)
  const card = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'E_既にアポ確定' }).first()
  const n = await card.getByRole('button', { name: '架電を記録' }).count()
  check('アポ確定には架電記録ボタンを出さない', n === 0, `${n}個`)
  check('提案リストも作られない', rowsOf(writes, 'proposals').length === 0, `${rowsOf(writes, 'proposals').length}件`)
  allErrs.push(...errs)
  await close()
}

/* ④ アポ獲得以外では昇格しない */
{
  const items = [base('f', 'F_不在', '架電済', oneCall)]
  const { page, writes, errs, close } = await open('dist', items)
  await recordFromList(page, 'F_不在', '担当者不在')
  const row = rowsOf(writes, 'teleapo_items').map(x => x.data || x).filter(d => d?.companyName === 'F_不在').pop()
  check('担当者不在では昇格しない', rowsOf(writes, 'proposals').length === 0 && row?.status === '架電済',
    `提案${rowsOf(writes, 'proposals').length}件 / ${row?.status}`)
  allErrs.push(...errs)
  await close()
}

done(allErrs)
