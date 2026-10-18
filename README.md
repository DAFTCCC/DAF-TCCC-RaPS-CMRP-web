# FieldReady Longitudinal Competency Study — Web/PWA v4.4.1-study-web

## UI acceptance update — v4.4.1

Form saves now survive a background refresh and reject conflicting edits, mobile navigation stays within the viewport, manual sync preserves the current view, and cancelling an account denial leaves the request pending. Login and modal keyboard access is contained. See `UI_ACCEPTANCE.md` for role-by-role test coverage and live NUC checks still outstanding.

## Current workflow

Role-based Supabase login is enabled. Evaluators grade assigned events; Program and MAJCOM managers manage their authorized scopes; Enterprise manages users and enterprise data. ASM, CLS, and CPP now supplement the original five modules, preserving the RaPS sheets and timing rules. See `SOURCE_MAPPING.md` for the pinned source.

**Existing FieldReady databases:** apply `supabase/012_add_raps_skill_modules.sql` before creating ASM/CLS/CPP events. It extends the event skill allowlist without changing RLS. The web update cannot apply database migrations.

Authorized data refreshes on login, window focus, periodically while idle, and before CSV exports. Changed records use conditional server-revision checks; conflicts preserve pending work instead of overwriting another device. Finish active grading before exporting shared results. Backup remains a local recovery download. See `STUDY_WORKFLOW.md` for study-record semantics and limitations.

Temporary warning-mode test records remain separate from authenticated study data; download them from the synchronization panel if needed. They are never silently uploaded into study records.

Validation: `python3 tests/static_validate.py`, `node --test tests/*.cjs`, and browser checks documented in `VALIDATION.md`.

## v4.2.0 history — optional NUC/Supabase backend foundation

This branch adds a **disabled-by-default** central persistence layer for the FieldReady study without changing RaPS.

- GitHub Pages remains the front-facing FieldReady application.
- The NUC can host a dedicated FieldReady Supabase/Postgres/Auth/API backend.
- Local/offline evaluation remains available; saves are marked pending until synchronized.
- The top bar exposes LOCAL ONLY / SIGN IN / READY TO SYNC / PENDING / SYNCING / SYNCED / OFFLINE / SYNC ERROR.
- Server-side RLS scopes evaluator, installation manager, MAJCOM manager, and enterprise access.
- Finalized evaluation rows are immutable at the database layer.
- Server revision fields and append-only audit records are included.
- The browser configuration accepts only the public/anon key. Never commit a service_role key.

See `NUC_SETUP.md` and `supabase/001_fieldready_core.sql`. The original foundation was disabled by default; the current checked-in configuration enables the dedicated FieldReady backend.

FieldReady is a **static GitHub Pages evaluator and longitudinal study prototype**. It uses the DAF TCCC RaPS web app as the workflow/management baseline—event creation, MAJCOM and installation organization, roster workflow, criterion-level scoring, timers, local analytics, and export—with the original five study skill sets and the additional RaPS ASM, CLS, and CPP modules. Adding a module does not establish its approval for a study cohort.

## What changed in v4.1.0

### Full RaPS CMC Tier 3 content

The CMC evaluation no longer uses the reduced local CMC representation from v4.0. `skills.js` now carries the complete CMC Tier 3 criterion sequence represented in the RaPS baseline:

- `CMC-001` through `CMC-123` from `TCCC-CMC-TTA-05-02 · 30 MAY 26`
- `CMC-DAF-MACE2` as the RaPS DAF supplemental MACE 2 criterion
- CUF, TFC, M, A, R, C, H, H2, P, ABX, W, S, CPR, COMMS, DOC, and EVAC sections

The app title intentionally says **Full RaPS Tier 3** to distinguish this build from the earlier reduced study representation. The underlying RaPS source file labels the source checklist “Tactical Trauma Assessment — Abbreviated”; FieldReady does not trim that RaPS Tier 3 content further.

### RaPS CMC clocks matched

CMC includes the same formal clock standards carried in the RaPS Tier 3 configuration:

| Clock | Standard | Linked criterion |
|---|---:|---|
| Overall Tactical Trauma Assessment | ≤ 30:00 | Global |
| CUF Tourniquet — Bleeding Control | ≤ 1:00 | CMC-005 |
| Wound Packing Pressure | ≥ 3:00 | CMC-014 |
| NDC Catheter Hold | 5–10 sec | CMC-034 |
| Hypertonic Saline Administration | ≥ 10:00 | CMC-080 |
| HTS Repeat Interval — if no response | ≥ 20:00 | CMC-081 |
| Neurologic Reassessment Interval | 5–10 min | CMC-084 |

### Running assessment stopwatch on every skill

Every formal skill evaluation now has a large running **assessment stopwatch** with an explicit **START** and **STOP** control.

