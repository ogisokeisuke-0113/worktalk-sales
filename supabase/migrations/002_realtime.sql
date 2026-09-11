-- ============================================================================
-- Sales Board / Realtime（他メンバーの更新をその場で反映）を有効にする
--
-- 目的:
--   起動時に一度データを取ったきりなので、開きっぱなしのタブは
--   朝のスナップショットを持ち続ける。その状態で企業情報を保存すると、
--   その間に他の人が入れた変更を巻き戻してしまう。
--   変更を購読して即座に反映すれば、この窓が閉じる。
--
-- 安全性:
--   * データは一切変更しない。変更通知の配信対象にテーブルを加えるだけ。
--   * 何度実行しても同じ結果（既に入っていれば何もしない）
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に全文を貼って Run
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  -- publication 自体が無いプロジェクトもあるので先に用意する
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 対象テーブルを順に追加する。存在しないテーブルはスキップする
  FOREACH t IN ARRAY ARRAY['teleapo_items', 'proposals'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'テーブル % が無いのでスキップします', t;
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE 'テーブル % は既に有効です', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    RAISE NOTICE 'テーブル % を追加しました', t;
  END LOOP;
END $$;

-- 確認: teleapo_items と proposals が並んでいれば成功
SELECT tablename AS "Realtimeが有効なテーブル"
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY 1;
