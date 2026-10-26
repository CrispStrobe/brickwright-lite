# Automated model intake

A small model-building agent can produce candidates and repair reported defects.
Acceptance belongs to an independent, immutable harness. A green simulation
receipt establishes the declared, tested behavior; it cannot certify every
possible mechanism or the fit and durability of real LEGO.

## Run it

Use the repository's prepared Node 22 dependencies and normal worktree/claim
workflow. From a prepared worktree:

```sh
node scripts/qualify-robot-lab-models.mjs \
  --models=sine-shuttle,quartermaster --mode=native \
  --out=artifacts/model-intake-native-001

node scripts/qualify-robot-lab-models.mjs \
  --models=sine-shuttle,quartermaster --mode=full \
  --out=artifacts/model-intake-full-001
```

Every attempt needs a fresh directory. Failure stops the sequence and preserves
its log and JSON receipt. Native mode is **PARTIAL**, never admitted. Full mode
requires all eleven stages, including a normal production build, actual
Chromium **and** WebKit gallery/program/control/lesson/construction/BOM tests,
raw LDR/MPD imports, a real GUI project save and fresh-context full program
replay, and the complete verified library export. Generated, known translation
side effects are captured and restored; other candidate input changes refuse
admission. `candidate.json` binds the source fingerprint, Git head, contracts
and worktree status. Local admission is separate from exact-head hosted CI and
normal PR landing; it does not upload a release or grant hardware acceptance.

Registered contracts cover SineShuttle, Quartermaster, WaveMaker with its correctly phased physical control, and Cascade with a real six-piece elbow brace. WaveMaker has 298 explicit placements and two required inferred crosses (300 physical pieces); its native suite checks the independently derived Cardan/differential laws, speed change, reversal, physical cancellation, anchor closure and world-space frame stability. Cascade checks independently moving links, elbow freedom/locking, the complete held-support observation, original hinge closure and world-space feet/pivot stability. Unknown
model IDs and unknown principles are refused. This is an initial reusable
qualification runner, not automatic support for every existing or future model.

## What the harness checks

### Candidate preflight and the nine-Technic regression suite

Run structural preflight on an arbitrary LDR/MPD without granting it admission:

```sh
node --import ./scripts/lib/register-gui-scope.mjs \
  scripts/check-robot-lab-intake.mjs \
  overlay/scratch-gui/static/sim-lab/models/looprelay.ldr \
  --drive=A:chain_input16
```

The JSON report names offending physical parts. It checks real retaining
connections, motor-housing support, keyed input ownership, retainer engagement,
rigid transforms, overlapping solids and axle tips penetrating other gears.
It retains compiler advisories for review. Optional `--record=recording.json`
and `--success=done` inspect actual recorded completion, faults, finite poses
and a full two-second continuation; they do not establish a passive-motion law.

The reviewed HelixGate, LoopRelay, ParityDial, CounterSlide, Toggle Press,
Footfall, Phasekeeper, VectorSum and PointWeaver contracts have their own suite:

```sh
BW_MODEL_QUALIFY_EVIDENCE_DIR=artifacts/nine-intake-native-001 \
node --test --import ./scripts/lib/register-gui-scope.mjs \
  test/bw-sim-nine-intake-checks.test.mjs \
  test/bw-sim-nine-intake-assets.test.mjs \
  test/bw-sim-nine-intake-motion.test.mjs
```

Use a fresh recording directory. Each model runs at 25 ms and browser cadence,
then with an essential real transmission part removed. These checks observe
passive body poses, complete input routes, native floor contact, hinge closure,
world-space support and held continuation. Frozen passive outputs and a
translated foundation must fail. Source/program hashes accompany the original
recordings, which are saved before a verdict. This separate regression suite
does not relax the general builder contract's minimum piece count or silently
promote a small experimental demonstrator.

The normal browser entry accepts `--part=examples --examples=helixgate,...`.
The nine-model journeys check the actual worker, bounded manual buttons,
connected instruction pages, placement BOM, both lesson languages, raw imports
and a real saved-project export followed by a fresh full program replay.
Worker snapshots do not expose native contact presence: browser checks retain
world-space pose/closure checks, while native tests independently prove floor
contact. A height check is not relabeled as contact evidence.

For a selected export, including enabled experimental examples, use
`scripts/export-robot-lab-library.mjs OUTPUT-DIRECTORY OUTPUT.zip --models=ID,ID`.
The default export remains the qualified catalogue. Selected exports preserve
experimental status and verify complete LDR/MPD semantics and motor-pose assets.

### Rules exposed by concrete failures

- Structural reachability is weaker than a fixed support. A "fixed" pivot can
  connect back to the chassis through the moving linkage while its bearing
  misses the frame. Declare fixed bearing parts and require rigid ownership.
- Motor arrival does not prove transmission. A round hole can slip around a
  powered axle while every command completes. Require the intended input arm
  to belong to the actual rotor assembly, then measure the passive output.
- Audit the full occupied shaft interval. Solid-overlap checks omit legitimate
  shaft regions; a free tip can still penetrate a planet gear outside its bore.
- Check physical guide travel against the requested trajectory. Software jog
  ranges cannot extend a short rail or move a real carriage end stop.
- Compare suspicious collision envelopes with the canonical mesh and retain
  a real obstruction control. Claim a shared correction separately; do not
  suppress collisions to make one candidate pass.
