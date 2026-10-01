-- FieldReady cumulative hierarchical delegation and evaluator assignment controls.
-- Enterprise -> all capabilities.
-- MAJCOM Manager -> all Program Manager capabilities within MAJCOM + appoint Program Managers.
-- Program Manager -> installation management + appoint evaluators + assign appointed evaluators to classes.
-- Evaluator -> assigned classes only.

alter table public.fr_memberships
  add column if not exists parent_scope_value text;

create table if not exists public.fr_manager_evaluators (
  manager_id uuid not null references public.fr_profiles(user_id) on delete cascade,
  evaluator_id uuid not null references public.fr_profiles(user_id) on delete cascade,
  appointed_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key(manager_id,evaluator_id),
  check (manager_id <> evaluator_id)
);

alter table public.fr_manager_evaluators enable row level security;

drop policy if exists fr_manager_evaluators_read on public.fr_manager_evaluators;
create policy fr_manager_evaluators_read
on public.fr_manager_evaluators
for select
to authenticated
using (
  manager_id=auth.uid()
  or evaluator_id=auth.uid()
  or public.fr_is_enterprise()
);

grant select on public.fr_manager_evaluators to authenticated;
revoke insert,update,delete on public.fr_manager_evaluators from anon,authenticated;

create or replace function public.fr_manager_team()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_role text;
  v_scope_type text;
  v_scope_value text;
  v_evaluators jsonb := '[]'::jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_program_managers jsonb := '[]'::jsonb;
begin
  select p.role into v_role
  from public.fr_profiles p
  where p.user_id=auth.uid()
    and p.active=true;

  if v_role is null or v_role not in ('program_manager','majcom_manager','enterprise') then
    raise exception 'Manager access required.';
  end if;

  select m.scope_type,m.scope_value
    into v_scope_type,v_scope_value
  from public.fr_memberships m
  where m.user_id=auth.uid()
  order by m.created_at
  limit 1;

  if v_role='program_manager' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'active',p.active,
      'role',p.role,
      'appointed_by_manager',true
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_evaluators
    from public.fr_manager_evaluators a
    join public.fr_profiles p on p.user_id=a.evaluator_id
    where a.manager_id=auth.uid()
      and p.active=true
      and p.role='evaluator';

    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'active',p.active,
      'role',p.role
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_candidates
    from public.fr_profiles p
    where p.active=true
      and p.role='evaluator'
      and p.user_id<>auth.uid();

  elsif v_role='majcom_manager' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'active',p.active,
      'role',p.role,
      'installation_id',m.scope_value,
      'majcom',m.parent_scope_value
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_program_managers
    from public.fr_profiles p
    join public.fr_memberships m on m.user_id=p.user_id
    where p.active=true
      and p.role='program_manager'
      and m.scope_type='installation'
      and m.parent_scope_value=v_scope_value;

    select coalesce(jsonb_agg(distinct jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'active',p.active,
      'role',p.role
    )),'[]'::jsonb)
    into v_evaluators
    from public.fr_profiles p
    where p.active=true
      and p.role='evaluator'
      and (
        exists(
          select 1
          from public.fr_manager_evaluators a
          where a.manager_id=auth.uid()
            and a.evaluator_id=p.user_id
        )
        or exists(
          select 1
          from public.fr_manager_evaluators a
          join public.fr_memberships pm
            on pm.user_id=a.manager_id
           and pm.scope_type='installation'
          join public.fr_profiles pp
            on pp.user_id=a.manager_id
           and pp.active=true
           and pp.role='program_manager'
          where a.evaluator_id=p.user_id
            and pm.parent_scope_value=v_scope_value
        )
      );

    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'active',p.active,
      'role',p.role
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_candidates
    from public.fr_profiles p
    where p.active=true
      and p.role in ('evaluator','program_manager')
      and p.user_id<>auth.uid();

  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'active',p.active,
      'role',p.role
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_evaluators
    from public.fr_profiles p
    where p.active=true
      and p.role='evaluator';

    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'active',p.active,
      'role',p.role
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_candidates
    from public.fr_profiles p
    where p.active=true
      and p.role in ('evaluator','program_manager','majcom_manager')
      and p.user_id<>auth.uid();

    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'active',p.active,
      'role',p.role,
      'installation_id',m.scope_value,
      'majcom',m.parent_scope_value
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_program_managers
    from public.fr_profiles p
    left join public.fr_memberships m
      on m.user_id=p.user_id
     and m.scope_type='installation'
    where p.active=true
      and p.role='program_manager';
  end if;

  return jsonb_build_object(
    'role',v_role,
    'scope_type',v_scope_type,
    'scope_value',v_scope_value,
    'evaluators',v_evaluators,
    'candidates',v_candidates,
    'program_managers',v_program_managers
  );
