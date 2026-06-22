-- The Command Zone — database schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- It's idempotent (safe to run again).
--
-- Online PLAY needs no tables (it uses Realtime broadcast/presence only).
-- This table exists solely so logged-in users can save their decks to the cloud.

-- One row per user holding all of that user's decks as a JSON blob.
create table if not exists public.user_decks (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  decks      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: each user can only see/modify their own row.
alter table public.user_decks enable row level security;

drop policy if exists "own decks - select" on public.user_decks;
drop policy if exists "own decks - insert" on public.user_decks;
drop policy if exists "own decks - update" on public.user_decks;
drop policy if exists "own decks - delete" on public.user_decks;

create policy "own decks - select" on public.user_decks
  for select using (auth.uid() = user_id);

create policy "own decks - insert" on public.user_decks
  for insert with check (auth.uid() = user_id);

create policy "own decks - update" on public.user_decks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own decks - delete" on public.user_decks
  for delete using (auth.uid() = user_id);
