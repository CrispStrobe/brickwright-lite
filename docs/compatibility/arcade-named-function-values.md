# Arcade owned named function values

## First slice

This lane proposes actual values for uniquely resolved, unchanged module or
namespace `FunctionDeclaration` bindings. Initial declarations take no
arguments and have completely proved Number, String or Void results. The
qualified Arrow and ordinary class callback surfaces remain intact.

A function name, namespace spelling, parameter annotation or result annotation
cannot supply authority. The exact lexical declaration, actual body and all
writers determine eligibility. Local declarations with captures, parameters,
defaults, optional arguments, free generic functions, opaque results and SDK
intrinsic domains remain outside this first slice.

Ordinary-class-returning factories are separate work. Their source admission is
not established by the current Number/String/Void default gate, even though
parts of the native class type machinery understand owned ordinary references.
Generic class parameters, factory registries and callable arrays require their
own complete producer, element and mutation proofs.

## Declaration and label authority

- Resolve the actual declaration binding before namespace flattening. Preserve
  that identity through lowering; do not infer it from generated name prefixes.
  Namespace objects and arbitrary property lookups do not become function values.
- Reject duplicate declarations, conflicting lexical bindings, reassignment,
  update writers, ambiguous aliases and unproved control flow. Preserve the
  existing lexical shadow and default/source initialization rules.
- Retain the source declaration site, exact concrete signature, actual current
  procedure/body and target owner in the callable plan. Extend a schema only
  with the same current-project validation as its existing declaration forms.
- Reuse a stable zero-capture label for repeated reads of the same current target
  and procedure. Aliases must compare equal. Distinct declarations and foreign
  targets must not acquire identity merely because names or signatures match.
  Do not replace a declaration value with a newly created Arrow wrapper.
- Module globals read by the body remain actual target bindings. Their declared
  types do not excuse uninitialized, opaque or incompatible writers.
- Stop, restart, reload, graph edits and disposal must retain existing generation
  and owner checks. Never revive a stopped service or dispatch through a retained
  dead caller or fabricated execution utility.

## Results and current authored bodies

Number and String results need complete actual producer/return proof. Void
requires actual undefined completion on every admitted path while preserving
side effects and continuation order. A `void` annotation alone cannot turn an
unproved value into undefined. Missing, cyclic, foreign, disconnected or changed
procedure bodies must not retain a stale result certificate.

Source aliases, existing ordinary class holder fields and dispatch may consume
these labels only where the current graph proves the same exact binding and
signature. This does not admit a general callable value domain or broaden class
callback result types. Unsupported storage or forwarding stays a named refusal.

The exporter must reconstruct the real function declaration and current body,
not restore a retained source string or copy a procedure into an Arrow thunk.
Visible Code and Blocks edits, stable variable renames, same-signature binding
swaps and current connected operands must have meaningful positive/negative
controls. Saved projects need complete portable lexical metadata; detached
metadata cannot mint an authored declaration.

## Qualification and remaining GUI work

Use independently authored fixtures for global and namespace declarations,
Number/String/Void results, repeated label identity, actual effects, holder
forwarding and complete return proof. Include direct and indirect calls,
current body edits, same/fresh saved projects, export/reimport and affected
runtime lifetime negatives. Preserve the initial named-value refusals.

Freeze the exact new source and edited export before original compiler/guest
qualification, reserve the normal execution slot, and retain actual compilation
input/binary and before/after SDK guards. No successful unchanged original is
replayed merely to read it. Hosted Code/Blocks editing and saved-project
journeys remain separate GUI acceptance, not an inference from native tests.

Stored arbitrary free handlers, scene registration, score APIs, generic State
factories, class/callable arrays and SDK Image/Sprite signatures remain separate
lanes. This label bridge alone does not close either complete game context.
