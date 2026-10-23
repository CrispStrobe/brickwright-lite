# Circuit measurements, reusable organ faceplate and sampled audio

IMPLEMENTED LOCALLY — Codex circuit/performance owner, isolated source branch,
base `e3be735b3`; supplier adoption and hosted qualification pending.
User authorizes product implementation now; extensive manual/hardware acceptance
is deferred. Preserve other owners' branches, worktrees, previews and claims.

Own the three school-circuit example definitions, organ `controller.json` and
program, their index/generated copies, and focused tests. Use the existing
right-hand Widgets panel: eight named momentary buttons bind to Key1–Key8;
eight adjustable controls bind to Trim1–Trim8. Keep controller blocks and
pseudocode programmable through the existing controller API. Add generic,
editable keyboard shortcuts for momentary buttons with release on cancellation,
blur, edit mode, removal and unmount. Persist config through the existing panel
and example/project serialization; no organ-specific hidden UI or fake tone.
Own narrow changes to controller-panel-view.jsx, new pure shortcut helpers,
associated GUI-scope declarations and canonical mirrors. New pseudocode or
serialization changes only where a demonstrated existing seam needs repair.

Supplier-first envelope: claim and implement `bw-circuit-ui` component voltage,
current and dissipated-power readouts with explicit unavailable states and
configurable component limits; support authored AA alkaline/NiMH/balanced-R5
variants through saved example circuits rather than solver approximations.
Also add bounded continuous audio transport from actual contiguous sampled
scope data, preserving capture replay/WAV. Report buffering/underruns honestly;
never invent oscillator samples, hide solver failures or change pitch to disguise
slow simulation. Preserve physical models, tolerances, solver budgets and units.
Adopt only qualified exact supplier revisions via the canonical pin/lock process.

Require focused executable controls for real bindings and release lifecycle,
example/Save/Open persistence and blocks/pseudocode, electrical readings and
power warnings, variant topology/current paths, actual sample timing and bounded
audio queues. Use automated browser checks for new UI paths. No physical,
acoustic, installed-native or universal-SPICE equivalence claim. No hardware,
firmware, native build/release, scheduler or unrelated Robot Lab work.

Local qualification: 13 shortcut/binding/lifecycle controls pass. Actual React
components with the real circuit engine pass Chromium and WebKit checks for
keyboard/pointer ownership, tuning, serialized layout restoration, release and
unmount. The organ produces measured 261.3 Hz pulse envelopes; a separate
1 kHz sampled-source benchmark renders at 1 kHz through native Web Audio.
These component checks do not establish integrated Scratch VM Save/Open,
actual Safari audio, acoustic or physical acceptance. Supplier CI and canonical
immutable adoption remain required before landing this consumer candidate.
