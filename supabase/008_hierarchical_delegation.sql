-- FieldReady cumulative hierarchy + MAJCOM-scoped evaluator authorization.
-- Enterprise -> all capabilities.
-- MAJCOM Manager -> all Program Manager capabilities within MAJCOM + appoint Program Managers.
-- Program Manager -> installation management + appoint evaluators + assign appointed evaluators to classes.
-- Evaluator -> assigned classes only, and only inside authorized MAJCOM(s).

alter table public.fr_memberships
  add column if not exists parent_scope_value text;

create table if not exists public.fr_evaluator_scopes (
  evaluator_id uuid not null references public.fr_profiles(user_id) on delete cascade,
  majcom text not null,
  appointed_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key(evaluator_id,majcom)
);

create table if not exists public.fr_manager_evaluators (
  manager_id uuid not null references public.fr_profiles(user_id) on delete cascade,
  evaluator_id uuid not null references public.fr_profiles(user_id) on delete cascade,
  majcom text not null,
  appointed_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key(manager_id,evaluator_id,majcom),
  check (manager_id <> evaluator_id)
);

alter table public.fr_evaluator_scopes enable row level security;
alter table public.fr_manager_evaluators enable row level security;

drop policy if exists fr_evaluator_scopes_read on public.fr_evaluator_scopes;
create policy fr_evaluator_scopes_read
on public.fr_evaluator_scopes
for select
to authenticated
using (
  evaluator_id=auth.uid()
  or public.fr_is_enterprise()
  or exists(
    select 1
    from public.fr_profiles p
    left join public.fr_memberships m on m.user_id=p.user_id
    where p.user_id=auth.uid()
      and p.active=true
      and (
        (p.role='majcom_manager' and m.scope_type='majcom' and m.scope_value=fr_evaluator_scopes.majcom)
        or
        (p.role='program_manager' and m.scope_type='installation' and m.parent_scope_value=fr_evaluator_scopes.majcom)
      )
  )
);

drop policy if exists fr_manager_evaluators_read on public.fr_manager_evaluators;
create policy fr_manager_evaluators_read
on public.fr_manager_evaluators
for select
to authenticated
using (
  manager_id=auth.uid()
  or evaluator_id=auth.uid()
  or public.fr_is_enterprise()
  or exists(
    select 1
    from public.fr_profiles p
    join public.fr_memberships m on m.user_id=p.user_id
    where p.user_id=auth.uid()
      and p.active=true
      and p.role='majcom_manager'
      and m.scope_type='majcom'
      and m.scope_value=fr_manager_evaluators.majcom
  )
);

grant select on public.fr_evaluator_scopes,public.fr_manager_evaluators to authenticated;
revoke insert,update,delete on public.fr_evaluator_scopes from anon,authenticated;
revoke insert,update,delete on public.fr_manager_evaluators from anon,authenticated;

-- Preserve any already-valid evaluator/event relationships by deriving a
-- MAJCOM authorization from the event itself.
insert into public.fr_evaluator_scopes(evaluator_id,majcom,appointed_by)
select distinct x.user_id,e.majcom,coalesce(e.created_by,x.user_id)
from public.fr_event_evaluators x
join public.fr_events e on e.id=x.event_id
join public.fr_profiles p on p.user_id=x.user_id
where p.active=true
  and p.role='evaluator'
  and nullif(trim(coalesce(e.majcom,'')),'') is not null
on conflict (evaluator_id,majcom) do nothing;

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
  v_parent_scope text;
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

  select m.scope_type,m.scope_value,m.parent_scope_value
    into v_scope_type,v_scope_value,v_parent_scope
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
      'majcom',a.majcom
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_evaluators
    from public.fr_manager_evaluators a
    join public.fr_profiles p on p.user_id=a.evaluator_id
    where a.manager_id=auth.uid()
      and a.majcom=v_parent_scope
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
      'majcom',s.majcom
    ) order by coalesce(p.display_name,p.email,p.user_id::text)),'[]'::jsonb)
    into v_evaluators
    from public.fr_evaluator_scopes s
    join public.fr_profiles p on p.user_id=s.evaluator_id
    where s.majcom=v_scope_value
      and p.active=true
      and p.role='evaluator';

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
      'role',p.role,
      'majcoms',coalesce((
        select jsonb_agg(s.majcom order by s.majcom)
        from public.fr_evaluator_scopes s
        where s.evaluator_id=p.user_id
      ),'[]'::jsonb)
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
    'parent_scope_value',v_parent_scope,
    'evaluators',v_evaluators,
    'candidates',v_candidates,
    'program_managers',v_program_managers
  );
