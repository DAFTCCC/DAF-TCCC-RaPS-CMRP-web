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
