-- The owner can delete a match from its summary. Observations and notes go with it through
-- their on delete cascade foreign keys (20261125120000), which run regardless of these grants.
create policy matches_delete_own on public.matches
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

grant delete on public.matches to authenticated;
