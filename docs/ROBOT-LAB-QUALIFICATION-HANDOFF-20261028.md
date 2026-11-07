# Robot Lab qualification, rotor inertia and #1435: handoff (2026-10-28)

This handoff is for a fresh agent. It covers four open work streams: model
qualification, geometry and collider repairs, the rotor-inertia fix (#1494), and
the resting-frame creep (#1435). Each section states what is done, what is open,
and the exact next actions. Refresh every PR head and check before you act. The
state below was true when this was written and will drift.

## Standing rules (apply to every task below)

- **Lanes.** Read `LANES.md` and `lanes/PROTOCOL.md`. Merge the applicable
  scope claim before new source implementation. Existing published work is not
  discarded to repair its historical claim sequence. Carry an explicitly
  delegated continuation in an owned isolated worktree; preserve other owners'
  unpublished source, branches and original evidence. Refresh live ownership
  before treating a snapshot's open task as unclaimed.
- **CI and `ci:full`.**
  - Iterate without the `ci:full` label and let the unit shards run.
  - Admit the actual opened-event scope before adding `ci:full` **once** on
    the final candidate. Browser shards, saved-project replay and export require
    the applicable thorough tier. Do not repeat a one-shot label, dispatch or
    Ready cycle; substantive successors use ordinary synchronize events.
  - The `full CI requested` check fails on code PRs without the label. That is
    the gate working, not a test failure, and such a PR cannot merge.
  - Label events create their own runs. Current concurrency distinguishes
    those from code events; do not assume a label cancels the preceding run.
    Bind each enabled result to its actual event, head, checkout and tree.
- **Merging.**
  - Use `gh pr merge N --merge --match-head-commit <sha>`, and only after every
    enabled check on that exact head is SUCCESS. Only conditional jobs and
    matrix template placeholders may be skipped.
  - Afterwards, verify that the merge commit's parents are main and the head,
    and that its tree equals `git merge-tree --write-tree <parents>`.
  - No force-push, no auto-merge, no duplicate dispatches.
- **Keeping up with main.** Don't re-merge main just because it moved. Do it
  only when GitHub reports a conflict, or when main changed files your PR
  touches or the qualification harness and its data.
- **Thresholds and evidence.**
  - Never weaken a tolerance, baseline or assertion to get green. A model that
    honestly fails stays experimental, with the reason recorded in
    `docs/data/robot-lab-experimental-checkpoint.json`.
  - Controls are never promoted.
  - Gates such as `savedProjectReplay`, per-model browser runs, export and
    manual controls stay `NOT_RUN` unless they actually ran. Say so in the
    checkpoint and contract (see Samebeat's `notRun`).
- **Engine tests.** A test that imports `jolt-physics` must be listed in
  `scripts/lib/gui-scope-allowed.json`, under `jolt-physics/wasm-compat` and/or
  `jolt-physics/wasm-simd-compat`. Unit tests must not write raw stdout; use
  `t.diagnostic`.
- **Fixture location.** Don't put diagnostic `.ldr` files under
  `test/fixtures/bw-sim/`, because `test/bw-sim-models-solid.test.mjs` scans
  that folder as buildable models.
- **CI is slow.** A unit round has waited 2–3 hours in the queue. Plan for it,
  and don't open more parallel PRs than you can land.

## How a model is qualified

The pieces:
- the contract in `docs/data/robot-lab-qualification.json`;
- a judge registered in `QUALIFICATION_JUDGES` (`scripts/lib/robot-lab-qualification.mjs`).
  Judges live in per-batch modules such as `scripts/lib/sim-lab-batch3-judges.mjs`
  and `scripts/lib/sim-lab-hubless-judges.mjs`;
- the harness `scripts/qualify-robot-lab-models.mjs`;
- the test `test/bw-sim-qualification.test.mjs`;
- the registry `MODELS` in `overlay/scratch-gui/src/lib/bw-sim/sim-session.js`;
- the experimental list in `overlay/scratch-gui/src/lib/bw-sim/model/experimental-models.js`;
- the catalogue and lessons, regenerated with the generators.

A promotion needs all of these to pass:
- the model's physical law, predicted from the compiled model;
- the frozen-output and 1 cm world-shift negative controls;
- a disconnection control: removing the causal part must break the law;
- the solid-construction suite.

Precedents to read first: #1446, #1455, #1483 (Samebeat), #1496 (Pivot Exchange,
plus hubless and motorless contract paths) and #1497.

Editing `scripts/lib/robot-lab-qualification.mjs`:
- Model PRs may add **only** their judge-module import and judge ids to
  `QUALIFICATION_JUDGES`.
- Validation logic belongs to the hubless-harness lane
  (`lanes/2026-10-27-robot-lab-hubless-harness.md`).
- When merging main, keep every side's entries.

## 00. Status and pending tasks, 2026-11-03 (read this first)

The owning agents stopped on the weekly usage limit. Everything below is
unowned and ready for a fresh agent. Refresh `origin/main`, PR heads and checks
before acting; another agent may have finished an item. Claim each task with
a `lanes/` file in the same PR as the change (see the existing
`lanes/2026-11-0*-robot-*.md` files for the format).

Merged since section 0: #1636 (batch A/B judges; promoted Poise, Bend Ripple,
Offset Relay, Rack Decoder, Remote Pivot, Schmidt Shift, Equal Share, Stroke
Shift, Triad Table), #1640 (disconnection checks; promoted Kestrel, Meridian,
Lumen, Tangent Table), #1635 (Afterturn measured under the native rotor) and
#1634 (this document's section 0/2b). #1512's collider changes landed via #1566.

