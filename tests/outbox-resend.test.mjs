/* 端末に預けた未送信ぶんを、次の起動で送り直す。
   ブラウザが落ちた・タブを閉じた・強制更新した、どの場合でも記録を落とさないための保険。 */
import { open, company, call, makeReporter } from './harness.mjs'

const base = [company('a', 'A_預かり', { status: '架電済', callHistory: [call('美藤 陸', '不通', '2026-09-01T02:00:00.000Z')] })]
const { check, done } = makeReporter('未送信ぶんの預かりと再送')
const allErrs = []

/* ① 保存が失敗する状況で記録 → 端末に預けられる */
let boxed = null
{
  const { page, errs, close } = await open('dist', base, { failWrites: true })
  await page.getByRole('button', { name: '検索する' }).first().click()
  await page.waitForTimeout(900)
  await page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'A_預かり' }).first()
    .getByRole('button', { name: '架電を記録' }).click()
  await page.waitForTimeout(600)
  await page.locator('select').filter({ has: page.locator('option', { hasText: '担当者接触' }) })
    .first().selectOption('担当者接触')
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /保存|記録する/ }).last().click()
  await page.waitForTimeout(7000)
  boxed = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('worktalk_cache', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    return await new Promise(res => {
      const q = db.transaction('lists', 'readonly').objectStore('lists').get('outbox:teleapo')
      q.onsuccess = () => res(q.result || null); q.onerror = () => res(null)
    })
  })
  check('預かり箱に入る', !!boxed && (boxed.changed || []).length > 0, boxed ? `${(boxed.changed || []).length}件` : 'なし')
  allErrs.push(...errs)
  await close()
}

/* ② 次の起動（保存が通る状態）で、預かり分が送り直される */
{
  const { page, writes, errs, close } = await open('dist', base, { seedOutbox: boxed })
  await page.waitForTimeout(6000)
  const sent = writes.filter(w => w.table === 'teleapo_items')
    .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)
    .map(x => x.data || x).filter(d => d && d.companyName === 'A_預かり')
  check('起動時に送り直される', sent.some(d => (d.callHistory || []).some(c => c.result === '担当者接触')),
    `${sent.length}回送信`)
  const left = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('worktalk_cache', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    return await new Promise(res => {
      const q = db.transaction('lists', 'readonly').objectStore('lists').get('outbox:teleapo')
      q.onsuccess = () => res(q.result || null); q.onerror = () => res(null)
    })
  })
  check('送れたら箱は空になる', left === null || !(left.changed || []).length, JSON.stringify(left && (left.changed || []).length))
  allErrs.push(...errs)
  await close()
}

done(allErrs)
