-- ============================================================================
-- Sales Board / ブックマーク機能
--
-- 目的:
--   「担当者に電話が繋がりそう」「狙っている会社なので改めよう」といった
--   個人の見立てを残し、あとで効率よく架電し直せるようにする。
--
-- なぜ teleapo_items.data に持たせないか:
--   1社=1行のJSONを丸ごと差し替える構造なので、2人が同時に別々の企業を
--   ブックマークすると、後から保存したほうで相手のぶんが消える。
--   2026-09-10 に架電履歴447件が消えたのと同じ理屈。
--   1人1社で1行の別テーブルにすれば、行が競合しないので起こらない。
--
-- Keep との違い:
--   Keep は当日中だけ有効な「今日かけ直す」印（日付が変わると自動で外れる）。
--   ブックマークは期限なしの個人リスト。役割が別なので併存させる。
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に全文を貼って Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS teleapo_bookmarks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- teleapo_items.id は TEXT なので合わせる
  teleapo_item_id  TEXT NOT NULL,
  -- 企業が消えても誰の何だったか追えるように社名も持つ
  company_name     TEXT,

  -- 誰のブックマークか。Supabase Auth の uid を正とし、表示用に氏名も持つ
  user_id          UUID NOT NULL,
  user_name        TEXT NOT NULL DEFAULT '',

  -- 「担当者に繋がりそう」などの一言メモ
  note             TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同じ人が同じ企業を二重にブックマークしない
CREATE UNIQUE INDEX IF NOT EXISTS teleapo_bookmarks_uniq
  ON teleapo_bookmarks (teleapo_item_id, user_id);

-- 「自分のブックマーク一覧」を引く
CREATE INDEX IF NOT EXISTS teleapo_bookmarks_user_idx
  ON teleapo_bookmarks (user_id, created_at DESC);

-- 一覧側で「この企業は誰かがブックマークしているか」を引く
CREATE INDEX IF NOT EXISTS teleapo_bookmarks_item_idx
  ON teleapo_bookmarks (teleapo_item_id);

COMMENT ON TABLE teleapo_bookmarks IS
  '個人ごとのブックマーク。1人1社で1行なので、同時に操作しても競合しない。';


-- ── RLS ──────────────────────────────────────────────────────────
-- 全員の分を読めるようにする（「梶田ブックマーク」を他の人も見たい要望のため）。
-- 追加・削除は自分の分だけ。他人のブックマークは外せない。
ALTER TABLE teleapo_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authed select" ON teleapo_bookmarks;
DROP POLICY IF EXISTS "authed insert" ON teleapo_bookmarks;
DROP POLICY IF EXISTS "authed update" ON teleapo_bookmarks;
DROP POLICY IF EXISTS "authed delete" ON teleapo_bookmarks;

CREATE POLICY "authed select" ON teleapo_bookmarks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authed insert" ON teleapo_bookmarks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authed update" ON teleapo_bookmarks
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authed delete" ON teleapo_bookmarks
  FOR DELETE TO authenticated USING (user_id = auth.uid());


-- ── Realtime ─────────────────────────────────────────────────────
-- 他の人が付け外ししたら、その場で反映されるようにする
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'teleapo_bookmarks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.teleapo_bookmarks;
  END IF;
END $$;


-- ── 確認 ─────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM teleapo_bookmarks)::text                          AS "ブックマーク件数（最初は0）",
  (SELECT COUNT(*)::text FROM pg_policies
     WHERE schemaname='public' AND tablename='teleapo_bookmarks')         AS "ポリシー数（4なら成功）",
  (SELECT COUNT(*)::text FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND tablename='teleapo_bookmarks') AS "Realtime（1なら有効）";