### P1. Finish PR #1641 — Afterturn judge, Afterturn promotion, Poise lesson

Branch `lane/robot-afterturn-judge-20261103`, head `95e19460` (a merge of main
into `5a203448`), `ci:full` already labelled. Content: judge
`afterturn-shape-cycle-v1` from an independent prediction (Iw/J = 0.02608 at
B = 0 and 0.02746 at B = 70°; each stroke within 1 %, whole and inverse cycle,
fixed-mass control branch, removing both rods breaks the law); Afterturn
promoted; supplier claims and en/de lessons corrected from the #1494 artefact
4.66° to the physical value; Poise lesson no longer repeats "Roberval
balance". Native runs passed locally (cycle 1.24° against 1.25° predicted).

To do:
1. Wait for every enabled check on the current head. The previous head
   `5a203448` had one failure, `browser (light)`; its log was never read.
2. If `browser (light)` fails again, read the failed log (`gh run view <run>
   --job <job> --log-failed`). If it is a Robot Lab assertion, fix the cause;
   if it is an unrelated flake, retry only that job once (`gh run rerun
   <run> --job <job>` after the run finishes). Never weaken a check.
3. Merge: `gh pr merge 1641 --merge --match-head-commit <head>`; verify the
   merge parents and that the tree equals `git merge-tree --write-tree
   <main-parent> <head>`.
4. If main moved and conflicts, merge main into the branch (no rebase or
   force-push), keep both sides' entries, and repeat steps 1–3. `ci:full`
   must stay on the final head.

### P2. Finish PR #1639 — register the nine-intake judge (no promotions)

Branch `lane/robot-nine-intake-promotions-20261103`, head `e97ec9b4`, draft,
no `ci:full`. Final content after a revert: registers the existing judge
`scripts/lib/sim-lab-nine-intake-judge.mjs` in `QUALIFICATION_JUDGES` with a
throwing wrapper and a disconnection-loss measure, and records in
`docs/data/robot-lab-experimental-checkpoint.json` why each of the nine stays
experimental (see P3–P5). No registry move, contract or model byte change.

To do: mark ready (`gh pr ready 1639`), wait for the lite checks, add
`ci:full` once on the final head, then merge and verify as in P1. If P1
merges first, merge main into this branch and keep both sides' checkpoint
and handoff entries.

