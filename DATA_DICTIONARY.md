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
- `skillId` — `TQ`, `NPA`, `NDC`, `BLOOD`, or `CMC`
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

The participant record groups all roster instances sharing the same normalized `participantId`. For a selected skill it displays Baseline, 3-Month, and 6-Month. If more than one record exists at the same timepoint/skill, the interface prefers a finalized record and then the most recent event date. It does not average duplicate measurements automatically.

Exports include the assessment-stopwatch duration in seconds and preserve event/timepoint context so external statistical software can perform repeated-measures analysis.
