-- 差分同期のための索引
--
-- 「前回以降に変わった行だけ」を取りに行くようになったため、
-- updated_at での絞り込みと並べ替えが定期的に走る。
-- 索引が無いと9,646行を毎回走査する（実測: 最新1件の取得に1.2秒）。
-- 件数が増えるほど効くので、先に入れておく。

create index if not exists teleapo_items_updated_at_idx
  on public.teleapo_items (updated_at);

create index if not exists proposals_updated_at_idx
  on public.proposals (updated_at);