### P3. Geometry repairs for five passing intakes (after P2)

Toggle Press, Footfall, Phasekeeper, Vector Sum and Point Weaver pass hosted
native ordinary, strict and disconnected qualification runs, but fail the
established construction gate `test/bw-sim-models-solid.test.mjs`:

| Model | Gate finding |
|---|---|
| toggle-press | `fixed_pivot_U` penetrates `upper_toggle_UK` and `pivot_bridge`; three guide-post holes filled twice |
| footfall | `base_cross_support_A` hole h4 filled by two pins |
| phasekeeper | `base_rail_output` holes h1 and h13 each filled by a pin and an axle |
| vectorsum | `output_axle` reaches 0.7 LDU into `diff_cover_28t` |
| pointweaver | eight motor-foot pins penetrate their feet (1.3 LDU); `endpoint_marker_tip` penetrates `endpoint_marker`; six holes filled twice |

For each model: move or remove the offending parts in the `.ldr` (smallest
reviewed pose change, following how #1510 repaired Phasor Twin and #1551
repaired Paired Door Sync), keep the BOM honest, rerun
`test/bw-sim-models-solid.test.mjs` for that model, then requalify with
`scripts/qualify-robot-lab-models.mjs` (ordinary, strict, disconnected). Only
then do the promotion changes listed in
`lanes/2026-11-02-robot-batchab-promotions.md` (contract, source fixture,
registry move, generated catalogue/lessons, mechanism entry, checkpoint).
Never loosen the gate. Phasekeeper's Cardan dependence is already shown
(removing `joint_2_intermediate_yoke` gives about 321° phase error).

### P4. Loop Relay disconnection run

Ordinary and strict runs pass. The shared disconnection run removes
`chain_input16` and then fails before measuring: the hub observation base is
not found. Find out why the harness loses the hub (read
`scripts/qualify-robot-lab-models.mjs` and the nine-intake disconnection
measure) and either pick a removal that keeps the observation base while
breaking the law, with a justification in the code comment, or fix the
harness lookup in a separately reviewed change. Do not swap parts just to
get green.

Diagnosis (2026-11-07): the removal is not the cause. Loop Relay's hub part is
`spike_hub`, and the shared disconnection test looked up a body containing a part
named `hub`, which no Loop Relay body has, with or without `chain_input16` (the
compiled hub body is unchanged by the removal). Helixgate, Parity Dial and Counter
Slide use `spike_hub` too. Fix on `lane/robot-looprelay-20261107`: the test takes
the compiler's single registered hub part (`mechanism.hubs[0].id`), as the
nine-intake judge already does; all 31 registered contracts resolve to `hub`, so
their runs are unchanged. The removal of `chain_input16` stays as reviewed.

### P5. Remove the 50-piece minimum from qualification (operator decision, 2026-11-07)

Decision: the >50-piece minimum is dropped from qualification altogether.
Qualification judges the simulated physics and its dependence on the
mechanism; piece count is not part of that. The builder brief
(`docs/ROBOT-LAB-MODEL-BUILDER.md`) keeps "models above 50 pieces are
welcome" as a design preference, and the gallery's "More than 50 pieces"
filter stays, both reading the honest count.

To do:
1. In `scripts/lib/robot-lab-qualification.mjs` (contract validator, the
   `assert.ok(Number.isInteger(c.parts)&&c.parts>50)` line) keep the
   integer/positive check on `parts` but drop the `>50` bound. The `>50`
   instruction-step check in `scripts/lib/sim-lab-arm-lift-gate.mjs` is a
   different rule; leave it.
2. Add or adjust a validator test: a contract with an honest small count
   (e.g. 20) is accepted, a missing or non-integer `parts` is still rejected.
3. Note the change in this handoff and in the checkpoint reasons for
   Helixgate (20 pieces), Parity Dial (31) and Counter Slide (44).
