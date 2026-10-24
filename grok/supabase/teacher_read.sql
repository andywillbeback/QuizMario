-- Teacher read access for the 聚光单词（grok） class board.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query),
-- after grok/supabase/user_progress.sql and grok/supabase/learner_events.sql.
-- Safe to re-run: policies and functions are replaced.
--
-- The browser keeps using the anon / publishable key in grok/config.js.
-- Do not put the service_role key in the site.
--
-- Authorization reads the JWT claim app_metadata.role, which is stored in
-- auth.users.raw_app_meta_data. Never use user_metadata / raw_user_meta_data:
-- users can edit that themselves.
--
-- Grant another teacher (then they sign out and sign in so the JWT refreshes):
--
--   update auth.users
--   set raw_app_meta_data =
--     coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'teacher')
--   where lower(email) = 'teacher@example.com';
--
-- Remove the role:
--
--   update auth.users
--   set raw_app_meta_data = raw_app_meta_data - 'role'
--   where lower(email) = 'teacher@example.com';

-- Invoker, not definer: this only reads the caller's JWT. Policies need EXECUTE.
create or replace function public.is_teacher()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'teacher', false);
$$;

comment on function public.is_teacher() is
  'True when auth.jwt() app_metadata.role is teacher. Ignores user_metadata.';

revoke all on function public.is_teacher() from public;
revoke all on function public.is_teacher() from anon;
grant execute on function public.is_teacher() to authenticated;

-- Own-row policies stay as created in user_progress.sql / learner_events.sql.
-- Postgres ORs permissive SELECT policies, so a teacher can read every row
-- and a student still reads only their own.

drop policy if exists user_progress_select_teacher on public.user_progress;
create policy user_progress_select_teacher
  on public.user_progress
  for select
  to authenticated
  using (public.is_teacher());

drop policy if exists learner_events_select_teacher on public.learner_events;
create policy learner_events_select_teacher
  on public.learner_events
  for select
  to authenticated
  using (public.is_teacher());

-- Masked emails for the board. auth.users is not readable by the browser role.
-- The lookup runs as the function owner in an unexposed schema. The public
-- wrapper is security invoker and returns rows only when the JWT role is teacher.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.mask_email(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when raw is null or strpos(raw, '@') = 0 then '—'
    when length(split_part(raw, '@', 1)) <= 1
      then left(split_part(raw, '@', 1), 1) || '***@' || split_part(raw, '@', 2)
    else left(split_part(raw, '@', 1), 2) || '***@' || split_part(raw, '@', 2)
  end;
$$;

revoke all on function private.mask_email(text) from public;
revoke all on function private.mask_email(text) from anon;
revoke all on function private.mask_email(text) from authenticated;

create or replace function private.teacher_directory()
returns table (user_id uuid, masked_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, private.mask_email(u.email::text)
  from auth.users u
  where coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'teacher', false);
$$;

comment on function private.teacher_directory() is
  'Masked auth emails. Empty unless app_metadata.role is teacher. Not exposed via the Data API.';

revoke all on function private.teacher_directory() from public;
revoke all on function private.teacher_directory() from anon;
grant execute on function private.teacher_directory() to authenticated;

create or replace function public.teacher_directory()
returns table (user_id uuid, masked_email text)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.user_id, d.masked_email
  from private.teacher_directory() d;
$$;

comment on function public.teacher_directory() is
  'Teacher-only masked emails (user_id, masked_email). Students receive no rows.';

revoke all on function public.teacher_directory() from public;
revoke all on function public.teacher_directory() from anon;
grant execute on function public.teacher_directory() to authenticated;

-- Re-assert the seeded teacher accounts. Idempotent.
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'teacher')
where lower(email) in ('andyisback@163.com', '642772166@qq.com');

notify pgrst, 'reload schema';
