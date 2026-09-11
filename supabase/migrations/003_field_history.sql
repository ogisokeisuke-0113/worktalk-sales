-- ============================================================================
-- Sales Board / メモ・ステータス等の変更履歴をサーバー側で自動保存する
--
-- なぜ必要か:
--   架電履歴は call_logs へ切り出したので、上書きされても復元できるようになった。
--   しかし メモ / ステータス / 担当営業 / 先方担当者 / 次回架電予定日 / Keep は
--   いまも teleapo_items.data の中だけにあり、上書きされたら二度と戻らない。
--   2026-09-10 に447件の架電履歴が消えたのと同じことが、これらの項目では
--   まだ起こり得る。
--
-- なぜトリガーか:
--   アプリ側で記録すると、アプリのバグや古いクライアントからの書き込みを取りこぼす。
--   実際、消失の原因はアプリ側にあった。
--   DB のトリガーなら、どの経路から書かれても必ず記録される。
--
-- 容量:
--   値が変わったときだけ1行増える。1日数百件の編集なら年間でも数十MB程度。
--   9,647行を毎日まるごと保存する方式より圧倒的に小さい。
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に全文を貼って Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS teleapo_field_history (
  id               BIGSERIAL PRIMARY KEY,
  teleapo_item_id  TEXT NOT NULL,
  company_name     TEXT,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  op               TEXT NOT NULL,          -- INSERT / UPDATE

  -- 変更後の値
  status           TEXT,
  memo             TEXT,
  sales_rep        TEXT,
  contact_name     TEXT,
  next_call_date   TEXT,
  is_kept          TEXT,
  kept_by          TEXT,
  email_status     TEXT,

  -- 変更前の値（差し戻しに使う）
  prev_status      TEXT,
  prev_memo        TEXT,
  prev_sales_rep   TEXT,
  prev_contact_name TEXT,

  -- 念のため変更前の行を丸ごと残す。ここから完全復元できる。
  prev_data        JSONB
);

CREATE INDEX IF NOT EXISTS teleapo_field_history_item_idx
  ON teleapo_field_history (teleapo_item_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS teleapo_field_history_time_idx
  ON teleapo_field_history (changed_at DESC);

COMMENT ON TABLE teleapo_field_history IS
  'teleapo_items の主要項目の変更履歴。値が変わったときだけ1行増える。復元用。';


-- ── トリガー本体 ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_teleapo_field_change() RETURNS TRIGGER AS $$
DECLARE
  changed BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    changed := TRUE;
  ELSE
    -- 監視する項目のどれかが変わったときだけ記録する。
    -- callHistory は call_logs が持つのでここでは見ない。
    changed :=
         NEW.data->>'status'       IS DISTINCT FROM OLD.data->>'status'
      OR NEW.data->>'memo'         IS DISTINCT FROM OLD.data->>'memo'
      OR NEW.data->>'salesRep'     IS DISTINCT FROM OLD.data->>'salesRep'
      OR NEW.data->>'contactName'  IS DISTINCT FROM OLD.data->>'contactName'
      OR NEW.data->>'nextCallDate' IS DISTINCT FROM OLD.data->>'nextCallDate'
      OR NEW.data->>'isKept'       IS DISTINCT FROM OLD.data->>'isKept'
      OR NEW.data->>'keptBy'       IS DISTINCT FROM OLD.data->>'keptBy'
      OR NEW.data->>'emailStatus'  IS DISTINCT FROM OLD.data->>'emailStatus';
  END IF;

  IF NOT changed THEN
    RETURN NEW;
  END IF;

  INSERT INTO teleapo_field_history (
    teleapo_item_id, company_name, op,
    status, memo, sales_rep, contact_name, next_call_date, is_kept, kept_by, email_status,
    prev_status, prev_memo, prev_sales_rep, prev_contact_name, prev_data
  ) VALUES (
    NEW.id,
    NEW.data->>'companyName',
    TG_OP,
    NEW.data->>'status',
    NEW.data->>'memo',
    NEW.data->>'salesRep',
    NEW.data->>'contactName',
    NEW.data->>'nextCallDate',
    NEW.data->>'isKept',
    NEW.data->>'keptBy',
    NEW.data->>'emailStatus',
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.data->>'status'      END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.data->>'memo'        END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.data->>'salesRep'    END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.data->>'contactName' END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.data              END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teleapo_field_history ON teleapo_items;
CREATE TRIGGER trg_teleapo_field_history
  AFTER INSERT OR UPDATE ON teleapo_items
  FOR EACH ROW EXECUTE FUNCTION log_teleapo_field_change();


-- ── RLS ─────────────────────────────────────────────────────────
-- 読めるだけにする。アプリからは書き込ませない（トリガーが書くので不要）。
-- 消す手段も与えない。履歴は消えてはいけないもの。
ALTER TABLE teleapo_field_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon select" ON teleapo_field_history;
DROP POLICY IF EXISTS "anon insert" ON teleapo_field_history;
DROP POLICY IF EXISTS "anon update" ON teleapo_field_history;
DROP POLICY IF EXISTS "anon delete" ON teleapo_field_history;

CREATE POLICY "anon select" ON teleapo_field_history
  FOR SELECT TO anon, authenticated USING (true);
-- INSERT / UPDATE / DELETE のポリシーは意図的に作らない。
-- トリガーは所有者権限で動くのでこれでも記録される。


-- ── 復元用のビュー ──────────────────────────────────────────────
-- 「値が消された」変更だけを拾う。事故のあとにここを見れば戻せる。
CREATE OR REPLACE VIEW teleapo_suspicious_changes AS
SELECT
  changed_at,
  company_name,
  teleapo_item_id,
  CASE
    WHEN COALESCE(prev_memo, '')        <> '' AND COALESCE(memo, '')        = '' THEN 'メモが消えた'
    WHEN COALESCE(prev_sales_rep, '')   <> '' AND COALESCE(sales_rep, '')   = '' THEN '担当営業が消えた'
    WHEN COALESCE(prev_contact_name,'') <> '' AND COALESCE(contact_name,'') = '' THEN '先方担当者が消えた'
    WHEN prev_status = 'アポ確定' AND status <> 'アポ確定'                        THEN 'アポ確定が取り消された'
  END AS what_happened,
  prev_memo, memo, prev_sales_rep, sales_rep, prev_status, status
FROM teleapo_field_history
WHERE op = 'UPDATE'
  AND (
       (COALESCE(prev_memo, '')        <> '' AND COALESCE(memo, '')        = '')
    OR (COALESCE(prev_sales_rep, '')   <> '' AND COALESCE(sales_rep, '')   = '')
    OR (COALESCE(prev_contact_name,'') <> '' AND COALESCE(contact_name,'') = '')
    OR (prev_status = 'アポ確定' AND status <> 'アポ確定')
  );


-- ── 確認 ────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM teleapo_field_history)                       AS "履歴の件数（最初は0）",
  (SELECT COUNT(*) FROM pg_trigger
     WHERE tgname = 'trg_teleapo_field_history' AND NOT tgisinternal) AS "トリガー（1なら有効）";
