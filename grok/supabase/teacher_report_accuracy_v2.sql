-- Teacher report accuracy v2. Replaces only four existing read functions.
-- Preserves ownership, grants, RLS, roles, and every learner record.
-- Existing teacher authorization and invoker security remain in effect.
-- Apply as one transaction after backing up the existing function definitions.
begin;
set local lock_timeout = '5s';

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
      or coalesce((card #>> '{polysemy,correct}')::numeric, 0)
         + coalesce((card #>> '{polysemy,wrong}')::numeric, 0)
         + coalesce((card #>> '{polysemy,unknown}')::numeric, 0) > 0
      or coalesce((card #>> '{collocationEvidence,correct}')::numeric, 0)
         + coalesce((card #>> '{collocationEvidence,wrong}')::numeric, 0)
         + coalesce((card #>> '{collocationEvidence,unknown}')::numeric, 0) > 0
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
      'polysemy', card->'polysemy',
      'collocationEvidence', card->'collocationEvidence',
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
      'track', payload->'track',
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
    select jsonb_agg(
      jsonb_build_object(
        'event_id', e.event_id,
        'item_id', e.item_id,
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
            'track', e.payload->'track',
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
      ) order by e.created_at, e.event_id
    ) as rows
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

notify pgrst, 'reload schema';
commit;
