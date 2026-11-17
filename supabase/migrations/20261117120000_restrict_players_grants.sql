-- Supabase grants anon and authenticated every table privilege by default. RLS does not cover
-- truncate, references or trigger, so keep only what the owner-only policies allow.
revoke all on public.players from anon;
revoke delete, truncate, references, trigger on public.players from authenticated;
