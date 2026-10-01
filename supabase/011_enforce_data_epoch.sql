-- FieldReady server-side data epoch enforcement.
-- Reject stale authenticated REST clients before they can recreate reset study data.

create or replace function public.fr_require_current_data_epoch()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_expected text;
  v_received text;
  v_headers jsonb;
begin
  -- Administrative/direct PostgreSQL sessions do not carry PostgREST request
  -- headers. Permit those so controlled migrations/resets remain possible.
  if current_setting('request.headers', true) is null
     or current_setting('request.headers', true) = '' then
    return coalesce(new,old);
  end if;

  begin
    v_headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    raise exception 'FieldReady request headers are invalid.';
  end;

  v_received := nullif(trim(coalesce(v_headers->>'x-fieldready-epoch','')),'');
  select data_epoch::text
    into v_expected
  from public.fr_system_state
  where singleton=true;

  if v_expected is null then
    raise exception 'FieldReady data epoch is not configured.';
  end if;

  if v_received is null or v_received is distinct from v_expected then
    raise exception 'FieldReady client data generation is stale. Reload FieldReady before synchronizing.';
  end if;

  return coalesce(new,old);
end;
$$;

drop trigger if exists fr_events_require_current_epoch on public.fr_events;
create trigger fr_events_require_current_epoch
before insert or update or delete on public.fr_events
for each row execute function public.fr_require_current_data_epoch();

drop trigger if exists fr_participants_require_current_epoch on public.fr_participants;
create trigger fr_participants_require_current_epoch
before insert or update or delete on public.fr_participants
for each row execute function public.fr_require_current_data_epoch();

drop trigger if exists fr_evaluations_require_current_epoch on public.fr_evaluations;
create trigger fr_evaluations_require_current_epoch
before insert or update or delete on public.fr_evaluations
for each row execute function public.fr_require_current_data_epoch();

drop trigger if exists fr_voids_require_current_epoch on public.fr_voids;
create trigger fr_voids_require_current_epoch
before insert or update or delete on public.fr_voids
for each row execute function public.fr_require_current_data_epoch();

revoke all on function public.fr_require_current_data_epoch() from public;
