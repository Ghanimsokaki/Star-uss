-- STAR TREK: ASCENSION — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
-- The browser holds only the public anon key, so EVERY table has row-level
-- security: a player can read and write their own save and leaderboard row,
-- and nothing else. The leaderboard is readable by everyone.

-- ------------------------------------------------------------------ saves
create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  version    int   not null default 1,
  updated_at timestamptz not null default now(),
  -- keep a single save from growing without bound (the client caps at 256 KB)
  constraint saves_size check (pg_column_size(data) < 400000)
);

alter table public.saves enable row level security;

drop policy if exists "saves: read own"   on public.saves;
drop policy if exists "saves: insert own" on public.saves;
drop policy if exists "saves: update own" on public.saves;
drop policy if exists "saves: delete own" on public.saves;
create policy "saves: read own"   on public.saves for select using (auth.uid() = user_id);
create policy "saves: insert own" on public.saves for insert with check (auth.uid() = user_id);
create policy "saves: update own" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saves: delete own" on public.saves for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------ leaderboard
create table if not exists public.leaderboard (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  captain    text not null check (char_length(captain) between 1 and 24),
  xp         bigint not null default 0 check (xp between 0 and 100000000),
  kills      int    not null default 0 check (kills between 0 and 10000000),
  systems    int    not null default 0 check (systems between 0 and 1000),
  rank       text   not null default 'Ensign' check (char_length(rank) <= 32),
  updated_at timestamptz not null default now()
);
create index if not exists leaderboard_xp on public.leaderboard (xp desc);

alter table public.leaderboard enable row level security;

drop policy if exists "leaderboard: public read" on public.leaderboard;
drop policy if exists "leaderboard: insert own"  on public.leaderboard;
drop policy if exists "leaderboard: update own"  on public.leaderboard;
create policy "leaderboard: public read" on public.leaderboard for select using (true);
create policy "leaderboard: insert own"  on public.leaderboard for insert with check (auth.uid() = user_id);
create policy "leaderboard: update own"  on public.leaderboard for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- (no delete policy: rows go away with the account via ON DELETE CASCADE)

-- Note: scores are reported by the game client, so a determined player could
-- inflate their own row. The check constraints bound the damage; for a
-- competitive ladder, move scoring into an Edge Function that validates runs.
