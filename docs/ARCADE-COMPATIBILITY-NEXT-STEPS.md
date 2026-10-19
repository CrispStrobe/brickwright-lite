# Arcade compatibility: integration and next steps

## Start here

Read this document, `LANES.md`, and the Arcade handoff/capability documents
available on the selected integration branch. In an operator checkout, also
read the ignored `CLAUDE.md` for the private source inventory, exact commands,
original evidence, recovery locations and current branch heads. Private machine
paths and raw evidence must stay out of commits and pull requests.

This is a handoff for pending work. It does not declare complete MakeCode
compatibility or qualify the pending source as part of `main`.

## Integration blocker

The foundation in [PR #888](https://github.com/CrispStrobe/brickwright-lite/pull/888)
is still open. At this checkpoint six enabled checks failed: four unit shards
and the light/heavy browser checks. Refresh the exact head and checks before
acting; these are observations, not permanent classifications.

The subsequent constructor, callback, Sprite and importer work depends on that
foundation. A source audit found 22 owned paths absent from the checked main
and 101 direct imports requiring foundation files absent there. Applying only
the latest feature commits would leave an incomplete implementation. Preserve
main-only edits and integrate the actual prerequisite closure; never overwrite
main with an older integration tree or silently replace dependency pins.

## Candidate capabilities and their observed boundaries

| Area | Candidate behavior | Boundary still requiring qualification |
| --- | --- | --- |
| Constructor parameter properties | Ordered public/private/readonly parameter-property initialization; instance-local state and callback fields | Main integration, new composed regression and editor authoring |
| Constructor callbacks | Canonical Number and Void signatures, live receiver ownership, separate callback and object generations | Broader games, paused/debugger paths and graphical authoring |
| Mutable globals in exported callbacks | Current variable identities, complete writer checks and initialization ordering; callbacks keep a shared mutable cell | Reimport of the exact emitted MakeCode map and visible editing |
| Owned Sprite acceleration | Number reads from the actual `ay` property through proven owned-array loops | Other properties, arbitrary collections, actual affected game execution and GUI |
| Parser/class selection | Structural evidence expires on physical or metadata changes; uncertain ASTs retain the original path | Complete corpus and current-main integration |
| Declaration identity preparation | Private demand in the existing producer engine avoids unused result propagation; public eager analysis and all parameter/default validation remain | Composition with the Sprite proof, complete suite/corpus and affected guest |

The Sprite certificate does not grant general Sprite/Array values. Annotations,
variable names and saved runtime values do not establish producer types.
Current blocks, all writers, actual receiver ownership and occurrence-specific
initialization remain the authority.

## Results that must remain separate

- The constructor foundation completed its focused 185-test suite and a real
  storage-enabled native VM control, including two instances, Number/Void
  callbacks, mutable state, Code, save/reload, Stop and a fresh generation.
- Sprite acceleration completed eight focused controls and the public
  import/Creator/SB3/Code/new-Creator/new-SB3 pipeline with genuine asset joins.
  This is not a complete original-game or native Sprite qualification.
- Mutable-global export completed eight public controls plus a separate test
  using the unchanged archive from the successful native control. Fresh
  production MakeCode Arcade resolve and compile accepted its exact two-file
  output with empty diagnostic channels and no network acquisition. The
  generated binary was retained as data and was never executed.
- The later combined 210-test attempt was killed after 202 consecutive passes.
  The final eight tests and whole-suite summary were unobserved. The cause was
  not established. Earlier separate passes do not turn that attempt into a
  complete pass.
- The declaration-identity candidate completed 17 controls and seven public
  import comparisons with exactly equal full outputs. One ordered sample had
  lower aggregate CPU use but mixed individual results, including a slower
  real input. No uniform speedup or complete-job capacity is established.

The historical raw-source census was 147 translated, 36 partial and one
malformed input out of 184. A new complete census remains **unmeasured**.
Incomplete prefixes and feature tests must never be subtracted from that count.
Keep the 41 complete project contexts, their original compiler failures, and
complete-game/GUI qualification in separate ledgers.

## Ordered work packages

### 1. Qualify and integrate the foundation

Refresh PR #888, main, supplier dependencies and active lanes. Reconcile each
of its failing checks with current source and retain the original failures.
Distinguish obsolete test seams from implementation defects with meaningful
controls; do not weaken assertions, baselines or captures. Integrate the full
required source closure, preserving concurrent work and dependency notices.

Acceptance: every enabled check succeeds on the exact final head, declared skips
are understood, affected clean guest qualification passes, and the reviewed
merge tree and actual merge parents/tree agree. Use a normal matched-head merge.
No force push, automatic merge or borrowed old-head success.

### 2. Compose the declaration and Sprite proofs correctly

Both candidates currently use an internal `analyseGraph` argument for different
purposes. Their direct composition conflicts. Preserve the existing Sprite proof
argument and route the declaration-identity context through a distinct argument;
update only its real private call sites. Preserve recursive Sprite proofs and
the complete public eager/Throw path. Do not overwrite one implementation with
the other or expose a public option that bypasses value validation.

Review the composition and run both complete component modules, then the whole
combined suite. The expected suite becomes 218 tests if the original 185, the
17 cost controls and both eight-test feature modules are unchanged. Derive the
actual catalogue from source; do not accept a predicted count as a result.
Capture actual CPU/rusage, terminal state and cleanup. Keep the existing limits;
no unchanged retries, test splitting or filtered substitutes for a whole result.

### 3. Finish the complete conversion census

Run the complete 184 raw-source plus 41 context subjects against one explicitly
selected source tree. Retain all source, configurations, resource roles,
dependency identities, diagnostics and order. One context has a real dependency
identity mismatch: preserve the actual rejection and original inputs rather
than manufacturing a successful identity. Keep original compiler failures.

Record every missing or unsupported element with source location, actual
consumer/runtime cause and a focused implementation/control plan. Close one
semantic area at a time, then rerun a genuinely changed candidate. Completion
means observed whole-run results, including the requested fewer-than-20-partial
milestone; a successful prefix is insufficient.

### 4. Close the export permutations and affected native cases

Reimport the exact already compiled Counter output map through the public
importer, actual Creator, Code and SB3 paths. Read the retained emitted files;
do not rerun the successful export or SDK merely to obtain them. Preserve
constructor properties, both allocations, live mutable-global reads, Void
callbacks, actual blocks and per-archive assets. Then qualify affected current
native behavior separately; compilation is not execution.

The unchanged Juggler/mega-bounce source has a prepared targeted diagnostic.
Only its original source was retained; its device configuration is explicitly
generated. The reviewed diagnostic recipe captures all six public pipeline
stages, complete errors, actual asset bytes and bounded child cleanup. It has
not run. Even a clean result does not establish the missing original project
context, native eligibility or a new complete census count.

### 5. Qualify authoring and visible control

Track Code, blocks and graphics separately from conversion/runtime support.
For each capability, require creation from a blank project, meaningful edits,
Code/blocks roundtrips, save/reopen, current export and a visible game/controller
journey. In particular cover:

- Constructor fields, access/readonly properties, typed parameters and callback
  inputs/results, with readable editable blocks and useful diagnostics.
- Sprite property editing, ownership/lifetime feedback, controllers/widgets,
  animation frames and image changes that alter what the game actually draws.
- Tile names on MakeCode export, legacy color maps, sprite placement on tiles,
  and save/reopen of a painted level.
- Graphics palettes, backgrounds, walls/collisions and resource identity across
  Code, blocks, asset editors and exports.

A headless VM or SDK compile does not close an editor or renderer item. Keep
unqualified UI areas visible in the capability ledger rather than implying
that the conversion implementation supplies their authoring controls.

## Reproducible workflow

Use owned isolated worktrees and read the lane contract first. Pin the exact
input/source/toolchain and collect successful official artifacts once. Retain
all product returns and diagnostic fields before assertions; observation or
serialization failures remain separate from product exceptions. Retain partial
results and unattempted stages explicitly. Use independent saved-data readers
without importing or replaying the producer.

Keep raw logs, binaries, corpus locations, local paths, receipts and operational
commands in ignored private notes/evidence. Public documentation should describe
capabilities, relative source paths, reproducible contracts and honest limits.
Do not launch new large local builds or duplicate hosted workflows to read an
already successful result.

## Integration checkpoint — 2026-10-19

The isolated declaration/Sprite composition preserves both proof arguments. Its
complete 218-test attempt observed 210 consecutive passes before SIGKILL, with
eight tests and the whole-run summary unobserved. The child consumed 24.90 CPU
seconds under the unchanged 25-second bound; this observation alone does not
prove the kill cause. A genuine analysis-cost fix and complete qualification
remain necessary. No corpus totals change.

Current main already contains the timer classification, clock-refusal census
and isolated mutant-fixture repairs. Reconcile those actual landed changes
rather than implementing duplicate fixes. Preserve the required newer
sb3-creator and Arrays supplier revisions and main's unrelated newer pins,
with coherent canonical files, mirrors, notices and provenance. The composed
source is a candidate until its independent source review, affected execution
and exact-head hosted checks complete.
