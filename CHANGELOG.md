# Changelog\n\n## 4.2.0-study-web — 2026-09-23\n\n- Added disabled-by-default FieldReady NUC/Supabase backend configuration.\n- Added local-first synchronization states and top-bar status control.\n- Added Supabase Auth sign-in/sync panel when backend is enabled.\n- Added dedicated `fr_*` database schema, RLS scope model, server revisions, finalized-record lock, and audit log foundation.\n- Protected already-finalized server evaluations from repeat client upserts.\n- Kept RaPS separate and unchanged.\n\n# Changelog

## 4.1.0-study-web — 2026-09-18

- Replaced the v4.0 reduced CMC representation with the complete RaPS Tier 3 criterion sequence: CMC-001 through CMC-123 plus the RaPS DAF supplemental MACE 2 item.
- Restored the RaPS H/H2 split and individual antibiotic criteria instead of merged rows.
- Matched the CMC clock set to the RaPS Tier 3 configuration: overall 30-minute TTA, CUF TQ ≤1 minute, wound pressure ≥3 minutes, NDC hold 5–10 seconds, HTS ≥10 minutes, HTS repeat ≥20 minutes, and neurologic reassessment 5–10 minutes.
- Added an overall running assessment stopwatch with START/STOP controls to all five study modules.
- Required the assessment stopwatch to be completed before formal finalization so duration is available at every longitudinal timepoint.
- Added participant-level longitudinal records linked by Participant ID across Baseline, 3-Month, and 6-Month.
- Added criterion-level longitudinal comparison, timepoint cards, direct measurement reopening, and participant longitudinal CSV export.
- Added migration for v4.0 local CMC rating IDs and legacy timer IDs while retaining the existing localStorage database key.
- Fixed timer-button rebinding during live clock updates so STOP remains clickable while the display is running.

## 4.0.0-study-web — 2026-09-18

- New study-focused static web repository using RaPS-style event, MAJCOM, installation, roster, analytics, and export concepts.
- Added TQ, NPA, NDC, Blood Administration, and CMC study modules.
- Enforced exactly five failure modes followed by exactly five primary contributors.

## 4.1.1-study-web
- Added splash-page research access password gate.
- Password is verified against a SHA-256 hash; plaintext is not stored in the repository.
- Unlock is session-scoped via `sessionStorage`.
- Added top-bar **Lock** button for immediate re-lock.
- Added explicit static-hosting security boundary to README.
