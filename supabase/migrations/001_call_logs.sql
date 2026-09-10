-- ============================================================================
-- Sales Board / 架電履歴を「追記専用テーブル」へ切り出す
--
-- 目的:
--   架電履歴は teleapo_items.data の callHistory 配列に入っている。
--   1社=1行のJSONを丸ごと差し替える方式のため、古いコピーで上書きされたり
--   送信を取りこぼしたりすると履歴そのものが消える。実際に447件が消えた。
--   INSERT しかしないテーブルへ切り出せば、行が競合しないので
--   上書きも取りこぼしも原理的に起こらない。
--
-- このSQLがやること:
--   1. call_logs テーブルと索引を作る
--   2. RLS を設定する（SELECT / INSERT のみ。UPDATE / DELETE は許可しない）
--   3. 既存の callHistory 4,472件を call_logs へ取り込む（バックフィル）
--   4. 件数の照合結果を表示する
--
-- 安全性:
--   * teleapo_items には一切触れない。新しいテーブルを作って読むだけ。
--   * 何度実行しても同じ結果になる（CREATE IF NOT EXISTS / ON CONFLICT DO NOTHING）
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に全文を貼って Run
-- ============================================================================


-- ── 1. テーブル ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- teleapo_items.id は TEXT なので合わせる
  teleapo_item_id   TEXT NOT NULL,
  -- 元の行が消えても誰への架電か追えるよう、社名は非正規化して持つ
  company_name      TEXT,

  -- callHistory 側エントリの id（無いデータもある）
  entry_id          TEXT,
  -- 二重登録を防ぐ鍵。id が無いエントリは配列内の位置で代用する
  dedup_key         TEXT NOT NULL,

  caller            TEXT NOT NULL DEFAULT '',
  -- 旧データには日時が入っていないものが374件ある。捏造せず NULL のままにする
  called_at         TIMESTAMPTZ,

  result            TEXT,
  call_type         TEXT,
  call_content      TEXT,
  memo              TEXT,
  rejection_reason  TEXT,

  -- 将来項目が増えても取りこぼさないよう、元エントリを丸ごと保持する
  raw               JSONB,

  source            TEXT NOT NULL DEFAULT 'app',   -- app / backfill / recovery
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS call_logs_dedup_uniq  ON call_logs (dedup_key);
CREATE INDEX        IF NOT EXISTS call_logs_item_idx    ON call_logs (teleapo_item_id, called_at DESC);
CREATE INDEX        IF NOT EXISTS call_logs_caller_idx  ON call_logs (caller, called_at DESC);
CREATE INDEX        IF NOT EXISTS call_logs_date_idx    ON call_logs (called_at DESC);

COMMENT ON TABLE  call_logs IS '架電履歴の正本。INSERT のみ。teleapo_items.data.callHistory は Phase 2 で廃止予定。';
COMMENT ON COLUMN call_logs.dedup_key IS 'teleapo_item_id|entry_id 形式。id が無いエントリは pos:配列位置 で代用。';


-- ── 2. RLS ───────────────────────────────────────────────────────
-- 既存テーブルに合わせて anon から読み書きできるようにする。
-- ただし UPDATE / DELETE のポリシーは意図的に作らない。
-- 履歴は消えてはいけないものなので、アプリから消す手段を最初から与えない。
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon select" ON call_logs;
DROP POLICY IF EXISTS "anon insert" ON call_logs;
DROP POLICY IF EXISTS "anon update" ON call_logs;
DROP POLICY IF EXISTS "anon delete" ON call_logs;

CREATE POLICY "anon select" ON call_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon insert" ON call_logs FOR INSERT TO anon, authenticated WITH CHECK (true);


