# Live measurements in the Robot Lab

In **Simulate → Show → Measurements**, add measurements, choose their targets,
and enable **Show in model** to draw live labels, connecting lines and vectors.
Joint choices identify the connected assembly parts (and the hub when present).
The panel also shows each saved measurement's targets. Each measurement can be hidden or removed independently. **Reset to recommended
measurements** restores structural presets: an assembly's mass and speed,
motor angles, slider travel, and rope or wheel loads where the model supports
them. A lift therefore offers travel; a wheeled robot offers a wheel load.

Custom measurements support:

| Quantity | Target and units | Meaning |
| --- | --- | --- |
| Model mass | No part target, g | Configured masses of all simulated model assemblies, including clamped pieces; excludes the ground, mat and scenery |
| Mass | One part, g | Configured mass of its rigid assembly, including joined parts |
| Weight | One part, N | That configured mass multiplied by scene gravity |
| Speed | One part, m/s | Jolt linear velocity at the assembly's centre of mass |
| Sampled acceleration | One part, m/s² | Magnitude of the centre-of-mass velocity difference divided by its simulated-time interval; unavailable until two valid samples, after reset or across a gap over 250 ms |
| Pneumatic gauge pressure | A part belonging to one connected pneumatic/pump network, kPa | Existing network pressure above atmospheric pressure; ambiguous or disconnected targets are unavailable |
| Angular speed | One part, degrees/s | Magnitude of the assembly's Jolt angular velocity |
| Motor torque | Bound hinge, N·m | Signed active motor impulse divided by the last completed fixed step; body 2 relative to body 1. Passive bearing friction is separate and motor-off reads zero active effort |
| Joint limit torque | Bound hinge, N·m | That hinge's local angular-stop impulse divided by its fixed step; zero when its stop supplies no reaction. This is not the sum of all connected constraint loads |
| Mechanical motor power | Bound hinge, W | Signed motor torque times the matching step's relative angular speed. Holding still has zero mechanical power; braking can be negative. This is not electrical consumption |
| Distance | Two part origins, mm | Current three-dimensional separation |
| Angle | Three part origins, degrees | A–B–C, with B as the vertex; range 0–180° |
| Joint angle / angular speed | Hinge, degrees or degrees/s | Signed relative, unwrapped hinge coordinate or rate |
| Slider travel | Slider, mm | Signed displacement from the joint's initial coordinate |
| Rope tension | Rope, N | Existing rope constraint impulse divided by its fixed timestep |
| Wheel normal load | Part of a rolling wheel, N | Existing rolling model's estimate from vertical acceleration and joint impulses |

The panel identifies the source of each reading. Unsupported wheel diagnostics,
missing targets and degenerate angles display **Unavailable**, never an invented
zero. Selecting a motor part refers to one of its compiled rigid assemblies;
select a joined axle, wheel or housing part to disambiguate which assembly.
These are simulation observations, not hardware measurements or accuracy claims.
Configured mass can differ from solver mass adjustments; weight is explicitly
calculated from configured mass. No total contact-force, electrical-power or energy reading is inferred from these quantities. Motor torque uses its own solver impulse rather than mass times acceleration.

Vectors use diagram scales: velocity multiplied by 0.1 seconds, and forces at
20 mm per newton. Labels carry the actual values and units. These scales affect
only drawing. Distance lines and angle legs join the measured part origins.

Definitions and individual visibility save with the model in the project's
`.sb3` bundle. They survive Reset and Build/Simulate transitions. Switching
examples keeps each model's definitions during the current pane session.
Standalone LDraw exports carry the model geometry; use a project save to retain
measurement definitions. Recompilation checks joint/rope bindings and reports
missing targets rather than silently attaching to a reused generated id.
Use **Edit** beside a saved measurement to change its name, quantity or targets
without removing it. **Save changes** replaces that definition in place, keeping
its order, visibility and plot selection; **Cancel** discards the draft. Editing
remains available when all 64 definition slots are occupied. If its model or
saved definition changes while the editor is open, the stale draft is refused.
For joint and rope readings, the editor asks for an explicit selection when the
saved binding no longer matches the current mechanism; saving refreshes the
binding to that selected joint or rope.

