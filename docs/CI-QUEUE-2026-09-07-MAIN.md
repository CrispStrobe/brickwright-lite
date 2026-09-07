# CI queue, part 2 — main: build.yml's per-commit runs on 2026-09-07 (00:00 – 13:53 UTC)

Asked by lego-ac on 2026-09-07 after main queued several per-commit runs at once while the
fleet's branch runs waited behind them. Part 1 (docs/CI-QUEUE-2026-09-07.md) covered the
previous 24 hours across the account and found the wait was mostly GitHub's runner allocation,
not our own runs. This part asks a narrower question about today: **how much of the waiting was
main's own superseded runs, and what would each way of cutting them cost in evidence.** It is a
proposal with numbers; no policy changes here. The owner decides.

Everything is read from the Actions API (`/actions/runs?created=2026-09-07`, then
`/actions/runs/{id}/jobs` for every run), snapshot 13:53 UTC. The script is not committed; the
definitions are stated so the numbers can be redone.

**Definitions.** *Queue wait* = a run's first non-`needs:` job `started_at` minus the run's
`created_at`. *Wall* = last job completed minus created. *Runner-minutes* = job durations
summed. A main run is *superseded before start* when a newer main run was created before its
first job started, and *superseded before end* when one was created before its last job
finished. Runner-minutes *after supersession* are the minutes a run's jobs spent after the newer
run appeared — what a cancelling group would have stopped.

## 1. Main today, in numbers

