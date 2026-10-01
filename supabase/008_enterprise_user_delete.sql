-- FieldReady Enterprise user deletion support.
-- Auth deletion removes only access/governance rows. Study records keep UUID attribution.

alter table public.fr_profiles
  drop constraint if exists fr_profiles_user_id_fkey;

alter table public.fr_profiles
  add constraint fr_profiles_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;

alter table public.fr_account_requests
  drop constraint if exists fr_account_requests_reviewed_by_fkey;

alter table public.fr_account_requests
  add constraint fr_account_requests_reviewed_by_fkey
  foreign key (reviewed_by)
  references auth.users(id)
  on delete set null;

-- Include explicit evaluator assignments in governance auditing.
drop trigger if exists fr_event_evaluators_audit on public.fr_event_evaluators;
create trigger fr_event_evaluators_audit
after insert or update or delete on public.fr_event_evaluators
for each row execute function public.fr_audit_governance_row();