Pause refreshes the final readings, including a short worker update after the last regular sample. Running readings remain sampled every 100 ms of simulated time. Pose replay hides live readings and overlays until the
view returns to the current simulation. Measurements never drive the model or
change physics state, timesteps, solver settings or dependency versions.

The implementation observes the existing Jolt simulation. No additional
mechanism solver or third-party teaching library is required.


Model mass counts physical assemblies once, including both mass shares of a
split motor. Drawn-only decoration without a physical body contributes no mass.
The total is configured simulation mass, distinct from any solver mass floor.

Large assemblies use compact target identities without increasing the saved
field-size limit. Existing project files with the earlier joint or rope identity
format remain readable; changing the target assembly still makes a reading
unavailable rather than silently selecting a different target.


Each reading has a **Time plot** checkbox. Choose up to four plots to compare
values over simulated time. A plot keeps at most 128 samples over the latest
12.8 simulated seconds, with one regular sample every 100 simulated milliseconds.
Pause refreshes the final point. The horizontal axis starts at the first retained
sample; the value axis uses the reading's own unit. Current, minimum and maximum
values are also available as text. Missing values leave gaps rather than zeroes.

Plots are temporary observations: hiding or removing a reading stops its trace;
Reset, a different model or a changed target clears its history. Pose replay hides
live plots, and returning live starts a fresh window. Plot choices and samples are
not stored in project files. Saved measurement definitions continue to work as
before. These sampled traces do not establish peak forces or hardware accuracy.

The shipped **Crank and rocker** and **Forklift** examples also offer **Apply lesson
measurements**. The first compares input/output angles and rocker speed; the second
shows input rotation, carriage travel and configured carriage weight. Applying a
lesson set explicitly replaces the current definitions. The targets are checked
against authored parts and current joint bindings; an unsupported or changed
model keeps the existing structural recommendations instead of selecting another
joint. Imported models retain custom measurements and structural recommendations.


## Select targets in the scene

Use **Pick in model A/B/C** beside a part selector, then click a visible part.
The selected part highlights and fills the current draft. Dragging the camera
never picks a part. Escape or Cancel stops picking. The selectors remain usable
by keyboard and when WebGL is unavailable. A preview shows the draft reading
and its geometry before Save; Cancel leaves the saved definition unchanged.
Changing the model or definition invalidates pending picks and stale drafts.

Overlays consume the same committed readings as the plots. Rendering and draft
previews cannot advance the acceleration sampling stream. Acceleration reports
a sampled magnitude, including changes in velocity direction; it does not
report instantaneous peak force. An assembly rotating about its centre of mass
can have zero linear speed and acceleration; use angular speed to observe that
rotation, or choose a translating assembly such as the crank-rocker's coupler.
Pressure reports the connected air model,
whose ideal supply, cylinder and valve approximations remain documented in
[the physics limits](ROBOT-LAB-PHYSICS-LIMITS.md).

## Record and compare experiments

Select up to four **Time plot** checkboxes, then **Start recording**. Recording
captures the current observation at elapsed time zero and subsequent actual
readings at least 100 simulated milliseconds apart. **Stop recording** freezes
the run. The final paused observation retains its actual timestamp.

Keep up to two runs, each bounded to 600 sample sets or 60 simulated seconds.
For a second recording, Reset restores that recorded model’s plot selection.
Record the same model and measurements again to compare runs. Comparison uses exact shared elapsed times and shows each run's range and
the difference where both readings exist. Missing values remain gaps. It does
not interpolate, claim repeatability, or establish physical accuracy. A changed
model, quantity, target or binding refuses comparison; clear the recordings to
start a different experiment.

**Download CSV** exports the captured values, simulated elapsed times, units,
sources, model digest and measurement definitions. Each run declares each
measurement definition once; subsequent rows refer to its measurement ID. Unavailable values are blank
with a reason. User text is quoted and spreadsheet formula prefixes are escaped.
Closing the panel stops recording. Project saves freeze any active capture and
store completed recordings and plot choices with the current model. Reopening
the project or releasing and reopening the Robot Lab restores them. Four model
histories may be retained while switching examples in one pane; the project
stores its current model, as before. Export or clear a history before recording
a fifth model. Opening a different project clears that pane cache.

