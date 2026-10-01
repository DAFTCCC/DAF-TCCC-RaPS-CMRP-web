-- FieldReady cumulative evaluator capability for management roles.
-- Program Managers may evaluate classes at their own installation.
-- MAJCOM Managers may evaluate classes within their MAJCOM.
-- Enterprise may evaluate any class.
-- Lower roles cannot assign higher-role managers as evaluators.

drop function if exists public.fr_eligible_evaluators(text);

create or replace function public.fr_eligible_evaluators(
  p_majcom text,
  p_installation text default null
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
  v_installation text := nullif(trim(coalesce(p_installation,'')),'');
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

    if v_installation is not null and v_scope_value is distinct from v_installation then
      raise exception 'Installation is outside your Program Manager scope.';
    end if;

    return coalesce((
      select jsonb_agg(row_to_json(q)::jsonb order by q.sort_name)
      from (
        select
          p.user_id,
          p.email,
          p.display_name,
          p.role,
          v_majcom as majcom,
          coalesce(p.display_name,p.email,p.user_id::text) as sort_name
        from public.fr_profiles p
        where p.user_id=auth.uid()
          and p.active=true
          and p.role='program_manager'

        union all

        select
          p.user_id,
          p.email,
          p.display_name,
          p.role,
          a.majcom,
          coalesce(p.display_name,p.email,p.user_id::text) as sort_name
        from public.fr_manager_evaluators a
        join public.fr_profiles p on p.user_id=a.evaluator_id
        where a.manager_id=auth.uid()
          and a.majcom=v_majcom
          and p.active=true
          and p.role='evaluator'
      ) q
    ),'[]'::jsonb);
  end if;

  if v_role='majcom_manager' then
    if v_scope_value is distinct from v_majcom then
      raise exception 'MAJCOM is outside your MAJCOM Manager scope.';
    end if;

    return coalesce((
      select jsonb_agg(row_to_json(q)::jsonb order by q.sort_name)
      from (
        select
          p.user_id,
          p.email,
          p.display_name,
          p.role,
          v_majcom as majcom,
          coalesce(p.display_name,p.email,p.user_id::text) as sort_name
        from public.fr_profiles p
        where p.user_id=auth.uid()
          and p.active=true
          and p.role='majcom_manager'

        union

        select
          p.user_id,
          p.email,
          p.display_name,
          p.role,
          s.majcom,
          coalesce(p.display_name,p.email,p.user_id::text) as sort_name
        from public.fr_evaluator_scopes s
        join public.fr_profiles p on p.user_id=s.evaluator_id
        where s.majcom=v_majcom
          and p.active=true
          and p.role='evaluator'

        union

        select
          p.user_id,
          p.email,
          p.display_name,
          p.role,
          m.parent_scope_value as majcom,
          coalesce(p.display_name,p.email,p.user_id::text) as sort_name
        from public.fr_profiles p
        join public.fr_memberships m on m.user_id=p.user_id
        where p.active=true
          and p.role='program_manager'
          and m.scope_type='installation'
          and m.parent_scope_value=v_majcom
          and (v_installation is null or m.scope_value=v_installation)
      ) q
    ),'[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(q)::jsonb order by q.sort_name)
    from (
      select
        p.user_id,
        p.email,
        p.display_name,
        p.role,
        v_majcom as majcom,
        coalesce(p.display_name,p.email,p.user_id::text) as sort_name
      from public.fr_profiles p
      where p.active=true
        and p.role='enterprise'

      union

      select
        p.user_id,
        p.email,
        p.display_name,
        p.role,
        s.majcom,
        coalesce(p.display_name,p.email,p.user_id::text) as sort_name
      from public.fr_evaluator_scopes s
      join public.fr_profiles p on p.user_id=s.evaluator_id
      where s.majcom=v_majcom
        and p.active=true
        and p.role='evaluator'

      union

      select
        p.user_id,
        p.email,
        p.display_name,
        p.role,
        m.parent_scope_value as majcom,
        coalesce(p.display_name,p.email,p.user_id::text) as sort_name
      from public.fr_profiles p
      join public.fr_memberships m on m.user_id=p.user_id
      where p.active=true
        and p.role='program_manager'
        and m.scope_type='installation'
        and m.parent_scope_value=v_majcom
        and (v_installation is null or m.scope_value=v_installation)

      union

      select
        p.user_id,
        p.email,
        p.display_name,
        p.role,
        m.scope_value as majcom,
        coalesce(p.display_name,p.email,p.user_id::text) as sort_name
      from public.fr_profiles p
      join public.fr_memberships m on m.user_id=p.user_id
      where p.active=true
        and p.role='majcom_manager'
        and m.scope_type='majcom'
        and m.scope_value=v_majcom
    ) q
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
      'display_name',p.display_name,
      'role',p.role
    ) order by coalesce(p.display_name,p.email,p.user_id::text))
    from public.fr_event_evaluators x
    join public.fr_profiles p on p.user_id=x.user_id
    where x.event_id=p_event_id
      and p.active=true
      and p.role in ('evaluator','program_manager','majcom_manager','enterprise')
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

  select m.scope_value,m.parent_scope_value
    into v_scope_value,v_parent_scope
  from public.fr_memberships m
  where m.user_id=auth.uid()
  order by m.created_at
  limit 1;

  if exists(
    select 1
    from unnest(v_ids) u(user_id)
    left join public.fr_profiles p on p.user_id=u.user_id
    where p.user_id is null
       or p.active is not true
       or p.role not in ('evaluator','program_manager','majcom_manager','enterprise')
  ) then
    raise exception 'All assigned users must be active FieldReady accounts.';
  end if;

  -- Base evaluation-capability rules for the event itself.
  if exists(
    select 1
    from unnest(v_ids) u(user_id)
    join public.fr_profiles p on p.user_id=u.user_id
    where not (
      (
        p.role='evaluator'
        and exists(
          select 1
          from public.fr_evaluator_scopes s
          where s.evaluator_id=p.user_id
            and s.majcom=v_event.majcom
        )
      )
      or
      (
        p.role='program_manager'
        and exists(
          select 1
          from public.fr_memberships m
          where m.user_id=p.user_id
            and m.scope_type='installation'
            and m.scope_value=v_event.home_installation_id
            and m.parent_scope_value=v_event.majcom
        )
      )
      or
      (
        p.role='majcom_manager'
        and exists(
          select 1
          from public.fr_memberships m
          where m.user_id=p.user_id
            and m.scope_type='majcom'
            and m.scope_value=v_event.majcom
        )
      )
      or p.role='enterprise'
    )
  ) then
    raise exception 'One or more selected users are outside the class evaluation scope.';
  end if;

  -- A PM may assign themself plus evaluators they personally appointed.
  if v_role='program_manager' and exists(
    select 1
    from unnest(v_ids) u(user_id)
    join public.fr_profiles p on p.user_id=u.user_id
    where u.user_id<>auth.uid()
      and not (
        p.role='evaluator'
        and exists(
          select 1
          from public.fr_manager_evaluators a
          where a.manager_id=auth.uid()
            and a.evaluator_id=u.user_id
            and a.majcom=v_event.majcom
        )
      )
  ) then
    raise exception 'Program Managers may assign themselves or evaluators they appointed.';
  end if;

  -- A MAJCOM Manager may assign themself, eligible evaluators in the MAJCOM,
  -- and Program Managers when the class is at that PM's installation.
  if v_role='majcom_manager' then
    if v_scope_value is distinct from v_event.majcom then
      raise exception 'Class MAJCOM is outside your MAJCOM Manager scope.';
    end if;

    if exists(
      select 1
      from unnest(v_ids) u(user_id)
      join public.fr_profiles p on p.user_id=u.user_id
      where u.user_id<>auth.uid()
        and p.role not in ('evaluator','program_manager')
    ) then
      raise exception 'MAJCOM Managers may assign themselves, scoped evaluators, or Program Managers in the class installation.';
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

grant execute on function public.fr_eligible_evaluators(text,text) to authenticated;
grant execute on function public.fr_get_event_evaluators(uuid) to authenticated;
grant execute on function public.fr_set_event_evaluators(uuid,uuid[]) to authenticated;
