# Robot Lab library model lane — 2026-10-21

Historical local checkpoints from #1138, moved into the current per-lane ledger
format during main composition. Exact-head hosted CI and source integration
remain release gates; older inventory numbers identify their checkpoints.

## Compact Robot Lab controls — 2026-10-21

IMPLEMENTED / locally qualified — Codex, explicit owner request. One scrolling action/context row with
responsive icon labels; compact example dialog and automatic program/title
selection; collapsible Drive/Motors row; manual sliders visibly disabled until
override is enabled; faster simulation with the program/world clock kept aligned.
Scope: Robot Lab pane, mixer, toolbar/dialog, clock/API and focused controls.
Preserve peer-owned physics/compiler files and worktrees.

Production build and 40 focused lifecycle/API/pacing/real-worker clock controls
pass. EN/DE browser checks pass at 1600, 1024 and 768 px: one action row,
responsive icons, scrolling/pop-ups, delayed-program Run guard, visible project
titles, physical motor movement from explicit override, collapse, return to the
program and 4× clock selection. Fast-step scheduling preserves physical step
size and program/physics alignment; actual throughput is hardware-dependent.
The complete Code example-selector and device-retargeting journey passes.

## Automatic blocks when loading examples — 2026-10-21

IMPLEMENTED / locally qualified — Codex, explicit owner request during model intake. Make the Code
built-in example picker compile into the VM automatically, including retargeted
examples. Preserve lazy initial loading and existing Circuit/Robot Lab automatic
conversion. Include the lazy Code host so a Robot Lab selection made before
visiting Code retains and compiles its program. Remove stale example hints asking for a separate To blocks click.
Prove the actual VM changes immediately after selection, without that button.

## Atlas Arm and Switchback Lift intake — 2026-10-21

IMPLEMENTED / locally qualified — Codex, existing model-design lane / draft PR #1138, after completing
pendulum/clutch examples. Adapt the supplied three-motor arm and ball-return
lift from exact source CAD, apply the owner’s CrispStrobe / BSD-3-Clause credit,
repair geometry/mechanism gaps, and add native programs and EN/DE lessons.
Qualify actual physical poses, ball transport, controls and connected manuals.
Downloaded generators/controllers and predicted animation are reference data,
not executed or presented as simulation results. Preserve peer worktrees.

## Motor-excited pendulums and clutch load bench — 2026-10-21

IMPLEMENTED / locally qualified — Codex, existing model-design lane / draft PR #1138. Add two original
CrispStrobe / BSD-3-Clause motorised experiments: unequal-length pendulums with
motor excitation and free-oscillation observations, and a torque-limiter bench
with a controllable output load. Qualify real output poses and clutch slip,
manual controls, connected building instructions, full BOMs and EN/DE lessons.
Use supported catalogue mechanisms; preserve peer worktrees and the four owned
Jolt/compiler/collision implementation files. Only qualified assemblies enter
the bundled library. Main composition and hosted CI remain release gates.
54-piece / A pendulum array: three free arms, measured periods about0.38/0.49/0.52s.
26-piece / A,B clutch bench: physical -0.6 free ratio, loaded slip, release and
reverse. Shared short-pin overlaps replaced by single3L pins; no test exemptions
or engine implementation changes. Six new native-VM/pose/stress cases,113
registry/instruction cases, six detailed geometry checks and18 notice cases pass.
Production build passes. Both actual-worker programs, all three manual controls,
stops, initial framing, lessons and22/15-page manuals with54/26-piece bills pass.
43 choices /35 distinct machines /86 EN-DE lessons;14 selectable examples >50pieces.

## Robot Lab guided example lessons — 2026-10-21