- TQ, NPA, NDC, and Blood: generic assessment stopwatch records total formal-measurement duration.
- CMC: the assessment stopwatch is the RaPS **Overall Tactical Trauma Assessment** clock and retains the ≤30:00 pass standard.
- The stopwatch must be started and stopped before the record can be finalized. This ensures the same duration field exists at Baseline, 3-Month, and 6-Month.
- Skill-specific clinical clocks remain separate from the overall stopwatch. For example, the TQ 1-minute/3-minute standards and NDC 5–10 second hold still have their own clocks.

### Longitudinal participant record

The dashboard now contains a **Longitudinal Participant Records** section. Participants are linked across study events by the normalized `Participant ID`.

Opening a participant record provides:

- Baseline, 3-Month, and 6-Month measurement cards side-by-side
- score and final result at each timepoint
- critical-failure count
- assessment stopwatch duration
- event/date context
- criterion-by-criterion Baseline → 3-Month → 6-Month comparison
- filters for all criteria, any failure, changed over time, or critical criteria only
- direct access back to the underlying measurement
- participant-level longitudinal CSV export

**Operational rule:** use the exact same Participant ID at every timepoint. Do not use names as the linking key.

## Study skills included

1. **Two-Handed Windlass Tourniquet** — 15 source criteria from the TQ skill sheet. Source timing standards: steps 1–7 within 1 minute and total process/documentation within 3 minutes.
2. **Nasopharyngeal Airway (NPA) Insertion** — 13 source criteria.
3. **Needle Decompression of the Chest (NDC)** — 15 source criteria, including the 5–10 second catheter hold.
4. **Administration of Blood Products** — 26 source criteria.
5. **CMC — Full RaPS Tier 3** — complete RaPS CMC criterion set described above.

## Scoring model

The scoring behavior stays similar to the RaPS evaluator:

- `PASS` = criterion met.
- `FAIL` = criterion not met.
- `NT` = noncritical criterion not elicited by the approved scenario; excluded from the percentage.
- `N/O` = not observed / unresolved; blocks finalization.
- Percentage = PASS / (PASS + FAIL).
- Final PASS requires **>=75%**, **zero failed critical criteria**, and any required global timing standard met.
- Every FAIL must be classified before finalization.

### Required FAIL workflow — exactly 5 + 5

**Step 1 — exactly five failure modes**

1. Not performed / incomplete
2. Incorrect technique
3. Timing / sequence
4. Unsafe action
5. Other / unclear

**Step 2 — exactly five primary contributors**

1. Knowledge / cue recognition
2. Judgment / prioritization
3. Psychomotor execution
4. Communication / teamwork
5. System / performance context

`Other / unclear` requires an objective comment. The legacy RaPS failure/root-cause lists are not displayed in the live study evaluator.

## Study and organizational fields

Each event stores study arm, study timepoint, MAJCOM/supported command, home installation, unit/organization, training location, evaluator ID, scenario/version, skill module, and source version.

Each participant stores Participant ID, AFSC, clinical years of experience, work section, optional rank, and intervention exposure (practice sessions, repetitions, coaching events, trials-to-mastery, and intervention minutes). Exposure fields never alter the formal score.

## Management intelligence

The dashboard retains descriptive rollups by MAJCOM, installation, skill, study arm, and timepoint. It reports finalized measurements, pass rate, critical-failure rate, mean score, classification completeness, criterion gaps, primary contributors, and arm/timepoint summaries.

## Storage and study-data caution

With the backend disabled, working records are stored in browser `localStorage`. When the dedicated FieldReady NUC backend is enabled, local storage becomes the offline working copy and authorized server records become the central persistence layer. Export/backup on the approved study schedule. Use Participant ID rather than names in research records whenever the protocol permits.

## GitHub Pages deployment

No Node/npm build is required.

1. Create or empty a GitHub repository.
2. Upload **all files and folders from this repository to the repository root**.
3. GitHub → **Settings → Pages**.
4. Source: **Deploy from a branch**.
5. Branch: `main`.
6. Folder: `/(root)`.
7. Save.

`.nojekyll` is included for direct static serving.

## Validation and change control

Run:

```bash
python tests/static_validate.py
```

The validation suite checks the 5×5 FAIL taxonomy, target skill counts, full CMC ID sequence, CMC clocks, universal stopwatches, and longitudinal-record UI hooks. See `VALIDATION.md`, `SOURCE_MAPPING.md`, and `DATA_DICTIONARY.md`.

Do not alter source criteria, critical flags, clinical timing standards, study-arm logic, finalization rules, or failure taxonomy during an active cohort without documented PI review and re-calibration when applicable.

## Access

The current app requires a Supabase account with an active FieldReady profile. Access requests require administrator approval; there is no shared testing password. Database RLS enforces account scope. Browser code contains only the public anonymous key, never a service-role credential. The acknowledgement warning accompanies login.
