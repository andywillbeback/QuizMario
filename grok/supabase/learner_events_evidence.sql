-- Evidence columns on public.learner_events.
-- Run in the Supabase SQL editor on a database that already has the table
-- (see learner_events.sql). Safe to re-run.
--
-- Live project already received this ALTER. The browser upsert lists these
-- three names explicitly and also copies them into payload. Nullable, with
-- no default, so existing rows stay valid and the add does not rewrite the table.
-- The browser uses the anon key and RLS. This file does not grant extra privileges.

alter table public.learner_events
  add column if not exists evidence_kind text,
  add column if not exists independent boolean,
  add column if not exists task_direction text;

comment on column public.learner_events.evidence_kind is
  'typed_spelling, mc_recognition, or mc_production. Also stored in payload.';
comment on column public.learner_events.independent is
  'Whether the attempt is independent typed spelling. false is stored. Also stored in payload.';
comment on column public.learner_events.task_direction is
  'Task direction such as spelling, meaning, or form. Also stored in payload.';
