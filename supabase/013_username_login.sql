-- Dedicated FieldReady database only. Existing Auth identities and RLS remain intact.
begin;

alter table public.fr_profiles add column if not exists username text;

-- A stable default avoids collisions, including duplicate work-email prefixes.
update public.fr_profiles
set username='fr.' || replace(user_id::text,'-','')
where username is null;
alter table public.fr_profiles alter column username set not null;
alter table public.fr_profiles drop constraint if exists fr_profiles_username_check;
alter table public.fr_profiles add constraint fr_profiles_username_check
  check (username ~ '^[a-z0-9][a-z0-9._-]{2,47}$');
create unique index if not exists fr_profiles_username_uq on public.fr_profiles(username);

create or replace function public.fr_default_username()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.username is null then
    new.username := 'fr.' || replace(new.user_id::text,'-','');
  end if;
  return new;
end;
$$;
drop trigger if exists fr_profiles_default_username on public.fr_profiles;
create trigger fr_profiles_default_username before insert on public.fr_profiles
for each row execute function public.fr_default_username();

-- Only the owner or active Enterprise administrator can change a login name.
create or replace function public.fr_set_username(p_user_id uuid,p_username text)
returns text language plpgsql security definer set search_path='' as $$
declare v_username text := lower(trim(p_username));
begin
  if not exists(select 1 from public.fr_profiles where user_id=auth.uid() and active)
     or (p_user_id is distinct from auth.uid() and not public.fr_is_enterprise()) then
    raise exception 'Account owner or Enterprise access required.';
  end if;
  if v_username is null or v_username !~ '^[a-z0-9][a-z0-9._-]{2,47}$' then
    raise exception 'Use 3–48 letters, numbers, periods, underscores or hyphens; start with a letter or number.';
  end if;
  update public.fr_profiles set username=v_username,updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'FieldReady account not found.'; end if;
  return v_username;
exception when unique_violation then
  raise exception 'This username is unavailable. Choose another.';
end;
$$;
revoke all on function public.fr_set_username(uuid,text) from public,anon;
grant execute on function public.fr_set_username(uuid,text) to authenticated;

-- Shared database limits survive runtime restarts and multiple function workers.
create table if not exists public.fr_login_limits (
  bucket text primary key,
  attempts integer not null,
  reset_at timestamptz not null
);
alter table public.fr_login_limits enable row level security;
revoke all on public.fr_login_limits from public,anon,authenticated;

-- No anonymous/authenticated username-to-email lookup is exposed.
create or replace function public.fr_resolve_login(p_username text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_username text := lower(trim(p_username)); v_count integer; v_email text;
begin
  delete from public.fr_login_limits where reset_at < now()-interval '1 day';
  insert into public.fr_login_limits as l values ('global',1,now()+interval '1 minute')
  on conflict (bucket) do update set
    attempts=case when l.reset_at<=now() then 1 else l.attempts+1 end,
    reset_at=case when l.reset_at<=now() then now()+interval '1 minute' else l.reset_at end
  returning attempts into v_count;
  if v_count>120 then return '{"limited":true}'::jsonb; end if;
  insert into public.fr_login_limits as l values ('name:'||md5(coalesce(v_username,'')),1,now()+interval '15 minutes')
  on conflict (bucket) do update set
    attempts=case when l.reset_at<=now() then 1 else l.attempts+1 end,
    reset_at=case when l.reset_at<=now() then now()+interval '15 minutes' else l.reset_at end
  returning attempts into v_count;
  if v_count>20 then return '{"limited":true}'::jsonb; end if;
  select u.email into v_email from public.fr_profiles p join auth.users u on u.id=p.user_id
  where p.username=v_username and p.active;
  return jsonb_build_object('email',v_email);
end;
$$;
revoke all on function public.fr_resolve_login(text) from public,anon,authenticated;
grant execute on function public.fr_resolve_login(text) to service_role;
revoke all on function public.fr_default_username() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
