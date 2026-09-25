-- FieldReady account administration + access request workflow
-- Apply only to the dedicated FieldReady Supabase database.

alter table public.fr_profiles
  add column if not exists email text;

update public.fr_profiles p
set email=lower(u.email)
from auth.users u
where u.id=p.user_id
  and (p.email is null or p.email='');

create unique index if not exists fr_profiles_email_uq
  on public.fr_profiles(lower(email))
  where email is not null;

create table if not exists public.fr_account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  requested_role text not null default 'evaluator'
    check (requested_role in ('evaluator','program_manager','majcom_manager')),
  majcom text,
  installation_id text,
  status text not null default 'pending'
    check (status in ('pending','approved','denied')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fr_account_requests_email_uq
  on public.fr_account_requests(lower(email));

create or replace function public.fr_is_enterprise()
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
      and p.role='enterprise'
  );
$$;

create or replace function public.fr_capture_account_request()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
  v_majcom text;
  v_installation text;
begin
  v_name := trim(coalesce(new.raw_user_meta_data->>'display_name',''));
  v_majcom := nullif(trim(coalesce(new.raw_user_meta_data->>'majcom','')),'');
  v_installation := nullif(trim(coalesce(new.raw_user_meta_data->>'installation_id','')),'');

  insert into public.fr_account_requests(
    user_id,email,display_name,requested_role,majcom,installation_id,status
  )
  values(
    new.id,
    lower(coalesce(new.email,'')),
    v_name,
    'evaluator',
    v_majcom,
    v_installation,
    'pending'
  )
  on conflict (user_id) do update
    set email=excluded.email,
        display_name=excluded.display_name,
        majcom=excluded.majcom,
        installation_id=excluded.installation_id,
        updated_at=now();

  return new;
end;
$$;

drop trigger if exists fr_auth_user_account_request on auth.users;
create trigger fr_auth_user_account_request
after insert on auth.users
for each row execute function public.fr_capture_account_request();

-- Backfill a request row for existing Auth users that do not yet have one.
insert into public.fr_account_requests(
  user_id,email,display_name,requested_role,status,reviewed_by,reviewed_at
)
select
  u.id,
  lower(coalesce(u.email,'')),
  coalesce(p.display_name,''),
  case
    when p.role in ('evaluator','program_manager','majcom_manager') then p.role
    else 'evaluator'
  end,
  case when p.active then 'approved' else 'pending' end,
  case when p.active then u.id else null end,
  case when p.active then now() else null end
from auth.users u
left join public.fr_profiles p on p.user_id=u.id
where not exists(
  select 1 from public.fr_account_requests r where r.user_id=u.id
);

create or replace function public.fr_account_request_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists fr_account_requests_touch on public.fr_account_requests;
create trigger fr_account_requests_touch
before update on public.fr_account_requests
for each row execute function public.fr_account_request_touch();

alter table public.fr_account_requests enable row level security;

drop policy if exists fr_account_requests_read on public.fr_account_requests;
create policy fr_account_requests_read
on public.fr_account_requests
for select
to authenticated
using (user_id=auth.uid() or public.fr_is_enterprise());

drop policy if exists fr_memberships_read on public.fr_memberships;
create policy fr_memberships_read
on public.fr_memberships
for select
to authenticated
using (user_id=auth.uid() or public.fr_is_enterprise());

create or replace function public.fr_approve_account_request(
  p_request_id uuid,
  p_role text default 'evaluator',
  p_scope_type text default null,
  p_scope_value text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.fr_account_requests%rowtype;
begin
  if not public.fr_is_enterprise() then
    raise exception 'Enterprise access required.';
  end if;

  if p_role not in ('evaluator','program_manager','majcom_manager') then
    raise exception 'Unsupported role.';
  end if;

  select * into r
  from public.fr_account_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'Account request not found.';
  end if;

  if p_role='program_manager' and (p_scope_type<>'installation' or nullif(trim(p_scope_value),'') is null) then
    raise exception 'Program managers require an installation scope.';
  end if;

  if p_role='majcom_manager' and (p_scope_type<>'majcom' or nullif(trim(p_scope_value),'') is null) then
    raise exception 'MAJCOM managers require a MAJCOM scope.';
  end if;

  insert into public.fr_profiles(user_id,email,display_name,active,role)
  values(r.user_id,lower(r.email),r.display_name,true,p_role)
  on conflict (user_id) do update
    set email=excluded.email,
        display_name=excluded.display_name,
        active=true,
        role=excluded.role,
        updated_at=now();

  delete from public.fr_memberships where user_id=r.user_id;

  if p_role in ('program_manager','majcom_manager') then
    insert into public.fr_memberships(user_id,scope_type,scope_value)
    values(r.user_id,p_scope_type,trim(p_scope_value));
  end if;

  update public.fr_account_requests
  set status='approved',
      requested_role=p_role,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      decision_note=null
  where id=r.id;
end;
$$;

create or replace function public.fr_deny_account_request(
  p_request_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.fr_is_enterprise() then
    raise exception 'Enterprise access required.';
  end if;

  update public.fr_account_requests
  set status='denied',
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      decision_note=nullif(trim(coalesce(p_note,'')),'')
  where id=p_request_id;

  if not found then
    raise exception 'Account request not found.';
  end if;
end;
$$;

create or replace function public.fr_set_user_access(
  p_user_id uuid,
  p_active boolean,
  p_role text,
  p_scope_type text default null,
  p_scope_value text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.fr_is_enterprise() then
    raise exception 'Enterprise access required.';
  end if;

  if p_user_id=auth.uid() and (not p_active or p_role<>'enterprise') then
    raise exception 'You cannot remove your own Enterprise access.';
  end if;

  if p_role not in ('evaluator','program_manager','majcom_manager','enterprise') then
    raise exception 'Unsupported role.';
  end if;

  if p_role='program_manager' and (p_scope_type<>'installation' or nullif(trim(p_scope_value),'') is null) then
    raise exception 'Program managers require an installation scope.';
  end if;

  if p_role='majcom_manager' and (p_scope_type<>'majcom' or nullif(trim(p_scope_value),'') is null) then
    raise exception 'MAJCOM managers require a MAJCOM scope.';
  end if;

  update public.fr_profiles
  set active=p_active,
      role=p_role,
      updated_at=now()
  where user_id=p_user_id;

  if not found then
    raise exception 'FieldReady profile not found.';
  end if;

  delete from public.fr_memberships where user_id=p_user_id;

  if p_role in ('program_manager','majcom_manager') then
    insert into public.fr_memberships(user_id,scope_type,scope_value)
    values(p_user_id,p_scope_type,trim(p_scope_value));
  end if;
end;
$$;

-- Audit account governance changes.
do $$
declare t text;
begin
  foreach t in array array['fr_profiles','fr_memberships','fr_account_requests'] loop
    execute format('drop trigger if exists %I_audit on public.%I',t,t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.fr_audit_row()',t,t);
  end loop;
end $$;

grant select on public.fr_account_requests to authenticated;
grant execute on function public.fr_approve_account_request(uuid,text,text,text) to authenticated;
grant execute on function public.fr_deny_account_request(uuid,text) to authenticated;
grant execute on function public.fr_set_user_access(uuid,boolean,text,text,text) to authenticated;

-- Keep direct account-governance writes server-side/RPC only.
revoke insert,update,delete on public.fr_account_requests from anon,authenticated;
revoke insert,update,delete on public.fr_profiles from anon,authenticated;
revoke insert,update,delete on public.fr_memberships from anon,authenticated;
