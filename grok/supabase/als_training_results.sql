-- Private owner history from the trusted ALS classroom. Source vocabulary stays in learner_events.
create table public.als_training_results (
    event_id uuid primary key,
    learner_id uuid not null references auth.users(id) on delete cascade,
    user_id uuid not null check (user_id=learner_id),
    source text not null check (source='als'),
    event_type text not null check (event_type='als.training_result'),
    created_at timestamptz not null,
    headword text,
    payload jsonb not null check (jsonb_typeof(payload)='object')
);
create index als_training_results_owner_time_idx on public.als_training_results
    (learner_id, created_at desc, event_id desc);
alter table public.als_training_results enable row level security;
revoke all on table public.als_training_results from public, anon, authenticated, service_role;
grant select on table public.als_training_results to authenticated;
grant select, insert on table public.als_training_results to service_role;
create policy als_training_read_own on public.als_training_results for select to authenticated
    using (learner_id=(select auth.uid()));
