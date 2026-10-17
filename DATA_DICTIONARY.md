# FieldReady Study Data Dictionary — v4.1.0

## Longitudinal identity

`participantId` is the longitudinal linkage key. The application normalizes it to uppercase for comparison. **Use the same Participant ID at Baseline, 3-Month, and 6-Month.** Names are not required for longitudinal linkage.

## Event fields

- `id` — app-generated event UUID
- `name` — study event/class name
- `date` — event date
- `timepoint` — `baseline`, `3-month`, or `6-month`
- `studyArm` — `Control`, `Frequency-Based`, or `Deliberate Practice`
- `majcom` — command/MAJCOM identifier
- `homeInstallationId`, `homeInstallationName` — participant/event home installation context
- `unit` — organization/unit
- `trainingLocation` — physical training/evaluation location
- `skillId` — `TQ`, `NPA`, `NDC`, `BLOOD`, `CMC`, `ASM`, `CLS`, or `CPP`
- `scenarioVersion` — approved scenario/version
- `leadEvaluator`, `evaluatorId` — evaluator metadata

## Participant fields

- `id` — app-generated event-roster UUID
- `participantId` — protocol participant identifier; longitudinal key
- `afsc`
- `clinicalYears`
- `workSection`
- `rank` — optional
- `intervention.sessions`
- `intervention.repetitions`
- `intervention.coachingEvents`
- `intervention.trialsToMastery`
- `intervention.trainingMinutes`

## Evaluation fields

- `evaluation.id`
- `evaluation.startedAt`
- `evaluation.finalizedAt`
- `evaluation.finalResult` — `PASS` or `FAIL`
- `evaluation.ratings[criterionId]` — `pass`, `fail`, `nt`, or `no`
- `evaluation.failureDetails[criterionId]` — required for each FAIL
- `evaluation.ntReasons[criterionId]`
- `evaluation.evaluatorName`
- `evaluation.evaluatorId`
- `evaluation.notes`
- `evaluation.appVersion`
- `evaluation.skillSource`
- `evaluation.scenarioVersion`

## Assessment stopwatch

Every evaluation stores:

- `evaluation.stopwatch.elapsedMs` — continuous total formal-assessment time
- `evaluation.stopwatch.running`
- `evaluation.stopwatch.startedAt`
- `evaluation.stopwatch.stoppedAt`
- `evaluation.stopwatch.completed`

The stopwatch must be completed before finalization. For TQ/NPA/NDC/Blood it is descriptive study timing. For CMC the stopwatch is also the RaPS overall TTA timing standard (≤30:00).

## Clinical timers

`evaluation.timers[timerId]` stores `elapsedMs`, `running`, `startedAt`, `completed`, and `valid`. These are separate from the overall assessment stopwatch.

TQ: `TQ-1MIN`, `TQ-3MIN`  
NDC: `NDC-HOLD`  
CMC: `cmc_cuf_tq`, `cmc_wound_pressure`, `cmc_ndc_hold`, `cmc_hts_admin`, `cmc_hts_repeat`, `cmc_neuro_reassess`

## Failure details

Each failed criterion requires:

- `mode` / `modeLabel` — one of five failure modes
- `contributor` / `contributorLabel` — one of five primary contributors
- `comment` — required when mode = `other-unclear`; otherwise optional objective detail
- `at` — timestamp

## Longitudinal comparison behavior

The participant record groups all roster instances sharing the same normalized `participantId`. For a selected skill it displays Baseline, 3-Month, and 6-Month. Formal comparisons require exactly one classified finalized assessment for the selected type at each timepoint. Duplicate measurements require review; the interface never automatically substitutes the latest or best attempt. Historical assessments without classification remain unclassified.

Exports include the assessment-stopwatch duration in seconds and preserve event/timepoint context so external statistical software can perform repeated-measures analysis.

## Study record fields

- `participant.enrollment`: stable `id`, `arm`, `enrolledDate`, `trainingDate`, `recordedAt`, and `recordedBy`; reused across roster entries. This is a shared client identity snapshot, not a database-enforced unique enrollment.
- `participant.trainingExposures[]`: session `id`, `date`, `skillId`, `type`, `minutes`, `repetitions`, `coachingEvents`, nullable `trialsToMastery`, `notes`, `recordedAt`, `recordedBy`. Legacy `intervention` totals remain separate.
- `evaluation.assessment`: `phase` (`baseline`, `pre`, `post`, `practice`, `retest`, or historical `unclassified`) and actual `date`. Missing metadata is not inferred.

See `STUDY_WORKFLOW.md` for analysis eligibility, export meanings, and remaining study activation requirements.

## Device synchronization metadata

Local `_serverRevision` and `_syncBaseline` fields record the server version and normalized last-pulled payload used for conflict detection. They are excluded from server participant/evaluation/event payloads and study CSVs. JSON backups may retain them for pending-work recovery. Only changed records are written. Existing records require a matching server revision in a conditional PATCH; a zero-row update is a conflict, not a successful save.
