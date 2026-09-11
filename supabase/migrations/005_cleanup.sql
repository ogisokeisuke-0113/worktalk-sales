-- ============================================================================
-- Sales Board / データの後片付け
--
--  (A) users から password 欄を削除する
--      Supabase Auth に移行したので不要になった。
--      値は全員空文字だが、パスワードを入れる場所が残っていること自体が
--      「ここに入れれば使える」と誤解させる。項目ごと消す。
--
--  (B) 架電履歴の担当者名の表記ゆれを直す
--      旧スキーマが担当者を姓だけで持っており（「梶田」など）、
--      フルネームと別人として集計されてしまう。
--      users に姓が一意に一致する場合だけフルネームへ寄せる。
--      call_logs 側は移行時に正規化済みだが、本体(teleapo_items)は未対応だった。
--
-- 安全性:
--   * 架電履歴の件数・中身は変えない。caller の表記だけ揃える。
--   * 元の値は raw / prev_data には影響しない（call_logs は既に正規化済み）。
--   * 何度実行しても同じ結果。
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に全文を貼って Run
-- ============================================================================

-- ── (A) password 欄の削除 ───────────────────────────────────────
UPDATE users
SET data = data - 'password'
WHERE data ? 'password';


-- ── (B) 担当者名の正規化 ────────────────────────────────────────
WITH normalized AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN full_name.name IS NOT NULL
        THEN e.val || jsonb_build_object('caller', full_name.name)
        ELSE e.val
      END
      ORDER BY e.idx
    ) AS arr
  FROM teleapo_items t
  CROSS JOIN LATERAL jsonb_array_elements(t.data->'callHistory') WITH ORDINALITY AS e(val, idx)
  LEFT JOIN LATERAL (
    -- 姓が一意に一致する人がいるときだけフルネームを返す（同姓が複数なら寄せない）
    SELECT MIN(u.data->>'name') AS name
    FROM users u
    WHERE split_part(u.data->>'name', ' ', 1)
        = NULLIF(COALESCE(NULLIF(e.val->>'caller', ''), NULLIF(e.val->>'calledBy', '')), '')
    HAVING COUNT(*) = 1
  ) full_name ON TRUE
  WHERE jsonb_typeof(t.data->'callHistory') = 'array'
    AND jsonb_array_length(t.data->'callHistory') > 0
  GROUP BY t.id
)
UPDATE teleapo_items t
SET data = jsonb_set(t.data, '{callHistory}', n.arr)
FROM normalized n
WHERE t.id = n.id
  AND t.data->'callHistory' IS DISTINCT FROM n.arr;


-- ── 確認 ────────────────────────────────────────────────────────
SELECT 'usersにpassword欄が残っている件数' AS "確認項目",
       (SELECT COUNT(*) FROM users WHERE data ? 'password')::text AS "結果（0なら成功）"
UNION ALL
SELECT '架電履歴の総件数（変わっていないはず）',
       (SELECT COUNT(*) FROM teleapo_items t
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(t.data->'callHistory')='array'
                 THEN t.data->'callHistory' ELSE '[]'::jsonb END) x)::text;

-- 担当者ごとの件数（姓だけの表記が消えていれば成功）
SELECT COALESCE(NULLIF(e.val->>'caller',''), '(空欄)') AS "担当者",
       COUNT(*)                                        AS "架電件数"
FROM teleapo_items t
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(t.data->'callHistory')='array'
       THEN t.data->'callHistory' ELSE '[]'::jsonb END) AS e(val)
GROUP BY 1
ORDER BY 2 DESC;
