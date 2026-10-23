# Native Arcade frame reset analysis

Status: implemented after merged claim #1283. All 11 source-conversion
regression groups pass at `41b8c0dce0e379bba7530a692b192c10689673c7`,
including all four immutable built-in Sprite kinds.
The owned-source import correction retains every test assertion. The original
11 groups also pass in hosted unit shard 4 at
`4089698bef96246f73500b62e94954faf7fd89f4`; that earlier head still fails its
generated-import policy check. Declare the exact existing procedure-model
dependency for the corrected test through the unchanged GUI scope census.
Affected final-head hosted/native/GUI qualification and corpus reassessment
remain pending.

This task concerns Array export authority after an ordinary procedure's entry
local reset. It does not add a runtime Array operation or infer an Array from a
variable name, annotation, destination input or saved variable value.

## Problem and intended boundary

The owned numeric authoring game creates its temporary StringArray after a
background change, Sprite creation and position, a counter loop and Math
operations. The generated ordinary startup procedure resets the temporary local
to null at entry. A later direct write gives that same binding a genuine empty
Array, followed by Unicode/String pushes and a StringArray settings write/read.
The existing narrow reset proofs cannot cross the whole native effect prefix.

The new proof establishes only that the particular entry reset cannot reach
those later consumers. Actual allocation, every remaining writer, element types,
settings key/type correspondence and item presence remain separate obligations.
The four existing reset/overwrite routes retain their independent behavior.

A useful positive must retain all native effects, the actual loop condition and
body, and the later button registration. That registration genuinely captures
the temporary local; a rule requiring that the local is never captured would
reject the owned program. The relevant distinction is whether a capture can
publish this frame before the actual overwrite.

## Required native contracts

The proof needs the actual fresh ordinary parameter-frame allocation, unique
physical procedure identity, actual caller ancestry and complete writer/capture
provenance. Unknown, recursive or independently entered callers cannot acquire
this fact through their names or apparent nesting.

Each admitted operation requires exact inputs and an audited native effect
contract. Background, position and Math arguments must be grounded primitive
values. A private Sprite handle used to reason about effects supplies no Sprite,
Image or Array export certificate. Counter-loop analysis must preserve all
normal paths without assuming termination, a fixed iteration count or no yields.

Sprite creation and movement can dispatch callbacks and wait for their threads.
A new callback thread alone does not prove isolation: registered callbacks may
carry captured parameter cells. The proof must close all potentially active
entries and registrations before overwrite, including earlier caller effects
and prototype mutation. Genuine later registration may remain valid. Unknown
extension, object, callable, reflection, dynamic-name or callback routes retain
refusal unless their exact existing contract proves the required isolation.

Owned JSON snapshots freeze their source descendants. New exports use new
snapshots; another edited export must not contaminate a prior graph. Ambient
prototype or other watched dependency changes after a used proof must revoke it
permanently, including after restoration. Raw caller objects cannot impersonate
an owned JSON snapshot.

## Regression module and qualification status

`test/array-native-frame-reset.test.mjs` authors its input through the existing
`numericAuthoringFiles` source fixture, `arcadeToPseudocode` and the real Creator.
It does not embed a captured project or invent a runtime/compiler result.
The module imports owned production code from `overlay/scratch-gui/src/lib/`.
The repository's normal root-test hook resolves declared GUI dependencies from
the integrated GUI package. Keep the exact per-test dependency census current;
do not bypass the hook, import generated production mirrors, borrow another
worktree's dependencies or substitute stubs or fake SDKs.

Its whole module covers:

- The complete owned numeric prefix, real allocation, Unicode pushes, StringArray
  storage/read and genuine later capture.
- Each background, Sprite/position, loop and Math prefix independently, their
  composition, alpha-renamed source and Code decompile/reparse.
- Early registration, independent entry, created callback, candidate read/alias
  publication, self-read, invalid operand/schema/menu and unsafe loop effects.
- Non-dominating overwrite, incompatible writer/allocation, foreign caller,
  raw-object rejection, snapshot isolation and prototype-change revocation.

The complete module passed with the real conversion code, Creator, structural
constraint model and locked source dependencies. Its fixture includes the actual
MakeCode export/reimport before Code feedback. Both imports attach real artwork
using Creator's public SVG methods; exports receive the associated asset bytes.
Code feedback rejects unsupported-block comments before parsing. This matters:
omitting either the first export/reimport or artwork attachment tests a different
program, and must not be corrected by inserting a reset or deleting the Sprite.

A separate source check at `4a5d5e6574d874b35c75fcaecaf711430677bf9b`
of the exact owned input retained from the failing numeric journey accepts both
mutation receivers and the item-read receiver.
The original failed result remains preserved. These checks establish Array
receiver analysis and clean source conversion for the owned regression; they do
not establish an original SDK build, native execution, installed GUI behavior,
controller operation or a completed corpus application. The official numeric
journey must still pass its unchanged clean-export and existing assertions.

## Current supported slice and follow-up boundaries

This proof currently requires one ordinary zero-argument procedure with one
direct source-start caller. It audits the complete preceding sequence, admits
other source-start scripts only when they hide their own target, and permits a
unique registered-button handler only after the overwrite. Visible monitors,
unknown entries/effects and unrelated procedures remain refused. Other safe
calling patterns need a complete caller/frame and activation proof, not a name
exception. Sprite kind effects admit the exact native `Player`, `Projectile`, `Food` and
`Enemy` literals. This is a numeric effect domain, not a claim about their
particular integer IDs. Unknown, custom, dynamic, coercing and malformed kind
inputs still refuse; additional domains need their actual effect contract.

The existing ownership index deliberately excludes declaration prototypes.
The new census therefore recognizes only the exact, physically linked and
validated zero-argument prototype as a declaration. Root identity, link tuple,
parent, shadow/top-level roles and signature remain required. An orphan or
prototype-looking object cannot gain executable ownership or value authority.

## Follow-up work if a boundary remains refused

1. Preserve the actual original failure and identify its real selected producer,
   input, writer, entry and effect dependency. Do not replace a missing condition
   with an opcode allowlist or annotation-based fact.
2. Scope any additional native operation, callback activation or frame contract
   before implementation. Keep compiler, runtime, parser, supplier pins and
   unrelated proofs unchanged unless separately owned and justified.
3. Add a genuine positive and a paired counterexample for that obligation while
   preserving the old whole cohorts. A later capture and an early capture are
   distinct controls; the latter must not become safe merely to admit the former.
4. Reassess complete export, reimport, source/Blocks authoring, settings presence
   and the affected official GUI journey. Report remaining limitations explicitly.
