-- ============================================================================
-- Sales Board / ブックマークを複数リストに分ける
--
-- 要望:
--   1アカウントで複数のブックマークを作りたい／それぞれに名前を付けたい。
--
-- 方針:
--   1社は1つのリストにだけ入る（別のリストへは「移動」）。
--   ☆マークの意味が今までどおり「ブックマーク済み」のままで済み、
--   一覧の見た目も操作も変わらないため。
--   よって既存の一意制約 (teleapo_item_id, user_id) はそのまま使う。
--
-- 既存データ:
--   いまあるブックマークは全部「マイリスト」に入る。消えない。
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に全文を貼って Run
-- ============================================================================

ALTER TABLE teleapo_bookmarks
  ADD COLUMN IF NOT EXISTS list_name TEXT NOT NULL DEFAULT 'マイリスト';

-- 念のため、空文字で入っているものがあれば既定名に寄せる
UPDATE teleapo_bookmarks SET list_name = 'マイリスト'
  WHERE list_name IS NULL OR btrim(list_name) = '';

-- 「自分の『◯◯リスト』」を引く
CREATE INDEX IF NOT EXISTS teleapo_bookmarks_list_idx
  ON teleapo_bookmarks (user_id, list_name);

COMMENT ON COLUMN teleapo_bookmarks.list_name IS
  'ブックマークの分類名。1社は1リストだけに入る。名前の変更は同じ user_id の行を一括更新する。';

-- ── 確認 ─────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM teleapo_bookmarks)::text                       AS "ブックマーク件数",
  (SELECT COUNT(DISTINCT list_name) FROM teleapo_bookmarks)::text      AS "リスト数（最初は1）",
  (SELECT string_agg(DISTINCT list_name, ' / ') FROM teleapo_bookmarks) AS "リスト名";
