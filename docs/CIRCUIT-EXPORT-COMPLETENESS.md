# Circuit export completeness progression

Claimed 2026-08-31. The measured starting point is intentionally narrower than
the old roadmap promise:

- circuit export commands are received by `BoardCanvas`, which is not mounted
  in Schematic or Board view;
- scope and sweep CSV can be copied, but not downloaded as a file; and
- there is no LaTeX/TikZ circuit exporter to register or surface.

The work is split into independently useful checkpoints. Each checkpoint is
pushed immediately after its own definition of done; the final Lite pin points
at one reviewed upstream commit, not a succession of half-vendored snapshots.

## Progress

| checkpoint | remote evidence | state |
| --- | --- | --- |
| claim and contract | Lite `a6edb82f9` | complete |
| view-independent owner | bw-circuit-ui `bf74620` | complete |
| trace downloads | bw-circuit-ui `cbfd331` | complete |
| deterministic Circuitikz | bw-circuit-ui `9cc6a3f` | complete |
| cross-view browser bytes | bw-circuit-ui `9b3abdb` | complete |
| Lite vendor and consumer | Lite `f9f997008` | complete |
| deployed artifact proof | Lite `496db0d76`..`83214cb13`; Pages `f9f997008` | complete |

## Production evidence

GitHub Pages deployment `6182391235` published Lite `f9f997008`, the exact
product commit that pins bw-circuit-ui `9b3abdb07401700c669471c4aca18c54bc9cdc16`.
The later Lite commits only add, strengthen and wire the acceptance proof.

The coordinator ran the corrected proof against the live Pages URL and
personally inspected its 1440×900 Board-view screenshot. It loaded the named
`50-rc-scope` circuit, entered simulation, exported a 1,212-byte Circuitikz
document in Realistic, Schematic and Board views, and obtained the identical
SHA-256 `dc81a507f9969c8d25b7675013d298a48f5d6c865c2478c7c8922db4feff7cc0`
in all three. The same journey downloaded one honest envelope trace with
8,192 numeric rows. It recorded four downloads, hashed assets
`chunks/2923.acafc33f95f63349f3f8.js` and `gui.2f0326ec.js`, and zero page
errors. The screenshot visibly contains the named RC circuit, active Board
view simulation, populated scope waveform and trace-download control.

## Checkpoint 1 — claim, measurements and executable command contract

**DoD**

- The claim and this progression are on remote Lite `main`.
- A focused upstream test reproduces export delivery in all three views and
  fails against the measured mount-coupled implementation.
- The test distinguishes “event dispatched” from “download produced”; a
  listener that merely consumes the command cannot make it green.
- Ownership is explicit: one mounted designer-level controller receives file
  commands, while canvases render and request actions.

## Checkpoint 2 — view-independent circuit exports upstream

**DoD**

- Import/export command handling no longer depends on `BoardCanvas` being
  mounted, and exactly one handler owns each command.
- Realistic, Schematic and Board views each produce the same selected export
  artifact from the same circuit state.
- Cold-start delivery remains green and listener teardown is proven (no
  duplicate downloads after remount/view changes).
- Focused mutations — removing the owner, restoring the canvas-only listener,
  or double-registering it — each make a named test fail.
- The focused suite and upstream `npm test` are green before push.

## Checkpoint 3 — downloadable trace CSV and deterministic TikZ upstream

**DoD**

- Scope and sweep retain clipboard copy and additionally download CSV through
  the shared download utility, with stable filenames, headers, units and full
  precision covered by tests.
- The shared exporter registry exposes a TikZ circuit document with a stable
  extension/MIME type and deterministic output.
- TikZ escapes user-controlled labels and values; disconnected pins and
  repeated nets stay visibly distinct; output contains no viewport-dependent
  coordinates or transient UI state.
- At least three hand-reviewed fixtures cover a simple passive network, a
  labelled multi-part net and characters requiring TeX escaping.
- Mutation checks prove CSV is a real download and TikZ connectivity is not
  fabricated or dropped.
- Upstream unit, render and 21-scenario interaction gates are green; heavy
  browser work runs only if VPS load and memory allow it.

## Checkpoint 4 — Lite vendor and consumer acceptance

**DoD**

- Lite pins and vendors one full upstream SHA; vendor check reports no drift.
- A Lite contract test asserts the command owner survives all three views and
  that the registry contains TikZ.
- A local production build passes when resources allow; otherwise the
  consolidated Lite push uses the existing CI build once, without queue
  polling loops.
- Existing user changes in package lock/translations remain byte-for-byte
  untouched and uncommitted.

## Checkpoint 5 — browser proof, ledgers and release

**DoD**

- A real-browser journey loads one named circuit, exports from each view, and
  validates downloaded bytes rather than only button text.
- The same journey downloads scope or sweep CSV and checks its header plus at
  least one numeric row.
- It records an exact denominator, zero page errors, the Lite build identity,
  upstream pin and artifact hashes; one screenshot is inspected by the
  coordinator.
- Production is probed only after the matching Pages deployment is available;
  CI queues are checked opportunistically, not waited on repeatedly.
- ROADMAP/LANES wording is corrected to measured present tense, the claim moves
  to DONE with SHAs, local and remote default branches agree, and no accepted
  work remains only on the VPS.

## Coordinator verification rule

Agents may audit or implement bounded pieces, but their reports are inputs, not
verdicts. The coordinator reviews every diff, reruns focused tests, performs the
mutations or equivalent adversarial checks, integrates onto current remote
defaults, and alone decides that a checkpoint satisfies its DoD.
