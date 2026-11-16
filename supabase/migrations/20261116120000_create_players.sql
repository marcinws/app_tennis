-- Players belong to exactly one account; only the owner can see and change them.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50 and name = btrim(name)),
  created_at timestamptz not null default now()
);

create unique index players_owner_id_lower_name_key on public.players (owner_id, lower(name));

alter table public.players enable row level security;

create policy players_select_own on public.players
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy players_insert_own on public.players
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy players_update_own on public.players
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