- Universal-joint crosses retain their forks without welding them. Structural
  diagnostics must include those real connections while leaving angle-only
  gear and chain ratios nonstructural.
- Authored `STEP` labels are not a construction proof. Audit each new placement
  against previously placed real connections and report inferred crosses
  separately from explicit LDraw placements.

| Layer | Checks | Typical caught failure |
| --- | --- | --- |
| Identity and packaging | Frozen original model/program hashes, author and full licence, explicit ports, all three registrations, generated catalogue and bilingual lessons, lazy catalogue classification | Model appears in one menu but not another; stale counts; missing parts or licence |
| Construction | All eight existing library-wide solid/mesh/shaft/hole checks; connected instruction steps and complete BOM | Overlapping solids, wrong axle clocking, doubled fasteners, disconnected building steps |
| Native program and physics | Real registered compiler → Scratch VM → virtual hub/controller → Jolt; ordinary/unassisted equality; finite completion and actual final hold; finite poses, real passive output laws, hinge closure, world-space foundation stability and operating limits | Motor turns but output does nothing; hidden assembly rescue; loss of closure; moving base disguised by relative coordinates |
| Adversarial controls | Frozen output recording, translated foundation, actual removal of an essential physical drive connection while the input still turns | A judge accepts encoder motion or imposed output instead of the mechanism |
| App | Both browser engines, automatic program loading, manual controls, EN/DE lessons, instructions, raw import and real saved-project replay | Correct native mechanics with broken UI lifecycle or persistence |
| Export | Fresh paths; LDR and MPD parse back to the same complete semantic model; motor-pose and material geometry resolution; SHA inventory and ZIP | Lost ropes, drawings or rotor poses; missing sidecars; stale or overwritten files |

SineShuttle's trusted checks cover the independent crank phase, both 32 mm
passive strokes, cosine/sine laws, symmetric central-stroke timing and the
measured 3:1 speed change. Quartermaster's checks observe its passive wheel
independently, all eight quarter-turn stations, retained dwell, reversal and
return. Their designer programs cannot directly set the measured output poses.
Removing SineShuttle's pivot lets the carriage drift and contact other parts;
the correct negative expectation is loss of its declared stroke/law, not an
invented requirement that every disconnected body remain motionless.

## Give this task to a smaller agent

1. Choose a supported mechanism template and a useful experiment. State the
   observable principle and operating envelope before tuning the design.
2. Produce a pack with `model.ldr`/equivalent `model.mpd`, finite `program.bw`,
   `LICENSE.txt`, EN/DE lessons, BOM, explicit motor ports and stable semantic
   part IDs. Prefer 50+ parts and 1–3 motors. Include actual bearing support,
   retainer hardware, guide overlap and a freestanding frame. Keep the datum
   reproducible and the program bounded, with feedback, final hold and watchdog.
3. Declare the intended passive output, its independent measurement points,
   expected law and units, useful travel, target stations, limits, and which
   essential connection a physical counterfactual should remove. Do not submit
   a success report based only on encoder arrival or direct API prototypes.
4. Run structural/native checks first. Use the retained failure report to repair
   model geometry or program coordination, then run a **new** attempt. Do not
   change the harness, tolerances, collision policy, solver or acceptance tests.
5. Run full qualification on the final integrated candidate. Submit the pack,
   unchanged original inputs and full receipt. A reviewer checks the claimed
   physics and licence, admits its contract, and carries the normal CI/landing.

For automation services, run the builder in an isolated writable candidate
folder/worktree. Run qualification from a trusted base outside that agent's
write permissions. Only reviewed candidate asset/registration changes enter
that base. Reject patches to judges, gate scripts, tolerances, dependencies or
physics. Do not execute downloaded package installers or qualification scripts
as trusted admission tools. Repository receipts alone are not signatures: the
independent service must bind its own source/contract fingerprints and logs.

An agent without Node/Jolt/browser access can submit its pack to the trusted
Mac or CI runner and receive the same evidence. It does not need our shell or
permission to install the toolchain. The present command expects an integrated
worktree; an unattended upload/queue service is a separate integration step.

The runner stores complete native recordings before judging the motion.
A bounded repair loop can return structured counterexamples to Luna, Qwen or
DeepSeek: failing layer, physical part IDs, expected/observed quantities and
units, phase/time, and the preserved screenshot or trajectory. Limit attempts
and escalate repeated failures. Model choice changes the quality of candidate
repairs; it must never change the gate.

## What still needs independent engineering

An agent-generated equation can be wrong. A new principle therefore needs a
reviewed, independent oracle or a reference template; passing its author's own
custom script is insufficient. Further automation should add a versioned
candidate-pack schema, declarative oracles for the existing mechanism families,
measured motion-envelope collision sweeps, retention/guide/connector validators,
parameterized physical counterfactuals, and automatic gallery registration in a
disposable integration checkout. Currently registration and novel-contract
admission still need review; the runner does not pretend those are automated.

Saved-pose meshes and finite trajectory samples do not prove continuous
clearance. Collider fidelity, manufacturing tolerances, real friction, flex,
axial retention under load, cable snagging, motor heating, assembly accessibility
and durability need further modelling or a physical build. A visually plausible
or green simulated machine remains explicitly simulation-qualified.
