-- ============================================================================
-- Sales Board / 架電履歴を「追記専用テーブル」へ切り出す
--
-- 目的:
--   これまで架電履歴は teleapo_items.data の callHistory 配列に入っていた。
--   1社=1行のJSONを丸ごと差し替える方式のため、
--     - 誰かの古いコピーで上書きされる
--     - 送信を取りこぼす
--   と履歴そのものが消える。実際に447件が消えた。
--
--   INSERT しかしないテーブルに切り出せば、行が競合しないので
--   上書きも取りこぼしも原理的に起こらない。
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に本ファイル全文をコピペして Run
--   何度実行しても同じ結果になる（冪等）
--
-- 既存の callHistory は残したまま二重書きする（Phase 1）。
-- 表示元を call_logs に切り替えたあと callHistory を廃止する（Phase 2）。
-- ============================================================================

CREATE TABLE IF NOT EXISTS call_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- teleapo_items.id は TEXT なので合わせる
  teleapo_item_id  TEXT NOT NULL,
  company_name     TEXT,               -- 行が消えても誰への架電か追えるように非正規化して保持

  -- callHistory 側エントリの id。二重登録を防ぐ鍵
  entry_id         TEXT,

  caller           TEXT NOT NULL DEFAULT '',
  called_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result           TEXT,
  call_type        TEXT,
  call_content     TEXT,
  memo             TEXT,

  -- 将来項目が増えても取りこぼさないよう、元エントリを丸ごと保持する
  raw              JSONB,

  source           TEXT NOT NULL DEFAULT 'app',   -- app / backfill / recovery
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同じエントリを二度入れない（アプリの再送・バックフィルの再実行に耐える）
CREATE UNIQUE INDEX IF NOT EXISTS call_logs_entry_uniq
  ON call_logs (entry_id) WHERE entry_id IS NOT NULL;

-- 企業ごとの履歴取得
CREATE INDEX IF NOT EXISTS call_logs_item_idx
  ON call_logs (teleapo_item_id, called_at DESC);

-- 「今日誰が何件架電したか」の集計
CREATE INDEX IF NOT EXISTS call_logs_caller_idx
  ON call_logs (caller, called_at DESC);

CREATE INDEX IF NOT EXISTS call_logs_called_at_idx
  ON call_logs (called_at DESC);


-- ── RLS ──────────────────────────────────────────────────────────
-- 既存テーブルに合わせて anon から読み書きできるようにする。
-- ただし UPDATE / DELETE は許可しない。履歴は消えてはいけないものなので、
-- アプリから消す手段を最初から与えない。
-- （訂正が必要になったら Dashboard から service_role で行う）
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon select" ON call_logs;
DROP POLICY IF EXISTS "anon insert" ON call_logs;
DROP POLICY IF EXISTS "anon update" ON call_logs;
DROP POLICY IF EXISTS "anon delete" ON call_logs;

CREATE POLICY "anon select" ON call_logs
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon insert" ON call_logs
  FOR INSERT TO anon, authenticated WITH CHECK (true);
-- UPDATE / DELETE のポリシーは意図的に作らない = 誰も消せない


-- ── 集計用ビュー ─────────────────────────────────────────────────
-- ダッシュボードが callHistory を数える代わりにこれを使えるようにしておく。
CREATE OR REPLACE VIEW call_logs_daily AS
SELECT
  (called_at AT TIME ZONE 'Asia/Tokyo')::date AS call_date,
  caller,
  COUNT(*)                                             AS calls,
  COUNT(*) FILTER (WHERE result = 'アポ獲得')          AS appointments,
  COUNT(DISTINCT teleapo_item_id)                      AS companies
FROM call_logs
GROUP BY 1, 2;

COMMENT ON TABLE call_logs IS
  '架電履歴の正本。INSERT のみ。teleapo_items.data.callHistory は Phase 2 で廃止予定。';
