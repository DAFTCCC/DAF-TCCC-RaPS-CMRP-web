# FieldReady NUC Backend — Foundation v4.2.0

This repository is the FieldReady longitudinal study, not RaPS. RaPS production remains untouched.

## Architecture

- GitHub Pages serves the FieldReady front end.
- The home NUC hosts the dedicated FieldReady Supabase/Postgres/Auth/API backend.
- Browser code may contain only the public/anon key.
- Never commit the Supabase service_role key to GitHub.
- The study remains limited to TQ, NPA, NDC, Blood Administration, and CMC.

## Safe rollout

1. Leave backend-config.js enabled=false while the NUC side is prepared.
2. Back up the current NUC/Supabase environment.
3. Run supabase/001_fieldready_core.sql in the dedicated FieldReady database/namespace.
4. Create FieldReady Auth users.
5. Add fr_profiles rows and assign evaluator/program_manager/majcom_manager/enterprise roles.
6. Add MAJCOM or installation scopes in fr_memberships for managers.
7. Assign evaluators to events through fr_event_evaluators.
8. Put the FieldReady HTTPS gateway URL and public anon key in backend-config.js.
9. Change enabled to true only in staging first.
10. Validate login, RLS scope, offline queue, reconnect, finalization lock, and backup/restore before production deployment.

## Sync states

The top bar can show LOCAL ONLY, SIGN IN, READY TO SYNC, PENDING, SYNCING, SYNCED, OFFLINE, or SYNC ERROR.

## Data integrity

- Stable UUIDs are used for event, participant, evaluation, and void records.
- Finalized evaluation rows are immutable at the database layer.
- Server revisions increment on updates.
- Audit entries are append-only from client perspective.
- No client DELETE policies are granted for study records.

## Important

The backend is disabled by default in this branch, so the current GitHub Pages app remains functional as a local/offline prototype until the NUC endpoint is configured.