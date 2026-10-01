-- FieldReady closed-class sync and Hawaii archive-month correction.
-- Future archive folders use Pacific/Honolulu local close month.
-- Corrects the preserved FIELDREADY-LOCAL-TEST archive row created during validation.

create or replace function public.fr_close_event(
  p_event_id uuid,
  p_csv text,
  p_file_name text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ev public.fr_events%rowtype;
  closed_ts timestamptz := clock_timestamp();
  participant_count integer;
  archive_month text;
begin
  select * into ev
  from public.fr_events
  where id=p_event_id
  for update;

  if not found then
    raise exception 'FieldReady class not found.';
  end if;

  if ev.deleted_at is not null then
    raise exception 'Deleted FieldReady classes cannot be closed.';
  end if;

  if not public.fr_can_manage_event_scope(ev.majcom,ev.home_installation_id,ev.created_by) then
    raise exception 'You do not have permission to close this class.';
  end if;

  if ev.closed_at is not null then
    return jsonb_build_object(
      'event_id',ev.id,
      'closed_at',ev.closed_at,
      'archive_month',(select a.archive_month from public.fr_event_archives a where a.event_id=ev.id),
      'file_name',(select a.file_name from public.fr_event_archives a where a.event_id=ev.id),
      'already_closed',true
    );
  end if;

  select count(*) into participant_count
  from public.fr_participants p
  where p.event_id=ev.id;

  if participant_count=0 then
    raise exception 'A class must contain at least one participant before it can be closed.';
  end if;

  if exists(
    select 1
    from public.fr_participants p
    where p.event_id=ev.id
      and not exists(
        select 1
        from public.fr_evaluations v
        where v.participant_id=p.id
          and v.event_id=ev.id
          and v.finalized_at is not null
      )
  ) then
    raise exception 'Every participant must have a finalized evaluation before the class can be closed.';
  end if;

  if exists(
    select 1
    from public.fr_evaluations v
    where v.event_id=ev.id
      and v.finalized_at is null
  ) then
    raise exception 'The class contains an unfinished evaluation.';
  end if;

  if p_csv is null or length(p_csv)<20 then
    raise exception 'Class archive CSV is missing.';
  end if;

  if octet_length(p_csv)>52428800 then
    raise exception 'Class archive CSV exceeds the 50 MB safety limit.';
  end if;

  if p_file_name is null or p_file_name !~ '^[A-Za-z0-9_.-]+[.]csv$' then
    raise exception 'Invalid class archive filename.';
  end if;

  archive_month := to_char(closed_ts at time zone 'Pacific/Honolulu','YYYY-MM');

  perform set_config('fieldready.event_state_transition','close',true);

  update public.fr_events
  set closed_at=closed_ts,
      closed_by=auth.uid()
  where id=ev.id;

  insert into public.fr_event_archives(
    event_id,closed_at,closed_by,archive_month,file_name,csv_text
  )
  values(
    ev.id,closed_ts,auth.uid(),archive_month,p_file_name,p_csv
  );

  return jsonb_build_object(
    'event_id',ev.id,
    'closed_at',closed_ts,
    'archive_month',archive_month,
    'file_name',p_file_name,
    'already_closed',false
  );
end;
$$;

revoke all on function public.fr_close_event(uuid,text,text) from public;
grant execute on function public.fr_close_event(uuid,text,text) to authenticated;

update public.fr_event_archives
set archive_month=to_char(closed_at at time zone 'Pacific/Honolulu','YYYY-MM'),
    persisted_at=null,
    persisted_path=null,
    persisted_sha256=null
where archive_month is distinct from to_char(closed_at at time zone 'Pacific/Honolulu','YYYY-MM');