IMPLEMENTED / locally qualified — Codex, current model-design lane / draft PR #1138. User explicitly asks
for in-app explanations and lessons following Circuit's example intros. Add lazy,
offline, bilingual lessons for every registered physical model and preset, with
what to observe, experiments, physical explanation, predictions/answers and links
between related mechanisms. Expose reading from example cards and the current
model, alongside the simulation; preserve model/program loading and responsive
controls. Verify lesson coverage, content references, EN/DE loading and retry,
selected-model changes, visibility while running and small-screen layout.
41 registered choices / 33 distinct machines; 82 complete offline lesson assets.
English/German reader, prediction reveal, real program loading, fetch retry,
preset following, related links and narrow tablet Build drawer pass in the
production browser. Formula labels are translated as well as prose. All 16
existing layout cases pass. Original lesson content: CrispStrobe / BSD-3-Clause.

## Pulse Percussion and original dynamics machine — 2026-10-21

IMPLEMENTED / locally qualified — Codex, existing model-design lane / draft PR #1138. Qualify the supplied
one-motor percussion mechanism with actual peg contact, gravity release and strikes;
connect its console, repair genuine design or collision gaps, and add native programs,
bilingual library entries and connected instructions. Then construct an original
motorised dynamics experiment and qualify its physical output, controls and manual.
Owner's supplied original designs use CrispStrobe / BSD-3-Clause; preserve separate
LDraw authors/licences and exact source provenance. Do not execute downloaded code.
Preserve peer worktrees and protected Jolt/compiler/collision implementation files.
Only locally qualified models join the offline library; hosted CI/integration remain
release gates. No audio output or physical hardware success is inferred from CAD.
Pulse: 130 pieces / A, three physical gravity beaters, 18.3 mm lift,
89/91/180-degree strike spacing, 64 connected instruction pages. Original governor:
34 pieces / A, two free arms, 7/26/47-degree mean tilt across its speed stages,
27 degrees in reverse, 14 connected pages. Both actual VM/worker programs, manual
controls, stops, initial framing and complete bills pass. Correct smooth round
pin 3673 collider to an axial cylinder using official geometry; negative control
reproduces false contacts with the former box. Bound long-shaft/bush instruction
clusters to six parts per page. Ten new cases, 95 instruction/catalogue cases,
six focused detailed geometry assertions and 18 notice checks pass. The initial
202-case broad regression had two failures; both are corrected and rechecked.
No independent edits to the four peer-owned implementation files. Main merge
and hosted CI remain release gates; keep this PR draft for owner composition.

## Tidal Trio phase-machine adaptation — 2026-10-20

IMPLEMENTED / locally qualified — Codex, existing model-design lane / draft PR #1138. Review the owner's
supplied BSD-3-Clause three-motor crank-rocker sculpture. Preserve its source notice;
qualify all three physical linkages, four phase presets, manual controls and
building instructions, then register the working adaptation in the offline
English/German examples library. Envelope: adapted assets and reproducible
adapter, catalogue/registry entries, focused geometry/program/browser checks and
notices. Preserve peer-owned Jolt/compiler/collider files and other worktrees.
226 pieces / 3 motors / four phase presets. Add an eight-piece floor-level pinned hub mount;
retain the source linkage and repair coarse 9L/11L beam ends against official geometry.
All four actual VM/worker programs, 63.07-degree rocker sweeps, 60% motor stress,
three manual controls, initial framing and 111 instruction pages / 226-piece bill pass.
Six detailed existing geometry checks and the production build pass. Corrected
instruction browser readiness checking is also available separately. English/German
example selection, the >50-piece filter and remaining page-error checks pass.
The owner confirmed both supplied machines are original CrispStrobe work and chose
BSD-3-Clause, superseding generated OpenAI/CC BY wording. Referenced LDraw parts
retain their own credits. CrispStrobe author headers keep own-file strict port handling.
Published models in this branch are not yet merged-main/released app claims.

## Orbital loom import and live drawing — 2026-10-20

IMPLEMENTED / locally qualified — Codex, existing model-design lane / comprehensive draft PR #1138.
Owner supplied a 210-piece BSD-3-Clause epicycle drawing-machine prototype. Preserve
source attribution and changes; qualify actual platter gearing and both motors,
replace the static predicted preview with pose-driven drawing on rotating paper,
and register only after structural/program/browser tests. Envelope: original or
adapted model/program assets, focused double-bevel parallel mesh support in gear
inference/metadata, generic moving-surface drawing metadata/view, tests and notices.
Do not independently edit peer-owned compile/Jolt/collider implementation files.

