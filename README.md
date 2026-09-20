# FieldReady Longitudinal Competency Study — Web/PWA v4.1.0-study-web

FieldReady is a **static GitHub Pages evaluator and longitudinal study prototype**. It uses the DAF TCCC RaPS web app as the workflow/management baseline—event creation, MAJCOM and installation organization, roster workflow, criterion-level scoring, timers, local analytics, and export—while limiting the formal study measurements to the five approved study skill sets.

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

This repository is a static/offline-capable prototype. Working records are stored in browser `localStorage`; this is **not** an authoritative enterprise research database. Export/backup on the approved study schedule. Use Participant ID rather than names in research records whenever the protocol permits.

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

## Splash-page password gate (v4.1.1)
The splash page now requires both the authorization acknowledgement and an access password. The temporary testing password is `FieldReady2026!`. Change it before real study use by replacing `passwordHashSha256` in `access-config.js` with the SHA-256 hash of the desired passphrase. Authentication is stored only in `sessionStorage`; closing the browser/tab session or pressing **Lock** requires the password again.

**Security boundary:** GitHub Pages is static public hosting. A client-side password gate is a useful casual-access deterrent, but it is not strong authentication and must not be treated as protection for sensitive, regulated, CUI, PHI, or authoritative research records. For controlled study access, use an approved authenticated hosting environment/backend.
