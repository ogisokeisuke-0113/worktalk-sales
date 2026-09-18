/* 架電記録の保存。このシステムで一番壊してはいけない部分。
   2026-09-09〜10 に記録が保存されたりされなかったりする事故が起きた。
   ・起動しただけで全社を上書きしない（差分の誤検知で大量upsertが走った）
   ・記録すると1社だけ送られ、記録者が入り、call_logs にも残る */
import { open, company, call, makeReporter } from './harness.mjs'

const ITEMS = [
  company('a', 'A_未架電'),
  company('c', 'C_架電済', { salesRep: '美藤 陸', status: '架電済', callHistory: [
    call('美藤 陸', '不通', '2026-09-01T01:00:00.000Z'),
    call('梶田 祐守', '担当者不在', '2026-09-08T01:00:00.000Z')] }),
]

const { page, writes, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('架電記録の保存')

const upsertsAtStartup = writes.filter(w => w.table === 'teleapo_items').length
check('起動しただけでは上書きしない', upsertsAtStartup === 0, `${upsertsAtStartup}件`)

await page.getByRole('button', { name: '検索する' }).first().click()
await page.waitForTimeout(900)
const card = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'C_架電済' }).first()
await card.getByRole('button', { name: '架電を記録' }).click()
await page.waitForTimeout(600)
await page.locator('select').filter({ has: page.locator('option', { hasText: '担当者不在' }) })
  .first().selectOption('担当者不在')
await page.waitForTimeout(200)
await page.getByRole('button', { name: /保存|記録する/ }).last().click()
await page.waitForTimeout(3000)

const sent = writes.filter(w => w.table === 'teleapo_items')
  .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)
const logs = writes.filter(w => w.table === 'call_logs')
  .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)
const row = sent.map(x => x.data || x).filter(d => d && d.companyName === 'C_架電済').pop()

check('保存された', !!row)
check('送信は1社だけ', sent.length === 1, `${sent.length}社`)
check('架電履歴が1件増える', row ? (row.callHistory || []).length === 3 : false, row ? `${(row.callHistory || []).length}件` : '')
check('記録者が入る', row ? (row.callHistory || []).slice(-1)[0]?.caller === 'テスト太郎' : false,
  row ? String((row.callHistory || []).slice(-1)[0]?.caller) : '')
check('担当営業は書き換えない', row ? row.salesRep === '美藤 陸' : false, row ? String(row.salesRep) : '')
check('call_logs にも残る', logs.length > 0, `${logs.length}件`)

done(errs)
await close()
