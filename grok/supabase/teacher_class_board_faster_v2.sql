-- Faster teacher_class_board while keeping teacher-board-v2 response keys
-- and invoker authorization (JWT app_metadata.role=teacher only).
-- Do not raise statement_timeout; keep 20s. Do not rewrite learner data.
-- Changes:
-- 1) Inline touched-card slimming (avoid per-card helper calls).
-- 2) Do not ORDER BY events inside jsonb_agg; the board already sorts in JS.
-- 3) Skip payload detoast for due_review / session.start / notebook_add.
-- 4) Pass through payload for other event types instead of rebuilding keys.
-- 5) Teacher SELECT policies use (select is_teacher()) so the check is once
--    per query, not once per row.
--
-- Safe to re-run. Does not change SUPABASE_URL, auth, or learner rows.
-- Already applied on project cmainasvlfdynidabunp as migration
-- teacher_class_board_faster_v2 (20261128082624).

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
    'generated_at', now(),
    'snapshot_version', 'teacher-board-v2',
    'event_since', now() - interval '14 days',
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
      'learner_id', e.learner_id,
      'user_id', e.user_id,
      'event_type', e.event_type,
      'created_at', e.created_at,
      'item_id', e.item_id,
      'headword', e.headword,
      'evidence_kind', nullif(e.evidence_kind, ''),
      'task_direction', nullif(e.task_direction, ''),
      'payload', case
        when e.event_type in ('vocab.due_review', 'session.start', 'vocab.notebook_add') then null
        else coalesce(e.payload, '{}'::jsonb)
      end
    ))) as rows
    from public.learner_events e
    where e.created_at >= now() - interval '14 days'
      and e.created_at <= now()
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

drop policy if exists user_progress_select_teacher on public.user_progress;
create policy user_progress_select_teacher
  on public.user_progress
  for select
  to authenticated
  using ((select public.is_teacher()));

drop policy if exists learner_events_select_teacher on public.learner_events;
create policy learner_events_select_teacher
  on public.learner_events
  for select
  to authenticated
  using ((select public.is_teacher()));

notify pgrst, 'reload schema';
