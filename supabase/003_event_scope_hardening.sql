-- FieldReady event role/scope hardening.
-- Keeps evaluator-created/assigned event behavior while enforcing current
-- installation/MAJCOM scope for scoped managers on read, insert, and update.

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
        or (p.role='evaluator' and p_created_by=auth.uid())
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
        public.fr_can_manage_event_scope(e.majcom,e.home_installation_id,e.created_by)
        or exists(
          select 1
          from public.fr_profiles p
          where p.user_id=auth.uid()
            and p.active=true
            and p.role='evaluator'
            and exists(
              select 1
              from public.fr_event_evaluators x
              where x.event_id=e.id
                and x.user_id=auth.uid()
            )
        )
      )
  );
$$;

create or replace function public.fr_block_event_creator_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'FieldReady event creator is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists fr_events_lock_creator on public.fr_events;
create trigger fr_events_lock_creator
before update on public.fr_events
for each row
execute function public.fr_block_event_creator_mutation();

drop policy if exists fr_events_read on public.fr_events;
create policy fr_events_read
on public.fr_events
for select
to authenticated
using (
  public.fr_is_active()
  and public.fr_can_access_event(id)
);

drop policy if exists fr_events_insert on public.fr_events;
create policy fr_events_insert
on public.fr_events
for insert
to authenticated
with check (
  public.fr_is_active()
  and created_by=auth.uid()
  and public.fr_can_manage_event_scope(majcom,home_installation_id,created_by)
);

drop policy if exists fr_events_update on public.fr_events;
create policy fr_events_update
on public.fr_events
for update
to authenticated
using (
  public.fr_is_active()
  and public.fr_can_manage_event_scope(majcom,home_installation_id,created_by)
)
with check (
  public.fr_is_active()
  and public.fr_can_manage_event_scope(majcom,home_installation_id,created_by)
);