end;
$$;

create or replace function public.fr_appoint_evaluator(
  p_evaluator_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
begin
  select p.role into v_role
  from public.fr_profiles p
  where p.user_id=auth.uid()
    and p.active=true;

  if v_role not in ('program_manager','majcom_manager','enterprise') then
    raise exception 'Manager access required.';
  end if;

  if not exists(
    select 1 from public.fr_profiles p
    where p.user_id=p_evaluator_id
      and p.active=true
      and p.role='evaluator'
  ) then
    raise exception 'Active evaluator account not found.';
  end if;

  insert into public.fr_manager_evaluators(manager_id,evaluator_id,appointed_by)
  values(auth.uid(),p_evaluator_id,auth.uid())
  on conflict (manager_id,evaluator_id) do nothing;

  insert into public.fr_audit_log(action,table_name,record_id,new_row)
  values(
    'APPOINT_EVALUATOR',
    'fr_manager_evaluators',
    p_evaluator_id,
    jsonb_build_object('manager_id',auth.uid(),'evaluator_id',p_evaluator_id,'manager_role',v_role)
  );
end;
$$;

create or replace function public.fr_remove_appointed_evaluator(
  p_evaluator_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_scope_type text;
  v_scope_value text;
begin
  select p.role into v_role
  from public.fr_profiles p
  where p.user_id=auth.uid()
    and p.active=true;

  if v_role not in ('program_manager','majcom_manager','enterprise') then
    raise exception 'Manager access required.';
  end if;

  select m.scope_type,m.scope_value
    into v_scope_type,v_scope_value
  from public.fr_memberships m
  where m.user_id=auth.uid()
  order by m.created_at
  limit 1;

  delete from public.fr_manager_evaluators
  where manager_id=auth.uid()
    and evaluator_id=p_evaluator_id;

  -- Remove class assignments only from classes inside the caller's managed scope.
  if v_role='program_manager' then
    delete from public.fr_event_evaluators x
    using public.fr_events e
    where x.event_id=e.id
      and x.user_id=p_evaluator_id
      and e.home_installation_id=v_scope_value;
  elsif v_role='majcom_manager' then
    delete from public.fr_event_evaluators x
    using public.fr_events e
    where x.event_id=e.id
      and x.user_id=p_evaluator_id
      and e.majcom=v_scope_value;
  elsif v_role='enterprise' then
    delete from public.fr_event_evaluators
    where user_id=p_evaluator_id;
  end if;

  insert into public.fr_audit_log(action,table_name,record_id,old_row)
  values(
    'REMOVE_APPOINTED_EVALUATOR',
    'fr_manager_evaluators',
    p_evaluator_id,
    jsonb_build_object('manager_id',auth.uid(),'evaluator_id',p_evaluator_id,'manager_role',v_role)
  );
end;
$$;

create or replace function public.fr_assign_program_manager(
  p_user_id uuid,
  p_installation text,
  p_majcom text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_scope text;
  v_target_role text;
begin
  select p.role into v_role
  from public.fr_profiles p
  where p.user_id=auth.uid()
    and p.active=true;

  if v_role not in ('majcom_manager','enterprise') then
    raise exception 'MAJCOM Manager or Enterprise access required.';
  end if;

  if p_user_id=auth.uid() then
    raise exception 'You cannot appoint yourself as a Program Manager.';
  end if;

  if nullif(trim(coalesce(p_installation,'')),'') is null
     or nullif(trim(coalesce(p_majcom,'')),'') is null then
    raise exception 'MAJCOM and installation are required.';
  end if;

  if v_role='majcom_manager' then
    select m.scope_value into v_scope
    from public.fr_memberships m
    where m.user_id=auth.uid()
      and m.scope_type='majcom'
    order by m.created_at
    limit 1;

    if v_scope is distinct from trim(p_majcom) then
      raise exception 'Program Manager must remain within your MAJCOM scope.';
    end if;
  end if;

  select p.role into v_target_role
  from public.fr_profiles p
  where p.user_id=p_user_id
    and p.active=true;

  if v_target_role is null then
    raise exception 'Active FieldReady user not found.';
  end if;

  if v_target_role in ('enterprise','majcom_manager') then
    raise exception 'Enterprise and MAJCOM Manager accounts cannot be reassigned as Program Managers.';
  end if;

  update public.fr_profiles
  set role='program_manager',
      active=true,
      updated_at=now()
  where user_id=p_user_id;

  delete from public.fr_memberships
  where user_id=p_user_id;

  insert into public.fr_memberships(user_id,scope_type,scope_value,parent_scope_value)
  values(p_user_id,'installation',trim(p_installation),trim(p_majcom));

  delete from public.fr_manager_evaluators
  where evaluator_id=p_user_id;

  delete from public.fr_event_evaluators
  where user_id=p_user_id;

  insert into public.fr_audit_log(action,table_name,record_id,new_row)
  values(
    'ASSIGN_PROGRAM_MANAGER',
    'fr_profiles',
    p_user_id,
    jsonb_build_object(
      'role','program_manager',
      'installation',trim(p_installation),
      'majcom',trim(p_majcom),
      'assigned_by',auth.uid()
    )
  );
end;
$$;

create or replace function public.fr_get_event_evaluators(
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.fr_can_access_event(p_event_id) then
    raise exception 'Event access required.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name
    ) order by coalesce(p.display_name,p.email,p.user_id::text))
    from public.fr_event_evaluators x
    join public.fr_profiles p on p.user_id=x.user_id
    where x.event_id=p_event_id
      and p.active=true
      and p.role='evaluator'
  ),'[]'::jsonb);
