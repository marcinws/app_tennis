-- Target of the composite foreign key below: a match can point only at a player of the same account.
alter table public.players add constraint players_id_owner_id_key unique (id, owner_id);

-- Matches belong to exactly one account; only the owner can see and start them.
-- Format ids must match MATCH_FORMATS in src/lib/services/matches.ts.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  player_id uuid not null,
  tournament_name text check (
    tournament_name is null
    or (char_length(tournament_name) between 1 and 100 and tournament_name = btrim(tournament_name))
  ),
  format text not null check (format in ('best_of_3_sets')),
  with_advantage boolean not null default true,
  first_server text not null check (first_server in ('player', 'opponent')),
  created_at timestamptz not null default now(),
  foreign key (player_id, owner_id) references public.players (id, owner_id)
);

create index matches_owner_id_created_at_idx on public.matches (owner_id, created_at desc);

alter table public.matches enable row level security;

create policy matches_select_own on public.matches
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy matches_insert_own on public.matches
  for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Supabase grants anon and authenticated every table privilege by default. RLS does not cover
-- truncate, references or trigger, so keep only what the owner-only policies allow.
revoke all on public.matches from anon;
revoke update, delete, truncate, references, trigger on public.matches from authenticated;
