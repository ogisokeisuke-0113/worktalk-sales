-- Sales Board - Supabase スキーマ
-- Supabase Dashboard > SQL Editor で実行してください

-- 提案リスト
CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON proposals FOR ALL USING (true) WITH CHECK (true);

-- テレアポリスト
CREATE TABLE teleapo_items (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE teleapo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON teleapo_items FOR ALL USING (true) WITH CHECK (true);

-- ユーザー
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON users FOR ALL USING (true) WITH CHECK (true);

-- ダウンロード履歴（CF7 Webhook）
CREATE TABLE download_leads (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE download_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON download_leads FOR ALL USING (true) WITH CHECK (true);

-- アプリ設定
CREATE TABLE app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON app_settings FOR ALL USING (true) WITH CHECK (true);
