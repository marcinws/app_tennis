-- Player goals belong to exactly one account; only the owner can see, add and change them.
-- The composite foreign key keeps a goal on a player of the same account.
create table public.player_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  player_id uuid not null,
  text text not null check (char_length(text) between 1 and 100 and text = btrim(text)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (player_id, owner_id) references public.players (id, owner_id) on delete cascade
);

create index player_goals_player_id_active_created_at_idx on public.player_goals (player_id, active, created_at);

alter table public.player_goals enable row level security;

create policy player_goals_select_own on public.player_goals
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy player_goals_insert_own on public.player_goals
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy player_goals_update_own on public.player_goals
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Supabase grants anon and authenticated every table privilege by default. RLS does not cover
-- truncate, references or trigger, so keep only what the owner-only policies allow.
-- Clients may write only the columns the routes send; id, owner_id and created_at come from defaults.
revoke all on public.player_goals from anon;
revoke insert, update, delete, truncate, references, trigger on public.player_goals from authenticated;
grant insert (player_id, text), update (text, active) on public.player_goals to authenticated;

-- The limit must equal MAX_ACTIVE_GOALS in src/lib/services/goals.ts.
-- Locking the player row serializes concurrent adds for the same player.
create function public.enforce_active_goal_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform 1 from public.players where id = new.player_id for update;
    if (
      select count(*) from public.player_goals
      where player_id = new.player_id and active and id <> new.id
    ) >= 3 then
      raise exception 'goal_limit' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Trigger functions fire without execute privilege; nobody needs to call it directly.
revoke execute on function public.enforce_active_goal_limit() from public, anon, authenticated;

create trigger player_goals_enforce_active_goal_limit
  before insert or update of active on public.player_goals
  for each row
  execute function public.enforce_active_goal_limit();