-- ── 3. バックフィル ───────────────────────────────────────────────
-- 注意: callHistory には2世代のスキーマが混在している。
--   新: { id, date,     caller,   result, callType, callContent, note, rejectionReason }
--   旧: {     calledAt, calledBy, result, note }                       ← 175件
-- 旧世代を拾い損ねると175件が消えるので、両方を見る。
-- また、旧スキーマは担当者を姓だけで持っている（「梶田」166件）。
-- そのままだと「梶田 祐守」と別人扱いになり集計が割れるので、
-- users テーブルに姓が一意に一致する人がいる場合だけフルネームへ寄せる。
-- 元エントリは raw にそのまま残すので、判断を誤っても後から追える。
WITH src AS (
  SELECT
    t.id                                        AS item_id,
    t.data->>'companyName'                      AS company_name,
    e.val                                       AS entry,
    e.idx                                       AS idx,
    COALESCE(NULLIF(e.val->>'caller', ''), NULLIF(e.val->>'calledBy', ''), '') AS raw_caller,
    -- ISO 形式に見えるものだけ日時として採用し、それ以外は NULL のまま残す（捏造しない）
    CASE
      WHEN COALESCE(NULLIF(e.val->>'date', ''), NULLIF(e.val->>'calledAt', ''))
           ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN COALESCE(NULLIF(e.val->>'date', ''), NULLIF(e.val->>'calledAt', ''))::timestamptz
    END                                         AS called_at
  FROM teleapo_items t
  CROSS JOIN LATERAL jsonb_array_elements(
    -- callHistory が配列でない（null / 欠落）行でも落ちないようにする
    CASE WHEN jsonb_typeof(t.data->'callHistory') = 'array'
         THEN t.data->'callHistory'
         ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(val, idx)
)
INSERT INTO call_logs (
  teleapo_item_id, company_name, entry_id, dedup_key,
  caller, called_at, result, call_type, call_content, memo, rejection_reason,
  raw, source
)
SELECT
  s.item_id,
  s.company_name,
  s.entry->>'id',
  s.item_id || '|' || COALESCE(s.entry->>'id', 'pos:' || s.idx),

  COALESCE(
    (SELECT MIN(u.data->>'name') FROM users u
      WHERE split_part(u.data->>'name', ' ', 1) = NULLIF(s.raw_caller, '')
      HAVING COUNT(*) = 1),          -- 同姓が複数いる場合は寄せない
    s.raw_caller
  ),

  s.called_at,
  s.entry->>'result',
  s.entry->>'callType',
  s.entry->>'callContent',
  s.entry->>'note',
  s.entry->>'rejectionReason',
  s.entry,
  'backfill'
FROM src s
ON CONFLICT (dedup_key) DO NOTHING;


-- ── 4. 集計用ビュー ──────────────────────────────────────────────
CREATE OR REPLACE VIEW call_logs_daily AS
SELECT
  (called_at AT TIME ZONE 'Asia/Tokyo')::date          AS call_date,
  caller,
  COUNT(*)                                             AS calls,
  COUNT(*) FILTER (WHERE result = 'アポ獲得')          AS appointments,
  COUNT(DISTINCT teleapo_item_id)                      AS companies
FROM call_logs
WHERE called_at IS NOT NULL
GROUP BY 1, 2;


-- ── 5. 照合 ──────────────────────────────────────────────────────
-- 「取り込んだ件数」と「callHistory の総エントリ数」が一致すれば成功。
-- 2026-09-10 時点の実測値は 4,472 件。
SELECT
  (SELECT COUNT(*) FROM call_logs)                                     AS "call_logsの件数",
  (SELECT COUNT(*) FROM teleapo_items t
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(t.data->'callHistory') = 'array'
            THEN t.data->'callHistory' ELSE '[]'::jsonb END) x)        AS "callHistoryの総数",
  (SELECT COUNT(*) FROM call_logs WHERE called_at IS NULL)             AS "日時が不明",
  (SELECT COUNT(*) FROM call_logs WHERE caller = '')                   AS "担当者が不明",
  (SELECT COUNT(*) FROM call_logs WHERE raw ? 'calledAt')              AS "旧スキーマから取り込んだ件数";
