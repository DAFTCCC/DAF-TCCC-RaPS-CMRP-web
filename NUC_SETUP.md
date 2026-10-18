# FieldReady NUC Backend

This repository is the FieldReady longitudinal study, not RaPS. RaPS production remains untouched.

## Architecture

- GitHub Pages serves the FieldReady front end.
- The home NUC hosts the dedicated FieldReady Supabase/Postgres/Auth/API backend.
- Browser code may contain only the public/anon key.
- Never commit the Supabase service_role key to GitHub.
- Modules include TQ, NPA, NDC, Blood Administration, CMC, ASM, CLS, and CPP.

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

## v4.4.0 module rollout

Apply `supabase/012_add_raps_skill_modules.sql` to the dedicated **FieldReady** database before enabling ASM, CLS, or CPP event creation. The transaction replaces only `fr_events_skill_id_check` to include the three added IDs. It does not touch RaPS or alter row-level security. New databases created from the current `001_fieldready_core.sql` already include those IDs. Verify manager event creation, evaluator assignment, grading/finalization, second-device refresh, and CSV export using approved staging accounts after migration.

## v4.5.0 username login and file exports

The web update can download CSV/PDF and prepare attachments without new server configuration. Username login needs **both migration 013 and the new `fieldready-login` Edge Function on the NUC**. These files have been tested locally; this environment cannot install them on the NUC. Existing email/password login continues throughout the rollout.

From a checkout of this version **on the NUC**, run:

```bash
bash deploy/fieldready-username-update.sh
```

If the repository is not already on the NUC:

```bash
git clone --depth 1 https://github.com/DAFTCCC/DAF-TCCC-RaPS-CMRP-web.git /tmp/fieldready-username-update
bash /tmp/fieldready-username-update/deploy/fieldready-username-update.sh
```

The script checks the dedicated `fieldready-edge-functions` persistent `/home/deno/functions` mount and existing server-side variables, backs up **only the FieldReady database** in `$HOME/fieldready-backups` (restrictive permissions), installs `fieldready-login/index.ts`, applies `supabase/013_username_login.sql`, and restarts **only FieldReady's functions runtime**. It never touches `supabase-db` or the RaPS runtime. `FIELDREADY_BACKUP_DIR` can select another protected backup directory. If the mount differs, the script stops before writing anything; use its actual persistent functions mount. The database dump contains account/study data and must remain protected.

Manual deployment uses the existing FieldReady functions dispatcher and its server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep the gateway's JWT/API-key checks in place: the login caller sends the existing valid public anon JWT; the function itself performs the password exchange. Do not put service credentials in backend-config.js or disable JWT checks globally. Validate this route through the actual gateway after installing it.

After installation:

1. Sign in with your current email and password. Open **Account**, choose a readable username, and save it. Default names are stable `fr.` plus the Auth UUID without hyphens; administrators can view and rename them from **Users → Manage → Set username**.
2. Lock and sign in with the new username and existing password. Check each role and assigned scope. Username changes preserve the Auth user ID, role, assignments, audit history, and study records. New approvals/invitations receive a default username automatically; invitees still set their own password using the existing invitation flow.
3. Repeat on another device and compare the same event CSVs. Check deactivated accounts cannot enter and an evaluator cannot rename someone else's account.
4. Download an event and participant PDF. Check full criterion ratings, failure comments, timing, baseline/pre/post labels, enrollment/exposures, and the final page. PDF reports contain current attempts; JSON backups retain voided attempts.
5. Test **Share files → Share files** on the intended phone/tablet. The first click syncs and prepares CSV/PDF; the second supplies a fresh user gesture for the device share sheet. If file sharing is unsupported or fails, use the individual downloads and attach them in the email/files app. Cancellation is harmless. Handing files to the operating system does not confirm email delivery.

Usernames are case-insensitive, 3–48 characters, and unique. Passwords remain managed by GoTrue. Email remains associated with the account for invitations/recovery. Anonymous clients cannot read the username/email resolver or its rate-limit table. The service-only resolver limits each normalized username to 20 attempts per 15 minutes and the login route globally to 120 attempts per minute; buckets expire and are cleaned up. Supabase Auth limits still apply. Direct export email is deferred; there is no export-email integration in this release.


## v4.6.0 temporary account passwords

This feature requires migration **014** and the updated **fieldready-account-admin** Edge Function on the dedicated FieldReady stack. Migration 013/username login must already be installed. The web release alone cannot install server changes.

Run on the NUC from a fresh checkout:

```bash
fr_setup=$(mktemp -d)
git clone --depth 1 https://github.com/DAFTCCC/DAF-TCCC-RaPS-CMRP-web.git "$fr_setup"
bash "$fr_setup/deploy/fieldready-temporary-password-update.sh"
```

The script checks the persistent functions mount and existing server-side variables, makes and validates a protected FieldReady database dump under `$HOME/fieldready-backups`, saves the previous account-admin function when present, applies the repeatable transactional migration, installs the function and restarts **only fieldready-edge-functions**. It never targets the RaPS containers. Keep backups protected: they contain account and study data. A failure after migration can be retried from the same checkout. Do not manually clear password flags to recover an interrupted setup; issue a fresh temporary password instead.

Refresh the web app to **4.6.0-study-web**. As Enterprise:

1. Open **Users → Create User**, enter name, username and account email, then choose Evaluator, Program Manager or MAJCOM Manager and required scopes. Program Managers require both installation and parent MAJCOM. Enterprise promotion remains available through Manage after setup.
2. Show/copy the generated temporary password and give it directly to the intended user. Closing the dialog clears it; it is not saved in browser storage, study records, exports or audit entries. No invitation email is sent by Create User. Email remains attached to the Auth identity for recovery.
3. On another device, sign in with that username and temporary password. Study access must stay blocked until the user replaces it with a different password (12–128 characters). Verify the correct role and scope after setup.
4. Test **Manage → Reset temporary password** for a disposable existing account. The old password must fail; temporary sign-in must require replacement again. Confirm role, class assignments and evaluations remain linked to the same user ID.
5. Test expiry/reissue and ordinary account deactivation before wider use. Password setup expires 24 hours after issue. Too many change attempts are throttled; ask Enterprise to reissue if setup is lost or expired. Enterprise cannot reset its own password through this flow; use normal account recovery or another Enterprise administrator.

The database holds pending credentials inactive, with separate intended activation state, so direct study APIs and governance RPCs also reject access before password setup. Reapproving/reactivating a pending account does not bypass this requirement. Pending users display **PASSWORD CHANGE**, rather than Removed. Deactivating a pending user prevents activation even if it knows the temporary password. Existing ordinary accounts remain active and keep their passwords. Native Auth stores password hashes; this feature never stores plaintext passwords in profiles, audit rows or study data.

If a native Auth reset fails after access is paused, the account remains locked; retry issuing a temporary password. If replacement succeeds but activation is interrupted, sign in using the newly chosen password and finish setup, or ask Enterprise to reissue. The server verifies the current password again before activation and checks that the latest reset has not changed or expired.

Local tests use synthetic HTTP responses and isolated PostgreSQL. They do not verify the NUC's deployed dispatcher, runtime environment, policies or actual second-device behavior; perform the checks above after installation. SMTP is needed only for the retained email-invitation/recovery workflows, not temporary account creation.
