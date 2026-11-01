-- FieldReady 015: reconcile the live NUC database with the repository's intended
-- access rules. Dedicated FieldReady database only. Safe to re-run.
--
-- Findings from a read-only live-vs-repo comparison on 2026-10-31:
--   1. fr_event_archives_read (from 006) was missing on the live database.
--   2. fr_events_update on live was the 003 version; it did not exclude
--      closed or soft-deleted classes. 006 intended the stricter version.
--   3. Supabase default grants gave anon and authenticated broad table
--      privileges, including TRUNCATE, which row-level security and the
--      row-level finalized-evaluation lock do not cover.
--
-- This migration changes no rows, no columns, no functions and no triggers.
-- Row-level security already blocked the row operations removed in step 3, so
-- no supported application behavior changes.

begin;

-- 1. Restore the 006 archive read policy.
drop policy if exists fr_event_archives_read on public.fr_event_archives;
create policy fr_event_archives_read
on public.fr_event_archives
for select
to authenticated
using (
  public.fr_is_active()
  and public.fr_can_access_event(event_id)
);

-- 2. Restore the 006 event update policy: closed and deleted classes are not
--    editable through the API.
drop policy if exists fr_events_update on public.fr_events;
create policy fr_events_update
on public.fr_events
for update
to authenticated
using (
  public.fr_is_active()
  and closed_at is null
  and deleted_at is null
  and public.fr_can_manage_event_scope(majcom,home_installation_id,created_by)
)
with check (
  public.fr_is_active()
  and public.fr_can_manage_event_scope(majcom,home_installation_id,created_by)
);

-- 3. Table privileges: anon gets nothing; authenticated gets exactly what the
--    repository grants. service_role is not changed.
revoke all on
  public.fr_profiles,
  public.fr_memberships,
  public.fr_events,
  public.fr_event_evaluators,
  public.fr_participants,
  public.fr_evaluations,
  public.fr_voids,
  public.fr_audit_log,
  public.fr_account_requests,
  public.fr_event_archives,
  public.fr_evaluator_scopes,
  public.fr_manager_evaluators,
  public.fr_system_state,
  public.fr_login_limits
from anon, authenticated;

grant select, insert, update on public.fr_events       to authenticated;
grant select, insert, update on public.fr_participants to authenticated;
grant select, insert, update on public.fr_evaluations  to authenticated;
grant select, insert         on public.fr_voids        to authenticated;
grant select on
  public.fr_profiles,
  public.fr_memberships,
  public.fr_event_evaluators,
  public.fr_audit_log,
  public.fr_account_requests,
  public.fr_event_archives,
  public.fr_evaluator_scopes,
  public.fr_manager_evaluators
to authenticated;

commit;