202-piece adaptation / 2 motors; four ratio presets; original BSD-3-Clause credit
retained. Paired pins and over-inserted axle corrected; 11x5 frame collision
widths, double-bevel spur contact and moving-paper ink supported. 231 focused
tests and six detailed mesh/fastener assertions pass. Ink now samples physics
updates independently of rendering (11 focused sampling tests pass). All four
production-browser presets draw closed ink, with 901–975 observed points each;
both manual controls, all 99 instruction pages and the 202-piece bill pass. The
English/German examples browser also passes without page errors. The instruction planner handles
chained pin/half-pin mounts and bounded callouts; the loom manual has 99 steps.

## Expanded mechanics catalogue machines — 2026-10-20

IMPLEMENTED — Codex, existing lane/robot-lab-models-20261020 / comprehensive draft PR #1138.
Read revision 6 of the 330-idea catalogue (234 additions). Build original two-joint
positioning arm, rack shuttle and three-channel ratio comparison bench, with motor
programs, bilingual library lessons, generated instructions and independent physics
judges. Test real VM/worker programs and manual GUI controls before qualification.
Preserve peer worktrees and physics ownership. Main's later universal-joint changes
conflict with the composed dependency core; leave that composition to its owners.
No external CAD or restricted assets introduced.

29-piece arm / 2 motors, 66-piece gear workbench / 3 motors, 27-piece shuttle / 1
motor. Independent VM/worker equations, detailed geometry, building instructions
and all six manual controls pass, with initial framing checked in the GUI.

## Motorised mechanics idea catalogue — 2026-10-20

IMPLEMENTED — Codex, lane/robot-lab-models-20261020 / comprehensive draft PR #1138.
Original motorised crank-rocker, parallel-motion lift, screw crane and steerable
rover from the supplied mechanics concepts. Qualify intended motion through the
VM/Jolt and GUI, geometry, stability and building instructions before bundling.
Preserve all other worktrees and in-progress core changes; compose published fixes.
Only original or verified commercially compatible assets may ship, never NC.
Added 15/23/44/30-piece builds with 1/1/2/3 motors, original BSD programs,
bilingual lessons and library registrations. 150 focused tests and six existing
geometry assertions pass; all four programs and seven manual motor controls pass
in the production browser, alongside the existing full Robot Lab UI gate. Fixed
Three.js initial framing and loaded-motor mixer Stop (encoder hold, brake fallback
for encoderless hubs). Dependency #1137 and hosted full CI remain release gates.

## Robot Lab physics examples and licensed model intake — 2026-10-20

IMPLEMENTED — Codex, lane/robot-lab-models-20261020 / draft PR #1138, depends on #1137.
Owner requests >50-piece models with distinct physics principles, auditing the
Philo/BrickHub downloader corpus, and an examples browser like Circuit's selector.
Own new model/program/metadata assets, a lazy Robot Lab examples component and its
pane/toolbar integration, model registry additions, intake/qualification tooling,
attribution and focused tests/browser gates. Only original or verified commercial-use
compatible MIT/BSD/Apache/CC-BY/CC-BY-SA/public-domain assets may ship; never NC.
Preserve other lanes and peer-owned physics/compiler/collider files. Download or
LDraw parse success alone is not simulation qualification.
Original 59-piece chain transmission and 56-piece flywheel differential added;
107 focused tests pass on the peer's df2b9947b core. Production build and English/German
gallery/worker browser gate pass. The toolbar browser filters physics and >50 pieces,
opens models/programs in Simulate or Build, and restores keyboard focus on close.
All 16 responsive Simulate/Build layout cases pass, including a 461 px pane; six
focused real-mesh, fastener and shared-hole checks pass for the two larger models.
Notebook: 26 native MPDs acquired, 23 HTTP 403 failures, 19 duplicates of the peer's
corpus, 7 additional checks recorded; zero external models newly vendored/qualified.
An NC embedded section overrides the Rodent page's otherwise compatible notice.
Peer still owns the 148-model bench and parts-gap ranking; no duplicate corpus run.

