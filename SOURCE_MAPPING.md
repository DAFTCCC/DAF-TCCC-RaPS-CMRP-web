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

- Live app: `https://afomsteam.github.io/DAF-TCCC-RaPS-WEB/`
- Repository source: `https://github.com/afomsteam/DAF-TCCC-RaPS-WEB/`
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
