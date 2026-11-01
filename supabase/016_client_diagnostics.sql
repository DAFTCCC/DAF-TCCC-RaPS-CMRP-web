-- FieldReady 016: beta client diagnostics.
-- Technical events only (errors, failed/slow requests, rage/dead clicks, UI
-- freezes, error messages shown). No study data. The client scrubs IDs,
-- emails, quoted values and any token containing a digit before upload.
-- Signed-in users may INSERT their own rows; only Enterprise may read.
-- No UPDATE or DELETE from clients. Safe to re-run.

begin;

create table if not exists public.fr_client_diagnostics (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_at timestamptz,
  session_id text check (char_length(session_id) <= 64),
  app_version text check (char_length(app_version) <= 40),
  kind text not null check (kind in ('js_error','promise_rejection','request_failed','request_slow','rage_click','dead_click','ui_freeze','error_shown')),
  view text check (char_length(view) <= 40),
  target text check (char_length(target) <= 200),
  message text check (char_length(message) <= 300),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4096),
  user_agent text check (char_length(user_agent) <= 200),
  viewport text check (char_length(viewport) <= 20),
  online boolean
);

create index if not exists fr_client_diagnostics_received_idx on public.fr_client_diagnostics(received_at desc);
create index if not exists fr_client_diagnostics_kind_idx on public.fr_client_diagnostics(kind, received_at desc);
create index if not exists fr_client_diagnostics_user_idx on public.fr_client_diagnostics(user_id, received_at desc);

-- Per-user flood control: rows beyond 500 per rolling hour are silently dropped.
create or replace function public.fr_client_diagnostics_throttle()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if (select count(*) from public.fr_client_diagnostics d
      where d.user_id=new.user_id and d.received_at > now() - interval '1 hour') >= 500 then
    return null;
  end if;
  new.received_at := now();
  return new;
end;
$$;

drop trigger if exists fr_client_diagnostics_throttle on public.fr_client_diagnostics;
create trigger fr_client_diagnostics_throttle
before insert on public.fr_client_diagnostics
for each row execute function public.fr_client_diagnostics_throttle();

alter table public.fr_client_diagnostics enable row level security;

drop policy if exists fr_client_diagnostics_insert on public.fr_client_diagnostics;
create policy fr_client_diagnostics_insert
on public.fr_client_diagnostics
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists fr_client_diagnostics_read on public.fr_client_diagnostics;
create policy fr_client_diagnostics_read
on public.fr_client_diagnostics
for select
to authenticated
using (exists(select 1 from public.fr_profiles p where p.user_id=auth.uid() and p.active=true and p.role='enterprise'));

-- Explicit grants: Supabase default privileges would otherwise grant broadly.
revoke all on public.fr_client_diagnostics from anon, authenticated;
grant insert, select on public.fr_client_diagnostics to authenticated;

commit;