| measure | value |
|---|---|
| main commits today (git, 92) that started a run | 42 runs (the other 50 were pushed together with a head that ran, or were prose-only and skipped by the paths filter) |
| runs by conclusion | success 33, failure 5, cancelled 3 (by hand), in progress 1 |
| queue wait: median / p90 / max | **8.5 / 27.7 / 68.6 min** (part 1's 24 h: 0.1 / 5.6 / 23.7) |
| total queue wait, main runs | 521 min |
| wall (created → last job done): median / p90 / max | 21.2 / 43.4 / 84.9 min, for a job body that runs in 9–10 |
| runner-minutes, main | 1082 |
| superseded before START | **16 of 42** — 437 runner-min; 13 ran to a verdict, 3 were cancelled by hand |
| superseded before END | **31 of 42** — 821 runner-min, of which **640 spent after the newer run appeared** |
| peak open main runs (queued or running) at one moment | 4 (05:53); peak open build.yml runs on all branches 12 (08:15), 3 of them main |

The worst run of the day, 119d509b3 at 07:03, waited 68.6 minutes; two newer main runs had
been created before it started. It succeeded.

## 2. Who waited behind whom

87 branch runs today: queue wait median 1.0, p90 15.8, max 40.6 min, 489 min in total. Sampling
every 30 s across every branch wait over a minute (976 samples):

| during a branch run's wait | share of samples |
|---|---|
| a main job was running | 63 % |
| a **superseded** main job was running | **55 %** |
| nothing of ours was running anywhere on the account | 8 % |

Part 1's window was the opposite (33 % behind nothing, 10 % behind superseded work). Today the
fleet landed faster than main could verify, and the wait was ours: for more than half of every
minute a branch run spent queued, a main run whose commit had already been superseded held a
runner.

The 11:54–12:01 burst is the whole shape in seven minutes. Four main pushes (ac15b8295,
3073fc103, f0d7f0dec, 9d8e54319) waited 27.7, 33.5, 34.2 and 40.9 minutes; two were cancelled
by hand after 35 and 29 runner-minutes each; the two branch runs created behind them
(lane/editor-wait-siblings, lane/n11-costing) waited 40.6 and 31.0 minutes. Nine at once was
not observed on main (peak 4); twelve build.yml runs were open at 08:15, three of them main —
the "nine" is likely the Actions list counting every workflow (vendor-freshness and
ci-cost-metrics run every few minutes).

## 3. Five runs verified a plan edit

Five of today's main runs (dd4ab95c7, 6d49a5be4, 9bbf5ad55, 9d98aa9eb, a387e23cf) changed only
docs/LANGUAGE-DEVICE-MATRIX-PLAN.md (one of them LANES.md beside it). They cost 127
runner-minutes and three of them were created while an older main run was still open. The plan
is in the push trigger's re-include list because scripts/gen-reader-coverage.mjs:171 and
scripts/gen-language-device-matrix.mjs:97 print its name inside a template string — the
generated markdown says "Plan: docs/LANGUAGE-DEVICE-MATRIX-PLAN.md" — and doc-triggers counts
any non-comment mention, deliberately, so the rule errs toward building. Nothing reads the plan.

## 4. What each option would have bought today, and what it costs in evidence

| option | would have saved today | costs |
|---|---|---|
| **A. cancel a queued main run when a newer main run is queued and the older has not started** (`cancel-in-progress` cannot express this; it is a small job at the top of the workflow that lists queued runs on main and cancels older ones, or a scheduled sweeper) | 16 runs, **437 runner-min**, and their place in the queue: the 55 % of branch waiting spent behind superseded main jobs is mostly these | 13 verdicts. Four of the sixteen were red. 3d5676c3a (fix(i8086): vendor the C toggle repair) went red at 11:01, 5ac83c663 (a LANES row) red at 11:02, 851ff42b8 (T11) red at 11:10 — the same break carried forward. Under A the first two are cancelled and the first red main run is 851ff42b8: the fleet would have been told **T11 broke main** when the i8086 vendor commit did, and the bisect starts one commit late. Once a day, by today's count |
| **B. per-branch cancelling group on main too** (the `concurrency` expression already does this for every other ref) | 31 runs superseded before end, **640 runner-min** spent after the newer run appeared, and nearly all of the 55 % | 31 of 42 verdicts — three of every four main commits today would have no run of their own. LANES chose the per-commit verdict on purpose; part 1 already priced this at 281 min a day and left it to the owner. Nothing today changes that reading except the wait share: today it was 55 %, in part 1's window 10 % |
| **C. "docs-only landing skips the run", narrowed from mention to read** — doc-triggers keeps counting mentions, but a doc whose only mentions are inside string literals that are *written out* (a generator printing its own provenance) is waived by name in the list, and build-trigger-paths reddens if such a doc later gains a real read | 5 runs, **127 runner-min**, three of them created into a queue that already held an older main run | nothing in verdicts (no code reads the plan). The cost is one more rule in a filter that is already the most-commented block in build.yml, and a waiver list that must stay derived: if it is hand-maintained it is the thing plan T12 just removed from the budgets |
| **D. land one at a time** — a fleet rule, no CI change: the coordinator lands the next lane when the previous main run has *started* (not finished), and never four in seven minutes | the 11:54 burst becomes four runs each waiting for a runner rather than for each other: today that is at least the 2 hand-cancels (64 runner-min) and the 40-minute branch waits behind them; harder to price exactly because it changes the arrival pattern, not the work | no evidence at all. It costs the landing agent a wait of ~1–10 min per landing (main's median wait 8.5 min today), which is the wait the branch runs currently pay instead |

**What I would put to the owner.** D first, because it is free and it is the pattern the burst
shows; then C, because verifying a plan edit five times a day is a run no one asked for and the
waiver is testable; then A only if the owner accepts that the first red run after a break can
name the wrong commit once a day. Not B: today's 55 % is real, but it is the same trade part 1
declined at 10 %, and the fleet's bisects lean on the per-commit verdict.

## Appendix A: every main run today

wait = created → first job started; "newer" = main runs created after this one and before it
started / before it finished.
| created (UTC) | run | head | wait min | wall min | runner-min | newer main runs queued before it started / finished | conclusion |
|---|---|---|---|---|---|---|---|
| 09-07 00:43 | 34070714079 | 4f914e3f1 | 3.5 | 14.2 | 24.2 | 0 / 0 | success |
| 09-07 01:45 | 34074046052 | c3b30a587 | 0.1 | 9.6 | 27.5 | 0 / 0 | success |
| 09-07 02:40 | 34077055251 | 71e852d16 | 0 | 7.6 | 24.3 | 0 / 1 | success |
| 09-07 02:46 | 34077389480 | dd4ab95c7 | 0 | 9.3 | 25.8 | 0 / 0 | success |
| 09-07 03:05 | 34078436706 | afec18c5a | 0 | 9.8 | 25.7 | 0 / 0 | success |
| 09-07 05:13 | 34085979606 | a387e23cf | 0.1 | 8.4 | 26 | 0 / 0 | success |
| 09-07 05:23 | 34086601563 | 6d49a5be4 | 0.1 | 8.3 | 24.4 | 0 / 0 | success |
| 09-07 05:46 | 34088104142 | 0f53688ef | 9.7 | 21.2 | 26.1 | 3 / 3 | success |
| 09-07 05:47 | 34088166224 | 4b941539d | 16.8 | 34.7 | 25.9 | 2 / 3 | success |
| 09-07 05:48 | 34088212038 | da4d30b0c | 26.1 | 36.6 | 32.4 | 1 / 2 | cancelled |
| 09-07 05:53 | 34088520489 | d6773184b | 22.2 | 37.6 | 26 | 0 / 1 | success |
| 09-07 06:17 | 34090143035 | fbee03c41 | 7.3 | 17.8 | 25.2 | 0 / 0 | success |
| 09-07 06:49 | 34092576969 | 3d84eef62 | 11.4 | 52 | 26.2 | 1 / 2 | success |
| 09-07 06:50 | 34092619695 | 9bbf5ad55 | 16.3 | 30.2 | 25.7 | 1 / 1 | success |
| 09-07 07:03 | 34093588436 | 119d509b3 | 68.6 | 84.9 | 26.4 | 2 / 3 | success |
| 09-07 07:51 | 34097534401 | 920e5ff14 | 27.3 | 37.6 | 25.8 | 1 / 2 | failure |
| 09-07 08:00 | 34098323626 | ef376fd66 | 25 | 35.5 | 25.3 | 1 / 1 | success |
| 09-07 08:19 | 34099997406 | e6037bc84 | 16.7 | 28 | 25.3 | 0 / 2 | success |
| 09-07 08:39 | 34101768263 | 67fcc8cc7 | 2.4 | 10.4 | 24.6 | 0 / 2 | success |
| 09-07 08:45 | 34102279913 | f2ced1fa1 | 5 | 16.2 | 25.4 | 1 / 2 | failure |
| 09-07 08:47 | 34102511627 | 37d337935 | 10 | 21 | 24.6 | 0 / 1 | success |
| 09-07 09:00 | 34103619336 | 50838bc9c | 4.9 | 21.7 | 25.1 | 0 / 2 | success |
| 09-07 09:11 | 34104646467 | dd78117c4 | 5.7 | 17.1 | 26.4 | 0 / 1 | success |
| 09-07 09:19 | 34105342861 | 45fe94bb7 | 10.3 | 21 | 25.5 | 0 / 1 | success |
| 09-07 09:34 | 34106774962 | 3ecb72b7c | 16.6 | 27.7 | 26.3 | 1 / 1 | success |
| 09-07 09:48 | 34108111864 | dc9e44951 | 11.3 | 33.5 | 27.8 | 0 / 1 | success |
| 09-07 10:21 | 34111028136 | 256be3925 | 3.7 | 16 | 24.3 | 0 / 2 | success |
| 09-07 10:28 | 34111628699 | 491007b3e | 4 | 13.2 | 24.2 | 0 / 1 | success |
| 09-07 10:35 | 34112210638 | 39688b024 | 1.9 | 14.6 | 26.7 | 0 / 1 | success |
| 09-07 10:46 | 34113154528 | e42b6bebb | 0.9 | 43.4 | 27.2 | 0 / 3 | success |
| 09-07 11:01 | 34114426126 | 3d5676c3a | 2.3 | 20.6 | 25.9 | 1 / 2 | failure |
| 09-07 11:02 | 34114583082 | 5ac83c663 | 10.3 | 22 | 27.8 | 1 / 1 | failure |
| 09-07 11:10 | 34115247607 | 851ff42b8 | 5.4 | 16.6 | 24.3 | 0 / 0 | failure |
| 09-07 11:32 | 34117114146 | c60f827b9 | 0.1 | 15.1 | 27.8 | 0 / 0 | success |
| 09-07 11:54 | 34118997841 | ac15b8295 | 27.7 | 37.6 | 27.1 | 3 / 3 | success |
| 09-07 11:57 | 34119286701 | 3073fc103 | 33.5 | 43.2 | 35.4 | 2 / 2 | cancelled |
| 09-07 12:00 | 34119557638 | f0d7f0dec | 34.2 | 50.9 | 28.9 | 1 / 1 | cancelled |
| 09-07 12:01 | 34119648099 | 9d8e54319 | 40.9 | 52.6 | 27.8 | 0 / 0 | success |
| 09-07 13:02 | 34125145315 | e9564e30e | 9.4 | 27 | 26.6 | 1 / 2 | success |
| 09-07 13:11 | 34126007655 | 9d98aa9eb | 14.3 | 28.6 | 24.9 | 0 / 2 | success |
| 09-07 13:28 | 34127563907 | 88ec1cd05 | 8.5 | 20.1 | 27.1 | 0 / 1 | success |
| 09-07 13:37 | 34128478139 | cfe10b5c7 | 7.1 | 12.4 | 2.2 | 0 / 0 | in_progress |


## Appendix B: branch runs that waited over five minutes

"main runs open" = main runs queued or running at the moment this run was created; "superseded"
= of those, the ones a newer main run had already replaced.
| created (UTC) | run | branch | wait min | main runs open at creation | of which superseded |
|---|---|---|---|---|---|
| 09-07 00:01 | 34068483703 | land/pin86 | 15.8 | 0 | 0 |
| 09-07 05:49 | 34088274536 | ci/branch-concurrency | 15.8 | 3 | 2 |
| 09-07 06:21 | 34090451091 | pin/bw-board-d5850e6 | 9.2 | 4 | 3 |
| 09-07 06:29 | 34091035469 | n2b/int16 | 5.9 | 2 | 1 |
| 09-07 07:08 | 34094039616 | vendor/absent-by-design | 6.4 | 3 | 2 |
| 09-07 07:16 | 34094674126 | fix/preset-rom-404s | 7 | 3 | 2 |
| 09-07 07:17 | 34094775327 | lane/rom-census-widened | 13.4 | 3 | 2 |
| 09-07 07:21 | 34095108265 | vendor/reseat-gate-forward | 12.8 | 2 | 1 |
| 09-07 07:44 | 34096927027 | lane/p6-rom-boot-media | 29.1 | 1 | 0 |
| 09-07 07:48 | 34097325681 | lane/flake-raw-stdout | 31.9 | 1 | 0 |
| 09-07 07:49 | 34097420278 | lane/t9-pin-chain | 26.9 | 1 | 0 |
| 09-07 08:00 | 34098309971 | lane/t9b-pin-only-with-flag | 29.7 | 2 | 1 |
| 09-07 08:15 | 34099637951 | lane/n3d-sim-transport | 17.5 | 3 | 2 |
| 09-07 08:15 | 34099663532 | ci/pin-readers-actually-run | 13.3 | 3 | 2 |
| 09-07 09:15 | 34104957933 | ci/pin-readers-actually-run | 5.8 | 2 | 1 |
| 09-07 09:21 | 34105554295 | fix/kaluma-probe-says-what-it-saw | 16.5 | 3 | 2 |
| 09-07 09:21 | 34105563647 | t9b/flasher-dir-sha | 15.2 | 3 | 2 |
| 09-07 09:30 | 34106429298 | lane/n2c-i8086-c-wait | 12.5 | 1 | 0 |
| 09-07 09:42 | 34107521735 | lane/t10-notices-drift | 11.5 | 1 | 0 |
| 09-07 09:48 | 34108054396 | lane/chip-refusal-port-63h | 12.9 | 1 | 0 |
| 09-07 09:49 | 34108193261 | lane/species-29-silent-edit | 12.1 | 2 | 1 |
| 09-07 09:49 | 34108194413 | lane/nul-bytes | 13.8 | 2 | 1 |
| 09-07 10:09 | 34109917252 | lane/t10-notices-drift | 5.4 | 1 | 0 |
| 09-07 10:58 | 34114204203 | pin/bw-board-5547d43 | 5.8 | 1 | 0 |
| 09-07 11:42 | 34118012654 | lane/n10-export-fill | 5.2 | 1 | 0 |
| 09-07 12:08 | 34120229519 | lane/editor-wait-siblings | 40.6 | 4 | 3 |
| 09-07 12:25 | 34121758874 | lane/n11-costing | 31 | 4 | 3 |
| 09-07 13:01 | 34125073038 | lane/n2d-i8086-c-print-v4 | 9.3 | 0 | 0 |
| 09-07 13:18 | 34126647806 | lane/t12-gate-budgets | 6.2 | 2 | 1 |