## Robot Lab survey rover model — 2026-10-20

IMPLEMENTED — Codex, lane/robot-lab-models-20261020; draft PR #1138 (depends on #1137). Original compact SPIKE rover:
two drive motors and an independently tilting distance-sensor head, LDraw model,
example program, three model registries, focused physics/program/instruction tests
and documentation. Based on main plus the flex4 model-support lane. Preserve
peer-owned physics/compiler/collider work; no simulator changes in this lane. Production GUI build,
79 focused controls, all-motor stress bench and GUI worker/program/mixer/instructions
checks pass. The head needs position hold under gravity; the example homes it and
holds after each move. Browser measurements: 100.18 mm outward, 0.16 mm return
error, head ±30.3°, 15 instruction steps / 28 parts. All printable step images
decode; the evidence screenshot captures the viewport to avoid Chromium's long-page
capture failure. Five rover-only real-mesh/hole checks also pass with the existing assertions.
The broader all-model mesh run was stopped after seven minutes; no full-suite or
hosted-CI pass and no merge claimed.
## Straight Eight straight-line linkage intake — 2026-10-21

IMPLEMENTED / locally qualified — Codex, explicit owner request in the model-design lane. Adapt the
supplied 113-piece, one-motor Peaucellier linkage; preserve source provenance
and apply the owner's CrispStrobe / BSD-3-Clause credit to the original design.
Verify physical joint closure, straight output travel, bounded motor motion,
connected instructions, controls and EN/DE lesson before vendoring it. Treat
supplied kinematic animation and review reports as reference, not app results.


Atlas/Switchback/Straight Eight qualification checkpoint: 237 / 341 / 113 pieces,
three / three / one motors. Native VM and real-worker browser body-pose judges
pass, including the 64 mm ball cycle and Peaucellier straightness/loop closure.
184 focused controls, seven detailed geometry controls and 24 affected Pulse /
notice controls pass. Initial motor rotor angles align keyed sockets; shaft
placements are retained. Metadata is checked against the frozen official meshes.
Six fixed LDR/MPD imports, EN/DE lessons, seven manual motor controls, Stop/hold,
framing and instruction BOMs pass. Home/End navigate the longer manuals; only
rigid-mount notes start folded. Exporter verifies 38 pairs / 46 choices / 92
lessons, including standard LDraw rotor-pose geometry and separate part licences.
Production build passes. Raw source files remain byte-preserved. No independent
edits to the four peer-owned physics/compiler/collider files; no peer worktree
changes, hardware qualification or automatic merge. #1137 has now merged; this
draft still requires reconciliation with current main and exact-head hosted CI.


## Five-machine physics library intake — 2026-10-21

IN PROGRESS — Codex, existing model-design lane and draft #1138, explicit owner
request. Adapt Mean Machine, Stepworks, Stride Lab, Twinpoint and Butterfly;
preserve raw input provenance, apply original-work CrispStrobe/BSD attribution,
and test actual body motion, motor controls, instructions and EN/DE lessons.
Supplied renders and analytical validation are references, not app qualification.
Preserve peer worktrees and the four separately owned core/compiler files.

Owner added Tempo Loop to the same intake: one-motor double-crank mechanism,
85 source pieces, varying instantaneous ratio with a 1:1 revolution ratio.

Owner added Tilt Lab to this intake: 139 source parts, two nested powered
gimbal axes and an independent free ball. Check actual ball contact and
bounded tilts; the supplied demo is not an automatic maze solver.

Owner added Axis Plotter: 256 source pieces, three powered rack stages and a
removable virtual pen cassette. Verify measured coordinated XY travel and
pen lift against the source calibration, including disconnected strokes.

