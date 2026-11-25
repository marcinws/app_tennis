-- The post-match summary fills in an empty tournament name; the route sends only this column.
-- The existing length check on tournament_name and matches_update_own still apply.
grant update (tournament_name) on public.matches to authenticated;
