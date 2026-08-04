-- ============================================================================
-- Sales Board - Supabase スキーマ定義
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に本ファイル全文をコピペして Run
--   何度実行しても同じ結果になるよう冪等 (IF NOT EXISTS / DROP POLICY IF EXISTS)
--
-- テーブル一覧:
--   1. proposals       - 提案リスト
--   2. teleapo_items   - テレアポリスト
--   3. users           - ユーザー
--   4. download_leads  - 資料DLリード (CF7 Webhook 経由)
--   5. app_settings    - アプリ設定 (共有)
--   6. email_events    - SendGrid Event Webhook 履歴 (Wave 3 新規)
--
-- RLS (Row Level Security) 方針:
--   * proposals / teleapo_items / users / download_leads / app_settings
--     - anon key で SELECT / INSERT / UPDATE / DELETE すべて許可
--     - 現状 Sales Board UI は anon key で全操作を行うため
--     - 将来 Supabase Auth に移行する際は、下記の "anon" ロールを "authenticated" に絞る
--   * email_events
--     - anon key で SELECT / INSERT のみ許可（Webhook 受信・履歴閲覧用）
--     - UPDATE / DELETE は authenticated 限定（開封イベントの改ざん防止）
-- ============================================================================


-- =================================================================
-- 1. proposals: 提案リスト
--    App.jsx / ProposalList.jsx から upsert / delete / fetchAll
-- =================================================================
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposals_updated_at ON proposals (updated_at DESC);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"    ON proposals;
DROP POLICY IF EXISTS "anon select"  ON proposals;
DROP POLICY IF EXISTS "anon insert"  ON proposals;
DROP POLICY IF EXISTS "anon update"  ON proposals;
DROP POLICY IF EXISTS "anon delete"  ON proposals;
CREATE POLICY "anon select" ON proposals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon insert" ON proposals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon update" ON proposals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon delete" ON proposals FOR DELETE TO anon, authenticated USING (true);


-- =================================================================
-- 2. teleapo_items: テレアポリスト
--    App.jsx / TeleapoList.jsx から upsert / delete / fetchAll
-- =================================================================
CREATE TABLE IF NOT EXISTS teleapo_items (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teleapo_items_updated_at ON teleapo_items (updated_at DESC);

ALTER TABLE teleapo_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"    ON teleapo_items;
DROP POLICY IF EXISTS "anon select"  ON teleapo_items;
DROP POLICY IF EXISTS "anon insert"  ON teleapo_items;
DROP POLICY IF EXISTS "anon update"  ON teleapo_items;
DROP POLICY IF EXISTS "anon delete"  ON teleapo_items;
CREATE POLICY "anon select" ON teleapo_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon insert" ON teleapo_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon update" ON teleapo_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon delete" ON teleapo_items FOR DELETE TO anon, authenticated USING (true);


-- =================================================================
-- 3. users: ユーザー
--    App.jsx / Settings.jsx から upsert / fetchAll (削除は無し = 論理削除想定)
-- =================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"    ON users;
DROP POLICY IF EXISTS "anon select"  ON users;
DROP POLICY IF EXISTS "anon insert"  ON users;
DROP POLICY IF EXISTS "anon update"  ON users;
DROP POLICY IF EXISTS "anon delete"  ON users;
CREATE POLICY "anon select" ON users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon insert" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon update" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon delete" ON users FOR DELETE TO anon, authenticated USING (true);


-- =================================================================
-- 4. download_leads: 資料DLリード
--    CF7 (media.work-talk.jp/lp/download/) → GAS Webhook → Supabase
--    Sales Board 側は fetchAll のみ (Wave 3 で GAS が upsert)
--    フィールド (data JSONB 内):
--      date, companyName, name, email, tel, consent
-- =================================================================
CREATE TABLE IF NOT EXISTS download_leads (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_download_leads_created_at ON download_leads (created_at DESC);

ALTER TABLE download_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"    ON download_leads;
DROP POLICY IF EXISTS "anon select"  ON download_leads;
DROP POLICY IF EXISTS "anon insert"  ON download_leads;
DROP POLICY IF EXISTS "anon update"  ON download_leads;
DROP POLICY IF EXISTS "anon delete"  ON download_leads;
CREATE POLICY "anon select" ON download_leads FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon insert" ON download_leads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon update" ON download_leads FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon delete" ON download_leads FOR DELETE TO anon, authenticated USING (true);


-- =================================================================
-- 5. app_settings: アプリ設定 (共有)
--    App.jsx から get / set (id='default' の 1レコード)
-- =================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"    ON app_settings;
DROP POLICY IF EXISTS "anon select"  ON app_settings;
DROP POLICY IF EXISTS "anon insert"  ON app_settings;
DROP POLICY IF EXISTS "anon update"  ON app_settings;
DROP POLICY IF EXISTS "anon delete"  ON app_settings;
CREATE POLICY "anon select" ON app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon insert" ON app_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon update" ON app_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon delete" ON app_settings FOR DELETE TO anon, authenticated USING (true);


-- =================================================================
-- 6. email_events: SendGrid Event Webhook 履歴  (Wave 3 新規)
--    SendGrid → GAS (doPost) → Supabase の経路で INSERT される
--    event_type:
--      'processed' | 'delivered' | 'open' | 'click' |
--      'bounce'    | 'dropped'   | 'unsubscribe' | 'spamreport'
--    metadata 例:
--      { ip, user_agent, timestamp, sg_message_id, category, ... }
--    Sales Board UI では teleapo_item_id で JOIN して開封状況を可視化
-- =================================================================
CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  teleapo_item_id TEXT,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  sg_message_id TEXT,
  sg_event_id TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_events_teleapo_item_id ON email_events (teleapo_item_id);
CREATE INDEX IF NOT EXISTS idx_email_events_email           ON email_events (email);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type      ON email_events (event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at     ON email_events (occurred_at DESC);
-- 同一 sg_event_id の重複 INSERT を防ぐ (Webhook のリトライ対策)
CREATE UNIQUE INDEX IF NOT EXISTS ux_email_events_sg_event_id ON email_events (sg_event_id) WHERE sg_event_id IS NOT NULL;

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"                ON email_events;
DROP POLICY IF EXISTS "anon select"              ON email_events;
DROP POLICY IF EXISTS "anon insert"              ON email_events;
DROP POLICY IF EXISTS "authenticated update"     ON email_events;
DROP POLICY IF EXISTS "authenticated delete"     ON email_events;
-- 閲覧は anon (Sales Board UI が anon key)
CREATE POLICY "anon select"          ON email_events FOR SELECT TO anon, authenticated USING (true);
-- 追加は anon (GAS Webhook が anon key で INSERT)
CREATE POLICY "anon insert"          ON email_events FOR INSERT TO anon, authenticated WITH CHECK (true);
-- 更新・削除は authenticated 限定 (改ざん防止 / 管理オペレーションのみ)
CREATE POLICY "authenticated update" ON email_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete" ON email_events FOR DELETE TO authenticated USING (true);


-- =================================================================
-- 動作確認クエリ (Optional)
-- =================================================================
-- SELECT COUNT(*) FROM proposals;
-- SELECT COUNT(*) FROM teleapo_items;
-- SELECT COUNT(*) FROM download_leads;
-- SELECT COUNT(*) FROM email_events;
