-- Dedicated FieldReady database only. Passwords stay exclusively in GoTrue.
begin;
alter table public.fr_profiles
  add column if not exists password_change_required boolean not null default false,
  add column if not exists password_resume_active boolean not null default false,
  add column if not exists password_reset_id uuid,
  add column if not exists temporary_password_expires_at timestamptz;

-- Existing role/RLS helpers already require active=true. Keep pending credentials
-- inactive even if an administrator approves/promotes/reactivates the account.
create or replace function public.fr_password_active_intent()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.password_change_required and new.password_change_required then
    new.password_resume_active:=new.active;
  end if;
  return new;
end;
$$;
create or replace function public.fr_password_gate()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.password_change_required then new.active:=false; end if;
  return new;
end;
$$;
drop trigger if exists fr_profiles_password_active_intent on public.fr_profiles;
create trigger fr_profiles_password_active_intent before update of active on public.fr_profiles
for each row execute function public.fr_password_active_intent();
drop trigger if exists fr_profiles_password_gate on public.fr_profiles;
create trigger fr_profiles_password_gate before insert or update on public.fr_profiles
for each row execute function public.fr_password_gate();

-- Restrict direct study-table access even if a historical permissive policy exists.
do $$ declare t text; begin
  foreach t in array array['fr_events','fr_participants','fr_evaluations','fr_voids',
    'fr_event_evaluators','fr_event_archives','fr_audit_log'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists fr_password_prerequisite on public.%I',t);
      execute format('create policy fr_password_prerequisite on public.%I as restrictive for all to authenticated using (public.fr_is_active()) with check (public.fr_is_active())',t);
    end if;
  end loop;
end $$;

-- Preserve the installed RPCs, their signatures, OIDs, grants and scope logic.
-- Add an explicit active-account prerequisite to each client governance RPC.
-- This also closes nullable-role checks in older installed function bodies.
do $$
declare r record; guarded text; marker text:='-- FieldReady password prerequisite';
begin
  for r in select p.oid,p.prosrc,pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' and l.lanname='plpgsql' and p.proname=any(array[
      'fr_manager_team','fr_appoint_evaluator','fr_remove_appointed_evaluator',
      'fr_assign_program_manager','fr_eligible_evaluators','fr_get_event_evaluators',
      'fr_set_event_evaluators','fr_close_event','fr_delete_event',
      'fr_approve_account_request','fr_deny_account_request','fr_set_user_access','fr_set_username'])
  loop
    if position(marker in r.prosrc)=0 then
      guarded:=regexp_replace(r.prosrc,'\mbegin\M',
        E'begin\n  -- FieldReady password prerequisite\n  if not public.fr_is_active() then raise exception ''Active account with completed password setup required.''; end if;', 'i');
      if guarded=r.prosrc then raise exception 'Unable to guard FieldReady RPC %',r.oid::regprocedure; end if;
      execute replace(r.definition,r.prosrc,guarded);
    end if;
  end loop;
end $$;

