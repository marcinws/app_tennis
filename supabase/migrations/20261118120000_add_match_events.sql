-- The match log (point and server-switch actions) and its revision for conditional saves.
-- The length limit must equal MAX_MATCH_ACTIONS in src/lib/services/scoring.ts.
-- `and` gives no evaluation order and jsonb_array_length throws on a non-array, hence the case.
alter table public.matches
  add column events jsonb not null default '[]'::jsonb check (
    case when jsonb_typeof(events) = 'array' then jsonb_array_length(events) <= 2000 else false end
  ),
  add column revision integer not null default 0 check (revision >= 0);

-- The log route sends only these two columns; every other column stays without update.
grant update (events, revision) on public.matches to authenticated;

create policy matches_update_own on public.matches
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
