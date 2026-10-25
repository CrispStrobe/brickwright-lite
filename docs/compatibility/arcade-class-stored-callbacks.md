# Stored callbacks in ordinary Arcade classes: prototype

This separately opted-in prototype keeps the numeric callable profile and
default class callback admission unchanged. It prepares ordinary class fields,
captured receivers and invocation-local generic method signatures. It does not
admit SDK intrinsic subclasses or qualify StatusBar, Carnival or a hosted GUI.

## Bounded vertical control

The owned `State` / `Holder` control stores `() => number` in a real class field.
Its constructor closure reads its actual captured `this.state`. A generic
`apply<T>(action: (state: State) => T): T` method invokes both Number and String
callbacks without changing shared method metadata. The Number callback mutates
the same State allocation before its caller continues.

Installed native controls cover Code reparse, same and fresh SB3, copied callback
receiver identity, typed undefined result cells before initialization, pause
suspension and Stop cancellation. Current-block export and native reimport also
preserve an actual callback edit from `+2` to `+7`. Two actual selected-original
programs also passed: unchanged source returns `3 / ok / 3`; the changed export
returns `8 / ok / 8`, followed by matching native reimport. Each compilation
retained its actual inputs and binary; all nine SDK and bridge guards were
unchanged. This qualifies the bounded control, not arbitrary stored callbacks.

## Ownership and current bodies

The inert v2 plan records real class declarations, procedure parameter mappings,
lexical owners and captures. It supplies no retained executable body. Creation
requires the engine's actual current primitive operation and a sealed current
project. Constructor and method receiver captures additionally require the real
heap allocation, descriptor signature, procedure frame and lifetime.

Export validates current callback bodies and the actual ordinary class metadata.
Generated local cells require a first dominating typed assignment in their real
body. Their declaration remains at that assignment; no name convention grants
a cell, and no initializer is moved. Class reference producers and every writer
are proved separately from declared field types. Recursive field or variable
aliases require an independent producer anchor. Opaque writers, foreign scope,
forward reads and changed types are refused.

A void function that actually owns a creation in the finished v2 plan uses
managed dispatch with ordered arguments. Its real undefined completion is
discarded. Ordinary void functions and names resembling exporter helpers do not
gain this authority. Discarded factory, object and callable results use fresh
local cells reserved against actual source and native parameter names. Native
formal and local collision controls preserve their authored values, and edited
super/initializer helper bodies remain strictly validated.

Readonly writes are limited to the actual constructor receiver. Formal callback
parameter writes, unsupported generic constraints/defaults, intrinsic ancestry,
Array signatures, module callable variable declarations and unresolved nested
invocation types remain named boundaries. A typed callback returning an
uninitialized primitive field is not newly qualified by the initialized-State
control.

## Authoring gate

Current Blocks and Code carry editable procedure bodies, concrete signatures
and actual variable identities through SB3. Default admission requires the
broader lifecycle and strict refusal controls, followed by
an admitted official GUI artifact exercising visible class/callback body edits,
Code, fresh save, original export and reimport. This prototype does not claim a
complete graphical function or generic signature editor.
