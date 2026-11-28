-- Durable teacher board snapshot: slim 7-day events + 60s cache.
-- Keeps teacher-board-v2 keys so live grok/teacher.js does not need to change.
-- Authorization is unchanged: public.teacher_class_board() is security invoker
-- and still requires JWT app_metadata.role=teacher. statement_timeout stays 20s.
-- Learner rows are not rewritten. private cache is not exposed to the Data API.

create table if not exists private.teacher_board_cache (
  slot smallint primary key default 1 check (slot = 1),
  generated_at timestamptz not null,
  event_since timestamptz not null,
  snapshot jsonb not null,
  snapshot_bytes integer not null,
  build_ms integer
);

alter table private.teacher_board_cache enable row level security;
revoke all on table private.teacher_board_cache from public;
revoke all on table private.teacher_board_cache from anon;
revoke all on table private.teacher_board_cache from authenticated;

create or replace function private.build_teacher_board_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '20s'
as $$
declare
  body jsonb;
  started timestamptz := clock_timestamp();
  since_at timestamptz := now() - interval '7 days';
begin
  select jsonb_build_object(
    'generated_at', now(),
    'snapshot_version', 'teacher-board-v2',
    'event_since', since_at,
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
        'source_card_count', coalesce(slim.card_count, 0),
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
      ) order by p.user_id
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
          'polysemy', c.value->'polysemy',
          'collocationEvidence', c.value->'collocationEvidence',
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
      ) as cards, count(*)::integer as card_count
      from jsonb_each(coalesce(p.save->'cards', '{}'::jsonb)) as c(key, value)
      where c.value->>'state' in ('learning', 'review')
        or coalesce((c.value->>'reps')::numeric, 0) > 0
        or coalesce((c.value->>'correct')::numeric, 0) > 0
        or coalesce((c.value->>'wrong')::numeric, 0) > 0
        or coalesce((c.value->>'unknown')::numeric, 0) > 0
        or coalesce((c.value->>'mastery')::numeric, 0) > 0
        or coalesce((c.value #>> '{polysemy,correct}')::numeric, 0)
           + coalesce((c.value #>> '{polysemy,wrong}')::numeric, 0)
           + coalesce((c.value #>> '{polysemy,unknown}')::numeric, 0) > 0
        or coalesce((c.value #>> '{collocationEvidence,correct}')::numeric, 0)
           + coalesce((c.value #>> '{collocationEvidence,wrong}')::numeric, 0)
           + coalesce((c.value #>> '{collocationEvidence,unknown}')::numeric, 0) > 0
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
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'learner_id', w.learner_id,
      'user_id', w.user_id,
      'event_type', w.event_type,
      'created_at', w.created_at,
      'item_id', w.item_id,
      'headword', w.headword,
      'evidence_kind', nullif(w.evidence_kind, ''),
      'task_direction', nullif(w.task_direction, ''),
      'payload', w.payload
    ))) as rows
    from (
      select e.learner_id, e.user_id, e.event_type, e.created_at, e.item_id, e.headword, e.evidence_kind, e.task_direction,
             case
               when e.event_type in ('vocab.due_review', 'session.start') then null
               else coalesce(e.payload, '{}'::jsonb)
             end as payload
      from public.learner_events e
      where e.created_at >= since_at
        and e.created_at <= now()
        and e.event_type not in ('vocab.due_review', 'session.start')
      union
      select s.learner_id, s.user_id, s.event_type, s.created_at, s.item_id, s.headword, s.evidence_kind, s.task_direction, null::jsonb
      from (
        select e.*, row_number() over (
          partition by coalesce(e.user_id, e.learner_id)
          order by e.created_at desc
        ) as rn
        from public.learner_events e
        where e.created_at >= since_at
          and e.created_at <= now()
          and e.event_type not in ('session.start', 'session.end')
      ) s
      where s.rn <= 12
    ) w
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

  body := coalesce(body, jsonb_build_object(
    'generated_at', now(),
    'snapshot_version', 'teacher-board-v2',
    'event_since', since_at,
    'progress', '[]'::jsonb,
    'events', '[]'::jsonb,
    'directory', '[]'::jsonb
  ));

  insert into private.teacher_board_cache as c (slot, generated_at, event_since, snapshot, snapshot_bytes, build_ms)
  values (
    1,
    coalesce((body->>'generated_at')::timestamptz, now()),
    since_at,
    body,
    pg_column_size(body),
    greatest(0, (extract(epoch from (clock_timestamp() - started)) * 1000)::int)
  )
  on conflict (slot) do update
  set generated_at = excluded.generated_at,
      event_since = excluded.event_since,
      snapshot = excluded.snapshot,
      snapshot_bytes = excluded.snapshot_bytes,
      build_ms = excluded.build_ms;

  return body;
end;
$$;

revoke all on function private.build_teacher_board_snapshot() from public;
revoke all on function private.build_teacher_board_snapshot() from anon;
revoke all on function private.build_teacher_board_snapshot() from authenticated;

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
security invoker
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
  'Teacher-only class snapshot: touched cards plus 7 days of practice events and a short per-student timeline. Cached for 60s. Requires app_metadata.role=teacher.';

revoke all on function public.teacher_class_board() from public;
revoke all on function public.teacher_class_board() from anon;
grant execute on function public.teacher_class_board() to authenticated;

notify pgrst, 'reload schema';
