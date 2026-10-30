# Finite local control-cell source entry analysis

Status: CLAIMED; merge before implementation.
Base: `9490b286ab933f9972b52b57e3cca5bde5093615`.
Owner: Arcade source integration; preserve the active integration publisher and
all Sprite, Array, lexical-frontier and execution-root claims.

## Measured problem

One remaining raw input retains four ordinary Number-argument diagnostics in
the complete importer, although its directly parsed source passes the same
primitive validator. Observing the actual normalized program reproduces those
diagnostics: loop normalization separates assignments and later reads into
correlated guards. Independent branch joins introduce synthetic Undefined at
reads whose actual guarded paths have already assigned the bindings. The SDK
numeric producers are already qualified at this source boundary.

## Intended behavior and exact scope

Add private `overlay/scratch-gui/src/lib/bw-makecode/source-control-cell-entry.js`
and narrow source entry/currentness hooks in `source-value-producers.js`. Consume
only actual occurrence readiness in the ordinary primitive constraint analysis.
Preserve the separate source normal-completion, lexical-frontier, Sprite proof,
Array allocation/availability and execution-root authorities. Do not modify
normalizer output or SDK producers.

Derive a finite analysis from actual unique per-invocation local control bindings
with literal primitive initializers and complete literal writers. Reject captured,
escaped, duplicate, parameter, global, dynamic or unknown control writers. Follow
actual expression/assignment order, refine conditions, join possible branches and
iterate loop entries to a finite fixed point. Unknown conditions remain possible;
zero iterations and abrupt exits must preserve conservative outcomes. Explicit
state/work bounds must decline precision, never discard feasible paths.

Candidate control references must be confined to the modeled local declaration,
plain `=` assignment of a supported finite Number/Boolean literal, and exact
condition forms: literal equality/inequality comparisons, Boolean/truth tests,
negation and their modeled short-circuit conjunction/disjunction. No argument,
return, alias or arbitrary expression use may enroll a control cell. Reject
compound/update/destructuring writers and all unmodeled operators or reads;
expanding these forms requires explicit implementation and negative controls.

The result may suppress only the additional synthetic Undefined at a physical
identifier occurrence proved initialized on every executing path. It cannot
remove real Undefined/null/String/object writers, provide Number/Array/Image
facts, prove caller/global initialization, element presence or loop completion.
Do not use generated names, descriptive loop flags, annotations or supplied
facades/sets/callbacks as authority. Bind proof and sticky currentness to the exact
actual AST and ambient dependencies. Uncertain entry falls back to existing
conservative analysis.

Also own one new `test/arcade-source-control-cell-entry.test.mjs`, its exact GUI
scope row, and updates to Arcade handoff, next steps and GUI capability ledger.
No vendor/pin/runtime/firmware changes or other active owners' implementation.
Broader edits require an updated claim before implementation.

## Controls and qualification

Use independently authored post-test/guarded loop sources through the complete
public importer, Creator, Code, owned JSON/SB3 and export/reimport. Assert real
branches, calls, values and errors survive. Direct readiness controls must cover
all paths rather than just observed literal arguments.

Keep negatives for mixed/unknown control writes, captured callbacks, shadowed
bindings, predicate/operator/literal mismatches, false/unknown earlier guards,
zero-iteration loops, continue/break/return/throw, actual Undefined/String/object
writers and unknown entries. Detect same-value identity replacement, observed
ABA expiry, forged metadata and ambient changes. Mutate branch refinement,
all-writer admission and currentness separately; retain original failures.

Bounded source controls precede one final exact-head hosted qualification.
Unchanged original/emitted MakeCode, native execution and visible editor/saved
project checks remain required before source landing. A better source census
alone is not an application completion. First-class post-test loop authoring
and broader callback/Array effects remain separately scoped GUI/runtime work.

The private graph records whether occurrence readiness actually suppressed a
synthetic Undefined edge. Every strengthened graph still checks the full sticky
proof before publishing types. A proof that contributed no fact is not an
invalidation dependency of that graph. This changes no public proof query,
readiness condition, actual writer or limit. The affected 33-control source
cohort passes; this is not a measured performance or guest qualification.
