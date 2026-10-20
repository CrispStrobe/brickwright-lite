# Owned callable `typeof`

PROPOSED. Merge this claim before production changes. This document defines a
bounded addition to the existing `sourceTypeOf` operation and the qualified
callable ownership services. It does not enable a new source profile or adopt
an unqualified prototype, supplier or pin.

## Selected runtime behavior

The selected MakeCode simulator reports `function` for a noncapturing code
label and `object` for a captured action represented by `RefAction`. The native
callable service already records this distinction from the actual declared
captures and validates the corresponding resource. Classifying every closure
as `function` would change the selected runtime behavior.

A reflection read evaluates its operand once. It does not invoke the callable,
change captured cells, dispatch a service thread or modify callable identity.
A same-site noncapturing label and distinct captured action instances retain
their existing identities. Literal text containing a callable-looking token
remains String; raw Sprite handles retain their existing ambiguity boundary.

## Source and current-project authority

Only callable producers already accepted by the complete existing numeric or
ordinary class source gate are eligible. The source declaration signature,
inert lexical metadata, displayed name, annotation or assertion supplies no
producer authority by itself. Unknown neighboring source bodies and all
unsupported writer channels remain explicit diagnostics.

Native classification delegates to the exact bound `CallableValues.typeOf`
service. Require the current extension runtime and service identity, a live
resource belonging to its actual target and generation, and matching current
procedure, parameters, declaration and capture/default descriptor. A plain
codec carrier with no resource, forged or foreign scope, stale ID, removed
resource/body, changed declaration or replaced service must refuse. Stop,
restart, Load and dispose retain the existing cancellation and generation
rules. A legitimate reload creates current ownership; it never reopens a
retained disposed owner.

Bind an authored reporter to the actual live caller and connected input under
the unchanged current-project snapshot. Source-variable reads use their real
connected variable ID and atomic declaration owner/generation. If an additional
read-only Callable declaration query is needed, it validates the existing
Callable binding; it does not widen scalar/reference declaration domains or
reset values. Classification of an initialized resource and classification of
actual undefined before assignment remain different reads.

Export and Code reparse validate the current lexical plan, sealed bindings,
class catalogue, every relevant writer and edited body. Emit genuine `typeof`
against the current expression and prove its String result. Retained original
AST bodies, names or annotations cannot replace edited blocks. Current graph
edits require the existing restart/revalidation path; a Code refresh cannot
silently repair an inconsistent plan, binding or body seal.

## Owned implementation envelope

- New callable reflection producer/current-project authority helper and tests.
- Callable operand proof in `arcade-translate.js` and `export-arcade.js`;
  current-body String-result validation in `callable-export-graph.js`.
- Optional exact-owner adapter in native `source-typeof-values.js` and narrow
  `index.js` initialization, coordinated with the class lifecycle owner.
- A read-only actual Callable binding query in `source-scalar-cells.js` only if
  required by the connected declaration proof. Atomic prefix validation and
  all existing declaration domains remain strict.
- A coordinated exact `typeof` expression hook in `class-callable-source-flow.js`.
  The class branch/result-flow certificate, generic signatures and completion
  rules remain with their owner.
- Source and generated mirrors of these changes, bounded contract updates and
  focused tests required by the repository's normal synchronization rules.

The existing supplier operation and six-word callable ABI are reused. No new
canonical word, function wrapper, arbitrary reference kind, pin adoption,
named/dynamic handler admission or Sprite-string classification is authorized.
Number/String/Font producer work and class result-flow work retain their owners.

## Required qualification

1. Pure source proofs cover renamed bindings/classes, aliases, action/label
   representation, unknown adjacent bodies, opaque writers and misleading
   annotations/assertions. Existing whole-source and signature guards remain.
2. Actual native controls cover current owned labels/actions, no invocation or
   capture mutation during reflection, plain carriers, fake IDs/scopes,
   foreign/replaced service, changed parameters/captures/defaults, removed
   bodies/resources and Stop/restart/Load/dispose.
3. Current-project controls cover connected IDs, same-signature rewiring,
   current String result, reparenting and graph edits, computed fields,
   disconnected/foreign writers and every supported local/captured/class
   writer channel. Unproved channels refuse.
4. Source, edited Blocks, Code reparse, same/fresh SB3, current export and native
   reimport preserve identity and classification. Preserve ordinary primitive,
   Array, Image, Buffer, class and raw Sprite-string controls.
5. New selected-original source and edited-export programs need actual input,
   compilation, executed binary, result and consumed runtime/helper guard
   receipts. Successful retained inputs may be reused only with exact byte
   equality. Earlier semantic observations without retained executed binaries
   are not binary provenance. Serialize any new original executions and retain
   first failures.

Public admission waits for independent source/current-graph review, affected
native and authoring controls, exact original qualification and every enabled
final-head check. No full-game, general higher-order callback, broader library,
hosted GUI or release claim follows from this bounded lane.


## Qualified bounded implementation

Source and current editable blocks now preserve selected MakeCode reflection
for owned callable values: a captured action reports `object`, while a
noncapturing label reports `function`. Actual producer/writer, resource, graph,
capture-use and runtime lifetime checks remain required. Constructor-only
startup typing comes from a current registered ordinary class allocation and
its actual arguments. Uninvoked reflection qualifies only the bounded pure
scalar return body; it does not execute that body to establish support.

One hundred affected native/pure controls passed independent review. The
source and genuinely edited export both compiled and executed in the selected
MakeCode runtime with unchanged consumed SDK/bridge bytes. The source observed
3/4/7 and the edited callback observed 9/16/7, retaining action/label reflection.
Code, same/fresh saved projects and current export/reimport preserve those
values. The composed branch also passed the affected callable and shared
numeric controls using its current VM projection.

This does not admit arbitrary function annotations, opaque callbacks, Sprite
String carriers, general class inheritance or every uninvoked callback body.
A visible browser journey that authors callable factories and reflection from
scratch remains a GUI qualification item. No new word or supplier pin is added.
