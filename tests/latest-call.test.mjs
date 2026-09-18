/* カードの「直近架電」に何を出すか。
   取り込み時にできた中身の無い記録が配列の末尾に入っていることがあり、
   単純に最後の要素を取ると中身のある最新の記録が隠れてしまっていた。
   優先順位は 中身のある記録 → 中身の無い記録 → 記録なし。 */
import { open, company, call, makeReporter } from './harness.mjs'

const blank = (date = null) => call('美藤 陸', '', date)

const ITEMS = [
  // 中身のある記録が先にあり、空の記録が後ろに積まれている（今回の報告ケース）
  company('a', 'A_空が末尾', { status: '架電済', callHistory: [
    call('梶田 祐守', '担当者不在', '2026-09-01T01:00:00.000Z', { note: '古いメモ' }),
    call('梶田 祐守', '担当者接触', '2026-09-10T01:00:00.000Z', { note: '最新のメモ' }),
    blank('2026-09-12T01:00:00.000Z'),
    blank(null),
  ] }),
  // 中身のある記録が複数。日時が新しいほうを出す（配列の順番ではなく）
  company('b', 'B_順番が逆', { status: '架電済', callHistory: [
    call('梶田 祐守', '不通', '2026-09-15T01:00:00.000Z', { note: 'こちらが最新' }),
    call('梶田 祐守', '受付ブロック', '2026-09-03T01:00:00.000Z'),
  ] }),
  // 空の記録しかない場合はそれを出す
  company('c', 'C_空だけ', { status: '架電済', callHistory: [blank('2026-09-05T01:00:00.000Z'), blank(null)] }),
  // 履歴なし
  company('d', 'D_記録なし'),
  // 結果は空だがメモがある＝中身のある記録として扱う
  company('e', 'E_メモだけ', { status: '架電済', callHistory: [
    blank('2026-09-09T01:00:00.000Z'),
    call('梶田 祐守', '', '2026-09-08T01:00:00.000Z', { note: 'メモだけの記録' }),
  ] }),
]

const { page, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('直近架電の表示')

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)

const shown = await page.evaluate(() => {
  const out = {}
  document.querySelectorAll('div.bg-white.rounded-xl.border').forEach(el => {
    const name = el.querySelector('a,span')?.textContent?.trim() || ''
    if (!/^[A-E]_/.test(name)) return
    const box = [...el.querySelectorAll('div')].find(d => (d.textContent || '').includes('直近架電'))
    out[name] = (box?.textContent || '').replace(/\s+/g, ' ').trim()
  })
  return out
})

check('空が末尾でも中身のある最新を出す', /最新のメモ/.test(shown['A_空が末尾'] || ''), shown['A_空が末尾'])
check('古いメモは出さない', !/古いメモ/.test(shown['A_空が末尾'] || ''))
check('配列順でなく日時が新しいほうを出す', /こちらが最新/.test(shown['B_順番が逆'] || ''), shown['B_順番が逆'])
check('空しか無ければ空を出す', /直近架電/.test(shown['C_空だけ'] || '') && !/まだ記録がありません/.test(shown['C_空だけ'] || ''), shown['C_空だけ'])
check('履歴なしは「まだ記録がありません」', /まだ記録がありません/.test(shown['D_記録なし'] || ''), shown['D_記録なし'])
check('結果が空でもメモがあれば中身あり扱い', /メモだけの記録/.test(shown['E_メモだけ'] || ''), shown['E_メモだけ'])

// 詳細パネルの履歴は新しい順（日時なしは末尾）
await page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'A_空が末尾' }).first()
  .getByRole('button', { name: '詳細' }).click()
await page.waitForTimeout(700)
const order = await page.evaluate(() => {
  const panel = document.querySelector('div.fixed.inset-0')
  const txt = (panel?.textContent || '')
  return { newest: txt.indexOf('最新のメモ'), oldest: txt.indexOf('古いメモ') }
})
check('詳細の履歴は新しい順', order.newest > -1 && order.oldest > -1 && order.newest < order.oldest,
  JSON.stringify(order))

done(errs)
await close()
