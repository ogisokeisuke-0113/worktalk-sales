/**
 * ============================================================================
 * Sales Board - Google Apps Script Web App (Wave 3)
 * ============================================================================
 * 1つの Web App URL で 3系統の外部連携を処理する:
 *
 *   ?action=send_email      ⑥ Sales Board から新規テレアポ企業へ SendGrid 送信
 *   ?action=cf7_lead        ⑦ Contact Form 7 → Supabase.download_leads
 *   ?action=sendgrid_event  ⑧ SendGrid Event Webhook → Supabase.email_events
 *
 * ============================================================================
 * 事前準備 (Apps Script → 設定 → スクリプト プロパティ):
 *   SUPABASE_URL       https://arhgxtdwnsciwmotvokl.supabase.co
 *   SUPABASE_ANON_KEY  sb_publishable_xxxxxxxx
 *   SENDGRID_API_KEY   SG.xxxxxxxxxxxx
 *   FROM_EMAIL         noreply@work-talk.jp             (デフォルト: 未設定なら同左)
 *   FROM_NAME          WorkTalk営業チーム                (デフォルト: 未設定なら同左)
 *
 * ============================================================================
 * デプロイ:
 *   デプロイ → 新しいデプロイ → 種類: ウェブアプリ
 *   次のユーザーとして実行: 自分
 *   アクセスできるユーザー: 全員 (匿名アクセス許可 = SendGrid/CF7 からPOST可能に)
 *   → 発行された URL を:
 *      * Sales Board 設定画面「Sales Board メール送信用 GAS URL」に登録
 *      * SendGrid Event Webhook に「<URL>?action=sendgrid_event」
 *      * WordPress CF7 Webhook に「<URL>?action=cf7_lead」
 * ============================================================================
 */

const PROPS = PropertiesService.getScriptProperties()

// -----------------------------------------------------------------------------
// ルーティング
// -----------------------------------------------------------------------------

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || ''
  if (action === 'health') {
    return jsonOut({
      ok: true,
      service: 'worktalk-sales-gas',
      version: '1.0.0',
      now: new Date().toISOString(),
    })
  }
  return jsonOut({
    ok: true,
    service: 'worktalk-sales-gas',
    hint: 'POST with ?action=send_email | cf7_lead | sendgrid_event',
  })
}

function doPost(e) {
  try {
    const action = detectAction(e)
    switch (action) {
      case 'send_email':      return handleSendEmail(e)
      case 'cf7_lead':        return handleCf7Lead(e)
      case 'sendgrid_event':  return handleSendgridEvent(e)
      default:
        return jsonOut({ ok: false, error: `unknown action: ${action || '(none)'}` })
    }
  } catch (err) {
    console.error('[doPost] ' + err.message + '\n' + (err.stack || ''))
    return jsonOut({ ok: false, error: err.message, stack: err.stack })
  }
}

function detectAction(e) {
  // 1) クエリパラメータ ?action=xxx を最優先
  if (e && e.parameter && e.parameter.action) return e.parameter.action

  // 2) postData.contents に JSON があれば .action を見る
  if (e && e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents)
      if (parsed && parsed.action) return parsed.action
    } catch (_) { /* not JSON */ }
  }

  // 3) e.parameter (form-urlencoded) に your-company があれば CF7 と推定
  if (e && e.parameter && (e.parameter['your-company'] || e.parameter['your-email'])) {
    return 'cf7_lead'
  }

  return ''
}

// -----------------------------------------------------------------------------
// ⑥ send_email : Sales Board → SendGrid
//   Body: {
//     subject, bodyText, senderName,
//     recipients: [{ email, companyName, contactName, teleapoItemId }]
//   }
// -----------------------------------------------------------------------------
function handleSendEmail(e) {
  const body = JSON.parse(e.postData.contents || '{}')
  const {
    subject = '',
    bodyText = '',
    senderName = '',
    recipients = [],
  } = body

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return jsonOut({ ok: false, error: 'recipients is empty' })
  }

  const apiKey = PROPS.getProperty('SENDGRID_API_KEY')
  if (!apiKey) return jsonOut({ ok: false, error: 'SENDGRID_API_KEY not set' })

  const fromEmail = PROPS.getProperty('FROM_EMAIL') || 'noreply@work-talk.jp'
  const fromName  = senderName || PROPS.getProperty('FROM_NAME') || 'WorkTalk営業チーム'

  const results = []
  const eventRows = []

  for (const r of recipients) {
    if (!r || !r.email) {
      results.push({ email: r && r.email, ok: false, error: 'missing email' })
      continue
    }

    const personalSubject = applyVars(subject, r, fromName)
    const personalBody    = applyVars(bodyText, r, fromName)

    const payload = {
      personalizations: [{
        to: [{ email: r.email, name: r.companyName || '' }],
        custom_args: {
          teleapo_item_id: r.teleapoItemId || '',
        },
      }],
      from: { email: fromEmail, name: fromName },
      subject: personalSubject,
      content: [{ type: 'text/plain', value: personalBody }],
      tracking_settings: {
        click_tracking: { enable: true, enable_text: false },
        open_tracking:  { enable: true, substitution_tag: '%open-track%' },
      },
    }

    const res = UrlFetchApp.fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    })
    const code = res.getResponseCode()
    const headers = res.getAllHeaders()
    const sgMessageId = headers['X-Message-Id'] || headers['x-message-id'] || ''

    const ok = code >= 200 && code < 300
    results.push({
      email: r.email,
      teleapoItemId: r.teleapoItemId || '',
      ok,
      code,
      sgMessageId,
      error: ok ? null : res.getContentText().slice(0, 500),
    })

    if (ok) {
      eventRows.push({
        id: Utilities.getUuid(),
        teleapo_item_id: r.teleapoItemId || null,
        email: r.email,
        event_type: 'processed',
        occurred_at: new Date().toISOString(),
        sg_message_id: sgMessageId || null,
        sg_event_id: null,
        url: null,
        metadata: {
          subject: personalSubject,
          from_email: fromEmail,
          from_name: fromName,
        },
      })
    }
  }

  // email_events に一括 INSERT (処理履歴)
  if (eventRows.length > 0) {
    supabaseInsert('email_events', eventRows)
  }

  const sent = results.filter(r => r.ok).length
  const failed = results.length - sent
  return jsonOut({
    ok: true,
    sent,
    failed,
    total: results.length,
    sentEmails: results.filter(r => r.ok).map(r => r.email),
    results,
  })
}

