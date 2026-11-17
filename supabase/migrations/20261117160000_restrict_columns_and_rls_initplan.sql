-- Clients may write only the columns the forms send; id, owner_id and created_at come from defaults.
revoke insert on public.matches from authenticated;
grant insert (player_id, tournament_name, format, first_server) on public.matches to authenticated;
revoke insert, update on public.players from authenticated;
grant insert (name), update (name) on public.players to authenticated;

-- (select auth.uid()) is evaluated once per statement instead of once per row.
alter policy players_select_own on public.players using (owner_id = (select auth.uid()));
alter policy players_insert_own on public.players with check (owner_id = (select auth.uid()));
alter policy players_update_own on public.players
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
alter policy matches_select_own on public.matches using (owner_id = (select auth.uid()));
alter policy matches_insert_own on public.matches with check (owner_id = (select auth.uid()));
