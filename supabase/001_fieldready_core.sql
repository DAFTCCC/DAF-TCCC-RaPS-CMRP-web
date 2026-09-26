-- FieldReady Longitudinal Competency Study backend foundation v4.2.0
-- Dedicated FieldReady namespace. Do not apply to RaPS production without explicit separation/approval.
create extension if not exists pgcrypto;

create table if not exists public.fr_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  active boolean not null default true,
  role text not null default 'evaluator' check (role in ('evaluator','program_manager','majcom_manager','enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fr_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fr_profiles(user_id) on delete cascade,
  scope_type text not null check (scope_type in ('installation','majcom')),
  scope_value text not null,
  created_at timestamptz not null default now(),
  unique(user_id,scope_type,scope_value)
);

create table if not exists public.fr_events (
  id uuid primary key,
  event_date date,
  timepoint text check (timepoint in ('baseline','3-month','6-month')),
  study_arm text check (study_arm in ('Control','Frequency-Based','Deliberate Practice')),
  majcom text,
  home_installation_id text,
  skill_id text not null check (skill_id in ('TQ','NPA','NDC','BLOOD','CMC')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_revision bigint not null default 1,
  deleted_at timestamptz
);

create table if not exists public.fr_event_evaluators (
  event_id uuid not null references public.fr_events(id) on delete cascade,
  user_id uuid not null references public.fr_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table if not exists public.fr_participants (
  id uuid primary key,
  event_id uuid not null references public.fr_events(id) on delete restrict,
  participant_code text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_revision bigint not null default 1,
  unique(event_id,participant_code)
);

create table if not exists public.fr_evaluations (
  id uuid primary key,
  participant_id uuid not null references public.fr_participants(id) on delete restrict,
  event_id uuid not null references public.fr_events(id) on delete restrict,
  finalized_at timestamptz,
  final_result text check (final_result in ('PASS','FAIL') or final_result is null),
  app_version text,
  evaluator_id text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_revision bigint not null default 1
);

create table if not exists public.fr_voids (
  id uuid primary key,
  participant_id uuid not null references public.fr_participants(id) on delete restrict,
  event_id uuid not null references public.fr_events(id) on delete restrict,
  voided_at timestamptz not null default now(),
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.fr_audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor uuid default auth.uid(),
  action text not null,
  table_name text not null,
  record_id uuid,
  old_row jsonb,
  new_row jsonb
);

create index if not exists fr_events_scope_idx on public.fr_events(majcom,home_installation_id);
create index if not exists fr_events_study_idx on public.fr_events(skill_id,timepoint,study_arm);
create index if not exists fr_participants_code_idx on public.fr_participants(participant_code);
create index if not exists fr_evaluations_event_idx on public.fr_evaluations(event_id);

create or replace function public.fr_touch_revision() returns trigger language plpgsql as $$
begin new.updated_at=now(); new.server_revision=coalesce(old.server_revision,0)+1; return new; end; $$;

drop trigger if exists fr_events_touch_revision on public.fr_events;
create trigger fr_events_touch_revision before update on public.fr_events for each row execute function public.fr_touch_revision();
drop trigger if exists fr_participants_touch_revision on public.fr_participants;
create trigger fr_participants_touch_revision before update on public.fr_participants for each row execute function public.fr_touch_revision();
drop trigger if exists fr_evaluations_touch_revision on public.fr_evaluations;
create trigger fr_evaluations_touch_revision before update on public.fr_evaluations for each row execute function public.fr_touch_revision();

create or replace function public.fr_block_finalized_evaluation_mutation() returns trigger language plpgsql as $
begin
  if old.finalized_at is not null then
    raise exception 'Finalized FieldReady evaluations are immutable. Use controlled correction/retest.';
  end if;
  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$;
drop trigger if exists fr_evaluations_lock_finalized on public.fr_evaluations;
create trigger fr_evaluations_lock_finalized before update or delete on public.fr_evaluations for each row execute function public.fr_block_finalized_evaluation_mutation();

create or replace function public.fr_audit_row() returns trigger language plpgsql security definer set search_path=public as $$
declare rid uuid; begin rid=case when tg_op='DELETE' then old.id else new.id end;
insert into public.fr_audit_log(action,table_name,record_id,old_row,new_row)
values(tg_op,tg_table_name,rid,case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
return case when tg_op='DELETE' then old else new end; end; $$;

do $$ declare t text; begin
  foreach t in array array['fr_events','fr_participants','fr_evaluations','fr_voids'] loop
    execute format('drop trigger if exists %I_audit on public.%I',t,t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.fr_audit_row()',t,t);
  end loop;
end $$;

create or replace function public.fr_is_active() returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.fr_profiles p where p.user_id=auth.uid() and p.active=true); $$;

create or replace function public.fr_can_access_scope(p_majcom text,p_installation text) returns boolean language sql stable security definer set search_path=public as $$
select exists(
 select 1 from public.fr_profiles p
 where p.user_id=auth.uid() and p.active=true and (
   p.role='enterprise'
   or (p.role='majcom_manager' and exists(select 1 from public.fr_memberships m where m.user_id=p.user_id and m.scope_type='majcom' and m.scope_value=p_majcom))
   or (p.role='program_manager' and exists(select 1 from public.fr_memberships m where m.user_id=p.user_id and m.scope_type='installation' and m.scope_value=p_installation))
 )
); $$;

create or replace function public.fr_can_access_event(p_event uuid) returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.fr_events e where e.id=p_event and (
 e.created_by=auth.uid() or public.fr_can_access_scope(e.majcom,e.home_installation_id)
 or exists(select 1 from public.fr_event_evaluators x where x.event_id=e.id and x.user_id=auth.uid())
)); $$;

alter table public.fr_profiles enable row level security;
alter table public.fr_memberships enable row level security;
alter table public.fr_events enable row level security;
alter table public.fr_event_evaluators enable row level security;
alter table public.fr_participants enable row level security;
alter table public.fr_evaluations enable row level security;
alter table public.fr_voids enable row level security;
alter table public.fr_audit_log enable row level security;

drop policy if exists fr_profiles_self_read on public.fr_profiles;
create policy fr_profiles_self_read on public.fr_profiles for select to authenticated using (user_id=auth.uid() or public.fr_can_access_scope(null,null));

drop policy if exists fr_events_read on public.fr_events;
create policy fr_events_read on public.fr_events for select to authenticated using (public.fr_is_active() and (created_by=auth.uid() or public.fr_can_access_scope(majcom,home_installation_id) or exists(select 1 from public.fr_event_evaluators x where x.event_id=id and x.user_id=auth.uid())));
drop policy if exists fr_events_insert on public.fr_events;
create policy fr_events_insert on public.fr_events for insert to authenticated with check (public.fr_is_active() and created_by=auth.uid());
drop policy if exists fr_events_update on public.fr_events;
create policy fr_events_update on public.fr_events for update to authenticated using (public.fr_is_active() and (created_by=auth.uid() or public.fr_can_access_scope(majcom,home_installation_id))) with check (public.fr_is_active());

drop policy if exists fr_event_evaluators_read on public.fr_event_evaluators;
create policy fr_event_evaluators_read on public.fr_event_evaluators for select to authenticated using (public.fr_is_active() and (user_id=auth.uid() or public.fr_can_access_event(event_id)));

drop policy if exists fr_participants_read on public.fr_participants;
create policy fr_participants_read on public.fr_participants for select to authenticated using (public.fr_is_active() and public.fr_can_access_event(event_id));
drop policy if exists fr_participants_insert on public.fr_participants;
create policy fr_participants_insert on public.fr_participants for insert to authenticated with check (public.fr_is_active() and public.fr_can_access_event(event_id) and created_by=auth.uid());
drop policy if exists fr_participants_update on public.fr_participants;
create policy fr_participants_update on public.fr_participants for update to authenticated using (public.fr_is_active() and public.fr_can_access_event(event_id)) with check (public.fr_is_active() and public.fr_can_access_event(event_id));

drop policy if exists fr_evaluations_read on public.fr_evaluations;
create policy fr_evaluations_read on public.fr_evaluations for select to authenticated using (public.fr_is_active() and public.fr_can_access_event(event_id));
drop policy if exists fr_evaluations_insert on public.fr_evaluations;
create policy fr_evaluations_insert on public.fr_evaluations for insert to authenticated with check (public.fr_is_active() and public.fr_can_access_event(event_id) and created_by=auth.uid());
drop policy if exists fr_evaluations_update on public.fr_evaluations;
create policy fr_evaluations_update on public.fr_evaluations for update to authenticated using (public.fr_is_active() and public.fr_can_access_event(event_id)) with check (public.fr_is_active() and public.fr_can_access_event(event_id));

drop policy if exists fr_voids_read on public.fr_voids;
create policy fr_voids_read on public.fr_voids for select to authenticated using (public.fr_is_active() and public.fr_can_access_event(event_id));
drop policy if exists fr_voids_insert on public.fr_voids;
create policy fr_voids_insert on public.fr_voids for insert to authenticated with check (public.fr_is_active() and public.fr_can_access_event(event_id) and created_by=auth.uid());

revoke all on public.fr_audit_log from anon, authenticated;
grant select on public.fr_audit_log to authenticated;
drop policy if exists fr_audit_read on public.fr_audit_log;
create policy fr_audit_read on public.fr_audit_log for select to authenticated using (exists(select 1 from public.fr_profiles p where p.user_id=auth.uid() and p.active=true and p.role='enterprise'));

grant select,insert,update on public.fr_events to authenticated;
grant select,insert,update on public.fr_participants to authenticated;
grant select,insert,update on public.fr_evaluations to authenticated;
grant select,insert on public.fr_voids to authenticated;
grant select on public.fr_profiles,public.fr_memberships,public.fr_event_evaluators to authenticated;
-- No client DELETE grants/policies for authoritative study records.