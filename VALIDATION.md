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
