-- Exact lexical metadata for review nominations. The existing anchor reader remains available.
begin;
create or replace function public.als_training_anchors_v3(anchor_ids uuid[])
returns table(event_id uuid, learner_id uuid, user_id uuid, source text, event_type text,
              headword text, sense_id text, source_user text, synthetic text, track text, gloss_zh text)
language sql
stable
set search_path to ''
as $function$
    select e.event_id, e.learner_id, e.user_id, e.source, e.event_type,
           e.headword, e.payload->>'sense_id', e.payload->>'source_user_id', e.payload->>'synthetic',
           coalesce(e.payload->>'source_card_track', e.payload->>'track'), e.payload->>'gloss_zh'
    from als_feed_private.vocabulary_events e
    where cardinality(anchor_ids) between 1 and 40 and e.event_id = any(anchor_ids)
$function$;
revoke all on function public.als_training_anchors_v3(uuid[]) from public, anon, authenticated;
grant execute on function public.als_training_anchors_v3(uuid[]) to service_role;
commit;
