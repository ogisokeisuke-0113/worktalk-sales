-- ============================================================================
-- Sales Board / RLS を「ログイン済みの人だけ」に絞る
--
-- いまの状態:
--   全テーブルのポリシーが anon（匿名）に読み書きを許している。
--   公開キーはビルド結果のJSに埋め込まれて誰でも見えるので、
--   URLさえ知っていれば、認証なしで
--     ・企業9,647件（社名・電話番号・商談メモ）
--     ・メンバー6名の情報
--     ・架電履歴4,478件
--   を読めるし、書き換えも削除もできる。
--
-- これを authenticated（Supabase Auth でログイン済み）限定にする。
--
-- 前提（すでに完了していること）:
--   1. メンバー6名の Supabase Auth アカウントを作成済み
--   2. ログイン画面を Supabase Auth に切り替えて配信済み
--   ※ 1と2が終わる前にこれを実行すると、全員がアプリを使えなくなる。
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に全文を貼って Run
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proposals', 'teleapo_items', 'users', 'download_leads', 'app_settings'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'テーブル % が無いのでスキップ', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "anon select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon delete" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "allow all"   ON public.%I', t);

    EXECUTE format('CREATE POLICY "authed select" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "authed insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "authed update" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "authed delete" ON public.%I FOR DELETE TO authenticated USING (true)', t);

    RAISE NOTICE 'テーブル % を authenticated 限定にしました', t;
  END LOOP;
END $$;

-- call_logs は「読む」と「足す」だけ。消す手段は引き続き与えない。
DROP POLICY IF EXISTS "anon select" ON call_logs;
DROP POLICY IF EXISTS "anon insert" ON call_logs;
CREATE POLICY "authed select" ON call_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "authed insert" ON call_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 変更履歴は読むだけ。書くのはトリガーなのでポリシーは不要。
DROP POLICY IF EXISTS "anon select" ON teleapo_field_history;
CREATE POLICY "authed select" ON teleapo_field_history FOR SELECT TO authenticated USING (true);


-- ── 確認 ────────────────────────────────────────────────────────
-- roles に anon が残っていなければ成功。
SELECT
  tablename  AS "テーブル",
  policyname AS "ポリシー",
  roles      AS "許可ロール",
  cmd        AS "操作"
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('proposals','teleapo_items','users','download_leads',
                    'app_settings','call_logs','teleapo_field_history')
ORDER BY tablename, cmd;
