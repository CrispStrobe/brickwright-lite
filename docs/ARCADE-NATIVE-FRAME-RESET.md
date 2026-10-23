# Native Arcade frame reset analysis

Status: implementation candidate after merged claim #1283. The 11 new
integrated-product regression groups are authored but not yet executed.
Affected hosted/native/GUI qualification and corpus reassessment remain pending.

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

The new proof must establish only that the particular entry reset cannot reach
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
The module imports production code from `packages/scratch-gui/src/lib/`. Run the
repository's normal integration step first so the integrated GUI resolves its
actual production dependencies. Do not substitute copied providers, stubs or
policy exceptions for that prerequisite.

Its whole module covers:

- The complete owned numeric prefix, real allocation, Unicode pushes, StringArray
  storage/read and genuine later capture.
- Each background, Sprite/position, loop and Math prefix independently, their
  composition, alpha-renamed source and Code decompile/reparse.
- Early registration, independent entry, created callback, candidate read/alias
  publication, self-read, invalid operand/schema/menu and unsafe loop effects.
- Non-dominating overwrite, incompatible writer/allocation, foreign caller,
  raw-object rejection, snapshot isolation and prototype-change revocation.

Source authoring is not test execution. The module and production change need
whole-module qualification on their exact final source. A clean focused Array
receiver result does not establish a clean complete export or MakeCode build;
the module keeps a separate complete-export assertion for positive fixtures.
The original numeric GUI journey must also pass its unchanged clean-export
assertion and other existing checks before its boundary is closed. No corpus
completion count or full compatibility claim follows from this task alone.

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
