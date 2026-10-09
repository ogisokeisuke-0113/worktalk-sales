/* 古い内容を抱えた画面が「アポ確定」を取り消すのを防ぐ。
   2026-10-08 に実際に起きた（テクノエフアンドシー）：
   05:44 にアポ獲得で自動昇格 → 08:09 に古い画面が保存して 架電済 に戻った。
   架電履歴はマージで守られるので、記録だけ残って状態だけ巻き戻る。 */
import { open, company, call, makeReporter } from './harness.mjs'

/* 画面が持っている内容（古い）：アポ獲得の記録をまだ知らない */
const stale = [company('a', 'A_古い画面', { status: '架電済', callHistory: [
  call('美藤 陸', '担当者不在', '2026-10-07T04:51:37.000Z', { note: 'PM会議' })] })]

/* サーバー側（新しい）：すでにアポ獲得が記録され、アポ確定になっている */
const onServer = JSON.parse(JSON.stringify(stale[0]))
onServer.status = 'アポ確定'
onServer.callHistory.push(call('美藤 陸', 'アポ獲得', '2026-10-08T05:44:56.000Z', { note: '吉田様宛' }))

const { page, writes, errs, close } = await open('dist', stale, { serverSide: { a: onServer } })
const { check, done } = makeReporter('古い画面がアポ確定を取り消さない')

const sent = () => writes.filter(w => w.table === 'teleapo_items')
  .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)
  .map(x => x.data || x).filter(d => d && d.companyName === 'A_古い画面').pop()

/* 古い画面から、関係のない操作（架電記録の追加）で保存を起こす */
await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
const card = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'A_古い画面' }).first()
await card.getByRole('button', { name: '架電を記録' }).click()
await page.waitForTimeout(600)
await page.locator('select').filter({ has: page.locator('option', { hasText: '不通' }) }).first().selectOption('不通')
await page.waitForTimeout(200)
await page.getByRole('button', { name: /保存|記録する/ }).last().click()
await page.waitForTimeout(3500)

const row = sent()
check('保存は通る', !!row)
check('アポ確定が取り消されない', row?.status === 'アポ確定', String(row?.status))
check('サーバー側のアポ獲得が残る',
  (row?.callHistory || []).some(c => c.result === 'アポ獲得'),
  `${(row?.callHistory || []).length}件`)
check('自分が入れた記録も残る',
  (row?.callHistory || []).some(c => c.result === '不通'))

done(errs)
await close()
