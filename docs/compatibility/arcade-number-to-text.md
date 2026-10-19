# Arcade primitive Number to text

## Proposed scope

This lane adds the zero-argument `value.toString()` source operation when the
actual receiver is proven to be a primitive Number. It carries the operation
through native execution, Code, Blocks, saved projects, original export and
reimport. A Number annotation, a method name or a saved variable value does not
provide that authority. Implementation starts after the ownership claim merges.

The selected PXT 13.2.1 simulator implementation is
[`Number_.toString`](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/pxtsim/libgeneric.ts#L275):
`return (x + "");`. Preserve its primitive String coercion. An existing native
String operation may represent it when its actual semantics and export agree;
this claim does not reserve a new producer word or move dependency pins.
The PXT implementation is MIT; retain its notice if source is incorporated.

## Producer and binding authority

- Resolve the receiver using actual lexical bindings and primitive producers.
  Include relevant assignments, aliases, function arguments and complete return
  paths. Missing initialization, unresolved calls and mixed or opaque writers
  cannot borrow a Number producer from another use.
- Consume the receiver exactly once at the original evaluation point. Preserve
  argument and callback order and the existing Source frame boundaries.
- Current Blocks and Code must own the connected operand and current writers.
  Do not restore an earlier source value or method body from stale metadata.
- Preserve ordinary class methods named `toString` and their existing dispatch.
  Image, Font, Buffer, Sprite, arrays, objects and native reference carriers do
  not become primitive Numbers through a name, assertion or numeric-looking
  text. Existing separately qualified operations keep their own contracts.
- A global or local binding named `String` must not change this operation.
  Emit a source operation matching the selected primitive coercion rather than
  calling an apparent global conversion function.

## Required qualification

Qualify direct Numbers, aliases, actual function arguments and results, zero,
negative zero, signed and fractional values, and the selected implementation's
large/small number formatting. Include side effects and receiver evaluation
counts. Cover non-finite values only where the actual input and transport are
qualified.

Negative controls include uninitialized reads, changed and mixed writers,
shadowed bindings, unresolved or recursive result flow, custom methods, native
references and stale or foreign current-project authority. Optional radix and
nonzero argument counts remain outside this slice.

Compare native, Code, Blocks, same and fresh saved-project reload, an actual
edited original export, and reimport. Bind executed original input and compiler
artifacts to the frozen source. A successful unchanged original is not replayed
merely to read its result. Preserve every original failure.

## Boundaries

This is a primitive source operation. It does not establish general JavaScript
method support, boxed Number objects, arbitrary `toString` callbacks, optional
radix formatting, full Carnival or StatusBar support, or hosted GUI completion.
Class fields, SDK timer producers and live screen snapshot routing retain their
separate ownership and qualification.