4. Qualify those three through the normal pipeline (contract, ordinary,
   strict, disconnected, construction gate `test/bw-sim-models-solid.test.mjs`)
   and promote whichever pass. Never pad a model's count.

### P6. Other remaining experimental entries

From section 2b: RimRun (hub stands loose; mount it with real parts, then
write a judge), Evenhand (needs a motor holding-torque judge; reference
figures in 2b) and Paired Door Sync (repaired in #1551; needs a qualification
contract and the registry move). Controls and comparison variants
(`*-control`, `*-swapped`, `*-in-phase`, `afterturn-fixed-masses` and the
like) stay experimental by design.

## 0. Status refresh, 2026-11-02

Done on main since this handoff was written:

- **#1435 (resting-frame creep)** fixed by #1577 (idle speculative floor hits
  no longer displace resting supports); the issue is closed. Section 4 is
  history.
- **#1494 (rotor inertia)** fixed for opted-in models by #1573 (native relative
  rotor via `0 !BW ROTOR_INERTIA native`; supersedes #1505 and #1553); the issue
  is closed. Models that do not opt in keep the old behaviour. Section 3 is
  history; Afterturn needs the opt-in plus its own judge.
- **CRLF disconnection parsing** fixed by #1549. The seven CRLF models in
  section 2 are no longer blocked by the parser; each still needs its own judge.
