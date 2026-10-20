# Arcade Math.idiv source conversion

## Implemented development boundary

Development source `587315f49`, privately composed in `36805661`, accepts exact
unshadowed `Math.idiv(a, b)` with two proved Number inputs. Input values are
converted to signed 32-bit integers before division; the quotient is converted
to a signed 32-bit integer too. This preserves fractional, overflow, zero,
NaN and Infinity behavior. Plain `(a / b) | 0` remains that expression on export,
since it does not perform the same input conversions.

Arguments and earlier eager siblings execute once in source order. Staging
preserves lazy branches, conditions, loops and invocation-local temporaries.
Actual callers, initialization and all writers establish Number inputs;
annotations alone cannot. Shadowed or written Math bindings, aliases, escapes
and unresolved inputs retain explicit refusals.

The implementation uses current editable arithmetic blocks. It adds no new
extension word or supplier pin. Recursive ordinary function identity is now
separate from immutable Number-result proof: resolving a genuine recursive
declaration does not grant its return a type or prove its completion.

## Files for continued implementation and GUI work

The source implementation lives under
`overlay/scratch-gui/src/lib/bw-makecode/`:

- `math-idiv-source.js`: exact call admission and ordered lowering.
- `lower-pxt-staged-values.js`: expression staging.
- `source-value-producers.js`: declaration identity and producer facts.
- `procedure-constraint-source.js`: actual callable-entry constraints.
- `arcade-translate.js`: integration with source translation.

Authoring should expose the existing arithmetic operations and generated
procedure locals without discarding user edits. A dedicated visual Math.idiv
block or menu is not qualified by the conversion tests.

## Observed qualification

Two affected native controls pass against the full canonical compiler
`8b620dd`: Code, saved project reload, a current arithmetic-operation edit,
current export and reimport. They cover signed and fractional inputs, overflow,
zero, NaN, Infinity, ordered side effects, lazy evaluation, loop placement and
ordinary recursive function locals. Actual source/Creator diagnostics and
runtime errors are empty in those controls. Host warnings remain in the private
receipts. This is bounded native evidence; original MakeCode execution and
visible GUI authoring are separate open gates.

A separate positive source test still fails on this unchanged helper:

```typescript
function outer(a) {
    function read() { return a }
    return Math.idiv(read(), 2)
}
let q = outer(7)
```

Its unresolved value is `read()`. Supporting a named nested declaration that
captures an enclosing invocation requires actual allocation, capture-cell,
entry and completion ownership. Keep this failure and the complete helper
body. The final two members of that positive-test list were not attempted after
the failure. This composition is not an all-tests-passing or release claim.

See the [current project gaps](arcade-current-remaining-project-gaps.md) and
[authoring ledger](../CONVERSION-CAPABILITIES-AND-GUI-GAPS.md).
