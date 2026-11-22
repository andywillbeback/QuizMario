-- A student-owned mirror for cross-app display, independent of assessed training results.
create table public.als_student_activity (
    owner_id uuid not null references auth.users(id) on delete cascade,
    record_id uuid not null,
    recorded_at timestamptz not null,
    revised_at timestamptz not null,
    category text not null check (category in ('training','class','exam','practice','notebook')),
    title text not null check (length(title) between 1 and 100),
    details jsonb not null check (jsonb_typeof(details)='object' and octet_length(details::text)<=1000000),
    writer_signature text check (length(writer_signature)=64),
    removed boolean not null default false,
    primary key(owner_id,record_id)
);
create index als_student_activity_page_idx on public.als_student_activity(owner_id,recorded_at desc,record_id desc) where not removed;
alter table public.als_student_activity enable row level security;
revoke all on public.als_student_activity from public,anon,authenticated;
grant select,insert,update on public.als_student_activity to authenticated;
create policy student_activity_read on public.als_student_activity for select to authenticated using(owner_id=(select auth.uid()));
create policy student_activity_create on public.als_student_activity for insert to authenticated with check(owner_id=(select auth.uid()));
create policy student_activity_revise on public.als_student_activity for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create function public.als_sync_student_activity_v2(expected_owner uuid, records jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare account uuid:=auth.uid(); r record; saved public.als_student_activity; result jsonb:='{}'::jsonb; state text;
begin
    if account is null or account is distinct from expected_owner then
        raise exception 'Account changed' using errcode='42501';
    end if;
    if jsonb_typeof(records) is distinct from 'array' then raise exception 'Invalid batch'; end if;
    if jsonb_array_length(records) not between 1 and 40 then raise exception 'Invalid size'; end if;
    for r in select * from jsonb_to_recordset(records) as x(record_id uuid,recorded_at timestamptz,
            revised_at timestamptz,category text,title text,details jsonb,removed boolean,signature text,prior_signature text)
            order by record_id
    loop
        if r.signature is null or r.signature!~'^[0-9a-f]{64}$' or result?r.record_id::text then raise exception 'Invalid row'; end if;
        insert into public.als_student_activity(owner_id,record_id,recorded_at,revised_at,category,title,details,removed,writer_signature)
        values(account,r.record_id,r.recorded_at,r.revised_at,r.category,r.title,r.details,r.removed,r.signature)
        on conflict(owner_id,record_id) do nothing;
        if found then state:='stored';
        else
            select * into strict saved from public.als_student_activity
                where owner_id=account and record_id=r.record_id for update;
            if saved.revised_at<r.revised_at or
                (saved.revised_at=r.revised_at and saved.writer_signature is not null and saved.writer_signature=r.prior_signature)
            then
                update public.als_student_activity set recorded_at=r.recorded_at,revised_at=r.revised_at,
                    category=r.category,title=r.title,details=r.details,removed=r.removed,writer_signature=r.signature
                    where owner_id=account and record_id=r.record_id;
                state:='stored';
            elsif (saved.recorded_at,saved.category,saved.title,saved.details,saved.removed)
                  is not distinct from (r.recorded_at,r.category,r.title,r.details,r.removed) then
                state:='same';
            elsif saved.revised_at>r.revised_at then state:='newer';
            else state:='conflict';
            end if;
        end if;
        result:=result||jsonb_build_object(r.record_id::text,state);
    end loop;
    return result;
end $$;
revoke all on function public.als_sync_student_activity_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.als_sync_student_activity_v2(uuid,jsonb) to authenticated;
