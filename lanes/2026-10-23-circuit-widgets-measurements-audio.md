# Circuit measurements, reusable organ faceplate and sampled audio

DONE (implementation) — Codex circuit/performance owner, isolated source branch,
base `e3be735b3`; final consumer build/browser and exact-head hosted qualification
remain landing gates.
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

Qualification available before consumer landing: 24 runtime/widget and project
consumer controls pass, including a complete SPIKE compiler round trip. The
project owns circuit bindings while Widgets is closed; only physical input
capture belongs to the visible pane. Stop All, board replacement, edit/Play and
saved tuning have executable controls. A full-app hidden-pane negative exposed
the previous missing binding before this repair.

Actual React components with the real circuit engine pass Chromium and WebKit
checks for keyboard/pointer ownership, tuning, restored layout, cancellation,
measurements, power warnings and bounded sampled audio. The organ produces
measured 261.3 Hz pulse envelopes; changing the actual trimmer changes frequency
to 386.1 Hz. A separate 1 kHz sampled-source benchmark renders at 1 kHz through
native Web Audio. Earlier full-app File Save/fresh-context Open and programmed
eight-key playback pass; final integrated supplier adoption is checked again
before landing. These automated checks do not establish actual Safari audio,
acoustic or physical acceptance.

Suppliers landed first: [circuit UI PR108](https://github.com/CrispStrobe/bw-circuit-ui/pull/108)
and [compiler/examples PR164](https://github.com/CrispStrobe/sb3-creator/pull/164).
Canonical immutable adoption uses circuit UI `17fd4afb0bf27015b099ca67c9cca05919084654`
and compiler/examples `371a8f9d4489a91a9a596135a40cbdc6dbc1c7d7`.
Installed package payloads match pinned Git/npm pack bytes in both package
scopes, with one resolved engine. Generated notices, provenance and active
adoption guards follow the new pins; historical run receipts retain their
measured source. No solver limits or oracle tolerances are changed. The broader
Linux qualification controls require hosted Linux; Mac-only failures at Linux
OS APIs are retained and are not reported as passes.