Eight-machine implementation checkpoint: 212 / 240 / 75 / 117 / 224 / 85 /
161 / 256 pieces, respectively. Native VM and actual-worker body-pose checks
pass for all eight. Manual motor controls, EN/DE lesson reveals and instruction
first/next/Home/End/BOM pass. Axis Plotter also completes its three-curve and
24-stroke native programs headlessly; its calibration uses separate square and
diagonal strokes. All eight assemblies pass the focused detailed official-mesh
checks. Original source bytes and hash-gated adaptations are retained. One
unqualified optional Tempo Loop stop/start program is excluded. Final exported
file input/rendered-ink checks and preview promotion follow this checkpoint.
No existing tolerance is relaxed, no peer worktree or four protected core files
are changed, and no physical build or hosted exact-head acceptance is claimed.
See docs/ROBOT-LAB-COORDINATED-MACHINES.md for geometry and numerical limits.

Final export checkpoint: the production build passes, all 16 new LDR/MPD files
reopen through the actual browser file input, and Axis Plotter renders complete
257/53-point square/diagonal strokes. Floor-pen sampling now uses simulation
advances; its previous display-paint sampling failed this drawing check. Twelve
affected pen/surface/MPD controls pass. New native/body-pose/cold-start controls,
all three Axis programs and metadata pass; the one stale model-order expectation
in the broad unit run was corrected and the 14 registry/dialect/catalogue controls
rerun successfully. Forty-four affected mechanism controls and twenty lesson/
notice controls pass. LDraw lock, adapter reproduction, asset equality and scope
checks pass. The 46-pair/54-choice export and local preview are delivered. Current
main composition and hosted exact-head CI remain pending for draft #1138.

## Phase Bridge and Magnetic Chess intake — 2026-10-21

IN PROGRESS — Codex, owner-requested continuation of draft #1138. Adapt the
144-part double-Cardan transmission and the 1,206-LEGO-part chess transporter.
Reuse the published universal-joint implementation from #1126; preserve peer
worktrees and existing core fixes when composing it. Chess requires explicit
rail/rack metadata, custom board materials and a declared magnetic force model;
CAD route animation is not physics qualification. Keep pieces independent,
validate measured transport and release, and preserve original source bytes.


## Robot Lab loading, drawing and camera repairs — 2026-10-21

IMPLEMENTED / locally qualified — Codex, explicit owner reports on the existing model-design draft
#1138. Resolve vendored primitives through the shipped file index, keep the
Axis calibration program compact while retaining automatic Blocks conversion
and physical pen feedback, and make its measured ink visible in a collapsible
preview. Follow the main frame instead of the moving bounds; explicit part
following remains available. Clarify rigid assembly notes and group repeated
part names. Refresh static extension definitions only when changed; preserve
theme/language/menu callback updates and restore a factory after a failed update.
Scope includes the Blocks container and canonical mirror, pure definition helper,
Robot Lab view/pane/text/program/lessons, tests and exact-build browser checks.

Production build and 67 focused controls pass. Cold Chromium/WebKit checks show
no post-display blanking, no failed DAT requests and no duplicate-definition
warnings. The compact default compiles to 136 authored blocks (248 including
GUI-installed support blocks), down from 6,153. Both browsers record 257/53 ink
points in the two measured strokes; square/diagonal errors stay below 0.05 mm.
Governor camera movement stays below 0.02 mm during the browser run. Loom's
rigid assembly notes retain their diagnostics and clarify that other joints turn.
Current-main composition and exact-head hosted CI remain pending for draft #1138.

### Phase Bridge qualified