- **Paired Door Sync**: construction repair (from #1514) and programme-outcome
  contract merged in #1551. It is still on the experimental list: promotion
  (registry move, qualification contract) has not happened.
- **Promoted**: Final Squeeze and High Select (#1555, superseding #1508),
  Phasor Twin (#1510), Tipline, TwistSpan and Swayshift (#1555/#1566).
- **Closed/superseded**: #1505, #1508, #1512, #1514.

In progress by other agents (do not touch these branches):
`lane/robot-batchab-promotions-20261102` (batch A/B judges: poise, the A1 set,
equal-share/stroke-shift/triad-table), `lane/robot-afterturn-rotor-20261102`
(Afterturn with the native rotor opt-in) and
`lane/robot-collider-catalogue-20261102` (the mesh-collider work #1512 left
open).

The experimental list on main has 66 entries. Section 2b triages the ones the
2026-10-28 table did not cover.

## 1. Promoted so far, and work in flight

Merged on main:

| PR | Models promoted |
|---|---|
| #1446 | Toggle Lever, Thirdline |
| #1455 | Cross Ratio and the batch-2 set |
| #1483 | Samebeat |
| #1496 | Pivot Exchange |

#1497 (batch C) merged too, but promoted nothing. Final Squeeze, High Select
and Obliquity Orrery were reviewed and kept experimental.

Open PRs: refresh each one and coordinate the existing owner before carrying
its published continuation. Where the author delegates finishing qualification,
retain the frozen source and originals. Add `ci:full` only if absent and its
one-shot admission has not already happened; never blindly repeat it. Merge only
a fully qualified current combination, after source-review blockers are resolved.

| PR | Branch | Content | State at handoff |
|---|---|---|---|
| #1508 | `lane/robot-batchD-20261028` | Promotes High Select (judge `max-select-v1`) and Final Squeeze (construction repaired); records the batch-6 browser run | Unit checks running; no `ci:full` yet |
| #1510 | `fix/robot-lab-model-geometry-20261028` | Repairs Phasor Twin's construction (idler gear sat 7.5 LDU inside the motor; 20 pins reached into solid parts) and promotes it. The edit table is in the PR body | `ci:full` on; full run in progress |
| #1512 | `fix/robot-lab-mesh-colliders-20261028` | Mesh-derived shock-absorber and linear-actuator colliders | Full label admitted and added once; run40729193655 pending. Independent slab-containment, conservative-rounding and repeat-generation admission gaps require correction scope #1531. No actual missed surface is claimed. Every shipped model verdict must remain unchanged |
| #1514 | `fix/robot-lab-model-geometry-b3-20261028` | Seats Paired Door Sync's carriage pins | Full label admitted and added once; run40729199310 pending. Four along-axis moves, 88-placement canonical/MPD and checkpoint-hash joins are source-consistent; hosted clearance and program qualification remain necessary |
| #1505 | `fix/rotor-inertia-1494` | Rotor-inertia fix | Blocked; see section 3 |

## 2. Remaining models

Triage of batches B and A, 2026-10-28:

| Model | Status | Next action |
|---|---|---|
| poise | judge passes | Promote in a batch PR. The judge was written in the previous agent's scratch area and **never committed**, so re-derive it |
| bend-ripple, offset-relay, rack-decoder, tangent-table, remote-pivot, schmidt-shift | judges pass locally (law, disconnection, frozen, shift) | Same as poise: they were never committed. Re-derive and promote as batch "A1" |
| equal-share, stroke-shift, triad-table | meshes clean; only the oversized colliders fail | Wait for #1512. Then write their judges (previously measured: share ratio 2.0003 against a control of 1.00; strokes = 2r within 0.004 mm; 3-RPR kinematics within 0.0025 mm) and promote |
| paired-door-sync | pins repaired in #1514 | After #1514, judge and promote |
| apex, aster-governor, vesper-quickreturn | solid overlaps: housing links, flyweight against its key, motor against the fixed bearing | Make minimal real-part LDraw repairs (follow #1510's style and record every edit), then qualify |
| bloom | anchor pins reach into the elbows | Same |
| spiral-scribe | the 64781 rack pitch (3.2 mm) does not match the pinion law (37.7 vs 38.4 mm per turn) | Use a correct real part, or keep experimental with that reason |
| solstice-pumpjack, tempest-pendulum | each start guard faults at stage 0 after the 500 ms cold settle | Repair the pose, for example with rest stops as `1b251e04` did for High Select. Change the program only if the guard itself is wrong, and justify it |
| inertia-loop | geometry, the construction-steps rule, and likely motor-model dominated | Do it last, after #1494 lands |
| cadence-geneva, equinox-differential, kestrel-flapper, lumen-iris, helios-transmission, orion-cardan, meridian-linkage | CRLF line endings break the physical-ID disconnection parser. The existing JavaScript multiline author assertion already accepts CRLF | A narrow harness candidate normalizes CRLF in the disconnection matching view, with LF/CRLF and strict-ID controls. Original model bytes and provenance checks stay unchanged. Hosted qualification and unchanged existing verdicts remain required; this parser repair does not promote these models. Kestrel, lumen-iris and meridian had earlier local judge passes |
| pan-shift | runs past the 180 s contract maximum | Investigate the program length; keep experimental if it can't be fixed honestly |
| vector-delta | blocked by a missing part | Keep blocked |
| obliquity-orrery | blocked by issue #1460 (the compiler ignores motor orientation) | Wait for #1460 |
| afterturn | Promoted 2026-11-03 with the new `afterturn-shape-cycle-v1` judge: independent prediction from compiled masses and slider-crank poses, Iw/J = 0.02608 (masses out, B = 0) and 0.02746 (masses in, B = 70°); measured strokes 0.0261/0.0275 (within 1 %), cycle 1.24° vs predicted 1.25°, inverse back to 0.04°, fixed-mass control 0.01°. The earlier "0.02749 (masses out)" label was reversed: B = 70° moves the masses in. The supplier figure 4.6625° was the #1494 double count; claims and lessons now give the physical value | Done (control afterturn-fixed-masses stays experimental as the control) |
| impulse-line | the unpowered pusher droops about 4°/s during the cold settle, against a 2° guard; its law is only qualitative | Needs a pose fix and a quantitative law |
| quiet-partner | compiler warns of locked hinges, and the elastic bands become spring couplings | Needs harness support for spring couplings, or stays experimental |

Geometry edits must be the smallest real-part change that makes the model
buildable while keeping its principle. Record before and after for each edit. If
the model came from an addon archive, update the archive hash, canonical copy and
checkpoint consistently, as #1510 did.

## 2b. Triage of the remaining experimental entries, 2026-11-02

Read-only triage; nothing was compiled or run (host load was about 8).

**Nine Technic intakes** (added by `ddb5a6c1d`; record
`docs/data/robot-lab-nine-intakes-20261026.json`, handoff
`docs/ROBOT-LAB-NINE-MODELS-HANDOFF.md`). Each has a native passive-law judge in
`scripts/lib/sim-lab-nine-intake-judge.mjs` (gate
`sim-lab-nine-intake-gate.mjs`, test `test/bw-sim-nine-intake-motion.test.mjs`)
that passes both cadences, the part-removal control and the terminal hold. None
has a contract in `docs/data/robot-lab-qualification.json` or an entry in
`QUALIFICATION_JUDGES`, and the browser journeys (shards `robotaddon10..12`) are
incomplete. Shared next step: register the existing judge as a
`QUALIFICATION_JUDGES` entry, add the contract, run
`scripts/qualify-robot-lab-models.mjs` on the single model (cold repeat, two
cadences, frozen output, translated foundation, disconnection), then the hosted
browser journey, then promote as #1555 did.

| Model | Mechanism / law | Blockers and notes |
|---|---|---|
| helixgate | 24:1 worm drive; gate turns 30° per two motor turns, worm holds when coasting | 20 pieces, under the generic builder's >50-piece rule: decide if the rule applies to intakes or keep experimental with that reason |
| looprelay | chain drive 16→24, then 8→24 reversal: ratio −2:9 | Partial browser journey passed (lessons included) |
| paritydial | one 8T drives two 24T hands; the idler path reverses sign, same 1/3 speed | 31 pieces (same piece-count question); browser journey cut off at lessons |
| counterslide | one pinion, two opposed racks: equal and opposite jaw travel, fixed centre | Depends on the 3L shaft envelope fix (in main); two archives are one model |
| toggle-press | toggle (knee) linkage approaching dead centre: ram force/displacement ratio | Program must not cross dead centre; judge checks the approach only |
| footfall | twelve-link (Jansen-type) leg, closed foot path per crank turn | None known beyond browser journey |
| phasekeeper | double Cardan at equal angles: ripple of joint 1 cancelled by joint 2 | Needs the two inferred real Cardan crosses (83 physical pieces); keep the loose-part recognition test |
| vectorsum | open differential: carrier = mean of the two side-shaft angles | Two motors (A, B); check shaft-tip clearance stays clean |
| pointweaver | two-motor five-bar, endpoint reaches four corner poses | Chromium full journey already passed once (preliminary) |

**Update 2026-11-03 (nine intakes):** judges registered per family in
`QUALIFICATION_JUDGES` with a disconnection-loss measure. Toggle Press, Footfall,
Phasekeeper, Vector Sum and Point Weaver pass the native qualification runs but fail
the construction gate (`bw-sim-models-solid`), so they stay experimental pending
geometry repair. Loop Relay's disconnection run loses the hub observation base.
Helixgate, Parity Dial and Counter Slide stay under the >50-piece rule pending an
operator decision. Reasons are in `docs/data/robot-lab-experimental-checkpoint.json`.

**Batch E remainders** (added in #1499):

| Model | Mechanism / law | Contract / judge | Blockers and next step |
|---|---|---|---|
| rimrun, rimrun-swapped | rolling bodies of equal mass, different moment of inertia: inner ballast rolls faster | Package runner only; no contract | Hub stands free, `prepareModel(...).issues` reports `loose-part`. Mount the hub to the frame with real pins, then repair the author-declared failing finish/catch and watchdog-hold gates, then write a judge with the swapped scene as the causal control |
| evenhand, evenhand-control | counterbalanced two-joint arm: near-zero holding torque | None | Law is visible only in `jointDynamics(id).motorTorqueNm`. Write a torque judge (balanced: shoulder 0.33–0.36 mN·m, elbow < 0.01; control: elbow 0.61·cos(A+B) mN·m) with the control as the causal pair |

**Swayshift on the experimental list is not a bug.** The entry is id
`swayshift-in-phase`: the same `swayshift.ldr` with a second program,
`swayshift-in-phase.bw` (full-period timing). #1555 moved the plain
`swayshift.ldr` entry out of the list and kept this comparison, exactly as for
`tipline-swapped` and `twistspan-inner`. No duplicate entries exist in the list
(checked by file and id).

**Controls and comparisons of promoted or triaged models.** These stay
experimental by design; they are the causal controls of their parent's judge and
are not promotion candidates themselves: poise-mass-control,
equal-share-even-springs, impulse-line-missing-middle, travel-dial-wheel-raised,
ghost-pivot-unequal-link, afterturn-fixed-masses, quiet-partner-control,
high-select-mirror, obliquity-orrery-turned-axis, pivot-exchange-wide,
air-budget-two-tanks, foldback-open, thirdline-control, samebeat-conjugate,
samebeat-control, carry-ratio-control, sarrus-lift-single-chain,
phasor-twin-control, swayshift-in-phase, tipline-swapped, twistspan-inner,
rimrun-swapped, evenhand-control. Next step for each: none, unless its parent's
judge needs it as its disconnection or causal control.

## 3. Rotor inertia (#1494), PR #1505 (history: fixed by #1573)

The defect: `setRotorInertia` in `overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js`
adds the motor's reflected rotor inertia to **both** hinge bodies. Afterturn's
free platform therefore turns 0.124 per wheel degree, where physics predicts
about 0.026.

What #1505 does:
- **Derivation.** The ideal axial model has coupled inertia
  [[I1+Jr, −Jr], [−Jr, I2+Jr]]. Published source
  `92fb5d37cb244855b9a8af40dd122b444a21ec7a` still applies a lagged correction
  derived from whole-step angular-rate changes. Its current PR description
  discusses a different motor-impulse-only candidate; bind the actual source
  instead of assuming that description is already implemented.
- **Limit.** Post-step correction is not proof of exact contact/common-mode or
  integrated-position dynamics. A candidate must pass the original guards and
  independent momentum, servo and rollback controls; algebra alone is not
  qualification. A required native solver extension needs separately reviewed
  ownership, build/release and explicit pin adoption.
- **Regression fixture.** `test/bw-sim-rotor-inertia.test.mjs` compares a
  free-floating housing against the ideal ratio 0.02525; the previous diagonal
  model predicts 0.12381. Require the fixture on the actual corrected head,
  together with all original model and transport guards. Previously reported
  local results do not establish current-head qualification.

**Blockers.** Retained first failure logs from run40688505800 bind actual
synthetic checkout `9c14fbd252b21cae00b009bbabc2ae839284e1ad`, whose rotor and
failing test bytes equal the published head. Sarrus clearance is −0.004174 mm;
the world collision bench travels 0.012009 m against its unchanged <0.01 m guard;
City and Essential BLE/ScratchLink endpoint comparisons also fail their 0.5°
agreement guards. These are completed assertions, not missing command events or
infrastructure failures. Preserve every failure and original assertion. Scope
#1531 prepares a source correction; do not import a tolerance relaxation. Next:

1. Log, per step, the reaction impulse the coupling applies to the baseplate.
   Compare it with the physical reaction Jr·(relative angular acceleration)·dt,
   especially at the worm's abrupt speed changes.
2. **If the applied impulse is too large,** for example because the lag doubles
   it at a step change, fix the coupling with a same-step or implicit solution.
   Don't keep the lagged correction.
3. **If it matches the ideal model,** investigate contact and integrated-pose
   behavior under the original Sarrus, world and transport guards. Preserve
   their assertions. Do not infer a physical measurement from the simulation or
   replace a source correction with a looser clearance tolerance.
4. Add `ci:full` once and compare the 13 promoted models' verdicts with main's.
   On main all of them pass: air-budget, carry-ratio, cross-ratio, foldback,
   ghost-pivot, quartermaster, samebeat, sine-shuttle, thirdline, toggle-lever,
   travel-dial, twin-tempo and watt-line, plus any promoted since. If any
   verdict changes, investigate before merging.
5. After merging, close #1494. Re-run Afterturn and promote it only if it
   passes honestly. Its recorded figures (a 4.66° cycle; the supplier's 4.6625°)
   were measured with the old code. (Done 2026-11-03: about 1.25° under the
   native rotor, judged by `afterturn-shape-cycle-v1`, promoted.)

Lane file: `lanes/2026-10-28-rotor-inertia-relative-1494.md`.

## 4. Resting-frame creep (#1435): history, fixed by #1577

Both stages of the diagnosis are merged:
- #1472: the baseline, its reader `scripts/verify-sim-resting-creep.mjs`, and
  the table in `docs/ROBOT-LAB-RESTING-CREEP.md`.
- #1498: the contact stage, with the reader
  `scripts/verify-sim-resting-creep-contact.mjs`.

The audited official #1498 log (reader verdict: PASS for data integrity) gives
these results:

| Case | Drift in 1.75 s |
|---|---|
| Coplanar Orrery, all colliders | 6.99 mm, 3.21°; lowest collider 0.84 mm *below* the floor |
| Coplanar, rails only / floor supports only | 0 |
| Coplanar without the two `post_mid_low` parts (their bottoms sit 1.6 mm above the floor), or with them raised 0.5 mm | 0 |
| Coplanar, manifold reduction off | 0.0015 mm |
| Raised Orrery with the hover parts up 0.5 mm (so they sit in the band) | 9.37 mm, −5.10° |
| Flat plate with a cube hovering 1.2 / 1.6 / 1.9 / 2.1 mm above the floor | 0 / 1.73 / 2.75 / 0 mm |
| Flat plate, cube at 1.6 mm, manifold reduction off | 0 |

**Bounded finding.** In the retained cases that creep, an in-band hovering
collider and contact-manifold reduction are part of the demonstrated trigger.
The speculative distance is `LEGO_SPECULATIVE_CONTACT_M = 0.002`. Removing the
hovering collider, moving these cases out of the band or disabling reduction
removes their observed creep. The 1.2 mm plate control did not creep: this is
not a claim that every collider anywhere inside the band necessarily drifts.

**Next action.** Refresh live ownership of the correction before creating a
new fix: the merged diagnostics do not imply that the implementation is still
unclaimed. Preserve and coordinate any active successor; the diagnostic lanes
did not authorize solver changes. Candidate approaches include:
- (a) disable reduction through a verified supported policy. A body's
  `mUseManifoldReduction` / `SetUseManifoldReduction` applies to that body's
  contacts generally; it is not a ground-pair-only switch. A narrower policy
  needs its own verified native/API path, not an assumed contact-listener hook;
- (b) reduce the speculative distance.

Investigate (a) first; (b) moves the band rather than resolving the demonstrated
mechanism. Keep the broader effect of a body-level flag explicit. Requirements:
- a regression test from the #1498 cases that fails before the fix and passes
  after: coplanar all-colliders and plate-hover 1.6/1.9 mm drift go to about 0;
- no change to currently qualified models' verdicts under affected full qualification;
- the existing floor-contact tests, `docs/ROBOT-LAB-FLOOR-CONTACT.md`, still pass;
- no engine-pin change.

Keep #1435 open until the fix is merged. Lane files:
`lanes/2026-10-27-robot-resting-creep-1435.md` and
`lanes/2026-10-27-robot-resting-creep-1435-contact.md`.

## 5. Not in this handoff's scope

These belong to their own owners: #1440, #1318, #1128, #1499 (new experimental
models), #1517 and #1518. Issue #1460 (motor orientation) blocks Obliquity Orrery
and is not owned here.