**Import CSV** adds compatible completed runs. Clear existing recordings first
to replace them or resolve duplicate run IDs. Import checks the model, current
measurement definitions, units, sources, timestamps and all recording limits;
failed, oversized or superseded file reads leave existing runs unchanged. Imported CSV is labelled as supplied data, separately from recordings made here; it is not authenticated simulator or hardware evidence.
Unavailable values remain gaps. CSV supplies elapsed times, so imported data
has no invented absolute capture time. Historical gaps and original bindings
remain in saved recordings even when a live target becomes unavailable.

New captures identify the authored model using its saved LDraw serialization,
with fixed header names and the serializer's six-decimal coordinate precision.
The original opened-text digest is separate provenance. This model identity
excludes the mat/environment, catalogue and engine version; comparison does not
claim identical experimental conditions or physical repeatability. Existing
12-column CSV is accepted when its model identity matches. Portable re-exports
of legacy raw-text histories add `canonical_model_sha256` as a thirteenth
column, retaining the original digest and checking the current authored model.

Saved histories use compact tuples with a 512 KiB limit inside the existing
1 MiB Sim Lab section and 2 MiB project-state limits. A refusal is shown rather
than attaching stale saved content; it continues to block that stale export
when the pane is closed. Export CSV or clear unused content and save again.
A successfully loaded new project starts with its own state.

Dedicated lesson sets now also cover **Gearbox**, **Sky Courier** (ropes and
pulleys), **Snapgate** (spring travel) and **Pneumatic cylinder**. Each explains
the relationship to investigate and checks authored parts and joint roles before
applying. See [lessons and dynamics](ROBOT-LAB-LESSONS-AND-DYNAMICS.md).

## Saved-project evidence

New successful measurement browser qualifications retain the original generated
SB3, edit report, downloaded CSV and experiment report for seven days. The effort/history journey also retains its own saved-history SB3 and report, without replacing the original edit journey. The
standalone reader uses Python's standard library, without importing the browser
producer or simulator:

```sh
python3 scripts/read-sim-lab-measurement-artifact.py artifact-directory \
  --checkout EXPECTED_CHECKOUT_SHA --tree EXPECTED_TREE_SHA
```

Supply the expected identities from independently admitted workflow checkout
metadata. The reader checks ZIP CRCs and bounds, actual saved model and sidecar
contents, before/save/reopen definition equality, original hashes, and CSV
source/definition/time joins. Original successful files from older runs were not
retained; this change does not invent or replay those originals.

## Assembly physics inspector

Expand **Assembly physics** in the measurement panel and choose a rigid assembly
by its generated body ID and member part IDs. The inspector shows configured
mass and effective solver mass separately, world-space centre of mass in metres,
and the solver's tensor about that COM in local body axes (kg·m²). Static/clamped
bodies have no finite dynamic solver mass or tensor to report. The panel labels
mass adjustments, the initial small-body inertia fallback repair, and later
numerical/reflected-rotor inertia additions separately. These observations come
from the accepted physics state and are unavailable during pose replay.

The additional official originals are mandatory for the new history audit:

```sh
python3 scripts/read-sim-lab-measurement-artifact.py DIRECTORY --checkout COMMIT --tree TREE --require-history
```

This independent consumer verifies all six originals, including saved/history/
remount equality, canonical saved-model headers, every captured CSV value or gap,
plot selection, completed-step effort/power joins and finite inspector properties.
The old four-file mode remains available for its explicitly older evidence.

## Additional diagnostic channels

The editor offers passive hinge friction torque (N·m), slider motor and limit
force (N), slider motor power (W), cumulative screw slip events, filtered screw
supporting load (N), and contact presence (0/1). Joint readings retain their
member-part binding when saved. Motor, limit and passive friction channels are
separate. Force and torque use the last completed native constraint impulse
and its step interval; mechanical power uses the matching relative velocity.
Missing, stale or unsupported readings remain unavailable.

