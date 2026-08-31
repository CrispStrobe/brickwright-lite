# LEGO SPIKE round-trip completeness progression

Claimed 2026-08-31. This is a greater-than-two-hour, five-checkpoint
cross-repository progression that closes the measured remainder of
`docs/LEGO-ARCHITECTURE.md` Gap 1 for the canonical SPIKE Prime surface.

The starting point is not the document's old statement that no edge exists.
sb3-creator already has a hand-written `DEVICE SPIKE` forward/decompile path
and one obstacle-avoidance fixture. What is absent is a proof that this path
matches the extension actually shipped by Lite, a CLI/archive boundary test,
VM execution evidence, and a deployed Blocks ↔ Code journey. A small green
spot-check is not completion when the extension can add, rename or reshape a
block independently.

## Task list and definitions of done

### Checkpoint 1 — claim and executable surface census

**DoD**

- This claim and task list are pushed to Lite `main` before implementation.
- A generated or structurally derived census compares the canonical bundled
  `spikeprime` `getInfo()` opcodes, block kinds, arguments and menus with the
  sb3-creator parser/decompiler mapping.
- The census refuses an empty/unloadable extension and reports exact mapped,
  deliberately one-way and missing denominators; prose or comments cannot
  satisfy it.
- At least one mutation that removes a real mapping makes a named test fail.

### Checkpoint 2 — complete and pin the upstream dialect contract

**DoD**

- Every learner-facing canonical command, reporter and Boolean block is either
  round-trippable with its real argument shape or appears in a committed,
  reason-bearing exclusion ledger.
- Forward parsing and decompilation preserve menus, numeric/string inputs,
  reporter nesting and control-flow placement without silent defaults.
- Representative motor, motion, display/sound and sensor programs reach a
  fixed point with zero warnings.
- The source-of-truth relationship is pinned to immutable provenance so Lite
  extension movement cannot silently make the compiler's green tests stale.
- Focused mutation checks cover a command, reporter and argument/menu mismatch.

### Checkpoint 3 — real CLI archive and VM semantics

**DoD**

- `bw transpile ... --to sb3 --device spikeprime` produces a real ZIP whose
  `project.json` carries the canonical extension id and only valid block/input
  shapes; the command works from outside the repository working directory.
- Re-reading that archive reproduces the normalized `.bw` program.
- Scratch VM loads the archive with the bundled extension registered and
  executes a deterministic no-hardware journey through a controlled runtime
  seam; command order and reporter consumption are asserted, not merely load
  success.
- Archive corruption, a missing extension declaration, or a dropped motor
  command each makes a named test fail.
- Upstream focused, fast and full CI verdicts are green before the final pin.

### Checkpoint 4 — Lite vendor and browser integration

**DoD**

- Lite vendors one reviewed sb3-creator SHA together with its example/gallery
  tree; both `--check` guards report no drift.
- A Lite consumer gate asserts the shipped compiler, bundled extension and
  example agree on exact opcodes and argument names.
- A real browser opens the named SPIKE example, proves its LEGO blocks are
  present, switches to Code, reads normalized pseudocode, recompiles it, and
  proves the same extension-block structure survives.
- The journey requires no physical hub and must not claim remote/on-brick
  deployment semantics it did not exercise.
- Existing user package-lock and translation changes remain byte-identical and
  uncommitted.

### Checkpoint 5 — deployed proof and truth correction

**DoD**

- The browser journey runs against the exact matching Pages deployment and
  records build identity, upstream pin, opcode/script denominators, artifact
  hashes and zero page errors.
- The coordinator personally inspects one screenshot that visibly contains
  the SPIKE blocks or the normalized Code representation.
- `LEGO-ARCHITECTURE.md`, upstream `PLAN.md` and ledgers distinguish the
  completed canonical SPIKE slice from the still-open EV3/NXT/Boost/WeDo/
  Powered Up mappings; no family-wide claim is inferred from one hub.
- The claim moves to DONE with all SHAs, local and remote default branches
  agree, and no accepted code exists only on this VPS.

## Coordinator verification rule

Agent audits are inputs. The coordinator reviews every diff and fixture,
reruns focused and adversarial tests, checks archive bytes and browser output,
integrates onto current remote defaults, and owns every acceptance and push.

