/**
 * 架電記録の保存を実ブラウザで検証する。
 * Supabase REST は全てモックするので本番DBには一切触れない。
 *
 * usage: node e2e.js <bundle.js のパス> <ラベル>
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const BUNDLE = process.argv[2];
const LABEL = process.argv[3] || path.basename(BUNDLE);
const SCENARIO = process.env.SCENARIO || 'burst';

const USER = { id: 'u-test-1', name: 'テスト太郎', role: 'sales' };
const BULK = Number(process.env.BULK || 0);
const ITEMS = [
  mk('t-aaa', 'アルファ商事', '03-1111-1111'),
  mk('t-bbb', 'ブラボー工業', '03-2222-2222'),
  mk('t-ccc', 'チャーリー物流', '03-3333-3333'),
  ...Array.from({ length: BULK }, (_, i) =>
    mk('t-bulk-' + i, '株式会社ダミー' + i, '03-0000-' + String(i).padStart(4, '0'))),
];
function mk(id, companyName, phone) {
  return {
    id, companyName, phone, recruitmentPhone: '', contactName: '', contactPosition: '',
    industry: 'メーカー', employeeScale: '101〜300名', salesRep: '未確定', status: '未架電',
    isKept: false, keptBy: '', keptAt: '', memo: '', callHistory: [], keepHistory: [],
    companyUrl: '', prefecture: '東京都', salesScale: '', listingStatus: '', listSource: 'テスト',
    nextCallDate: '', emailStatus: '未送信', emailSentAt: '', emailOpenedAt: '', appoDate: null,
  };
}

// ── 静的配信 ───────────────────────────────────────────────
const root = fs.mkdtempSync('/tmp/wte2e-');
fs.mkdirSync(path.join(root, 'worktalk-sales/assets'), { recursive: true });
// BUNDLE がディレクトリなら dist 一式をそのまま配る（コード分割に対応）
const BUNDLE_IS_DIR = fs.existsSync(BUNDLE) && fs.statSync(BUNDLE).isDirectory();
if (BUNDLE_IS_DIR) {
  fs.cpSync(BUNDLE, path.join(root, 'worktalk-sales'), { recursive: true });
} else {
  fs.copyFileSync(BUNDLE, path.join(root, 'worktalk-sales/assets/app.js'));
}
if (!BUNDLE_IS_DIR) {
  const CSS = process.env.CSS_PATH || path.join(path.dirname(path.resolve(BUNDLE)), 'app.css');
  if (fs.existsSync(CSS)) fs.copyFileSync(CSS, path.join(root, 'worktalk-sales/assets/app.css'));
}
if (!BUNDLE_IS_DIR) fs.writeFileSync(
  path.join(root, 'worktalk-sales/index.html'),
  `<!doctype html><html lang="ja"><head><meta charset="UTF-8">
   <meta name="viewport" content="width=device-width,initial-scale=1">
   <title>Sales Board</title>
   <link rel="stylesheet" href="/worktalk-sales/assets/app.css">
   <script type="module" src="/worktalk-sales/assets/app.js"></script>
   </head><body><div id="root"></div></body></html>`
);
const server = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const ct = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, { 'content-type': ct });
  res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const pw = require('playwright');
  // 【重要】route() は離脱時の fetch(keepalive) を捕捉できない。
  // 実際に2026-09-10のテストで1行が本番DBへ漏れた。
  // DNSレベルで Supabase を潰し、モックをすり抜けた通信が外へ出られないようにする。
  const browser = await pw.chromium.launch({
    args: ['--host-resolver-rules=MAP *.supabase.co 127.0.0.1:1, MAP supabase.co 127.0.0.1:1'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  const upserts = [];          // teleapo_items への書き込みを全部記録
  const callLogs = [];         // call_logs への追記を全部記録
  let startupUpsertRows = 0;
  let booted = false;
  let failsLeft = SCENARIO === 'failretry' ? 2 : 0;
  let failedAttempts = 0;

  await ctx.route('**antqewvlzfonsakgndxt.supabase.co/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
        headers: { 'content-range': '0-0/*', 'access-control-allow-origin': '*' } });

    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    if (url.includes('/auth/v1/')) {
      if (url.includes('/token')) {
        return json({ access_token: 'x', token_type: 'bearer', expires_in: 86400,
          expires_at: Math.floor(Date.now()/1000)+86400, refresh_token: 'r',
          user: { id: 'auth-test-1', email: 'test@example.com', user_metadata: {} } });
      }
      return json({ id: 'auth-test-1', email: 'test@example.com', user_metadata: {} });
    }

    if (req.method() === 'GET') {
      if (url.includes('/teleapo_items')) {
        if (url.includes('id=in.')) {                       // マージ用の既存取得
          return json(ITEMS.map((i) => ({ id: i.id, data: i })));
        }
        return json(ITEMS.map((i) => ({ data: i })));
      }
      if (url.includes('/users')) return json([{ data: USER }]);
      if (url.includes('/proposals') || url.includes('/download_leads')) return json([]);
      if (url.includes('/app_settings')) return json([]);
      return json([]);
    }

    if (req.method() === 'POST' && url.includes('/call_logs')) {
      try { callLogs.push(...JSON.parse(req.postData() || '[]')); } catch (_) {}
      return json([]);
    }

    if (req.method() === 'POST' && url.includes('/teleapo_items')) {
      let rows = [];
      try { rows = JSON.parse(req.postData() || '[]'); } catch (_) {}
      if (SCENARIO === 'failretry' && booted && failsLeft > 0) {
        failsLeft--;
        failedAttempts++;
        return json({ message: '一時的な障害（テスト）' }, 500);
      }
      upserts.push(rows);
      if (!booted) startupUpsertRows += rows.length;
      return json([]);
    }
    return json([]);
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  if (SCENARIO === 'coldstart') await page.addInitScript(() => { window.__skipCache = true; });
  await page.addInitScript(([u, items]) => {
    try { localStorage.setItem('worktalk_current_user', JSON.stringify(u));
      localStorage.setItem('worktalk_users', JSON.stringify([u]));
      if (!window.__skipCache) localStorage.setItem('worktalk_teleapo', JSON.stringify(items));
    } catch (e) { console.warn('seed quota', e.message) }

    // Supabase Auth のセッションを仕込む（実際のログインは通さない）
    const b64 = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const jwt = [
      b64({ alg: 'HS256', typ: 'JWT' }),
      b64({ sub: 'auth-test-1', email: 'test@example.com', role: 'authenticated', exp, aud: 'authenticated' }),
      'sig',
    ].join('.');
    const session = {
      access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: exp,
      refresh_token: 'test-refresh',
      user: {
        id: 'auth-test-1', aud: 'authenticated', role: 'authenticated',
        email: 'test@example.com', email_confirmed_at: new Date().toISOString(),
        app_metadata: {}, user_metadata: { name: u.name, users_id: u.id },
        created_at: new Date().toISOString(),
      },
    };
    try { localStorage.setItem('sb-antqewvlzfonsakgndxt-auth-token', JSON.stringify(session)); } catch (e) {}
  }, [USER, ITEMS]);

  await page.goto(`http://127.0.0.1:${port}/worktalk-sales/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(BULK ? 35000 : 3000);   // 起動同期 + デバウンス1.5秒 が終わるのを待つ
  booted = true;

  const out = { label: LABEL, scenario: SCENARIO, startupUpsertRows, errors: [] };

  // ── テレアポタブへ ────────────────────────────────────────
  await page.getByRole('button', { name: 'テレアポ', exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '検索する' }).first().click();   // 初期表示は検索パネル
  await page.waitForTimeout(700);

  async function recordCall(company, result) {
    if (BULK) {
      const box = page.getByPlaceholder(/企業名/).first();
      await box.fill(company);
      await page.waitForTimeout(400);
    }
    await page.getByText(company, { exact: true }).first().click();          // 詳細パネルを開く
    // DOM の並び順に依存しないよう、中身で対象を特定する
    const panel = page.locator('div.fixed.inset-0')
      .filter({ has: page.getByRole('button', { name: '架電を記録' }) }).first();
    await panel.getByRole('button', { name: '架電を記録' }).click();
    const modal = page.locator('div.fixed.inset-0')
      .filter({ has: page.getByRole('button', { name: '記録する', exact: true }) }).first();
    await modal.locator('select').filter({ has: page.locator('option', { hasText: result }) })
      .first().selectOption(result);
    await modal.getByRole('button', { name: '記録する', exact: true }).click();
    await page.waitForTimeout(200);
    await page.locator('div.fixed.inset-0').getByText('×', { exact: true }).last().click();
    await page.waitForTimeout(200);
  }

  upserts.length = 0;
  const t0 = Date.now();
  if (SCENARIO === 'unload') {
    // 記録した直後に離脱する
    await recordCall('アルファ商事', 'アポ獲得');
    out.elapsedMs = Date.now() - t0;
    await page.waitForTimeout(200);
    await page.goto('about:blank');           // 1.5秒のデバウンス前にページを離れる
    await page.waitForTimeout(3000);
  } else {
    await recordCall('アルファ商事', 'アポ獲得');
    await recordCall('ブラボー工業', '担当者不在');
    out.elapsedMs = Date.now() - t0;
    await page.waitForTimeout(SCENARIO === 'failretry' ? 20000 : 6000);
  }
  out.failedAttempts = failedAttempts;

  const sentIds = new Set();
  const sentWithHistory = new Set();
  for (const rows of upserts) {
    for (const r of rows) {
      sentIds.add(r.id);
      const ch = (r.data && r.data.callHistory) || [];
      if (ch.length > 0) sentWithHistory.add(r.id);
    }
  }
  out.sentIds = [...sentIds];
  out.sentWithHistory = [...sentWithHistory];
  out.callLogs = callLogs.map(r => ({
    company: r.company_name, caller: r.caller, result: r.result,
    dedup_key: r.dedup_key, called_at: r.called_at ? 'あり' : null, source: r.source,
  }));
  out.indicatorExists = SCENARIO === 'unload' ? null : await page.locator('[role="status"]').count();
  out.errors = errors.slice(0, 6);

  console.log(JSON.stringify(out, null, 2));

  await browser.close();
  server.close();
})().catch((e) => { console.error('FAILED:', e.message); server.close(); process.exit(1); });
