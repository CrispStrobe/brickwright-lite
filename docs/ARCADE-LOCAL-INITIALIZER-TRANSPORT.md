# Ordinary local initializer transport

**Proposed claim; documentation only.** Merge this claim before implementation.
This is the narrow **C1** continuation of
[roundtrip shape](ARCADE-ROUNDTRIP-SHAPE.md). Its scope is independent of the
[current Array receiver proof](ARCADE-ARRAY-LOCAL-RESET-PROOF.md).

## Fresh-agent entry

Read this contract and the matching entry in `LANES.md`. Inspect current ordinary
procedure export and local declaration import before changing them. Implement
only the current-graph first-write transformation below, retain the original
failures, and qualify source, current save/export and affected native behavior
separately. Visible editor and whole-project compatibility need their own evidence.

## Implementation prerequisite

Begin implementation only from a reviewed source composition containing the A
current-owner snapshot/exporter and the existing local producer constraints,
with that entire foundation qualified for public adoption. These prerequisites
are not yet all on public main. The references to current owner validation and
export fences below describe required foundations, not capabilities supplied
by merging this documentation claim alone. Recheck the actual composition and
its qualification before claiming or changing shared exporter hooks.

## Problem and actual semantics

`overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js` currently prepends
`localDeclaration` headers to ordinary procedures while retaining their actual
`arcade_setLocal` body writes. Importing an initialized local declaration through
`arcade-translate.js` creates another actual local write. Repeating conversion
can therefore accumulate default assignments.

These operations cannot be deleted because their names or values resemble
exporter output. Current `arcade-translate.js` also turns a local declaration
without an initializer into a zero write. Native `_localParams`, `setLocal` and
`getLocal` in `overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js`
select the actual procedure frame, validate writes and distinguish an own value
from an absent local, whose current read fallback is zero. Explicit Undefined,
null, an absent cell and a declaration without initializer are not interchangeable.
This claim changes none of those existing policies.

## Owned first slice

Own a narrow ordinary-procedure current-graph initializer planner, coordinated
ordinary `arcade_setLocal` and header emission in `export-arcade.js`, focused
source/Creator/Code/Blocks/save/export and native controls, and capability notes.
Reuse existing strict procedure-owner validation and current graph fences.
Coordinate shared exporter hunks with their owners.

A selected local must have one actual current ordinary procedure owner and a
fixed nonformal local cell. Identify the actual connected first write and prove
that it precedes every read, other write, capture or exposure of that local.
Initially admit only a straight-line initializer prefix of canonical primitive
local writes. Each selected RHS must be an actual fixed finite Number, String,
Boolean, null or canonical Undefined expression with its existing exact value
semantics. Descriptor, socket, role, unique-parent and cell ownership proofs
must use the actual current graph. Declared types are constraints, not producers.

An earlier branch, loop, return, exception path, call, registration, inspection,
Stop, yield or unknown operation prevents this bounded proof. So do dynamic local
names, captured cells, ambiguous/shared/detached nodes and noncanonical RHS
expressions. Earlier literal writes of other locals are permitted only when
actual distinct cells and their lack of cross-local reads are proved. No general
callee effect analysis or whole-language definite-assignment claim is supplied.

At the selected write's **same actual position**, emit one initialized declaration
using that current local's type and exact RHS. Suppress only its synthetic
prepended header; the declaration initializer represents the selected actual
write, rather than adding a second copy of it. Retain every later explicit
assignment, including an identical zero or null reset, in its original order.
Unselected locals keep the existing path. Never hoist an effect, delete a
body/reset by spelling, reuse original source or infer generated-name authority.

Bind the actual owner, local inventory, statement and RHS identities before any
host callback, then check currentness before transformation and at the existing
export completion fence. A copied flag or stale graph cannot authorize folding.
Unknown proof takes the existing export path and retains its diagnostics.

## Exclusions

Callbacks, hats, startup wrappers, managed callables, class/constructor locals,
captured locals, arrays/images/objects and effectful initializers are outside
this first slice. Startup composition and callback formal allocation remain
separate **D/E** work. No source-only no-value declaration protocol (**C2**),
Undefined/default inference, producer/domain expansion, runtime ABI, block word,
engine, supplier/dependency pin or workflow change is authorized here. The Array
receiver proof retains its existing Null writer and never licenses deletion.

C2, if needed, must separately define actual current lexical declaration and
executed initialization across importer, pseudocode, Blocks, save and runtime.
C1 does not fix or reinterpret the existing missing-initializer policy.

## Acceptance and evidence

Preserve original conversion failures and full current inputs/partial results.
Collect every provided diagnostic channel before assertions; absent or unknown
channels are not empty successful arrays.

- Prove same-position, once-only primitive initialization for zero/nonzero,
  negative-zero, Boolean, empty/nonempty String, null and explicit Undefined.
  Preserve exact values, cell identity and current write validation.
- Cover several literal-prefix locals, same-name locals in distinct owners,
  formals/shadows, unused real writes and repeated identical resets. No real
  assignment may disappear merely because it duplicates a declaration value.
- Retain the old path for read-before-write, self-read, branch/loop, early
  return/throw, capture/exposure, registration/call/yield/Stop, unknown operations,
  malformed/shared/foreign graph and callback changes to owner, cell or RHS.
- Exercise repeated source → Creator → current Code/Blocks → same/fresh SB3 →
  current export/reimport permutations. Assert stable structural transport for
  the admitted slice, exact real bodies/order and current edits; never restore
  stored source. Retain actual current projects, ZIP bytes and assets separately.
- Qualify affected actual own native procedure execution with exact cell
  presence, Undefined versus null, initializer/reset counts and effect order.
  Only one VM may own shared dispatch at a time. Source/model controls alone do
  not qualify native execution.
- Track visible Code/Blocks declaration editing, readable error location,
  save/reopen and controller interaction as separate GUI acceptance. Do not
  promote native checks or source stability into whole-game compatibility.

The claim is complete only for its observed slice. If the actual current
procedures fail the literal-prefix proof, retain that gap rather than silently
broadening C1 or deleting additional writes.