function applyVars(text, r, senderName) {
  return String(text || '')
    .replace(/\{\{会社名\}\}/g, r.companyName || '')
    .replace(/\{\{担当者名\}\}/g, r.contactName || '')
    .replace(/\{\{送信者名\}\}/g, senderName || '')
}

// -----------------------------------------------------------------------------
// ⑦ cf7_lead : Contact Form 7 (form-urlencoded) → Supabase.download_leads
//   CF7 のフィールド:
//     your-company / your-name / your-email / your-tel / your-consent
// -----------------------------------------------------------------------------
function handleCf7Lead(e) {
  const params = (e && e.parameter) || {}

  const companyName = params['your-company'] || ''
  const name = params['your-name'] || ''
  const email = params['your-email'] || ''
  const tel = params['your-tel'] || ''
  const consent = params['your-consent'] || ''

  if (!email && !companyName) {
    return jsonOut({ ok: false, error: 'missing your-company and your-email' })
  }

  const now = new Date().toISOString()
  const row = {
    id: Utilities.getUuid(),
    data: {
      date: now,
      companyName,
      name,
      email,
      tel,
      consent,
      source: 'cf7',
    },
    created_at: now,
  }
  const code = supabaseInsert('download_leads', [row])
  const ok = code >= 200 && code < 300
  return jsonOut({ ok, id: row.id, code })
}

// -----------------------------------------------------------------------------
// ⑧ sendgrid_event : SendGrid Event Webhook → Supabase.email_events
//   Body: SendGrid が配列JSONで複数イベントをまとめて送ってくる
//   各イベント: { email, event, timestamp, sg_event_id, sg_message_id, url,
//                 custom_args?: { teleapo_item_id }, ip, useragent, ... }
// -----------------------------------------------------------------------------
function handleSendgridEvent(e) {
  const raw = (e && e.postData && e.postData.contents) || '[]'
  let events
  try {
    events = JSON.parse(raw)
  } catch (_) {
    return jsonOut({ ok: false, error: 'body is not JSON' })
  }
  if (!Array.isArray(events)) {
    return jsonOut({ ok: false, error: 'body must be a JSON array' })
  }

  const rows = events.map(ev => {
    const custom = ev.custom_args || {}
    return {
      id: Utilities.getUuid(),
      teleapo_item_id: custom.teleapo_item_id || ev.teleapo_item_id || null,
      email: ev.email || '',
      event_type: ev.event || 'unknown',
      occurred_at: ev.timestamp
        ? new Date(ev.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      sg_message_id: ev.sg_message_id || null,
      sg_event_id: ev.sg_event_id || null,
      url: ev.url || null,
      metadata: {
        ip: ev.ip || null,
        user_agent: ev.useragent || null,
        response: ev.response || null,
        reason: ev.reason || null,
        category: ev.category || null,
        status: ev.status || null,
        raw: ev,
      },
    }
  })

  const code = supabaseInsert('email_events', rows)
  const ok = code >= 200 && code < 300
  return jsonOut({ ok, count: rows.length, code })
}

// -----------------------------------------------------------------------------
// Supabase REST INSERT
//   Prefer: resolution=merge-duplicates で unique index に基づく重複 upsert
//   RLS ポリシーで anon INSERT を許可済み (schema.sql 参照)
// -----------------------------------------------------------------------------
function supabaseInsert(table, rows) {
  const url = PROPS.getProperty('SUPABASE_URL')
  const key = PROPS.getProperty('SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not set')
  if (!rows || rows.length === 0) return 204

  const res = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/rest/v1/' + table, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Prefer': 'return=minimal,resolution=merge-duplicates',
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true,
  })
  const code = res.getResponseCode()
  if (code >= 400) {
    console.error('[supabase:' + table + '] ' + code + ' : ' + res.getContentText())
  }
  return code
}

// -----------------------------------------------------------------------------
// JSON レスポンス
// -----------------------------------------------------------------------------
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}
