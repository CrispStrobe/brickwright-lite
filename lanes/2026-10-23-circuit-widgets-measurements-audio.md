# Circuit measurements, reusable organ faceplate and sampled audio

DONE (implementation) — Codex circuit/performance owner, isolated source branch,
base `e3be735b3`; exact-head hosted consumer qualification remains the landing gate.
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

Qualification available before final consumer landing: 119 widget/runtime and
project-bundle controls pass without skips, including the complete SPIKE compiler
round trip. Project-owned circuit bindings work while Widgets is closed; physical
input capture belongs to the visible pane. Stop All, board replacement, edit/Play,
saved tuning and vanilla project replacement have executable controls. An actual
full-app hidden-pane negative exposed the previous missing binding.

A production build and actual full-app browser checks pass Code-to-Blocks,
programmed keys with Widgets never mounted, keyboard input, tuning, File Save and
fresh-context Open. Component voltage/current/power and authored-limit warnings
pass. Actual native Web Audio renders the 1 kHz sample fixture at 1 kHz; observed
underruns are visible, and Build mode stops audio. Component Chromium/WebKit
checks also pass. These checks do not establish actual Safari audio, acoustic or
physical acceptance. Final compiler adoption receives a fresh consumer build and
browser check before landing.

Suppliers landed first: [circuit UI PR108](https://github.com/CrispStrobe/bw-circuit-ui/pull/108),
[compiler/examples PR164](https://github.com/CrispStrobe/sb3-creator/pull/164), and
[Controller menu repair PR166](https://github.com/CrispStrobe/sb3-creator/pull/166).
Canonical immutable adoption uses circuit UI `17fd4afb0bf27015b099ca67c9cca05919084654`
and compiler/examples `1cbaeed325f5a890e43b78a4211acae8f801f2d2`.
Installed package payloads match pinned Git/npm pack bytes in both scopes, with
one engine. Notices, provenance and active adoption guards follow the pins;
historical receipts retain their measured source. Original consumer CI caught
missing Controller menu shadows, the four new circuits absent from the census
count, and noncanonical Linux lock metadata. Preserve these failures. The
supplier repair has 179 focused and 60 actual-VM controls passing; all five
consumer corpus/placement controls pass across 1516 circuits. Canonical Linux
npm lock generation is byte-stable. Current main's 26 affected measurement plot,
history, preset and pane controls pass after normal composition. No solver
limits or oracle tolerances are changed. Linux qualification runs on hosted
Linux; original Mac failures at Linux-only OS APIs remain retained.

The subsequent hosted VM-corpus failure exposed a verifier gap: generated
reporter-menu shadows were checked as extension commands requiring same-named
methods. Derive reporter menus from the extension's own `acceptReporters`
metadata; preserve definition-plus-method checks for commands and refusal of
unknown menus. Two executable instrument controls and the original organ row
fail on the prior verifier; all 336 complete VM-corpus/menu controls pass after
repair, with zero skips. No opcode ratchet allowance or product change is used.
