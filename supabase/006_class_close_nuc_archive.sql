-- FieldReady class closure, NUC archive queue, and Enterprise-only deletion.
-- Closed classes are immutable/read-only. Closing atomically captures the CSV
-- payload in PostgreSQL; the NUC archive worker persists it to YYYY-MM folders.

alter table public.fr_events
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.fr_profiles(user_id) on delete restrict;

create table if not exists public.fr_event_archives (
  event_id uuid primary key references public.fr_events(id) on delete restrict,
  closed_at timestamptz not null,
  closed_by uuid not null references public.fr_profiles(user_id) on delete restrict,
  archive_month text not null check (archive_month ~ '^[0-9]{4}-[0-9]{2}$'),
  file_name text not null check (file_name ~ '^[A-Za-z0-9_.-]+[.]csv$'),
  csv_text text not null,
  persisted_at timestamptz,
  persisted_path text,
  persisted_sha256 text,
  created_at timestamptz not null default now()
);

create index if not exists fr_event_archives_pending_idx
  on public.fr_event_archives(persisted_at)
  where persisted_at is null;

alter table public.fr_event_archives enable row level security;

revoke all on public.fr_event_archives from anon, authenticated;
grant select on public.fr_event_archives to authenticated;

drop policy if exists fr_event_archives_read on public.fr_event_archives;
create policy fr_event_archives_read
on public.fr_event_archives
for select
to authenticated
using (
  public.fr_is_active()
  and public.fr_can_access_event(event_id)
);

create or replace function public.fr_can_access_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.fr_events e
    where e.id=p_event
      and e.deleted_at is null
      and (
        public.fr_can_manage_event_scope(
          e.majcom,
          e.home_installation_id,
          e.created_by
        )
        or exists(
          select 1
          from public.fr_profiles p
          join public.fr_event_evaluators x
            on x.user_id=p.user_id
           and x.event_id=e.id
          where p.user_id=auth.uid()
            and p.active=true
            and p.role='evaluator'
        )
      )
  );
$$;

create or replace function public.fr_can_write_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.fr_events e
    where e.id=p_event
      and e.closed_at is null
      and e.deleted_at is null
      and public.fr_can_access_event(e.id)
  );
$$;

create or replace function public.fr_guard_event_state()
returns trigger
language plpgsql
as $$
declare
  transition text := current_setting('fieldready.event_state_transition', true);
begin
  if tg_op='INSERT' then
    if new.closed_at is not null or new.closed_by is not null or new.deleted_at is not null then
      raise exception 'FieldReady event state may only be changed through controlled class actions.';
    end if;
    return new;
  end if;

  if (
    new.closed_at is distinct from old.closed_at
    or new.closed_by is distinct from old.closed_by
  ) and coalesce(transition,'') <> 'close' then
    raise exception 'Use the controlled Close Class action.';
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and coalesce(transition,'') <> 'delete' then
    raise exception 'Use the Enterprise Delete Class action.';
  end if;

  if old.closed_at is not null
     and coalesce(transition,'') <> 'delete'
     and (
       new.event_date is distinct from old.event_date
       or new.timepoint is distinct from old.timepoint
       or new.study_arm is distinct from old.study_arm
       or new.majcom is distinct from old.majcom
       or new.home_installation_id is distinct from old.home_installation_id
       or new.skill_id is distinct from old.skill_id
       or new.payload is distinct from old.payload
       or new.created_by is distinct from old.created_by
     ) then
    raise exception 'Closed FieldReady classes are read-only.';
  end if;

  return new;
end;
$$;

drop trigger if exists fr_events_guard_state on public.fr_events;
create trigger fr_events_guard_state
before insert or update on public.fr_events
for each row
execute function public.fr_guard_event_state();

drop policy if exists fr_events_read on public.fr_events;
create policy fr_events_read
on public.fr_events
for select
to authenticated
using (
  public.fr_is_active()
  and deleted_at is null
  and public.fr_can_access_event(id)
);