end;
$$;

create or replace function public.fr_set_event_evaluators(
  p_event_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_event public.fr_events%rowtype;
  v_role text;
  v_scope_value text;
  v_ids uuid[] := coalesce(p_user_ids,'{}'::uuid[]);
  v_old jsonb;
  v_new jsonb;
begin
  select * into v_event
  from public.fr_events
  where id=p_event_id
  for update;

  if not found then
    raise exception 'FieldReady class not found.';
  end if;

  if v_event.closed_at is not null or v_event.deleted_at is not null then
    raise exception 'Closed or deleted classes cannot change evaluator assignments.';
  end if;

  select p.role into v_role
  from public.fr_profiles p
  where p.user_id=auth.uid()
    and p.active=true;

  if v_role not in ('program_manager','majcom_manager','enterprise') then
    raise exception 'Manager access required.';
  end if;

  if not public.fr_can_manage_event_scope(
    v_event.majcom,
    v_event.home_installation_id,
    v_event.created_by
  ) then
    raise exception 'You do not manage this class.';
  end if;

  if exists(
    select 1
    from unnest(v_ids) u(user_id)
    left join public.fr_profiles p on p.user_id=u.user_id
    where p.user_id is null
       or p.active is not true
       or p.role<>'evaluator'
  ) then
    raise exception 'All assigned users must be active evaluators.';
  end if;

  if v_role='program_manager' and exists(
    select 1
    from unnest(v_ids) u(user_id)
    where not exists(
      select 1
      from public.fr_manager_evaluators a
      where a.manager_id=auth.uid()
        and a.evaluator_id=u.user_id
    )
  ) then
    raise exception 'Program Managers may assign only their appointed evaluators.';
  end if;

  if v_role='majcom_manager' then
    select m.scope_value into v_scope_value
    from public.fr_memberships m
    where m.user_id=auth.uid()
      and m.scope_type='majcom'
    order by m.created_at
    limit 1;

    if exists(
      select 1
      from unnest(v_ids) u(user_id)
      where not (
        exists(
          select 1
          from public.fr_manager_evaluators a
          where a.manager_id=auth.uid()
            and a.evaluator_id=u.user_id
        )
        or exists(
          select 1
          from public.fr_manager_evaluators a
          join public.fr_memberships pm
            on pm.user_id=a.manager_id
           and pm.scope_type='installation'
          join public.fr_profiles pp
            on pp.user_id=a.manager_id
           and pp.active=true
           and pp.role='program_manager'
          where a.evaluator_id=u.user_id
            and pm.parent_scope_value=v_scope_value
        )
      )
    ) then
      raise exception 'MAJCOM Managers may assign only evaluators appointed within their MAJCOM.';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into v_old
  from public.fr_event_evaluators x
  where x.event_id=p_event_id;

  delete from public.fr_event_evaluators
  where event_id=p_event_id;

  insert into public.fr_event_evaluators(event_id,user_id)
  select p_event_id,user_id
  from (
    select distinct unnest(v_ids) as user_id
  ) q
  on conflict (event_id,user_id) do nothing;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into v_new
  from public.fr_event_evaluators x
  where x.event_id=p_event_id;

  insert into public.fr_audit_log(action,table_name,record_id,old_row,new_row)
  values(
    'SET_EVENT_EVALUATORS',
    'fr_event_evaluators',
    p_event_id,
    v_old,
    v_new
  );
end;
$$;

grant execute on function public.fr_manager_team() to authenticated;
grant execute on function public.fr_appoint_evaluator(uuid) to authenticated;
grant execute on function public.fr_remove_appointed_evaluator(uuid) to authenticated;
grant execute on function public.fr_assign_program_manager(uuid,text,text) to authenticated;
grant execute on function public.fr_get_event_evaluators(uuid) to authenticated;
grant execute on function public.fr_set_event_evaluators(uuid,uuid[]) to authenticated;
