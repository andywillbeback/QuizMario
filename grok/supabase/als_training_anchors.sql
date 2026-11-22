-- The service can validate a bounded list of anchors through the existing scoped
-- vocabulary projection. It does not need direct SELECT on the full event ledger.
create function public.als_training_anchors_v1(anchor_ids uuid[])
returns table(event_id uuid, learner_id uuid, user_id uuid, source text, event_type text,
              headword text, sense_id text, source_user text, synthetic text)
language sql stable security invoker set search_path = '' as $$
    select e.event_id, e.learner_id, e.user_id, e.source, e.event_type,
           e.headword, e.payload->>'sense_id', e.payload->>'source_user_id', e.payload->>'synthetic'
    from als_feed_private.vocabulary_events e
    where cardinality(anchor_ids) between 1 and 40 and e.event_id=any(anchor_ids)
$$;
revoke all on function public.als_training_anchors_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.als_training_anchors_v1(uuid[]) to service_role;