drop policy if exists fr_events_update on public.fr_events;
create policy fr_events_update
on public.fr_events
for update
to authenticated
using (
  public.fr_is_active()
  and closed_at is null
  and deleted_at is null
  and public.fr_can_manage_event_scope(majcom,home_installation_id,created_by)
)
with check (
  public.fr_is_active()
  and public.fr_can_manage_event_scope(majcom,home_installation_id,created_by)
);

drop policy if exists fr_participants_insert on public.fr_participants;
create policy fr_participants_insert
on public.fr_participants
for insert
to authenticated
with check (
  public.fr_is_active()
  and public.fr_can_write_event(event_id)
  and created_by=auth.uid()
);

drop policy if exists fr_participants_update on public.fr_participants;
create policy fr_participants_update
on public.fr_participants
for update
to authenticated
using (
  public.fr_is_active()
  and public.fr_can_write_event(event_id)
)
with check (
  public.fr_is_active()
  and public.fr_can_write_event(event_id)
);

drop policy if exists fr_evaluations_insert on public.fr_evaluations;
create policy fr_evaluations_insert
on public.fr_evaluations
for insert
to authenticated
with check (
  public.fr_is_active()
  and public.fr_can_write_event(event_id)
  and created_by=auth.uid()
);

drop policy if exists fr_evaluations_update on public.fr_evaluations;
create policy fr_evaluations_update
on public.fr_evaluations
for update
to authenticated
using (
  public.fr_is_active()
  and public.fr_can_write_event(event_id)
)
with check (
  public.fr_is_active()
  and public.fr_can_write_event(event_id)
);

drop policy if exists fr_voids_insert on public.fr_voids;
create policy fr_voids_insert
on public.fr_voids
for insert
to authenticated
with check (
  public.fr_is_active()
  and public.fr_can_write_event(event_id)
  and created_by=auth.uid()
);

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
      and (
        not exists(
          select 1
          from public.fr_evaluations v
          where v.participant_id=p.id
            and v.event_id=ev.id
            and v.finalized_at is not null
            and not exists(
              select 1
              from public.fr_voids z
              where z.id=v.id
            )
        )
        or exists(
          select 1
          from public.fr_evaluations v
          where v.participant_id=p.id
            and v.event_id=ev.id
            and v.finalized_at is null
            and not exists(
              select 1
              from public.fr_voids z
              where z.id=v.id
            )
        )
      )
  ) then
    raise exception 'Every participant must have a finalized, non-voided evaluation before the class can be closed.';
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

  archive_month := to_char(closed_ts at time zone 'UTC','YYYY-MM');

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

create or replace function public.fr_delete_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ev public.fr_events%rowtype;
  deleted_ts timestamptz := clock_timestamp();
begin
  if not exists(
    select 1
    from public.fr_profiles p
    where p.user_id=auth.uid()
      and p.active=true
      and p.role='enterprise'
  ) then
    raise exception 'Enterprise access is required to delete a class.';
  end if;

  select * into ev
  from public.fr_events
  where id=p_event_id
  for update;

  if not found then
    raise exception 'FieldReady class not found.';
  end if;

  if ev.deleted_at is not null then
    return jsonb_build_object('event_id',ev.id,'deleted_at',ev.deleted_at,'already_deleted',true);
  end if;

  if ev.closed_at is null
     and exists(select 1 from public.fr_participants p where p.event_id=ev.id) then
    raise exception 'Classes containing participant data must be closed and archived before deletion.';
  end if;

  if ev.closed_at is not null
     and not exists(select 1 from public.fr_event_archives a where a.event_id=ev.id) then
    raise exception 'Closed class archive record is missing; deletion blocked.';
  end if;

  perform set_config('fieldready.event_state_transition','delete',true);

  update public.fr_events
  set deleted_at=deleted_ts
  where id=ev.id;

  return jsonb_build_object(
    'event_id',ev.id,
    'deleted_at',deleted_ts,
    'already_deleted',false
  );
end;
$$;

revoke all on function public.fr_delete_event(uuid) from public;
grant execute on function public.fr_delete_event(uuid) to authenticated;
