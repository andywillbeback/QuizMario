-- Fix: public.teacher_class_board() is security invoker, so the signed-in
-- teacher must be able to enter the private definer helper. The 20:53
-- cached-slim migration revoked EXECUTE on private.teacher_class_board_payload
-- from authenticated, which made live teacher JWT calls fail with
-- "permission denied for function teacher_class_board_payload" (HTTP 403).
-- Tests that ran as postgres did not catch this.
--
-- Keep the is_teacher() gate on the public function (still required).
-- Also check is_teacher() inside the private helper, so a later execute
-- grant cannot leak the snapshot to a non-teacher.
-- statement_timeout stays 20s. Snapshot shape stays teacher-board-v2.
-- Learner rows are not rewritten. SUPABASE_URL / auth contract unchanged.

create or replace function private.teacher_class_board_payload()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '20s'
as $$
declare
  body jsonb;
begin
  if not public.is_teacher() then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(87214401);
  select c.snapshot
    into body
  from private.teacher_board_cache c
  where c.slot = 1
    and c.generated_at > now() - interval '60 seconds';
  if body is not null then
    return body;
  end if;
  return private.build_teacher_board_snapshot();
end;
$$;

revoke all on function private.teacher_class_board_payload() from public;
revoke all on function private.teacher_class_board_payload() from anon;
revoke all on function private.teacher_class_board_payload() from authenticated;

create or replace function public.teacher_class_board()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '20s'
as $$
begin
  if not public.is_teacher() then
    raise exception 'not_teacher' using errcode = '42501';
  end if;
  return private.teacher_class_board_payload();
end;
$$;

comment on function public.teacher_class_board() is
  'Teacher-only class snapshot: touched cards plus 7 days of practice events and a short per-student timeline. Cached for 60s. Requires app_metadata.role=teacher. Runs as security definer only after that check so it can read the private cache helper.';

revoke all on function public.teacher_class_board() from public;
revoke all on function public.teacher_class_board() from anon;
grant execute on function public.teacher_class_board() to authenticated;

notify pgrst, 'reload schema';
