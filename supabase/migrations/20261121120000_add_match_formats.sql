-- Format ids must match MATCH_FORMATS in src/lib/services/matches.ts.
-- matches_format_check is the default name of the inline check from 20261117140000_create_matches.sql.
alter table public.matches
  drop constraint matches_format_check,
  add constraint matches_format_check check (format in ('best_of_3_sets', 'two_sets_super_tiebreak', 'short_sets'));

-- The start form now sends with_advantage; the other insert columns stay as granted before.
grant insert (with_advantage) on public.matches to authenticated;
