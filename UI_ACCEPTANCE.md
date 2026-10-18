# UI acceptance — v4.6.0

All results below were obtained locally with synthetic records. No real study participants, NUC account mutations, invitations, or production grading writes were used.

## Coverage

`python3 tests/role_journeys.py` runs the production HTML, app.js, study.js, skill definitions, and **real sync.js** in Chromium. A stateful local HTTP-contract test double supplies accounts and database responses. Separate browser contexts represent devices and accounts. It checks 12 complete journey groups:

1. Public evaluator-account request, required fields, and mismatched-password validation on mobile.
2. Invalid-login refusal, inactive background navigation, and login keyboard focus containment.
3. Enterprise request approval, invitation submission, and deactivation.
4. Cancelling a denial leaves the request pending; confirmed denial updates it.
5. MAJCOM appointment of a Program manager and Program-manager appointment of an evaluator.
6. Enterprise role and command-scope changes.
7. Background refresh while participant, event, enrollment, and training-exposure forms are open; current entries persist, while a conflicting participant revision is rejected without overwriting the other device's change.
8. Program-manager creation of a scoped event, evaluator assignment, roster creation, enrollment, and server synchronization.
9. Unassigned evaluator sees no class data or management controls in the test authorization model.
10. Assigned evaluator grading: N/O remains unresolved; critical NT is disabled; the 5×5 FAIL taxonomy works; Other/unclear requires a comment; running/uncompleted stopwatch blocks finalization; grading blocks manual sync rather than claiming success; noncritical failure can produce PASS while a critical failure produces FAIL. Finalization locks controls. Two separate browser sessions produce identical criterion-level CSVs.
11. Offline synchronized export is refused explicitly; local Backup still works. Program-manager class closure archives a CSV, and the evaluator's refreshed copy is read-only.
12. Enterprise class deletion leaves assessment history retained in the server test model.

`python3 tests/roles_browser.py` independently checks Evaluator, Program manager, MAJCOM manager, and Enterprise controls; scope-restricted event forms; every section of **TQ, NPA, NDC, BLOOD, CMC, ASM, CLS, and CPP**; finalized/closed locking; refreshed CSV downloads; and CSV column alignment. Evaluator checks use a mobile viewport.

`python3 tests/study_browser.py` checks matched pre/post baseline comparisons, exposure persistence, enrollment presentation, and study CSV content. `python3 tests/warning_browser.py` explicitly overrides the configuration to validate the retained local-testing option; deployed access remains Supabase login.

`node --test tests/*.cjs` passes 33 tests covering source parity, clocks, study pairing, scope filtering, active-profile rejection, multi-device reads, conflicting writes, session refresh, sign-out races, authoritative recovery, and voided attempts. `python3 tests/static_validate.py` passes.

## Issues corrected

- Mobile navigation could widen the entire page beyond the viewport. Navigation now wraps, study tables scroll within their container, and sticky grading controls follow the actual header height.
- Background synchronization could replace the in-memory database while a form held an old event/participant reference. Saving now resolves the current record; existing-record forms compare the opened server revision before applying changes.
- Manual synchronization could eject users to the dashboard or claim success even when grading deferred synchronization. It now preserves the current view and requires a completed fresh sync.
- Cancelling the account-denial prompt still denied the request. Cancellation now stops the action.
- Status notifications could overlap grading controls. They now ignore pointer input so stopwatch and grading taps reach the underlying control.
- The login overlay did not make background controls inactive for keyboard navigation. Main navigation remains inert until entry is authorized; login and modal dialogs contain keyboard focus and have dialog semantics.

## Reproduce

Use Python 3.12, Node 24, and Playwright 1.62.0. A system `/usr/bin/chromium` is used when present; otherwise install Playwright Chromium. `FIELDREADY_CHROMIUM_EXECUTABLE` can select another Chromium executable.

```bash
python3 tests/static_validate.py
node --test tests/*.cjs
python3 tests/role_journeys.py
python3 tests/roles_browser.py
python3 tests/study_browser.py
python3 tests/warning_browser.py
python3 tests/files_browser.py
python3 tests/timing_browser.py
```

GitHub Actions now runs the six browser suites in addition to the static and Node checks. Local passes do not establish a successful hosted CI run.

## Live NUC verification still required

