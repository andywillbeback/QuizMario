-- QuizMario learner_events (signals for ALS).
-- Run once in the Supabase SQL editor, after supabase/user_progress.sql.
-- Safe to re-run: policies are dropped before create.
--
-- One row per signal. QuizMario inserts source = 'quizmario' only.
-- learner_id and user_id are both the signed-in auth.uid() (ALS accepts either).
-- SM-2 clocks stay in the QuizMario save. This table does not store intervals.
-- ALS Mac ingest is still JSONL → SQLite until ALS reads this table itself.
-- The anon key is public. RLS blocks cross-user reads and forged ALS rows.
-- evidence_kind, independent, and task_direction are optional columns.
-- learner_events_evidence.sql is the same ALTER for a table that already exists.

create table if not exists public.learner_events (
  event_id uuid primary key,
  learner_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null,
  source text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  item_id text,
  headword text,
  frame_id text,
  cefr_level text,
  run_purpose text,
  evidence_kind text,
  independent boolean,
  task_direction text,
  constraint learner_events_source_check check (source in ('quizmario', 'als')),
  constraint learner_events_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint learner_events_user_matches check (user_id = learner_id)
);

-- Existing tables created before these columns: CREATE TABLE IF NOT EXISTS does not add them.
alter table public.learner_events
  add column if not exists evidence_kind text,
  add column if not exists independent boolean,
  add column if not exists task_direction text;

comment on table public.learner_events is
  'Append-only vocab signals. QM writes source=quizmario. ALS SQLite ingest is separate.';
comment on column public.learner_events.learner_id is 'Supabase auth.uid(). ALS ingest alias: user_id.';
comment on column public.learner_events.user_id is 'Same uuid as learner_id. Accepted as learner_id on ALS ingest.';
comment on column public.learner_events.headword is 'Lemma, already lowercased by QuizMario.';
comment on column public.learner_events.payload is
  'Small JSON. due_at (ISO-8601) lives here for vocab.due_review. evidence_kind, independent, and task_direction are copied here as well as their columns. Not an SM-2 state.';
comment on column public.learner_events.evidence_kind is
  'typed_spelling, mc_recognition, or mc_production. Also stored in payload.';
comment on column public.learner_events.independent is
  'Whether the attempt is independent typed spelling. false is stored. Also stored in payload.';
comment on column public.learner_events.task_direction is
  'Task direction such as spelling, meaning, or form. Also stored in payload.';

create index if not exists learner_events_learner_created_idx
  on public.learner_events (learner_id, created_at desc);

alter table public.learner_events enable row level security;

revoke all on table public.learner_events from anon;
revoke all on table public.learner_events from authenticated;
grant select, insert on table public.learner_events to authenticated;

drop policy if exists learner_events_select_own on public.learner_events;
create policy learner_events_select_own
  on public.learner_events
  for select
  to authenticated
  using (auth.uid() = learner_id);

drop policy if exists learner_events_insert_own on public.learner_events;
create policy learner_events_insert_own
  on public.learner_events
  for insert
  to authenticated
  with check (
    auth.uid() = learner_id
    and user_id = auth.uid()
    and source = 'quizmario'
  );

-- Append-only for the browser role: no update or delete policy.
