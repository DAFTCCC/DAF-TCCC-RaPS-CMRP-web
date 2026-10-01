-- FieldReady server-authoritative data generation.
-- Prevents stale clients from resurrecting data after an administrative reset.

create table if not exists public.fr_system_state (
  singleton boolean primary key default true check (singleton),
  data_epoch uuid not null default gen_random_uuid(),
  reset_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

insert into public.fr_system_state(singleton)
values(true)
on conflict (singleton) do nothing;

alter table public.fr_system_state enable row level security;

revoke all on public.fr_system_state from anon, authenticated;

create or replace function public.fr_get_data_epoch()
returns text
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_epoch uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select data_epoch into v_epoch
  from public.fr_system_state
  where singleton=true;

  if v_epoch is null then
    raise exception 'FieldReady data epoch is not configured.';
  end if;

  return v_epoch::text;
end;
$$;

create or replace function public.fr_rotate_data_epoch()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_epoch uuid := gen_random_uuid();
begin
  select role into v_role
  from public.fr_profiles
  where user_id=auth.uid()
    and active=true;

  if v_role is distinct from 'enterprise' then
    raise exception 'Enterprise access required.';
  end if;

  update public.fr_system_state
  set data_epoch=v_epoch,
      reset_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  return v_epoch::text;
end;
$$;

grant execute on function public.fr_get_data_epoch() to authenticated;
grant execute on function public.fr_rotate_data_epoch() to authenticated;
