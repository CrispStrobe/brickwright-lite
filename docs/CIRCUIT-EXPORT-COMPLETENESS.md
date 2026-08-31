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
