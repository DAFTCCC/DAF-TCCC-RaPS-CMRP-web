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

## Account administration

FieldReady supports distinct Auth users and controlled roles: evaluator, program_manager, majcom_manager, and enterprise.

Before enabling the account UI in production:

1. Apply `supabase/002_account_administration.sql` to the dedicated FieldReady database only.
2. Deploy `supabase/functions/fieldready-account-admin/index.ts` as the `fieldready-account-admin` Edge Function in the dedicated FieldReady functions runtime.
3. Confirm the Edge Runtime receives its existing server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Never expose the service-role value in GitHub Pages or browser configuration.
4. Confirm SMTP/invite delivery is configured for the dedicated FieldReady Auth service.
5. Validate one evaluator self-request, Enterprise approval, sign-in, Enterprise invitation, password setup, deactivation, and RLS scope before enrolling real study users.

Self-service requests create an Auth identity but do not create an active FieldReady profile until an Enterprise administrator approves the request. Enterprise invitations are performed by the server-side Edge Function so the service-role credential never reaches the browser.
