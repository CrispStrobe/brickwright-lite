# Arcade primitive Number to text

## Bounded scope

This lane adds the zero-argument `value.toString()` source operation when the
actual receiver is proven to be a primitive Number. It carries the operation
through native execution, Code, Blocks, saved projects, original export and
reimport. A Number annotation, a method name or a saved variable value does not
provide that authority. The ownership claim is merged. The bounded implementation uses an editable
primitive String join, with no new canonical word.

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

## Qualified implementation

The source operation now follows the actual lexical producer graph. A unique
ordinary function can supply a Number result only when that same binding has
no assignments and its arguments and complete return paths prove the domain.
A same-name local shadow is a different binding. Unresolved function aliases,
recursive results, missing arguments and mixed writers retain refusals. The
source annotations remain constraints rather than producer evidence.

The current Code and Blocks carry a primitive join with an empty String. Export
uses the current connected operands; it does not restore the original method
expression. Native source, Code, export/reimport and restart controls preserve
one formatter evaluation and a local parameter named `String`. An independent
edited join with a numeric operand and a new suffix also preserves those current
operands through export and reimport.

A selected-original source and an actual block-edited export independently
compiled and executed. The real frame callback consumed the formatting results
and published readiness. The observations covered zero, negative zero, signed
and fractional values, a large Number alias, a small Number and a subnormal.
Changing the actual argument block from `-1.25` to `12.5` changed the corresponding
exported observation; both executions retained exactly one formatter call.

The accompanying literal correction recognizes signed decimal exponents in the
source tokenizer and emits finite Number literals as exact decimal carriers.
It preserves member-dot and existing base-literal boundaries and rejects
malformed exponents. Literal overflow to a non-finite Number has an explicit
refusal until its source/Code/portable carrier is qualified. Underflow to zero
has a bounded carrier. Existing separately qualified NaN and Infinity constant
and numeric-fold behavior remains unchanged.

Full non-finite source literals, more SDK numeric producers, class/member Number
results and unresolved callee aliases remain follow-up work. This evidence does
not establish full Carnival or StatusBar support or a hosted GUI journey.
