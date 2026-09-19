/* 新しい版が配信されたら強制的に更新する。
   ただし未送信の架電記録を落とさないこと。落としたら本末転倒なのでここを厚く見る。 */
import { open, company, call, makeReporter } from './harness.mjs'

const ITEMS = [
  company('a', 'A_更新中', { status: '架電済', callHistory: [call('美藤 陸', '不通', '2026-09-01T02:00:00.000Z')] }),
]

const { check, done } = makeReporter('新しい版の強制更新')
const allErrs = []

/* ① 未送信が無い状態 → 予告が出て、押すと再読み込みされる */
{
  const { page, errs, close } = await open('dist', ITEMS)
  // 配信中の index.html が別のファイル名を返すよう差し替える（＝新しい版が出た状態）
  await page.route('**/worktalk-sales/?v=*', r => r.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><script type="module" src="/worktalk-sales/assets/index-NEWBUILD.js"></script>',
  }))
  let reloaded = false
  page.on('framenavigated', f => { if (f === page.mainFrame()) reloaded = true })

  await page.waitForTimeout(12000)   // 初回チェックは10秒後
  const banner = page.getByRole('status').filter({ hasText: '新しい版があります' })
  check('予告バナーが出る', (await banner.count()) > 0)
  check('「今すぐ更新」がある', (await banner.getByRole('button', { name: /今すぐ更新/ }).count()) > 0)

  await banner.getByRole('button', { name: /今すぐ更新/ }).click()
  await page.waitForTimeout(3000)
  check('再読み込みされる', reloaded)
  allErrs.push(...errs)
  await close()
}

/* ② 未送信の架電記録がある状態で更新 → 先に送信してから再読み込み */
{
  const { page, writes, errs, close } = await open('dist', ITEMS)
  await page.route('**/worktalk-sales/?v=*', r => r.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><script type="module" src="/worktalk-sales/assets/index-NEWBUILD.js"></script>',
  }))
  await page.getByRole('button', { name: '検索する' }).first().click()
  await page.waitForTimeout(900)
  const card = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'A_更新中' }).first()
  await card.getByRole('button', { name: '架電を記録' }).click()
  await page.waitForTimeout(600)
  await page.locator('select').filter({ has: page.locator('option', { hasText: '担当者接触' }) })
    .first().selectOption('担当者接触')
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /保存|記録する/ }).last().click()
  await page.waitForTimeout(12000)

  const sent = writes.filter(w => w.table === 'teleapo_items')
    .flatMap(w => Array.isArray(w.body) ? w.body : [w.body]).filter(Boolean)
    .map(x => x.data || x).filter(d => d && d.companyName === 'A_更新中').pop()
  check('記録がサーバーに送られている', !!sent && (sent.callHistory || []).some(c => c.result === '担当者接触'),
    sent ? `${(sent.callHistory || []).length}件` : 'なし')
  const banner = page.getByRole('status').filter({ hasText: '新しい版があります' })
  check('記録後も予告が出ている', (await banner.count()) > 0)
  allErrs.push(...errs)
  await close()
}

/* ③ 送信できないまま更新 → 端末に預けて、次の起動で送り直す */
{
  const { page, writes, errs, close } = await open('dist', ITEMS, { failWrites: true })
  await page.getByRole('button', { name: '検索する' }).first().click()
  await page.waitForTimeout(900)
  const card = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: 'A_更新中' }).first()
  await card.getByRole('button', { name: '架電を記録' }).click()
  await page.waitForTimeout(600)
  await page.locator('select').filter({ has: page.locator('option', { hasText: '資料送付' }) })
    .first().selectOption('資料送付')
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /保存|記録する/ }).last().click()
  await page.waitForTimeout(6000)

  const box = await page.evaluate(async () => {
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open('worktalk_cache', 1)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    const db = await open()
    return await new Promise(res => {
      const req = db.transaction('lists', 'readonly').objectStore('lists').get('outbox:teleapo')
      req.onsuccess = () => res(req.result || null)
      req.onerror = () => res(null)
    })
  })
  check('送れなかった分が端末に預けられる', !!box && (box.changed || []).length > 0,
    box ? `${(box.changed || []).length}件` : 'なし')
  const kept = (box?.changed || []).map(x => x.data || x).find(d => d.companyName === 'A_更新中')
  check('預けた中身に記録が入っている', !!kept && (kept.callHistory || []).some(c => c.result === '資料送付'))
  allErrs.push(...errs)
  await close()
}

/* ④ 配信が追いつかず同じ版を狙い続ける場合、往復し続けない */
{
  const { page, errs, close } = await open('dist', ITEMS)
  await page.route('**/worktalk-sales/?v=*', r => r.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><script type="module" src="/worktalk-sales/assets/index-NEWBUILD.js"></script>',
  }))
  // すでに2回この版を狙って失敗した状態にしておく
  await page.evaluate(() => {
    sessionStorage.setItem('wt-update-target', 'index-NEWBUILD.js')
    sessionStorage.setItem('wt-update-tries', '2')
  })
  let reloaded = 0
  page.on('framenavigated', f => { if (f === page.mainFrame()) reloaded++ })
  await page.waitForTimeout(14000)
  const banner = page.getByRole('status').filter({ hasText: '新しい版があります' })
  check('歯止めが効いたらバナーは出る', (await banner.count()) > 0)
  check('自動では再読み込みしない', reloaded === 0, `${reloaded}回`)
  check('手動更新の案内に変わる', (await banner.getByText('「今すぐ更新」を押してください').count()) > 0)
  allErrs.push(...errs)
  await close()
}

done(allErrs)