The two variants are now bundled with one-motor native programs, optional 45°
steps, complete 64-page connected instructions and EN/DE lessons. Eight model,
stress and actual-VM controls pass, including frozen-output negatives; fourteen
registry/catalogue/lesson/lazy-load controls also pass. Initial geometry assertion
was corrected for serialized negative zero, with no physical tolerance change.
Production build, hash-gated adaptation, catalogue/lesson freshness and LDraw
lock checks pass. Chromium and WebKit actual-worker programs pass: middle angle
law error <0.011°, output error <0.020°; the in-phase output cancels the ripple,
while the misphased output reaches ±12.70°. Joint pivots stay within 0.001 mm.
Manual A, connected BOMs and both-language lessons pass. The 144 explicit parts
plus two inferred crosses (146 physical pieces) are documented in the lessons
and notices. Library export: 48 assemblies / 56 choices / 112 bilingual lessons.
Magnetic Chess remains in development and is not added to the library yet.

### Published rack-constraint dependency adopted for Chess

IN PROGRESS — reuse the already merged frame-relative rack implementation from
4942d86c9, its current-main negative-control fixture, and current-main's pinned
Jolt 1.1.0-bw.5 URL/integrity. Preserve existing core fixes and avoid a parallel
rack solver. The published noEndStops bench option keeps the old world-rate
constraint a meaningful negative control; ordinary end stops remain enabled.
Twenty-eight rack/slider/universal-joint controls pass. The dependency is linked
through the managed content-keyed worktree dependency store. Full model and
browser requalification is still required before updating the qualified preview.

### Chess guide collision investigation and next model intake

IN PROGRESS — the actual native Chess controller stalls its first A move.
A diagnostic excluding one entire jointed body pair permits the move; this
is not qualification and whole-body exclusions will not be used as a repair.
The scope extends to compile.js/collision-filter.js for registered, specific
sliding-guide part pairs along physically continuous runs, preserving obstacles,
gaps and all unrelated contacts. Other owners' checkouts remain untouched.
Sarrus Lift and Orbit Mixer are queued after Chess. Their supplied manifests
state 140 pieces / one motor and 161 pieces / two motors, respectively; these
are intake counts, not yet independently qualified library entries.

### Orbit Mixer qualified; Chess and Sarrus remain in development

Orbit Mixer adds a 161-piece / two-motor BSD apparatus with automatic native
program loading, two programs, EN/DE lessons, and 67 connected instruction pages.
Both native programs pass physical-pose oracles, including a frozen-paddle
negative control. The browser actual-worker planetary-law error is below 0.083°;
manual A/B, both languages and the complete 161-piece BOM pass without page
errors. The overly wide 60484 T-beam proxy arms now use 9 LDU half-widths;
the unchanged official-mesh metadata contract passes all 21 checks. This
removes false overlaps while preserving the real source model geometry.

The Chess prototype now uses four explicitly double-sided adhesive gaskets
between the glass and support tiles. Eight loose registration shims are removed
because the bonded board no longer needs them. All parts remain simulated;
no body is frozen to make transport pass. Knight and full capture programs
complete through native feedback. Full catalogue/geometry admission, measured
transfer/release oracles and app/browser packaging are still pending.
Sarrus is not registered: native deck tilt exceeds screening limits even with
more solver iterations. Preserve its failure and do not equate encoder completion
with successful spatial linkage motion.

### Spatial six-hinge loop stabilization investigation

IN PROGRESS — Sarrus' two three-hinge chains constrain the deck to one free
translation: each chain permits rotation only about its own parallel hinge
axes; the two perpendicular axis families rule out relative deck rotation.
Their two preserved axial translations leave the common perpendicular as the
translation axis. Investigate a redundant passive Jolt slider derived only when
this exact six-joint topology and geometry is present. Keep every original
hinge, gravity, contact and motor; no target deck pose, velocity or animation.
The baseline failure and iteration-only/whole-pair diagnostic failures remain
retained. Require physical deck travel/tilt/pivot checks and near-miss detector
negatives before library admission. Quickstroke is queued after these models.

### Large instruction symmetry planning

IN PROGRESS — the 1,208-piece Chess instruction gate spends minutes in the
symmetry planner's repeated whole-model searches. Extend this lane to
instructions/steps.js and focused parity controls: index parts by connector-set
bounds and type/colour, keep the exact geometric comparison and original
candidate order. No symmetry, connection, page-size or BOM check is skipped.

