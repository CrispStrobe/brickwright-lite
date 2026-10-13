# Arcade exponentiation

The TypeScript importer parses `**` with right association: `2 ** 3 ** 2`
means `2 ** (3 ** 2)`. Parentheses remain significant. Arcade import selects
native value arithmetic, using the existing Arrays reporter:

```text
calculate value (base) op "**" with (exponent)
```

The blocks editor exposes `**` in that reporter's operation menu. The same
reporter survives Code → blocks → Code, MakeCode export and project reopening.
This adds an operation to an existing block; the shared vocabulary remains
324 canonical forms at the selected producer revision.

## Numeric behavior and source ownership

`BWValues.binary` decodes operands and evaluates JavaScript numeric exponentiation.
The Arrays extension's standalone fallback implements the same operation. Neither
uses Scratch's conversion of NaN to zero. Tests cover negative and fractional
powers, NaN, infinities, negative zero, coercion, right association and evaluating
each operand once in left-to-right order. Sprite references remain a named
unsupported arithmetic conversion, rather than pretending to implement their
numeric conversion.

The selected [Arrays source revision](https://github.com/CrispStrobe/extensions/commit/99f261feb5c1bcaa82015f8e156bedacf40d1b57)
is a descendant of the previous scoped Arrays pin. Only Arrays is fetched by
`scripts/spike/vendor-bundles.mjs --only arrays`; its generated source receipt
records the actual fetched revision, bytes and SHA256. The retained MPL-2.0
notice is unchanged. The shared [producer revision](https://github.com/CrispStrobe/sb3-creator/commit/342a4f860572b531ca622dba8d9e1fe3db444bfe)
adds `**` to the existing field choices and preserves the vocabulary cardinality.
The compiler mirror and authoring inventory are regenerated with the normal sync
scripts and the recorded producer pin.

## Qualification and remaining boundary

`test/makecode-arcade-exponentiation.test.mjs` executes an authored program in the
original pinned Arcade simulator, the real native VM, decompiled Code, exported
MakeCode in the original simulator, reimported MakeCode and an SB3 reload. It
checks observable values, including runtime-produced negative zero, and the
side-effect trace. `test/bw-values.test.mjs`,
`test/makecode-arcade-value-arithmetic.test.mjs` and
`test/makecode-arcade-math.test.mjs` retain the existing numeric and shared-value
contracts. Producer dialect tests exercise every declared field choice.

The pinned original compiler folds a literal `(-0)` to positive zero; the
existing native unary-value implementation preserves negative zero. The
exponentiation runtime comparison uses a runtime-produced signed zero so that
both execute the numeric operation with the same input. That compiler-folding
difference remains a separate source-conversion gap.

Arcade `Math.pow` imports now use the same native value operation. Original
comparisons cover NaN inputs, infinities, dynamically produced signed zero and
single evaluation of operands through Code, blocks, export and reimport. The
independent Planète Maths block retains its existing Scratch conversion behavior.
These focused controls do not reclassify a corpus game or qualify a complete library.
