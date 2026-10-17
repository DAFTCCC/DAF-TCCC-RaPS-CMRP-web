# Source Mapping — v4.1.0

This file records where the scored study content comes from. It is a content-control aid; final PI clinical approval remains required before study activation.

| Study module | App key | Controlled source used in FieldReady | App content |
|---|---|---|---|
| Two-Handed Windlass Tourniquet | `TQ` | Uploaded Module 6 Massive Hemorrhage Control skill sheet, Two-Handed (Windlass) Tourniquet Application in TFC | 15 criteria; source 1-minute and 3-minute clocks |
| Nasopharyngeal Airway | `NPA` | Uploaded Module 7 Airway Management in TFC, NPA Insertion | 13 criteria |
| Needle Decompression | `NDC` | Uploaded Module 8 Respiration Assessment and Management in TFC, NDC | 15 criteria; 5–10 second hold clock |
| Administration of Blood Products | `BLOOD` | Uploaded Module 11 Hemorrhagic Shock Fluid Resuscitation, Administration of Blood Products | 26 criteria |
| Combat Medic / Corpsman Tactical Trauma Assessment | `CMC` | DAF-TCCC-RaPS-WEB Tier 3 configuration for `TCCC-CMC-TTA-05-02 · 30 MAY 26` | Full `CMC-001`–`CMC-123` sequence plus `CMC-DAF-MACE2`; RaPS Tier 3 clocks |

## CMC baseline

RaPS reference used for CMC structure and timing:

- Live app: `https://daftccc.github.io/DAF-TCCC-RaPS-WEB/`
- Repository source: `https://github.com/DAFTCCC/DAF-TCCC-RaPS-WEB/`
- Tier configuration: `tiers.js`, Tier 3 / CMC

FieldReady intentionally carries **the entire RaPS Tier 3 CMC criterion sequence** rather than the smaller CMC representation in v4.0. Although the source title inside RaPS is “Tactical Trauma Assessment — Abbreviated,” this study build does not abbreviate the RaPS Tier 3 content further.

## CMC clock mapping

| App clock ID | RaPS label | Criterion | Standard |
|---|---|---|---:|
| assessment stopwatch | Overall Tactical Trauma Assessment | GLOBAL | ≤30:00 |
| `cmc_cuf_tq` | CUF Tourniquet — Bleeding Control | CMC-005 | ≤1:00 |
| `cmc_wound_pressure` | Wound Packing Pressure | CMC-014 | ≥3:00 |
| `cmc_ndc_hold` | NDC Catheter Hold | CMC-034 | 5–10 sec |
| `cmc_hts_admin` | Hypertonic Saline Administration | CMC-080 | ≥10:00 |
| `cmc_hts_repeat` | HTS Repeat Interval — if no response | CMC-081 | ≥20:00 |
| `cmc_neuro_reassess` | Neurologic Reassessment Interval | CMC-084 | 5–10 min |

## Universal assessment stopwatch

The study adds one continuous formal-assessment stopwatch to TQ, NPA, NDC, and Blood so that assessment duration can be compared longitudinally. This added stopwatch is a **study measurement field**; it does not create a new clinical pass/fail standard for those four modules. CMC is different: its overall stopwatch is the RaPS global TTA clock and therefore retains the ≤30-minute pass rule.

## Added RaPS modules (v4.4.0)

Imported from `DAFTCCC/DAF-TCCC-RaPS-WEB`, commit `c7226cf34d452efbfa3ff27d64a18490fe9b1642` (RaPS `3.4.12-web.7`). `raps-skills.js` preserves the complete upstream tier sections, item IDs, text, critical flags, provenance, source references, and timer definitions. The adapter converts timer seconds to milliseconds and maps each global timer to the assessment stopwatch. Each module retains the 75% threshold, critical-failure rule, and required global timing rule. Existing study skills remain unchanged.

| Module | RaPS tier | Criteria including DAF supplements | Clinical timers | Global timer |
|---|---|---:|---:|---|
| ASM | 1 | 33 | 2 | ≤30 minutes |
| CLS | 2 | 71 | 2 | ≤30 minutes |
| CPP | 4 | 124 | 8 | ≤30 minutes |

CPP's optional ketamine/analgesia clocks retain their upstream `requiredForPass: false` status; they do not independently block a linked PASS without a completed optional clock. Running clocks still must stop before finalization. `tests/raps_skills.cjs` checks the pinned source digest, exact sections, links, and converted standards.