### Three further mechanisms: current simulation qualification

The library candidate now contains Magnetic Chess (1,208 physical pieces,
three motors), Sarrus Lift (144 LEGO pieces, one motor) and Quickstroke
(111 LEGO pieces, one motor), with native programs and complete EN/DE lessons.
Sarrus adds four deck-clearance plates. Its closed spatial linkage is stabilized
by an unpowered equivalent platform slider and the published ball relaxation
of one redundant, uncoupled elbow. The other five hinges remain. Its worm
retains absolute gear phase; ordinary worm meshes retain their impact handling.
Measured body motion, pivot closure and all six physical axes are checked,
including a frozen-platform negative. No platform trajectory is prescribed.
Quickstroke's actual stroke timing is measured in both directions, independently
of its position equation; a frozen carriage cannot pass.

The affected native model regression passes 43 controls, including Chess's
five-transfer capture sequence and zero-field negative. Engine/guide/material
controls pass 35; the metadata and official/authored geometry locks pass.
Quickstroke and Sarrus also pass native-worker browser motion, manual controls,
complete 54/49-page instructions and bilingual lessons. Chess browser and the
full real-mesh sweep remain qualification work at this checkpoint. Do not
infer a merged release or physical hardware qualification.

The instruction symmetry lookup uses numeric spatial buckets while retaining
its exact point comparison and input-order ties. It matches the original
exhaustive planner on all 51 other assemblies; its boundary/tie controls and
existing instruction suite pass 127 tests. The original Chess instruction
BOM remains complete (357 pages, 1,208 pieces). Direct hexadecimal LDraw print
colours now pass through the geometry reader and renderer, with 13 drawing,
MPD and instancing controls. This fixes the previously grey chessboard print.

Qualification update: the complete shipped/fixture real-mesh sweep passes all
8 controls, including collider overlaps, solid mesh interpenetration, shaft
insertion and shared-hole occupancy. All three new Chromium worker/browser
programs, manual ports, instructions/BOMs and EN/DE lessons pass without page
errors. Sarrus rollback is bit-identical with its retained worm phase.
The final authored print-only adjustment separates coincident graphic planes
within the unchanged glass collider to avoid depth flicker; no physical body,
connector, program or glass dimension changes. The original failed source and
intermediate diagnostics remain retained. Hosted integration and release
ownership remain separate from this lane's local simulation qualification.

### Ellipse Engine and portable builder workflow — 2026-10-21

This lane adds the owner-supplied 169-piece, one-motor orthogonal trammel,
preserving all placements and its native forward/reverse program. Independent
body-pose measurements qualify both marker ellipses, both carriage strokes,
encoder agreement, hinge closure, antiroll guidance, base stability and return.
Ordinary and strict preparation runs pass, and frozen outputs fail the oracle.
No mechanism, metadata or engine repair is needed at this checkpoint.

The accompanying reusable builder brief compares lessons from earlier repairs
and replaces machine-specific recovery bundles with a concise capability
contract: CAD-only, headless-native and app/browser access establish different
evidence. It keeps physical construction, actual program execution and useful
output observations separate, and records unsupported checks as UNTESTED.
The current motor constraint is 1–3; stale catalogs and runtime assumptions
must not overwrite newer corrected work. Browser/render and mesh admission
remain the next checks for this model at this checkpoint.

Ellipse qualification update: all 3 construction/native controls pass, including
both import modes and frozen-output negatives; the existing Quickstroke helper
regression passes 2 controls. The standard real-mesh/shaft/shared-hole checks
pass all 6 targeted controls, and 33 registry/notice controls pass. Chromium
passes the complete native-worker program, manual A, 64-page connected
instructions/169-piece BOM, EN/DE lessons and no page errors. The normal GUI
build passes. The library now contains 61 choices over 53 assemblies, with
122 offline lessons. The portable handoff is 124 lines, without an embedded
runtime or stale model inventory. No physical build or merged release is claimed.

## Scale Echo / Turnwise and release follow-through

