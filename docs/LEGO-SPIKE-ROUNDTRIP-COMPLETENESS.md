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

## Checkpoint evidence

- **1–2 complete:** sb3-creator `a967f8b` pins and counts the canonical 84-opcode surface as
  30 mapped + 21 host-control + 4 event hats + 29 learner gaps. Removing a mapped opcode makes
  `spikeprime-census` fail.
- **3 complete:** sb3-creator `bcc65cd` proves external-CWD CLI generation, ZIP topology and
  deterministic Scratch VM execution. Mutating the distance reporter result from 12 to 0 makes
  the semantic test fail. The upstream plan records the measured boundary at `e0ec0fa`.
- **CI repair:** upstream `a023885` attaches measured evidence to the two new census bounds;
  the repository threshold ratchet then returns to its 24-item ceiling without raising it.
- **4 code complete, fresh-build verdict pending:** Lite `225faf95c` vendors the executable
  compiler contract; `4dc204ef7` wires the real File → blocks → Code → blocks → saved-file browser
  journey into the build workflow. A completed CI run exposed an opcode-predicate race against the
  pre-replacement VM; the gate now waits for the importer's explicit post-`loadProject` completion
  signal. The repaired journey passed against the deployed app with all 7 opcodes before and after
  Code and in the downloaded SB3, without fixed sleeps.
- **5 complete 2026-09-02.** The journey ran against the deployed Pages build, not a local one:
  `PROOF_URL=https://crispstrobe.github.io/brickwright-lite/ node scripts/verify-lego-spike-roundtrip.mjs`,
  all three stages green — 7/7 required opcodes in the loaded SB3, in the Code-to-blocks result, and in
  the downloaded SB3 — with zero page errors. **Deployed identity was taken from the artifact, not from
  timing:** the served `gui.b19dd2cc.js` contains `8da3b17`, so Pages is running lite `8da3b17ff`
  (Build run 33603356436: build, deploy and verify-gui all green, 31/31 browser gates — the first clean
  board since the 25-hour red streak began at `f15fd3e6c`). Screenshot `code-roundtrip.png` inspected
  personally: it shows the normalized Code for the round-tripped project — `DEVICE SPIKE`, `STAGE:`,
  `WHEN flag clicked:`, `start motor A forward`, `wait 0.25 seconds`, `set dist to (spike distance B)`,
  `display text "GO"`, `stop motor A` — with the conversion report reading `Blocks → Code ✓ OK`.
  `LEGO-ARCHITECTURE.md` already scopes this correctly ("One useful SPIKE Prime slice now crosses the
  first gap, but the generic multi-hub architecture remains open"); no EV3/NXT/Boost/WeDo/Powered Up
  claim is inferred from this hub.

- **What inspecting the screenshot found, which the gate could not.** The Code pane renders TWO globals
  where the source declares one: `GLOBAL dist = 0` on line 4 and `GLOBAL dist` on line 5. That is not a
  round-trip fault — the round trip preserves faithfully what it is handed — it is an sb3-creator parse
  defect that the fixture happens to exercise. `sb3Creator.js:5109` matches
  `/^(GLOBAL|LOCAL)\s+(.+)$/i` and takes `decl[2]` as the variable NAME, so `GLOBAL dist = 0` creates a
  variable literally named `dist = 0` and drops the initial value; if the program later uses the
  variable, a second, correct-but-uninitialized one is created beside it. Minimal repro against the
  vendored copy:

  | source | produced |
  | --- | --- |
  | `GLOBAL dist = 0` | variable named `dist = 0` |
  | `LOCAL n = 3` | variable named `n = 3` |
  | `GLOBAL LIST xs = [1,2]` | list named `xs = [1,2]` |
  | `LOCAL LIST ys = []` | list named `ys = []` |
  | `GLOBAL dist` (bare) | variable named `dist` (correct) |
  | `GLOBAL LIST xs` (bare) | list named `xs` (correct) |

  **Corrected 2026-09-02: the defect is four forms wide, not one.** My first table recorded only the
  scalar `GLOBAL` case; bw-ci measured the other three and I re-verified all four independently against
  the vendored copy. The same shape sits at `sb3Creator.js:5095` for the LIST form, and neither regex
  excludes `LOCAL`. Two consequences worth having before anyone starts: the LIST case is the nastier
  one, because `xs = [1,2]` becomes a NAME containing brackets and a comma, so any later display or
  round trip carries a name that reads like a literal; and `LOCAL` names are scoped per target
  (`${currentTarget.name}:${name}` in `declaredLocals`), so a corrupted LOCAL cannot collide across
  sprites and is correspondingly less likely to be noticed by eye than the GLOBAL that surfaced here.
  The emitter hole is four-wide to match — `5635` `GLOBAL ${v[0]}`, `5636` `GLOBAL LIST ${l[0]}` and the
  `LOCAL` pair near `5653` — so a corrected parse alone would not round-trip an initializer in any of
  the four. This belongs to sb3-creator and its
  lane, NOT to this claim and NOT to lite — the vendored copy must not be edited in place (house rule 5).
  Recorded here rather than fixed here, and deliberately not re-vendored: lite's `main` had been green
  for minutes when this was found, and a sb3-creator re-vendor is a pin change that deserves its own
  push rather than riding a closure.