end;
$$;

create or replace function public.fr_appoint_evaluator(
  p_evaluator_id uuid,
  p_majcom text default null
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
  v_parent_scope text;
  v_majcom text;
begin
  select p.role into v_role
  from public.fr_profiles p
  where p.user_id=auth.uid()
    and p.active=true;

  if v_role not in ('program_manager','majcom_manager','enterprise') then
    raise exception 'Manager access required.';
  end if;

  select m.scope_type,m.scope_value,m.parent_scope_value
    into v_scope_type,v_scope_value,v_parent_scope
  from public.fr_memberships m
  where m.user_id=auth.uid()
  order by m.created_at
  limit 1;

  if v_role='program_manager' then
    v_majcom:=nullif(trim(coalesce(v_parent_scope,'')),'');
    if v_majcom is null then
      raise exception 'Program Manager MAJCOM scope is not configured. Reappoint this Program Manager through MAJCOM or Enterprise management.';
    end if;
  elsif v_role='majcom_manager' then
    v_majcom:=nullif(trim(coalesce(v_scope_value,'')),'');
  else
    v_majcom:=nullif(trim(coalesce(p_majcom,'')),'');
    if v_majcom is null then
      raise exception 'Enterprise must select a MAJCOM for evaluator appointment.';
    end if;
  end if;

  if not exists(
    select 1 from public.fr_profiles p
    where p.user_id=p_evaluator_id
      and p.active=true
      and p.role='evaluator'
  ) then
    raise exception 'Active evaluator account not found.';
  end if;

  insert into public.fr_evaluator_scopes(evaluator_id,majcom,appointed_by)
  values(p_evaluator_id,v_majcom,auth.uid())
  on conflict (evaluator_id,majcom) do nothing;

  insert into public.fr_manager_evaluators(manager_id,evaluator_id,majcom,appointed_by)
  values(auth.uid(),p_evaluator_id,v_majcom,auth.uid())
  on conflict (manager_id,evaluator_id,majcom) do nothing;

  insert into public.fr_audit_log(action,table_name,record_id,new_row)
  values(
    'APPOINT_EVALUATOR',
    'fr_evaluator_scopes',
    p_evaluator_id,
    jsonb_build_object(
      'manager_id',auth.uid(),
      'evaluator_id',p_evaluator_id,
      'manager_role',v_role,
      'majcom',v_majcom
    )
  );
end;
$$;

create or replace function public.fr_remove_appointed_evaluator(
  p_evaluator_id uuid,
  p_majcom text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_scope_value text;
  v_parent_scope text;
  v_majcom text;
begin
  select p.role into v_role
  from public.fr_profiles p
  where p.user_id=auth.uid()
    and p.active=true;

  if v_role not in ('program_manager','majcom_manager','enterprise') then
    raise exception 'Manager access required.';
  end if;

  select m.scope_value,m.parent_scope_value
    into v_scope_value,v_parent_scope
  from public.fr_memberships m
  where m.user_id=auth.uid()
  order by m.created_at
  limit 1;

  if v_role='program_manager' then
    v_majcom:=nullif(trim(coalesce(v_parent_scope,'')),'');
  elsif v_role='majcom_manager' then
    v_majcom:=nullif(trim(coalesce(v_scope_value,'')),'');
  else
    v_majcom:=nullif(trim(coalesce(p_majcom,'')),'');
  end if;

  if v_majcom is null then
    raise exception 'MAJCOM is required.';
  end if;

  delete from public.fr_manager_evaluators
  where manager_id=auth.uid()
    and evaluator_id=p_evaluator_id
    and majcom=v_majcom;

  -- Remove the MAJCOM authorization only when no manager in that MAJCOM
  -- continues to appoint the evaluator.
  if not exists(
    select 1 from public.fr_manager_evaluators a
    where a.evaluator_id=p_evaluator_id
      and a.majcom=v_majcom
  ) then
    delete from public.fr_evaluator_scopes
    where evaluator_id=p_evaluator_id
      and majcom=v_majcom;

    delete from public.fr_event_evaluators x
    using public.fr_events e
    where x.event_id=e.id
      and x.user_id=p_evaluator_id
      and e.majcom=v_majcom;
  end if;

  insert into public.fr_audit_log(action,table_name,record_id,old_row)
  values(
    'REMOVE_APPOINTED_EVALUATOR',
    'fr_evaluator_scopes',
    p_evaluator_id,
    jsonb_build_object(
      'manager_id',auth.uid(),
      'evaluator_id',p_evaluator_id,
      'manager_role',v_role,
      'majcom',v_majcom
    )
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

  delete from public.fr_evaluator_scopes
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

create or replace function public.fr_eligible_evaluators(
  p_majcom text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_role text;
  v_scope_value text;
  v_parent_scope text;
  v_majcom text := nullif(trim(coalesce(p_majcom,'')),'');
begin
  if v_majcom is null then
    return '[]'::jsonb;
  end if;

  select p.role into v_role
  from public.fr_profiles p
  where p.user_id=auth.uid()
    and p.active=true;

  if v_role not in ('program_manager','majcom_manager','enterprise') then
    raise exception 'Manager access required.';
  end if;

  select m.scope_value,m.parent_scope_value
    into v_scope_value,v_parent_scope
  from public.fr_memberships m
  where m.user_id=auth.uid()
  order by m.created_at
  limit 1;

  if v_role='program_manager' then
    if v_parent_scope is distinct from v_majcom then
      raise exception 'MAJCOM is outside your Program Manager scope.';
    end if;

    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',p.user_id,
        'email',p.email,
        'display_name',p.display_name,
        'majcom',a.majcom
      ) order by coalesce(p.display_name,p.email,p.user_id::text))
      from public.fr_manager_evaluators a
      join public.fr_profiles p on p.user_id=a.evaluator_id
      where a.manager_id=auth.uid()
        and a.majcom=v_majcom
        and p.active=true
        and p.role='evaluator'
    ),'[]'::jsonb);
  end if;

  if v_role='majcom_manager' and v_scope_value is distinct from v_majcom then
    raise exception 'MAJCOM is outside your MAJCOM Manager scope.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'email',p.email,
      'display_name',p.display_name,
      'majcom',s.majcom
    ) order by coalesce(p.display_name,p.email,p.user_id::text))
    from public.fr_evaluator_scopes s
    join public.fr_profiles p on p.user_id=s.evaluator_id
    where s.majcom=v_majcom
      and p.active=true
      and p.role='evaluator'
  ),'[]'::jsonb);
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
  v_parent_scope text;
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
    left join public.fr_evaluator_scopes s
      on s.evaluator_id=u.user_id
     and s.majcom=v_event.majcom
    where p.user_id is null
       or p.active is not true
       or p.role<>'evaluator'
       or s.evaluator_id is null
  ) then
    raise exception 'All assigned evaluators must be active and authorized for the class MAJCOM.';
  end if;

  select m.scope_value,m.parent_scope_value
    into v_scope_value,v_parent_scope
  from public.fr_memberships m
  where m.user_id=auth.uid()
  order by m.created_at
  limit 1;

  if v_role='program_manager' and exists(
    select 1
    from unnest(v_ids) u(user_id)
    where not exists(
      select 1
      from public.fr_manager_evaluators a
      where a.manager_id=auth.uid()
        and a.evaluator_id=u.user_id
        and a.majcom=v_event.majcom
    )
  ) then
    raise exception 'Program Managers may assign only evaluators they appointed within their MAJCOM.';
  end if;

  if v_role='majcom_manager' and v_scope_value is distinct from v_event.majcom then
    raise exception 'Class MAJCOM is outside your MAJCOM Manager scope.';
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

-- Evaluators can read an event only if they are both explicitly assigned and
-- currently authorized for that event's MAJCOM.
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
          join public.fr_evaluator_scopes s
            on s.evaluator_id=p.user_id
           and s.majcom=e.majcom
          where p.user_id=auth.uid()
            and p.active=true
            and p.role='evaluator'
        )
      )
  );
$$;

grant execute on function public.fr_manager_team() to authenticated;
grant execute on function public.fr_appoint_evaluator(uuid,text) to authenticated;
grant execute on function public.fr_remove_appointed_evaluator(uuid,text) to authenticated;
grant execute on function public.fr_assign_program_manager(uuid,text,text) to authenticated;
grant execute on function public.fr_eligible_evaluators(text) to authenticated;
grant execute on function public.fr_get_event_evaluators(uuid) to authenticated;
grant execute on function public.fr_set_event_evaluators(uuid,uuid[]) to authenticated;
