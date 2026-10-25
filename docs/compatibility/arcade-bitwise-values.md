# Arcade typed bitwise values

Arcade imports use the existing typed Arrays value blocks for `&`, `|`, `^`, `<<`, `>>`, `>>>` and unary `~`. Unsigned right shift reports an unsigned 32-bit number; it is not lowered to signed right shift. Shift counts are converted to unsigned integers and masked to five bits. Other bitwise operands use signed 32-bit conversion; `>>>` converts its left operand to unsigned.

Conversion follows the selected original simulator for proven primitive values: numeric fractions and wrapped integers, numeric strings, Boolean values, null, undefined and nonfinite numbers. Bitwise results are numbers, including values above the signed range. Left and right expressions execute once in their original order. Normal Scratch comparison and arithmetic blocks retain their existing behavior.

Unknown, object and reference operands retain named source diagnostics. Native typed bitwise blocks emit an explicit error for opaque values and report undefined; they do not stringify reference handles or run arbitrary object coercion. This is a supported primitive boundary, not original exception-flow equivalence for arbitrary objects.

The existing canonical words gain operator field choices, including the literal `|` choice. Code decompilation and fresh SB3 retain those fields. Export emits typed helpers using the actual original operators and retains once-only argument evaluation. Focused controls compare original execution, native execution, Code, exported original execution, reimport and a fresh VM loading saved SB3, including numeric results stored in arrays. No general class, compound property assignment or whole-game qualification follows.
