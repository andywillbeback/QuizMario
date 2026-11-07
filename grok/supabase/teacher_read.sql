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

-- One response for the class board. The browser used to page every learner_events
-- row (full payload) and every user_progress save (including untouched cards).
-- That is several round trips and tens of megabytes, which fails as
-- TypeError: Failed to fetch on slow links. Charts need about 7 days of
-- events plus mastery from the save. This returns touched cards only and
-- the last 14 days of slim events, still under the caller's RLS.
-- security invoker: a student JWT only sees their own rows, and the
-- explicit check below rejects them before that. Not security definer.
-- Do not put the service_role key in the site.

create index if not exists learner_events_created_at_idx
  on public.learner_events (created_at);

create or replace function private.board_card_touched(card jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select card is not null
    and jsonb_typeof(card) = 'object'
    and (
      card->>'state' in ('learning', 'review')
      or coalesce((card->>'reps')::numeric, 0) > 0
      or coalesce((card->>'correct')::numeric, 0) > 0
      or coalesce((card->>'wrong')::numeric, 0) > 0
      or coalesce((card->>'unknown')::numeric, 0) > 0
      or coalesce((card->>'mastery')::numeric, 0) > 0
      or coalesce((card #>> '{spelling,correct}')::numeric, 0)
         + coalesce((card #>> '{spelling,wrong}')::numeric, 0)
         + coalesce((card #>> '{spelling,unknown}')::numeric, 0) > 0
      or coalesce((card #>> '{spelling,typed,correct}')::numeric, 0)
         + coalesce((card #>> '{spelling,typed,wrong}')::numeric, 0)
         + coalesce((card #>> '{spelling,typed,unknown}')::numeric, 0) > 0
      or coalesce((card #>> '{spelling,mc,correct}')::numeric, 0)
         + coalesce((card #>> '{spelling,mc,wrong}')::numeric, 0)
         + coalesce((card #>> '{spelling,mc,unknown}')::numeric, 0) > 0
    );
$$;

create or replace function private.board_slim_card(card jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when card is null or jsonb_typeof(card) <> 'object' then '{}'::jsonb
    else jsonb_strip_nulls(jsonb_build_object(
      'state', card->'state',
      'interval', card->'interval',
      'mastery', card->'mastery',
      'mastered', card->'mastered',
      'correct', card->'correct',
      'wrong', card->'wrong',
      'unknown', card->'unknown',
      'reps', card->'reps',
      'due', card->'due',
      'lapses', card->'lapses',
      'spelling', case
        when jsonb_typeof(card->'spelling') = 'object' then jsonb_strip_nulls(jsonb_build_object(
          'correct', card #> '{spelling,correct}',
          'wrong', card #> '{spelling,wrong}',
          'unknown', card #> '{spelling,unknown}',
          'typed', case when jsonb_typeof(card #> '{spelling,typed}') = 'object' then card #> '{spelling,typed}' else null end,
          'mc', case when jsonb_typeof(card #> '{spelling,mc}') = 'object' then card #> '{spelling,mc}' else null end
        ))
        else null
      end
    ))
  end;
$$;

create or replace function private.board_slim_payload(payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when payload is null or jsonb_typeof(payload) <> 'object' then '{}'::jsonb
    else jsonb_strip_nulls(jsonb_build_object(
      'gloss_zh', payload->'gloss_zh',
      'headword', payload->'headword',
      'lemma', payload->'lemma',
      'task_direction', payload->'task_direction',
      'task_direction_detail', payload->'task_direction_detail',
      'evidence_kind', payload->'evidence_kind',
      'duration_ms', payload->'duration_ms',
      'duration_sec', payload->'duration_sec',
      'review_interval_days', payload->'review_interval_days',
      'item_kind', payload->'item_kind',
      'card_kind', payload->'card_kind',
      'kind', payload->'kind',
      'task', payload->'task',
      'related', payload->'related',
      'collocation', payload->'collocation',
      'scene', payload->'scene'
    ))
  end;
$$;

revoke all on function private.board_card_touched(jsonb) from public;
revoke all on function private.board_card_touched(jsonb) from anon;
revoke all on function private.board_slim_card(jsonb) from public;
revoke all on function private.board_slim_card(jsonb) from anon;
revoke all on function private.board_slim_payload(jsonb) from public;
revoke all on function private.board_slim_payload(jsonb) from anon;
grant execute on function private.board_card_touched(jsonb) to authenticated;
grant execute on function private.board_slim_card(jsonb) to authenticated;
grant execute on function private.board_slim_payload(jsonb) to authenticated;

create or replace function public.teacher_class_board()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
set statement_timeout = '20s'
as $$
declare
  body jsonb;
begin
  if not public.is_teacher() then
    raise exception 'not_teacher' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'progress', coalesce(progress.rows, '[]'::jsonb),
    'events', coalesce(events.rows, '[]'::jsonb),
    'directory', coalesce(directory.rows, '[]'::jsonb)
  )
  into body
  from (
    select jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'updated_at', p.updated_at,
        'save', jsonb_strip_nulls(jsonb_build_object(
          'track', p.save->'track',
          'points', p.save->'points',
          'streak', p.save->'streak',
          'bestStreak', p.save->'bestStreak',
          'updatedAt', p.save->'updatedAt',
          'profile', case when jsonb_typeof(p.save->'profile') = 'object' then p.save->'profile' else null end,
          'daily', case when jsonb_typeof(p.save->'daily') = 'object' then p.save->'daily' else '{}'::jsonb end,
          'studyDaily', case when jsonb_typeof(p.save->'studyDaily') = 'object' then p.save->'studyDaily' else '{}'::jsonb end,
          'practice', case when jsonb_typeof(p.save->'practice') = 'object' then p.save->'practice' else '{}'::jsonb end,
          'wrongBook', case when jsonb_typeof(p.save->'wrongBook') = 'object' then p.save->'wrongBook' else '{}'::jsonb end,
          'cards', coalesce(slim.cards, '{}'::jsonb)
        ))
      )
    ) as rows
    from public.user_progress p
    left join lateral (
      select jsonb_object_agg(
        c.key,
        jsonb_strip_nulls(jsonb_build_object(
          'state', c.value->'state',
          'interval', c.value->'interval',
          'mastery', c.value->'mastery',
          'mastered', c.value->'mastered',
          'correct', c.value->'correct',
          'wrong', c.value->'wrong',
          'unknown', c.value->'unknown',
          'reps', c.value->'reps',
          'due', c.value->'due',
          'lapses', c.value->'lapses',
          'spelling', case
            when jsonb_typeof(c.value->'spelling') = 'object' then jsonb_strip_nulls(jsonb_build_object(
              'correct', c.value #> '{spelling,correct}',
              'wrong', c.value #> '{spelling,wrong}',
              'unknown', c.value #> '{spelling,unknown}',
              'typed', case when jsonb_typeof(c.value #> '{spelling,typed}') = 'object' then c.value #> '{spelling,typed}' else null end,
              'mc', case when jsonb_typeof(c.value #> '{spelling,mc}') = 'object' then c.value #> '{spelling,mc}' else null end
            ))
            else null
          end
        ))
      ) as cards
      from jsonb_each(coalesce(p.save->'cards', '{}'::jsonb)) as c(key, value)
      where c.value->>'state' in ('learning', 'review')
        or coalesce((c.value->>'reps')::numeric, 0) > 0
        or coalesce((c.value->>'correct')::numeric, 0) > 0
        or coalesce((c.value->>'wrong')::numeric, 0) > 0
        or coalesce((c.value->>'unknown')::numeric, 0) > 0
        or coalesce((c.value->>'mastery')::numeric, 0) > 0
        or coalesce((c.value #>> '{spelling,correct}')::numeric, 0)
           + coalesce((c.value #>> '{spelling,wrong}')::numeric, 0)
           + coalesce((c.value #>> '{spelling,unknown}')::numeric, 0) > 0
        or coalesce((c.value #>> '{spelling,typed,correct}')::numeric, 0)
           + coalesce((c.value #>> '{spelling,typed,wrong}')::numeric, 0)
           + coalesce((c.value #>> '{spelling,typed,unknown}')::numeric, 0) > 0
        or coalesce((c.value #>> '{spelling,mc,correct}')::numeric, 0)
           + coalesce((c.value #>> '{spelling,mc,wrong}')::numeric, 0)
           + coalesce((c.value #>> '{spelling,mc,unknown}')::numeric, 0) > 0
    ) slim on true
  ) progress
  cross join (
    select jsonb_agg(
      jsonb_build_object(
        'learner_id', e.learner_id,
        'user_id', e.user_id,
        'event_type', e.event_type,
        'created_at', e.created_at,
        'headword', e.headword,
        'evidence_kind', e.evidence_kind,
        'task_direction', e.task_direction,
        'payload', case
          when e.payload is null or jsonb_typeof(e.payload) <> 'object' then '{}'::jsonb
          else jsonb_strip_nulls(jsonb_build_object(
            'gloss_zh', e.payload->'gloss_zh',
            'headword', e.payload->'headword',
            'lemma', e.payload->'lemma',
            'task_direction', e.payload->'task_direction',
            'task_direction_detail', e.payload->'task_direction_detail',
            'evidence_kind', e.payload->'evidence_kind',
            'duration_ms', e.payload->'duration_ms',
            'duration_sec', e.payload->'duration_sec',
            'review_interval_days', e.payload->'review_interval_days',
            'item_kind', e.payload->'item_kind',
            'card_kind', e.payload->'card_kind',
            'kind', e.payload->'kind',
            'task', e.payload->'task',
            'related', e.payload->'related',
            'collocation', e.payload->'collocation',
            'scene', e.payload->'scene'
          ))
        end
      )
    ) as rows
    from public.learner_events e
    where e.created_at >= now() - interval '14 days'
  ) events
  cross join (
    select jsonb_agg(
      jsonb_build_object(
        'user_id', d.user_id,
        'masked_email', d.masked_email
      )
    ) as rows
    from public.teacher_directory() d
  ) directory;

  return coalesce(body, jsonb_build_object(
    'progress', '[]'::jsonb,
    'events', '[]'::jsonb,
    'directory', '[]'::jsonb
  ));
end;
$$;

comment on function public.teacher_class_board() is
  'Teacher-only class snapshot: touched cards plus 14 days of slim events. Requires app_metadata.role=teacher. Students get not_teacher.';

revoke all on function public.teacher_class_board() from public;
revoke all on function public.teacher_class_board() from anon;
grant execute on function public.teacher_class_board() to authenticated;

-- Re-assert the seeded teacher accounts. Idempotent.
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'teacher')
where lower(email) in ('andyisback@163.com', '642772166@qq.com');

notify pgrst, 'reload schema';