Scale Echo retains 148 placements and two motors; Turnwise retains 127 placements
and one motor. Native ordinary/strict programs, independent output observers,
frozen-output negatives, standard detailed geometry and Chromium UI checks pass.
Current-main composition also preserves Differential car and Crane and adds their
bilingual lessons. Full hosted qualification is pending. The separately packaged
0.1.25 / 53-assembly iOS beta was accepted by Apple, assigned to both tester groups
and submitted to Beta App Review; external review is pending. Release 0.1.26 and
its Android/Windows binaries are owned in the separate release claim.

### Release qualification repairs

The dropdown now prepares an example's mat before its single model build and
keeps controls busy through automatic program import. This avoids replacing an
apparently ready worker after Blocks load. Baseline-failing method controls cover
the load order and preservation of a model-only caller's mat.

Simulate reuses Build's one-frame GPU fence pattern: a busy renderer keeps the
latest pose pending rather than accumulating obsolete frames. Physical stepping
and independent ink sampling remain separate. Queue, context-loss, forced-frame
and drawing controls pass. Magnetic Chess now completes native-worker movement,
all three manual motors and its 357-page/1,208-component manual in Chromium;
Phase Bridge variants, example filtering/chain motion, tablet gestures and the
loaded Forklift stop test pass. The stop test takes its screenshot after stopping
so slow readback cannot drive the forks into their upper limit first.

Long preset groups are partitioned with every variant and instruction retained;
eight-minute steps and thirty-minute jobs remain unchanged. Full hosted CI is
still required before release.

The qualified mat-before-program path also ends a challenge tied to the prior
mat, preserving the earlier mat-switch behavior. A regression reproduces the
stale sumo selection before this repair. Hosted tablet traces showed a completed
touch down/up on More after box selection without any compatibility click. Popup
triggers now activate completed touch taps directly and consume the optional
following click once. Fresh mouse input and keyboard activation remain available;
scrolls, cancellations and unmatched pointers do not activate. No timeout, forced
click or retry substitutes for the missing input event.

A reported Sarrus baseplate flicker reproduces numerically: the floor's painted
plane, raised 1 mm for draw ordering, cuts 0.957 mm into the thin plate during
the actual lift cycle. The floor paint and grid now remain at the physical
floor; depth bias orders the ground and paint layers, and render order separates
the grid levels. Model placements and physics remain unchanged. A native-motion
scene regression fails on the raised plane and passes on the repaired floor;
twelve affected scene, Sarrus motion/rollback and frame-queue controls pass.

Hosted qualification caught the new Sarrus scene regression's missing explicit
Three.js dependency declaration. The native motion/clearance tests passed; the
dependency boundary correctly rejected the undeclared importer. Its measured
import is now registered alongside the existing scene tests. The same observed
log fails before this one-entry correction and passes afterward; all three
Sarrus tests and eleven dependency-boundary controls pass locally.

## Thirteen follow-on physics machines — 2026-10-21

DONE locally — original CrispStrobe/BSD-3-Clause additions in the existing model
lane: Pantograph Doubler (83), Scale Studio (101), Ripple Relay (191 explicit,
193 including inferred crosses), Crossglide (216), Momentum Twins (125),
Bloom Gate (170), Amplify (155), Offset Orbit (141), Ellipsa (187), Echo Bridge
(108 rigid + two bands), Linger (158), Crossline (147) and Bit Keeper
(133 rigid + one band).
Source placements, hashes and notices are retained. Native programs, ordinary
and strict preparation, independent useful-output measurements and frozen-output
negative controls pass. Detailed geometry is checked separately. Ellipsa also
passes an unpowered cold start. The additive source totals 70 assemblies,
78 choices and 156 bilingual lessons. Full native programs, manual controls,
English/German lessons and connected instructions pass in WebKit for all thirteen.
The first nine also pass their complete hosted browser gates; the new batch and
global regression repairs still require exact-head full hosted qualification; these additions are separate from the 57-assembly release.
