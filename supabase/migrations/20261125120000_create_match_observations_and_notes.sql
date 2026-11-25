-- Targets of the composite foreign keys below. `id` is already unique, so existing rows satisfy them.
alter table public.matches add constraint matches_id_owner_id_key unique (id, owner_id);
alter table public.matches add constraint matches_id_player_id_owner_id_key unique (id, player_id, owner_id);
alter table public.player_goals add constraint player_goals_id_player_id_owner_id_key unique (id, player_id, owner_id);

-- One tap at a goal during a match. The two composite foreign keys share player_id and owner_id,
-- so the database itself keeps an observation on a goal of the match's player, in the same account.
-- `id` comes from the phone (no default), so a retried insert hits the primary key instead of duplicating.
create table public.match_observations (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  match_id uuid not null,
  player_id uuid not null,
  goal_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (match_id, player_id, owner_id) references public.matches (id, player_id, owner_id) on delete cascade,
  foreign key (goal_id, player_id, owner_id) references public.player_goals (id, player_id, owner_id) on delete cascade
);

create index match_observations_match_id_created_at_idx on public.match_observations (match_id, created_at);
create index match_observations_goal_id_idx on public.match_observations (goal_id);

-- A short note during a match. The length limit must equal NOTE_TEXT_MAX_LENGTH in src/lib/services/match-notes.ts.
create table public.match_notes (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  match_id uuid not null,
  text text not null check (char_length(text) between 1 and 200 and text = btrim(text)),
  created_at timestamptz not null default now(),
  foreign key (match_id, owner_id) references public.matches (id, owner_id) on delete cascade
);

create index match_notes_match_id_created_at_idx on public.match_notes (match_id, created_at);

alter table public.match_observations enable row level security;
alter table public.match_notes enable row level security;

create policy match_observations_select_own on public.match_observations
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy match_observations_insert_own on public.match_observations
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy match_observations_delete_own on public.match_observations
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create policy match_notes_select_own on public.match_notes
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy match_notes_insert_own on public.match_notes
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy match_notes_delete_own on public.match_notes
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- Supabase grants anon and authenticated every table privilege by default. RLS does not cover
-- truncate, references or trigger, so keep only what the owner-only policies allow.
-- Clients may insert only the columns the routes send. `id` is the deliberate exception to
-- defaults-only ids: the phone picks it so retries are idempotent. owner_id and created_at stay default.
-- Entries are never edited, only added and deleted, so there is no update.
revoke all on public.match_observations from anon;
revoke all on public.match_notes from anon;
revoke insert, update, delete, truncate, references, trigger on public.match_observations from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.match_notes from authenticated;
grant insert (id, match_id, player_id, goal_id), delete on public.match_observations to authenticated;
grant insert (id, match_id, text), delete on public.match_notes to authenticated;

-- An ended goal is final: observations from earlier matches point at it, so its text must not change.
-- `using` checks the row before the update, so ending an active goal still passes.
alter policy player_goals_update_own on public.player_goals
  using (owner_id = (select auth.uid()) and active);
