# Claim: lexical declaration readiness for native addition

Owner: Arcade compatibility lane. Status: claimed; implementation pending.
Base: `dd22100df89269a940aef028a6bcaf9d0fcae683`.

## Scope

Add a private source fact distinguishing execution of an actual lexical
binding declaration from initialization of a value producer. Use it only to
close native-addition captured-operand obligations when the complete current
source graph independently proves every occurrence and writer primitive.
This is a source-analysis capability claim, not a count of repaired projects.

Owned implementation paths: source-value-producers.js; a new private
lexical-declaration-readiness.js under the MakeCode source-analysis directory;
native-array-binary-domain.js; complete focused readiness/native-domain tests;
and associated Arcade capability, failure-status and handoff documentation.
No GUI dependency declarations, supplier pins, generated menu tables, runtime
coercion behavior or public caller-issued certificate are included.

## Required proof

1. Track a distinct declaration-executed set at actual source occurrences.
   Executing let/const declaration takes effect only after evaluation of its
   actual initializer. A declaration with no initializer may produce actual
   Undefined after execution; it must not initialize the same binding before
   declaration. Retain actual lexical binding identity, statement ownership,
   branch intersection and reachability. Do not substitute Number0, annotation
   types, empty writer sets or an initialized-value flag for this fact.
2. An actual FunctionExpression allocation may retain only the declaration
   frontier proven at its real evaluation point. Function shape, name, a
   params/body-shaped arbitrary node or public analysis option cannot enroll
   it. Nested closure allocation and actual callable forwarding must retain
   full source/currentness and argument/default evaluation. Allocation before
   declaration does not acquire readiness merely because a later call exists.
3. Hoisted FunctionDeclaration readiness is a separate obligation. Admit only
   a unique unchanged actual declaration whose complete immutable lexical
   references are genuine closed entries and whose EVERY possible entry is
   after the relevant declaration frontier. Unknown reference uses, aliases
   without closed entry proof, replacement, escaping return/storage, foreign
   callbacks, reflection, recursion/reentry or an early/uncertain entry refuse
   unless separately proven by the same complete source graph. One later
   valid call must never mask another early, omitted or unknown entry.
4. Preserve direct/same-function TDZ refusal, initializer self-entry refusal,
   early-hoisted and external-callback refusals. No lexical annotation,
   ordinary formal, callable name, unreachable valid site or exceptional
   noncompletion may grant a fact. Preserve actual all-writer primitive
   obligations, constructor/callback/default effects, Array allocation and
   escape constraints, identity and sticky source currentness. Readiness
   conveys no Number, Array, Image or SDK-owner authority.

## Complete qualification and acceptance

Add meaningful complete focused modules with lexical FunctionExpression
positives after declaration (including actual Undefined), nested captures and
closed hoisted all-entry positives. Retain all existing native-domain tests.
Negatives include direct/same-function TDZ; closure allocated before lexical
execution; initializer invoking a capture before binding initialization;
conditional/loop/exception uncertainty; early hoisted call; a valid later
entry plus an early or unknown second entry; callable aliases/reassignment;
escaped or foreign callback; default-expression side effects; later opaque,
Array or unknown writers; forged owner shape; physical AST mutation and ABA.

Source review and whole affected modules are mandatory. Actual unchanged
source cases and, where affected, original native/GUI qualification remain
separate gates. Any broader corpus-repair attribution requires a new actual
complete conversion census; this claim neither establishes the cause of the
reported158 failures nor closes them. Preserve original failures and all
existing thresholds/assertions. No implementation before this claim merges.
