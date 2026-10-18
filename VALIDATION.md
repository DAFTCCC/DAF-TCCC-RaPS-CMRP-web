# Validation — v4.1.0

## Automated static validation

Run:

```bash
python3 tests/static_validate.py
node --test tests/*.cjs
```

The validator checks:

- required repository files
- JavaScript syntax
- exactly five live failure modes and five live primary contributors
- sequential Step 1 / Step 2 FAIL workflow
- TQ = 15 criteria
- NPA = 13 criteria
- NDC = 15 criteria
- Blood Administration = 26 criteria
- CMC contains source IDs `CMC-001` through `CMC-123`
- CMC contains `CMC-DAF-MACE2`
- CMC H/H2 content anchors are present
- CMC clock set and standards match the RaPS Tier 3 configuration
- all five study modules define a required assessment stopwatch
- CMC overall stopwatch has a 30-minute pass standard
- Baseline / 3-Month / 6-Month longitudinal UI and export hooks exist

The sync regression suite checks capped pagination, incomplete reads, and local-edit/server-reset races before a remote snapshot is applied. It uses mocked responses and never writes to the configured backend.

## Manual browser acceptance

Before study use, conduct the following in the browser/device actually used for evaluation:

1. Create an event and participant.
2. Open each of the five skills and confirm the large assessment stopwatch shows **START**, counts upward, and changes to a **STOP** control while running.
3. Stop the stopwatch and verify the recorded time remains visible.
4. For TQ, verify the separate 1-minute and 3-minute clinical clocks.
5. For NDC, verify the separate 5–10 second hold clock.
6. For CMC, verify the complete RaPS Tier 3 section sequence and the six additional RaPS clinical clocks.
7. Press FAIL on a noncritical criterion. Confirm **exactly five** Step 1 failure-mode choices.
8. Select one. Confirm **exactly five** Step 2 contributor choices.
9. Confirm `Other / unclear` cannot save without an objective comment.
10. Confirm formal finalization is blocked while any clock is running or before the assessment stopwatch is stopped.
11. Create/finalize the same Participant ID at Baseline, 3-Month, and 6-Month for the same skill.
12. From the dashboard, open the participant's longitudinal record and confirm all three timepoints are shown together.
13. Confirm the criterion table shows Baseline → 3-Month → 6-Month ratings and that “Open measurement” returns to the underlying record.
14. Export the participant longitudinal CSV and verify all three timepoints and stopwatch seconds are present.
15. Export/restore a JSON backup and confirm the records persist.

## Study activation gate

A successful software test does not replace clinical/source approval. The PI/AI must approve the source wording, critical flags, timers, scenario/version, and study workflow before participant data collection.

## Study record validation

See `STUDY_WORKFLOW.md` for the enrollment, separate pre/post assessment events, exposure recording, export, and legacy-data rules. The study regression suite exercises paired comparisons, duplicate handling, arm conflicts, source and scenario comparability, dates, and exposure deduplication. These tests do not establish clinical validity or database enforcement of enrollment uniqueness.

For the study UI smoke check, with Python Playwright and `/usr/bin/chromium` available, run `python3 tests/study_browser.py`. It starts a temporary local server, uses synthetic records and mocked authentication, checks separate pre/post baseline changes, saves an exposure, and validates the study CSV column alignment. It makes no production backend writes.

## Roles, RaPS modules, and multi-device data

Run `node --test tests/*.cjs` for pinned ASM/CLS/CPP source parity, timer conversion, role write scopes, unauthorized profile rejection, token refresh, separate-device updates, version conflicts, voided-attempt preservation, and refreshed-export preconditions.

Run `python3 tests/roles_browser.py` for all four roles: visible management controls, Program/MAJCOM form scopes, all ASM/CLS/CPP sections, finalized sign-off locking, refreshed event CSVs, and aligned export columns. It uses synthetic data and mocked authentication and makes no production writes. The evaluator case uses a mobile viewport. `python3 tests/study_browser.py` checks longitudinal comparisons and study exports. `python3 tests/warning_browser.py` explicitly overrides access mode to test the retained local-testing option; it does not reflect the deployed default.

Apply migration 012 and run a real two-device acceptance exercise in staging: create and assign an event as a manager, grade/finalize it as an assigned evaluator, refresh on another authorized device, and compare exports. Attempt a same-row concurrent edit and verify that the conflict preserves both copies for reconciliation. Client tests do not validate live RLS policies or migration application. Live read-only checks confirmed backend health and zero event rows visible with the public anonymous role.

## Complete role journeys (v4.4.1)

Run `python3 tests/role_journeys.py` for full administration-to-grading-to-archive workflows through production `sync.js` and a stateful local HTTP-contract test server. See `UI_ACCEPTANCE.md` for the 12 journey groups, the four-role/eight-module browser matrix, corrected defects, reproducibility instructions, and the explicit limits of simulated authorization. GitHub Actions runs all four browser scripts with Playwright 1.62.0.


## Username login and file exports (v4.5.0)

`python3 tests/files_browser.py` runs production app/sync code against the local API double. It verifies all four role identities after username changes, Enterprise renaming, full searchable PDFs for all eight modules, clinical symbols and pagination, participant CSV/PDF scope, real CSV/PDF File objects handed to a simulated Web Share API with fresh user activation, cancellation/error/unsupported fallbacks, and the offline export guard. Requires Playwright 1.62.0 and pypdf 6.10.0. Actual device share targets and delivery require device acceptance testing.

`node --test tests/*.cjs` includes the actual Edge Function handler with isolated native-Auth responses, generic invalid-credential errors, rate limits, and unavailable-backend cases. It also checks the browser client's username route and email compatibility.

Run migration checks in an isolated PostgreSQL engine:

```bash
npm install --prefix /tmp/fieldready-sql-test @electric-sql/pglite@0.3.14 --ignore-scripts --no-audit --no-fund
node --test tests/username_database.mjs
```

This executes the real migration twice, checks unique normalized names, owner/Enterprise renames, inactive and anonymous denial, service-only resolution, default names for new users, and persisted per-name/global throttles. It does not verify the live NUC's gateway, GoTrue configuration, mounted functions, or installed RLS. The NUC deployment script's shell syntax is checked locally; its Docker operations must run on the NUC.


## Grading stability and timer controls (v4.5.1)

Run `python3 tests/timing_browser.py` with the same Playwright runtime. It uses actual app/sync code, a local API double and controlled browser time to test desktop/mobile timer colors/contrast, touch size, long taps, focus preservation, exact boundaries, resets/pauses, offline saves, 92 seconds of background refresh suppression, explicit finalization sync, stable review and shared-browser account isolation. Screenshots are saved under `/tmp/fieldready-timing-review`. `node --test tests/*.cjs` includes focused production grading/timer and sync-pause checks. See `UI_ACCEPTANCE.md` for details and live-service limits.


## Temporary credentials (v4.6.0)

Run `node --test tests/*.cjs`, `node --test tests/username_database.mjs tests/password_database.mjs`, and `python3 tests/password_browser.py` in addition to the existing static and six browser suites. PGlite uses the existing pinned isolated-test installation described above. Function tests exercise the production TypeScript handler in Node 24; they cannot establish compatibility with the deployed Deno runtime/dispatcher. Installer tests use fake Docker responses, never NUC access. See UI_ACCEPTANCE.md and NUC_SETUP.md for the required live checks.