Screw supporting load is the existing filtered, previous-step absolute load;
it is not signed instantaneous contact force. Contact presence joins two
selected authored parts to their distinct rigid bodies and reads current native
body contact after a completed step. It supplies no magnitude, direction or
contact point. Contact polling is unavailable for scenes above 128 rigid bodies.
No new force model, timestep, solver setting or calibration is introduced.

## Fixed-step period, phase and work

Select up to four joint measurement plots, choose a period mode and angular
threshold, then explicitly start **Period, phase and work**. Oscillation mode
uses rising threshold crossings; full-rotation mode uses successive complete
turn crossings in the current direction. Crossings are linearly localized
between adjacent completed steps. Reversing rotation resets its period estimate.
Phase is the signed lag relative to the first selected hinge, wrapped to
−180…180 degrees; opposite rotation directions are not compared. A period needs
two observed crossings. A stationary signal or unobserved crossing has no value.

Motor work is the signed discrete sum of completed-step power times step
interval since analysis started. Braking contributions remain negative. These
analyses consume only accepted worker batches, after retry decisions and hub
replay. Changing selection, mode or threshold starts a new analytical interval;
reopening a project does not automatically arm analysis. Packet overflow,
missing values or a discontinuity makes complete-interval work unavailable.
No raw unbounded trace is retained. This improves temporal observation without
establishing physical calibration or accuracy below the fixed timestep.

## Recording a bounded window in a long run

**Window for long runs** takes an absolute simulated start time and a duration
of at most 60 seconds. While armed it retains configuration only. Once the
window starts, the existing four-trace, 600-sample-set and two-run bounds apply;
there is no pre-start buffer. Late observations keep their actual timestamps
and elapsed offset from the requested start. A missed window is reported and
never shifted. Session, model, binding or replay changes cancel capture;
saving stops capture or cancels arming. Project reopen never re-arms a window.

Saved runs carry `bw.sim-lab.recording-window.v1` metadata, independently checked
against absolute timestamps on admission. Ordinary CSV retains its existing
format and cannot reconstruct window provenance from elapsed time alone.

## Structural packs and explicit model pairs

**Measurement packs for this model** offers explicit choices based on uniquely
identified motor ports, slider joints, spring sliders, ropes and pneumatic
networks. Applying a pack replaces the current measurement definitions; those
ordinary bound definitions are saved with the model. Ambiguous or missing
roles are refused. Structural recommendations do not establish a model's
mechanical law, construction accuracy or suitability as a causal control.

The qualification helper reads the exact 60-entry PR1336 source checkpoint
`8ecbb4c116e4123fb9de18cdb71570c0dad2ceb9`. It separates model hash and role
resolution checks, JSON definition persistence, and the smaller actual browser
project pilot. Coverage of a source entry does not imply powered or mechanical
qualification of that entry. The source model and delivery ownership remain
with PR1336.

Ordinary recording and CSV import still require the same authored model and
measurement bindings. **Explicit control pair** instead requires two retained
model histories and deliberate baseline/control run and channel choices. It
occupies the current model's two run slots. Up to four one-to-one mappings must
have the same quantity, units and source semantics. There is no inferred label
match, conversion, sign correction or interpolation. Deltas mean control minus
baseline at exactly shared elapsed times; unavailable observations stay gaps.

The saved `bw.sim-lab.experiments.v2` envelope retains both models' canonical
identities, original capture identities, origins and each definition's binding.
Its current-model anchor is checked again on reopen; a foreign history remains
historical data. Both roles and their bindings are displayed. Existing byte,
run, sample and duration caps apply to the complete pair. Clear the pair before
ordinary capture; changing live bindings cannot silently rewrite its provenance.

New successful qualifications retain a separate paired SB3, dynamics report and
60-entry structural-persistence report. Audit them without importing the app:

```sh
python3 scripts/read-sim-lab-dynamics-artifact.py DIRECTORY --checkout COMMIT --tree TREE
```

The independent reader checks the new original bytes, canonical model joins,
paired identities and mappings, source/units/gaps, coverage joins and signed
work from the retained accepted fixed-step packets. It supplements the existing
six-original reader; earlier successful originals are not replayed.
