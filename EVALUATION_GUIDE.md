# Decision-maker evaluation — FieldReady web

The web app is the evaluation platform. Android development follows this review. Use synthetic participant IDs and record the app version, device/browser, account role, steps, expected behavior and actual behavior with each finding. A screenshot or a synthetic export helps reproduce it.

## Grade an assigned evaluation

Sign in as an evaluator, open an assigned class, and grade a synthetic participant. Check source criteria and critical flags against the approved skill sheet. Verify START/RESUME is green, STOP/completion is red, disabled controls are gray, and all timing buttons can be tapped comfortably. The clock display should update without replacing controls or interrupting typing.

Keep the evaluation open for at least two minutes. Change sections, type notes, switch away and back, and briefly disconnect/reconnect. Background synchronization remains paused throughout grading and review. Notes, ratings, focus, section and scroll position should stay in place. Refreshing the browser itself interrupts active timing and requires recovery; it is different from switching apps.

Complete a clinical timer at its source boundary and deliberately miss another. Confirm the classification workflow, NT/N/O handling, critical failure rule, required timing, and finalize lock. Active or paused clinical timers must be stopped or voided with a reason before resetting. Finalization explicitly attempts synchronization; an offline finalization stays saved locally until synchronization succeeds.

## Roles and scope

| Role | Expected review |
| --- | --- |
| Evaluator | Sees assigned events and grades their participants; cannot administer users or create events. |
| Program Manager | Manages events/team in the assigned installation and command. |
| MAJCOM Manager | Manages events/team in the assigned command. |
| Enterprise | Manages accounts and enterprise scope; can promote an existing approved account to Enterprise. New invitations/approvals offer the three roles supported by the server. |

On a shared browser, leave an evaluation unfinished, lock, and sign in as an account with different assignments. The new account should receive its own scope. The previous account's unsynchronized work is retained in its pending-work recovery backup rather than appearing in the new account's view. Sign back in as that owner to retrieve the recovery backup from the sync panel.

## Study data, devices and exports

Record post-training baseline and separate before/after reinforcement follow-ups for the same participant and skill. Verify enrollment, assigned arm, actual dates, source/scenario version and dated exposure minutes/repetitions. Missing or ambiguous measurements should be excluded from matched comparisons, not treated as zero or replaced by the latest attempt.

Before offline use, sign in and load assignments. Grade and save offline, finalize when appropriate, and return to the dashboard/roster to synchronize once connected. Check every grading device finishes synchronization before refreshing the collecting manager's device. Compare the same event's CSV on two authorized devices. Review PDF criterion/failure detail and try sharing the actual attachments on the intended phone/tablet.

During this web evaluation, CSV/PDF downloads still require a fresh server synchronization; JSON Backup provides an offline copy. NUC records, the existing class-close CSV archive, and browser-local CSV/PDF generation retain their current behavior. Server-free file collection/import and Android packaging are future decisions, not features of this review build.

## What local testing establishes

Automated checks cover source parity, score/timer rules, all four role interfaces, offline persistence, sync conflicts, account switching and CSV/PDF/share paths. Local browser services model authorization; they do not prove which RLS policies, gateway behavior or credentials are installed on the NUC. Complete the role/device exercise against the actual NUC using approved test accounts. Investigator review of clinical criteria and the study protocol is a separate evaluation item.
