# Arcade source scalar cells

Status: proposed contract. Product implementation and whole project qualification
are pending. This extends the [source phase contract](ARCADE-FRAME-SCHEDULER.md)
and the [class contract](ARCADE-CLASS-AND-OBJECT-SEMANTICS.md).

## Selected source behavior

Imported Arcade TypeScript follows the selected Microsoft PXT compiler. It does
not inherit the default zero of an ordinary Scratch variable. In the selected
PXT 13.2.1 execution controls, a Boolean, Number or String global read before its
initializer is `undefined`. A typed declaration without an initializer also
contains `undefined`. The authored initializer subsequently assigns its actual
value, including `false`, `0` or the empty string.

Keep this distinction in callbacks and constructors that run before a later
initializer. Initializing every Boolean to false would change an observable
source value. Ordinary authored Scratch variables retain their saved values.

Primary compiler source: [PXT 13.2.1 emitter](https://github.com/microsoft/pxt/blob/v13.2.1/pxtcompiler/emitter/emitter.ts).
The bundled compiler and actual execution controls remain the authority for the
selected profile; the source link does not qualify other compiler versions.

## Portable declaration and binding

The proposed command is `arcade_declareSourceScalar`, with canonical Code form:

```text
declare arcade source scalar {VARIABLE} as {TYPE}
```

`VARIABLE` must be a connected ordinary `data_variable` reporter. Its actual
variable ID binds the cell. A literal name, computed value, variable-like object,
list or broadcast reporter is insufficient. Native execution resolves the ID
through the actual target and rejects missing, foreign or stale bindings.

`TYPE` is a direct, editable enum field: `Number`, `Boolean`, `String` or `Any`.
It is not a reporter or a menu shadow. Code resolves the variable's display name
to its actual ID. Blocks, variable rename, Code decompilation and fresh SB3 load
must preserve that binding and the type. Reject conflicting declarations.

Declarations belong to the initial declaration sequence of an actual
`arcade_whenSourceStarts` hat. Before any source initializer runs, a source
prelude validates the declarations and writes the typed `undefined` value to
those cells. The declaration primitive subsequently validates its registered
binding without resetting a cell that already received an authored value.
Reject declarations inside loops, callbacks, ordinary Scratch hats or after an
initializer. Preserve the authored initialization order of dependency files,
namespace constants and main source.

No declaration changes ordinary Scratch variables. Reference categories and
unknown source types need separate qualification; `Any` does not admit an
unsupported reference API.

## Directed scalar flow

Export inference must distinguish scalar copies from reference aliases.
Assignment flows from its source to its destination. Call arguments flow into
parameters, and returned values flow into call results. A later write to an
invocation temporary must not flow backward and change an earlier Boolean
variable's inferred type.

Class and array reference identity retain their existing reference graph. Scalar
inference must classify actual Boolean and numeric reporters, preserve String
concatenation and distinguish legitimate mixed values from unknown values.
Source declaration metadata and directed flow complement each other. Metadata
must not replace value flow or hide contradictions by declaring everything
`Any`.

Generated temporaries that receive `undefined` before a Number value retain
that nullable source state. Export must preserve the selected compiler's index
and parameter typing rules. An actual Boolean source cell must not become a
Number or become usable as a numeric index merely to make export compile.

## Acceptance

Required controls bind the selected compiler, source inputs and installed native
source. They cover:

- Direct and function-mediated reads before initialization, uninitialized typed
  declarations and subsequent real initializers.
- Constructor and registered callback reads before and after initialization.
- Source dependency order and source prelude completion before the first frame.
- Mixed source and ordinary Scratch variables without changing saved Scratch
  defaults or ordinary thread eligibility.
- Directed argument, return, alias-copy and temporary flow; Boolean typing
  rejection for numeric indexes and parameters; legitimate mixed scalar values.
- Rejected computed, foreign, stale, duplicate and conflicting declarations.
- Stop, restart, project load and disposal with no surviving source cell state.
- Editable Code, Blocks, variable rename, same and fresh SB3 load, original
  compiler export execution and reimport through the actual native VM.

Keep every failed control. Parsing or a warning-free import is insufficient.
Browser user flows, frame cadence and complete games remain separate acceptance
boundaries.
