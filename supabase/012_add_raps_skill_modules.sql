-- Run once on the dedicated FieldReady database before creating ASM/CLS/CPP events.
-- This extends the module allowlist; it does not change RLS or study records.
begin;
alter table public.fr_events
  drop constraint if exists fr_events_skill_id_check;
alter table public.fr_events
  add constraint fr_events_skill_id_check
  check (skill_id in ('TQ','NPA','NDC','BLOOD','CMC','ASM','CLS','CPP'));
commit;
