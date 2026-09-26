-- FieldReady evaluator assignment-only hardening.
-- Evaluators may access only events explicitly assigned through fr_event_evaluators.
-- Event creation/editing remains available to Program Manager, MAJCOM Manager,
-- and Enterprise roles according to their existing scopes.

-- Preserve continuity for any legacy events that were created by users who are
-- still evaluators at migration time by converting creator access into an
-- explicit evaluator assignment.
insert into public.fr_event_evaluators(event_id,user_id)
select e.id,e.created_by
from public.fr_events e
join public.fr_profiles p on p.user_id=e.created_by
where p.role='evaluator'
on conflict (event_id,user_id) do nothing;

create or replace function public.fr_can_manage_event_scope(
  p_majcom text,
  p_installation text,
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.fr_profiles p
    where p.user_id=auth.uid()
      and p.active=true
      and (
        p.role='enterprise'
        or (
          p.role='program_manager'
          and exists(
            select 1
            from public.fr_memberships m
            where m.user_id=p.user_id
              and m.scope_type='installation'
              and m.scope_value=p_installation
          )
        )
        or (
          p.role='majcom_manager'
          and exists(
            select 1
            from public.fr_memberships m
            where m.user_id=p.user_id
              and m.scope_type='majcom'
              and m.scope_value=p_majcom
          )
        )
      )
  );
$$;

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
