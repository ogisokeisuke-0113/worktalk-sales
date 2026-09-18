/* テストの共通部分。
   ・dist をローカルの HTTP サーバーで配信する（本番と同じ /worktalk-sales/ 配下）
   ・Supabase への通信はすべて偽物に差し替える
   ・さらに *.supabase.co を解決不能にして、万一 route を抜けた通信（fetch keepalive など）が
     本番DBへ飛ばないようにする。2026-09-10 にテスト行が本番へ書き込まれた事故の再発防止。 */
import fs from 'fs'
import http from 'http'
import path from 'path'
import { chromium } from 'playwright'

export const call = (caller, result, date, extra = {}) => ({
  id: crypto.randomUUID(), date, caller, result, note: '', callType: '', callContent: '', ...extra,
})

export const company = (id, companyName, over = {}) => ({
  id, companyName, phone: '03-1111-1111', recruitmentPhone: '', contactName: '', contactPosition: '',
  industry: '不動産', employeeScale: '101〜300名', salesRep: '未確定', status: '未架電',
  isKept: false, keptBy: '', keptAt: '', memo: '', callHistory: [], keepHistory: [],
  companyUrl: '', email: '', prefecture: '東京都', listSource: 'テスト',
  nextCallDate: '', emailStatus: '未送信', appoDate: null, ...over,
})

export async function open(dist, items, { user = 'テスト太郎' } = {}) {
  if (!dist || !fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error(`dist が見つかりません: ${dist}`)
  }
  const root = fs.mkdtempSync('/tmp/sbtest-')
  fs.mkdirSync(path.join(root, 'worktalk-sales'), { recursive: true })
  fs.cpSync(dist, path.join(root, 'worktalk-sales'), { recursive: true })

  const srv = http.createServer((q, s) => {
    let f = path.join(root, decodeURIComponent(q.url.split('?')[0]))
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
    if (!fs.existsSync(f)) { s.writeHead(404); return s.end() }
    const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'
    s.writeHead(200, { 'content-type': type })
    s.end(fs.readFileSync(f))
  })
  await new Promise(r => srv.listen(0, r))

  const browser = await chromium.launch({
    args: ['--host-resolver-rules=MAP *.supabase.co 127.0.0.1:1'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } })

  const writes = []
  await ctx.route('**supabase.co/**', r => {
    const u = r.request().url()
    const m = r.request().method()
    const json = x => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(x), headers: { 'content-range': '0-0/*' },
    })
    if (u.includes('/auth/v1/')) return json({ id: 'a1', email: 't@e.com', user_metadata: {} })
    if (m !== 'GET') {
      let body = null
      try { body = r.request().postDataJSON() } catch { /* 本文なしの削除など */ }
      writes.push({ table: (u.split('/rest/v1/')[1] || u).split('?')[0], body })
    }
    if (m === 'GET' && u.includes('/teleapo_items')) {
      if (u.includes('id=in.')) return json(items.map(i => ({ id: i.id, data: i })))
      const q = new URL(u).searchParams
      const off = Number(q.get('offset') || 0)
      const lim = Number(q.get('limit') || 1000)
      return json(items.slice(off, off + lim).map(i => ({ data: i })))
    }
    return json([])
  })

  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e)))

  await page.addInitScript(([name]) => {
    const b64 = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const exp = Math.floor(Date.now() / 1000) + 86400
    localStorage.setItem('sb-antqewvlzfonsakgndxt-auth-token', JSON.stringify({
      access_token: [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: 'a1', exp, role: 'authenticated' }), 's'].join('.'),
      token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'r',
      user: {
        id: 'a1', aud: 'authenticated', role: 'authenticated', email: 't@e.com',
        app_metadata: {}, user_metadata: { name, users_id: 'u1' },
      },
    }))
  }, [user])

  await page.goto(`http://127.0.0.1:${srv.address().port}/worktalk-sales/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'テレアポ', exact: true }).first().click()
  await page.waitForTimeout(700)

  return {
    page, writes, errs,
    async close() { await browser.close(); srv.close(); fs.rmSync(root, { recursive: true, force: true }) },
  }
}

/* 検索結果に出ている企業名を取り出す */
export async function listedCompanies(page) {
  const cards = page.locator('div.bg-white.rounded-xl')
    .filter({ has: page.locator('a[href*="google.com/search"]') })
  const texts = await cards.allInnerTexts()
  return texts.map(t => t.split('\n')[0].trim()).sort()
}

/* MultiSelect を開いて選択する。ラベルは完全一致で選ぶ
   （「不在」が「担当者不在」に部分一致してしまうため） */
export async function selectOptions(page, filterLabel, values, { clearFirst = true } = {}) {
  const wrap = page.locator('div').filter({ has: page.locator('label', { hasText: filterLabel }) }).last()
  await wrap.locator('button').first().click()
  await page.waitForTimeout(300)
  const panel = wrap.locator('div.absolute')
  if (clearFirst) {
    const clear = panel.getByRole('button', { name: 'すべて解除' })
    // 「すべて解除」を押してもパネルは開いたまま（開き直すと閉じてしまう）
    if (await clear.count()) { await clear.click(); await page.waitForTimeout(250) }
  }
  for (const v of values) {
    await panel.locator('label').filter({ has: page.getByText(v, { exact: true }) })
      .first().locator('input[type=checkbox]').check()
  }
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.waitForTimeout(250)
}

export function makeReporter(title) {
  const rows = []
  const check = (name, passed, detail = '') => rows.push([!!passed, name, detail])
  const done = (errs = []) => {
    console.log(`\n=== ${title} ===`)
    for (const [ok, name, detail] of rows) {
      console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(34, '　')} ${detail}`)
    }
    const passed = rows.filter(r => r[0]).length
    console.log(`\n  ${passed}/${rows.length} 通過 / JSエラー: ${errs.length ? errs.slice(0, 2) : 'なし'}`)
    if (passed !== rows.length || errs.length) process.exitCode = 1
  }
  return { check, done }
}
