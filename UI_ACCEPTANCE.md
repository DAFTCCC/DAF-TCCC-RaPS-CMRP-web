# UI acceptance — v4.4.1

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
```

GitHub Actions now runs the four browser suites in addition to the static and Node checks. Local passes do not establish a successful hosted CI run.

## Live NUC verification still required

The test API models authorization; it does not run PostgreSQL policies, GoTrue, the Edge Runtime, SMTP, or the archive worker on the NUC. SQL migration 012 was confirmed applied from the user's NUC command output. Live role logins, database RLS, actual email delivery, and on-disk archive persistence have not been tested with authenticated NUC accounts in this environment. A staging acceptance run must verify those services using approved accounts and synthetic records before real study collection.
