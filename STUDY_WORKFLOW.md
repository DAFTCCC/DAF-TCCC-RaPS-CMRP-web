# Study measurement workflow

This implements record capture for the requested before-and-after-practice design. It does not implement randomization or establish an approved clinical instrument, passing threshold, reinforcement interval, or efficacy claim.

## Enrollment

A study manager opens the participant's longitudinal record and records the assignment already made by the study team, the enrollment date, and initial CMRP training completion date. Enrollment receives a stable ID. The same enrollment snapshot is stored in participant payloads across that participant's visible roster instances and inherited by new roster entries. Changing an existing participant ID, assigning a different arm on a new roster, and changing an event to an incompatible arm are blocked in the UI. Enrollment conflicts from imports or concurrent clients exclude the participant from matched analysis.

These are client consistency checks, not a central registry with database uniqueness constraints. Records unseen because of account scope cannot be reconciled by that client. Production study activation still requires a server-enforced enrollment registry and a controlled correction process. Do not resolve conflicts by deleting study history.

## Assessments

Record baseline after the initial training as observed, not an assumed perfect score. At follow-up, identify separate encounters as **Before reinforcement** and **After reinforcement**. Each carries its actual assessment date and its own evaluation ID, ratings, timers, finalization, source, and scenario version. Assessment type and date are required before finalizing new encounters. Practice and retests are explicitly labeled and excluded from formal paired comparisons.

The current event/roster model has one evaluation per participant per event. Use separate study events for the before- and after-practice encounters at each follow-up, keeping the same participant ID, arm, skill, and timepoint. Never void a valid before-practice encounter to replace it with the after-practice result. Control participants receive no reinforcement under the supplied plan; an unreinforced follow-up belongs in the before-reinforcement comparison. Do not fabricate a post-practice control measurement.

Finalized legacy evaluations are left unchanged and unclassified; they remain available in the all-assessments list and exports. They do not enter matched analyses automatically. Retrospective classification requires a separately governed migration, not a guess based on an event label.

## Training exposure

Record an exposure from the longitudinal record for an open event in the selected skill. Each session has its own ID, date, practice type, minutes, repetitions, coaching count, optional trials to mastery, explanatory notes, recorder ID, and recording timestamp. Capture training delivered outside the app, including deviations from the assigned intervention. Blank trials to mastery means not measured. Legacy aggregate counts are preserved; no dated sessions are fabricated from them. A date does not establish within-day ordering; before/after classification records the encounter's position explicitly. Exact training and assessment timestamps and structured intervention fidelity checks remain future protocol work.

Enrollment and exposure metadata travel in existing participant JSON payloads. Assessment identity travels in the evaluation payload. No SQL migration is required for these fields, and no production data are written by development tests. Snapshot synchronization remains subject to the existing participant merge/concurrency behavior; independent simultaneous edits are not an append-only server ledger.

## Comparisons and exports

Choose before- or after-reinforcement comparisons explicitly. Each participant/skill needs exactly one classified, finalized baseline and exactly one classified, finalized follow-up of the selected type. Duplicates are not resolved by choosing the newest or highest score. Enrollment conflicts, invalid chronology, absent source/scenario versions, differing source/scenario versions, and differing scored criterion sets (including NT exclusions) prevent a matched comparison.

Changes are follow-up minus baseline in percentage points. Actual days since baseline are displayed and exported. Dashboard comparisons separate skills and assigned arms, count matched participants, and report missing/excluded records. They use all timepoints within the organizational, arm, and skill filters, irrespective of the dashboard timepoint filter. The original descriptive management metrics remain available and should not be interpreted as matched retention estimates.

The longitudinal record's **Export study records** CSV includes enrollment, assessment, and exposure record types, original IDs, assessment phase/date, finalization status, scores, paired changes, exclusion reasons, training dose, source/scenario versions, and recording metadata. The existing criterion-level longitudinal CSV remains available separately. Blank values are not zero scores or absent practice. JSON backups preserve the complete payloads.

## Remaining protocol decisions

The supplied plan describes a 28-point binary TTA checklist; the app currently contains a different multi-module instrument. No clinical criteria or thresholds were changed. The 28-point checklist, instrument mapping, approved scenarios, assessment windows, scheduling, calibration certification workflow, self-efficacy instrument, fidelity monitoring, and statistical analysis plan still need protocol alignment before study activation.

The pilot compares training approaches at follow-up points. A before/after reinforcement design alone does not randomize training intervals or prove that three- or six-month training is sufficient. Repeated assessment itself may affect learning and must be covered in the approved protocol.

## Temporary warning-only testing mode

`access-config.js` now sets `mode: 'supabase'` and requires role-based login. The optional `warning-only` mode is retained for explicit local testing only. Entry requires acknowledging the warning, with no email or password. Test events, grading, enrollment, exposures, and exports work locally using separate browser storage (`FIELDREADY_LOCAL_TEST_V1`). Existing authenticated study data is not loaded or changed. All server API access is disabled, including when an authenticated session was previously saved. User administration and server class archival are unavailable. Backup test records before clearing browser storage.

To restore authenticated operation, set the mode back to `supabase` and change the service-worker cache name for deployment. Test records are not automatically imported or synchronized into study data. Run `python3 tests/warning_browser.py` to validate the temporary entry flow.

## Multi-device operation (v4.4.0)

Sign in with an authorized account on each device. Scope is determined by active server profiles, assignments, and memberships; users with different scopes should not expect identical exports. Pulls occur on login, window focus, and every 30 seconds while idle. Active grading defers automatic synchronization to preserve timers and unsaved assessment work. Finalization triggers synchronization. CSV exports and class archival refresh server data first; offline or conflicting data pauses those operations. Use Backup for pending offline work.

Changed events, participants, and evaluations use the server revision as a conditional-write precondition. Unchanged cached rows are not uploaded, preventing stale devices from undoing other-device edits. Concurrent changes to the same record cause a visible conflict; independent changes remain eligible for sync. These are multiple HTTP writes, not a single database transaction. A failure can leave some rows saved; retry reconciles already-saved payloads and retains local pending work. A server data-epoch reset or account switch preserves pending data in a per-account local recovery snapshot before the authoritative pull. The synchronization panel offers the current account's recovery backup. Conflicts need controlled reconciliation; do not clear local storage before downloading a backup.

Downloaded CSV files stay on the downloading device. The underlying authorized study data synchronize through the server, allowing any authorized device to generate an up-to-date export. Closed-class CSV archival continues to use the existing server archive workflow. Temporary warning-mode records are kept separate and available as a local testing backup; they are not auto-imported into the study.

The new module migration does not apply itself. Live cross-device writes, account authorization, and RLS still require validation in the deployed database with approved accounts; mocked browser and shared-server tests establish client behavior only.