The test API models authorization; it does not run PostgreSQL policies, GoTrue, the Edge Runtime, SMTP, or the archive worker on the NUC. SQL migration 012 was confirmed applied from the user's NUC command output. Live role logins, database RLS, actual email delivery, and on-disk archive persistence have not been tested with authenticated NUC accounts in this environment. A staging acceptance run must verify those services using approved accounts and synthetic records before real study collection.


## v4.5.0 acceptance additions

Locally passed: four-role username sign-in and rename with the same Auth identity, Enterprise username management, all eight full-criterion PDF downloads parsed with pypdf, Unicode clinical symbols, multipage CMC/CPP, participant enrollment/exposure PDF, aligned longitudinal CSV columns and measurement identifiers, CSV/PDF share attachments with fresh click activation, cancellation and failure fallback, unsupported file-sharing fallback, and offline export blocking. Artifacts are generated under `/tmp/fieldready-file-review`; the mobile participant view was also inspected visually.

The real migration passed in isolated PostgreSQL, including reapplication, permissions and throttling. The login handler passed isolated request tests. This verifies the new database code locally; migration 013 and the new function have **not** been installed or authenticated against the live NUC. Actual phone/tablet sharing and gateway routing remain device/NUC acceptance items. Direct email sending remains deferred.


## v4.5.1 grading and evaluation review

`tests/timing_browser.py` exercises the production app and sync client on 390px and 1280px viewports. It checks text contrast and touch height for green Start/Resume and red Stop, disabled controls, stable stopwatch focus/taps/keyboard activation, exact source timing boundaries, active/paused reset guards, offline local persistence with no grading requests, and continuous-hold segment timing. It also advances 92 seconds of polling plus focus/reconnect and incoming snapshots: unsaved notes, ratings, focused input and criterion DOM stay intact without server calls. Finalization syncs explicitly; finalized review stays stable for another 61 seconds; automatic reads resume after leaving the screen. Switching accounts after unfinished grading loads the new scope and preserves old pending work in the owner's recovery backup.

The Node suite adds production grading/timer function checks for 4,999/5,000/10,000/10,001ms NDC boundaries, wall/active/continuous clocks, administrative holds, critical failures, NT/N/O, missing classification, missing/active/recovered stopwatch, unfinished history, and repeated timer failures. Sync checks verify explicit pause without relying on a UI flag and rejection of a snapshot already in flight when grading starts. Account journeys check that invitation/approval role options match server support.

No skill content, score threshold, intervention assignments or NUC schema changed in this release. Live NUC role acceptance and actual device file-sharing remain separate from local tests. The decision-maker checklist is in `EVALUATION_GUIDE.md`.

Export checks also preserve raw clinical timer instances in event/longitudinal CSVs, including a 60,001ms failure against a 60,000ms maximum. The field is appended to Enterprise Detail too. Overall stopwatch seconds remain separate.

Release validation: static validation passed; 56 Node regression tests passed; the username migration check passed in isolated PostgreSQL; all six browser suites passed locally. No authenticated live NUC grading or production data mutations were performed.


## v4.6.0 temporary credentials

`tests/password_browser.py` uses production app.js/sync.js with a stateful synthetic API. It covers all three creatable roles, PM parent scope, one-time credential display/clearing, phone layout, no plaintext in local storage, forced first-login setup, mismatch/wrong-current errors, reload/sign-out, old-password rejection, resets with identity/assignment retention, no self-reset control, non-Enterprise controls hidden, and migration-missing guidance. Requests to production are blocked. Authorization in this HTTP double is a model, not proof of deployed RLS.

`tests/temporary_password_function.cjs` executes the actual function handler against synthetic Auth/REST responses. `tests/password_database.mjs` applies the actual migrations in isolated PostgreSQL, including repeat application, direct-table restrictions, governance RPC guards, service-only grants, reset nonce/expiry/throttle, activation/deactivation intent and assignment retention. `tests/password_installer.cjs` checks prerequisite/backup failures and dedicated-container targeting with a fake Docker command.

Live acceptance still requires running the NUC installer and testing a disposable account on two devices for each intended role. Check the 24-hour deadline/reissue, native Auth policy acceptance, installed RLS, existing account login, scoped data after setup, and reset of an account with assignments. Previously downloaded offline records follow the existing offline access behavior; an administrator reset cannot erase data already held by an offline device.