create or replace function public.fr_create_temporary_profile(
  p_actor uuid,p_user_id uuid,p_email text,p_display_name text,p_username text,
  p_role text,p_scope_type text default null,p_scope_value text default null,p_parent_scope text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare nonce uuid:=gen_random_uuid(); expiry timestamptz:=now()+interval '24 hours';
begin
  if not exists(select 1 from public.fr_profiles where user_id=p_actor and active and role='enterprise')
    then raise exception 'Enterprise access required.'; end if;
  if p_role not in ('evaluator','program_manager','majcom_manager') or p_role is null
    then raise exception 'Unsupported role.'; end if;
  if p_role='program_manager' and (p_scope_type is distinct from 'installation'
    or nullif(trim(p_scope_value),'') is null or nullif(trim(p_parent_scope),'') is null)
    then raise exception 'Program managers require installation and MAJCOM scopes.'; end if;
  if p_role='majcom_manager' and (p_scope_type is distinct from 'majcom' or nullif(trim(p_scope_value),'') is null)
    then raise exception 'MAJCOM managers require a MAJCOM scope.'; end if;
  insert into public.fr_profiles(user_id,email,display_name,username,role,active,
    password_change_required,password_resume_active,password_reset_id,temporary_password_expires_at)
  values(p_user_id,lower(trim(p_email)),trim(p_display_name),lower(trim(p_username)),p_role,false,
    true,true,nonce,expiry);
  if p_role in ('program_manager','majcom_manager') then
    insert into public.fr_memberships(user_id,scope_type,scope_value,parent_scope_value)
    values(p_user_id,p_scope_type,trim(p_scope_value),case when p_role='program_manager' then trim(p_parent_scope) else null end);
  end if;
  update public.fr_account_requests set status='approved',requested_role=p_role,
    reviewed_by=p_actor,reviewed_at=now(),decision_note='Enterprise temporary-password account'
    where user_id=p_user_id;
  insert into public.fr_audit_log(actor,action,table_name,record_id)
    values(p_actor,'CREATE_TEMPORARY_ACCOUNT','fr_profiles',p_user_id);
  return jsonb_build_object('userId',p_user_id,'username',lower(trim(p_username)),'expiresAt',expiry);
end;
$$;

create or replace function public.fr_begin_temporary_password(p_actor uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fr_profiles%rowtype; nonce uuid:=gen_random_uuid(); expiry timestamptz:=now()+interval '24 hours';
begin
  if not exists(select 1 from public.fr_profiles where user_id=p_actor and active and role='enterprise')
    then raise exception 'Enterprise access required.'; end if;
  if p_actor=p_user_id then raise exception 'Use account recovery to reset your own password.'; end if;
  select * into p from public.fr_profiles where user_id=p_user_id for update;
  if not found or not (p.active or (p.password_change_required and p.password_resume_active))
    then raise exception 'An enabled FieldReady account is required.'; end if;
  -- Do not SET active here: the gate trigger makes it false, preserving intent.
  update public.fr_profiles set password_change_required=true,password_resume_active=true,
    password_reset_id=nonce,temporary_password_expires_at=expiry,updated_at=now() where user_id=p_user_id;
  delete from public.fr_login_limits where bucket='password-change:'||p_user_id::text;
  insert into public.fr_audit_log(actor,action,table_name,record_id)
    values(p_actor,'ISSUE_TEMPORARY_PASSWORD','fr_profiles',p_user_id);
  return jsonb_build_object('userId',p_user_id,'username',p.username,'resetId',nonce,'expiresAt',expiry);
end;
$$;

create or replace function public.fr_password_change_context(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fr_profiles%rowtype; attempts integer;
begin
  select * into p from public.fr_profiles where user_id=p_user_id;
  if not found or not p.password_change_required or not p.password_resume_active
    then return jsonb_build_object('error','Password setup is not available. Contact Enterprise.'); end if;
  if p.temporary_password_expires_at is null or p.temporary_password_expires_at<=now()
    then return jsonb_build_object('error','Temporary password has expired. Ask Enterprise for a new one.'); end if;
  insert into public.fr_login_limits as l values('password-change:'||p_user_id::text,1,now()+interval '15 minutes')
  on conflict(bucket) do update set
    attempts=case when l.reset_at<=now() then 1 else l.attempts+1 end,
    reset_at=case when l.reset_at<=now() then now()+interval '15 minutes' else l.reset_at end
  returning l.attempts into attempts;
  if attempts>10 then return '{"limited":true}'::jsonb; end if;
  return jsonb_build_object('resetId',p.password_reset_id);
end;
$$;

create or replace function public.fr_complete_password_change(p_user_id uuid,p_reset_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.fr_profiles set password_change_required=false,active=true,
    password_resume_active=false,password_reset_id=null,temporary_password_expires_at=null,updated_at=now()
    where user_id=p_user_id and password_change_required and password_resume_active
      and password_reset_id=p_reset_id and temporary_password_expires_at>now();
  if not found then raise exception 'Password setup changed or expired. Sign in again or ask Enterprise for a new temporary password.'; end if;
  delete from public.fr_login_limits where bucket='password-change:'||p_user_id::text;
  insert into public.fr_audit_log(actor,action,table_name,record_id)
    values(p_user_id,'COMPLETE_PASSWORD_CHANGE','fr_profiles',p_user_id);
end;
$$;

-- Pending credentials may authenticate by username to reach password setup only.
-- This function remains service-only and retains the username-login rate limits.
do $$ declare f text; begin
  select pg_get_functiondef('public.fr_resolve_login(text)'::regprocedure) into f;
  if position('p.password_change_required' in f)=0 then
    f:=replace(f,'p.username=v_username and p.active',
      'p.username=v_username and (p.active or (p.password_change_required and p.password_resume_active))');
    execute f;
  end if;
end $$;

revoke all on function public.fr_password_active_intent(),public.fr_password_gate() from public,anon,authenticated;
revoke all on function public.fr_create_temporary_profile(uuid,uuid,text,text,text,text,text,text,text),
  public.fr_begin_temporary_password(uuid,uuid),public.fr_password_change_context(uuid),
  public.fr_complete_password_change(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fr_create_temporary_profile(uuid,uuid,text,text,text,text,text,text,text),
  public.fr_begin_temporary_password(uuid,uuid),public.fr_password_change_context(uuid),
  public.fr_complete_password_change(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
