-- QuizMario cloud progress.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: policies and the trigger are dropped before create.
--
-- Each auth user gets one row. RLS lets that user read and write only their row.
-- The anon key in config.js is public; do not use the service_role key on the site.

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  save jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_progress_save_object check (jsonb_typeof(save) = 'object')
);

comment on table public.user_progress is 'QuizMario per-user save (vocabSpotlight_v1 JSON).';
comment on column public.user_progress.save is 'SaveData JSON including updatedAt for last-write-wins.';

alter table public.user_progress enable row level security;

revoke all on table public.user_progress from anon;
grant select, insert, update, delete on table public.user_progress to authenticated;

drop policy if exists user_progress_select_own on public.user_progress;
create policy user_progress_select_own
  on public.user_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_progress_insert_own on public.user_progress;
create policy user_progress_insert_own
  on public.user_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_progress_update_own on public.user_progress;
create policy user_progress_update_own
  on public.user_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_progress_delete_own on public.user_progress;
create policy user_progress_delete_own
  on public.user_progress
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_user_progress_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_progress_set_updated_at on public.user_progress;
create trigger user_progress_set_updated_at
  before update on public.user_progress
  for each row
  execute function public.set_user_progress_updated_at();
