-- New, independent pronunciation evidence; does not alter learning progress,
-- existing teacher reads, auth roles or any existing table/policy.
-- Apply once (safe to rerun) before deploying word-pronunciation.
-- No audio, provider key, signed URL or student token is stored here.

create table if not exists public.word_pronunciation_attempts (
  -- Auth verifies this UUID before the engine reserves it. Do not cascade
  -- deleted accounts: an already attempted provider call still spent quota.
  owner_id uuid not null,
  attempt_id text not null check (attempt_id ~ '^[A-Za-z0-9:_-]{1,120}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  card_key text not null check (length(card_key) between 1 and 240),
  word text not null check (length(word) between 1 and 80),
  duration_ms integer not null check (duration_ms between 350 and 10000),
  created_at timestamptz not null default clock_timestamp(),
  state text not null default 'pending' check (state in ('pending', 'succeeded', 'failed')),
  completed_at timestamptz,
  http_status integer check (http_status between 200 and 599),
  outcome jsonb,
  primary key (owner_id, attempt_id),
  constraint pronunciation_completion_shape check (
    (state = 'pending' and completed_at is null and http_status is null and outcome is null)
    or (state <> 'pending' and completed_at is not null and http_status is not null
      and outcome is not null and jsonb_typeof(outcome) = 'object')
  )
);

create index if not exists word_pronunciation_created_idx on public.word_pronunciation_attempts(created_at);
create index if not exists word_pronunciation_owner_created_idx on public.word_pronunciation_attempts(owner_id, created_at);
alter table public.word_pronunciation_attempts enable row level security;

revoke all on table public.word_pronunciation_attempts from public, anon, authenticated, service_role;
grant select on table public.word_pronunciation_attempts to authenticated;
grant select, insert, update on table public.word_pronunciation_attempts to service_role;

drop policy if exists pronunciation_read_own on public.word_pronunciation_attempts;
create policy pronunciation_read_own on public.word_pronunciation_attempts
  for select to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.word_pronunciation_keep_evidence()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.state <> 'pending' and new is distinct from old then
    raise exception 'Completed pronunciation evidence is immutable';
  end if;
  if (new.owner_id, new.attempt_id, new.request_hash, new.card_key, new.word, new.duration_ms, new.created_at)
    is distinct from
    (old.owner_id, old.attempt_id, old.request_hash, old.card_key, old.word, old.duration_ms, old.created_at) then
    raise exception 'Original pronunciation reservation is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists pronunciation_keep_evidence on public.word_pronunciation_attempts;
create trigger pronunciation_keep_evidence before update on public.word_pronunciation_attempts
  for each row execute function public.word_pronunciation_keep_evidence();
revoke all on function public.word_pronunciation_keep_evidence() from public, anon, authenticated;

create or replace function public.word_pronunciation_reserve(
  p_owner_id uuid, p_attempt_id text, p_request_hash text,
  p_card_key text, p_word text, p_duration_ms integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz;
  v_row public.word_pronunciation_attempts%rowtype;
  v_global bigint; v_student bigint; v_minute bigint;
begin
  -- One shared, short transaction lock makes the global free ceiling atomic.
  -- No HTTP request or provider work happens while this lock is held.
  perform pg_advisory_xact_lock(710314177, 101);
  v_now := clock_timestamp();
  select * into v_row from public.word_pronunciation_attempts
    where owner_id = p_owner_id and attempt_id = p_attempt_id;
  if found then
    if v_row.request_hash is distinct from p_request_hash then return jsonb_build_object('state', 'conflict'); end if;
    if v_row.state = 'pending' then return jsonb_build_object('state', 'pending', 'createdAt', v_row.created_at); end if;
    return jsonb_build_object('state', 'cached', 'outcome', v_row.outcome, 'httpStatus', v_row.http_status);
  end if;
  select count(*), count(*) filter (where owner_id = p_owner_id),
    count(*) filter (where owner_id = p_owner_id and created_at > v_now - interval '1 minute')
    into v_global, v_student, v_minute
    from public.word_pronunciation_attempts where created_at > v_now - interval '24 hours';
  -- A rolling window does not rely on an undocumented provider reset timezone.
  -- Reservations, timeouts, and rejected audio all consume this conservative
  -- budget. It cannot roll back an upstream call whose ACK was lost.
  if v_global >= 400 or v_student >= 40 then return jsonb_build_object('state', 'quota'); end if;
  if v_minute >= 5 then return jsonb_build_object('state', 'throttled'); end if;
  insert into public.word_pronunciation_attempts(owner_id, attempt_id, request_hash, card_key, word, duration_ms, created_at)
    values (p_owner_id, p_attempt_id, p_request_hash, p_card_key, p_word, p_duration_ms, v_now);
  return jsonb_build_object('state', 'reserved');
end;
$$;
revoke all on function public.word_pronunciation_reserve(uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.word_pronunciation_reserve(uuid, text, text, text, text, integer) to service_role;

create or replace function public.word_pronunciation_finish(
  p_owner_id uuid, p_attempt_id text, p_outcome jsonb, p_http_status integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.word_pronunciation_attempts%rowtype;
  v_assessment jsonb; v_accuracy jsonb; v_total jsonb;
begin
  select * into v_row from public.word_pronunciation_attempts
    where owner_id = p_owner_id and attempt_id = p_attempt_id for update;
  if not found then raise exception 'Missing pronunciation reservation'; end if;
  if v_row.state <> 'pending' then
    return jsonb_build_object('state', 'cached', 'outcome', v_row.outcome, 'httpStatus', v_row.http_status);
  end if;
  if jsonb_typeof(p_outcome) is distinct from 'object' or p_http_status is null or p_http_status not between 200 and 599
      or jsonb_typeof(p_outcome->'ok') is distinct from 'boolean' then raise exception 'Invalid pronunciation outcome'; end if;
  if p_outcome->>'ok' = 'true' then
    v_assessment := p_outcome->'assessment';
    if p_http_status <> 200 or p_outcome#>>'{assessment,owner}' is distinct from p_owner_id::text
      or p_outcome#>>'{assessment,attemptId}' is distinct from p_attempt_id
      or p_outcome#>>'{assessment,id}' is distinct from ('ise_' || substring(v_row.request_hash from 1 for 40))
      or p_outcome#>>'{assessment,cardKey}' is distinct from v_row.card_key
      or p_outcome#>>'{assessment,word}' is distinct from v_row.word
      or p_outcome#>>'{assessment,provider}' is distinct from 'xfyun-ise'
      or p_outcome#>>'{assessment,status}' is distinct from 'assessed'
      or p_outcome#>>'{assessment,modelVersion}' is distinct from 'xfyun-ise-en-v1'
      or p_outcome#>'{assessment,scale}' is distinct from '100'::jsonb
      or jsonb_typeof(v_assessment->'at') is distinct from 'string' then
      raise exception 'Pronunciation ownership mismatch';
    end if;
    v_accuracy := v_assessment->'accuracyScore'; v_total := v_assessment->'totalScore';
    if v_accuracy is null or v_total is null
      or jsonb_typeof(v_accuracy) not in ('number', 'null')
      or jsonb_typeof(v_total) not in ('number', 'null')
      or (v_accuracy = 'null'::jsonb and v_total = 'null'::jsonb) then
      raise exception 'Missing pronunciation score';
    end if;
    if jsonb_typeof(v_accuracy) = 'number' then
      if (v_accuracy::text)::numeric not between 0 and 100 then raise exception 'Invalid pronunciation score'; end if;
    end if;
    if jsonb_typeof(v_total) = 'number' then
      if (v_total::text)::numeric not between 0 and 100 then raise exception 'Invalid pronunciation score'; end if;
    end if;
  elsif p_http_status < 400 or p_outcome ? 'assessment'
    or jsonb_typeof(p_outcome->'code') is distinct from 'string'
    or jsonb_typeof(p_outcome->'message') is distinct from 'string' then
    raise exception 'Invalid pronunciation failure';
  end if;
  update public.word_pronunciation_attempts set
    outcome = p_outcome, http_status = p_http_status, completed_at = clock_timestamp(),
    state = case when p_outcome->>'ok' = 'true' then 'succeeded' else 'failed' end
    where owner_id = p_owner_id and attempt_id = p_attempt_id returning * into v_row;
  return jsonb_build_object('state', 'cached', 'outcome', v_row.outcome, 'httpStatus', v_row.http_status);
end;
$$;
revoke all on function public.word_pronunciation_finish(uuid, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.word_pronunciation_finish(uuid, text, jsonb, integer) to service_role;

comment on table public.word_pronunciation_attempts is
  'Immutable server pronunciation outcomes, owner scoped. Quota reservations are not mastery, provider success, or pronunciation correctness.';
