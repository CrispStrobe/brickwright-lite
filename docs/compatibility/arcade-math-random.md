# MakeCode numeric selection and random operations

The Arcade extension exposes three authoring blocks and Code forms:

- `arcade random fraction`: a Number reporter with no inputs.
- `arcade math min|max|randomRange first (value) second (value)`: a Number reporter
  with a fixed visible operation menu and two connected inputs.
- `arcade percent chance (percentage)`: a Boolean reporter.

They export to the corresponding MakeCode APIs. Imported MakeCode source uses
these operations; ordinary Scratch random/min/max blocks retain their behavior.
Numeric editor shadows are numbers, while connected primitive reporters retain
SDK selection semantics. Unknown operations and reference inputs are diagnosed.

## Runtime rules

`Math.random()` returns one continuous platform draw in [0, 1). `randomRange`
returns equal bounds without drawing, swaps reversed bounds, uses inclusive
integer bounds when both numbers are integers, and otherwise interpolates the
fractional interval with one draw. It retains the original nonfinite behavior.
`percentChance` returns immediately at percentages at least 100 or at most 0;
otherwise it compares a random integer from 0 through 99 with the percentage.

MakeCode `min` uses `a <= b ? a : b`; `max` uses `a >= b ? a : b`. They select the
actual argument. A NaN left argument selects the right argument; a NaN right
argument is returned. Equal zero values retain the first argument's sign.

## Selected compiler profile versus local authoring

The pinned Arcade 4.2.1 worker uses PXT 13.2.1. Its numeric constant folding and
prefix emitter differ from JavaScript in observable cases. Constant negative
zero is emitted as positive zero. Parentheses block an outer fold, while the
inner expression is folded when emitted. Dynamic source unary minus uses
`0 - operand`; numeric operands reached after an outer prefix fold was blocked
are negated by the selected emitter, including grouped unary plus.

The importer retains optional parenthesis metadata and implements the qualified
pure numeric subset with unshadowed SDK Infinity/NaN constants. It does not
execute unknown bindings or side effects during folding. This is a bounded
selected-worker profile, not blanket emulation of every compiler optimization.
Tests retain both folded and dynamic signed-zero cases and the grouping barrier.

Locally authored BWValues unary operations keep their own JavaScript semantics.
Their exported unary-minus helper uses multiplication by -1 so the original
compiler retains negative zero. A numeric editor shadow containing negative zero
exports through a parameterized division helper, preventing constant folding
from changing the authored value. Actual original execution and reimport cover
both routes.

## Method and qualification

`test/makecode-arcade-math-random.test.mjs` compares the actual original simulator,
native execution, Code, same and fresh SB3 files, original export, and reimport.
It also checks primitive selection, nonfinite values, evaluation order, menu
metadata, refusal boundaries, compiler grouping, and signed-zero export.

The original entropy observer wraps only external platform `Math.random`, calls
and returns its original draw unchanged, and records an authored phase marker.
It neither seeds the source RNG nor replaces SDK random helpers. Observed values
and draw counts prove helper algorithms and guards. Separate native checks use
the same unchanged-draw observation method. Unseeded roundtrips compare range
invariants and deterministic state; they do not claim identical random values,
whole-game trajectories, or Dance Party timing.

Primary source references:

- [PXT min/max helpers](https://github.com/microsoft/pxt/blob/v13.2.1/libs/pxt-common/pxt-helpers.ts).
- [PXT simulator numeric helpers](https://github.com/microsoft/pxt/blob/v13.2.1/pxtsim/langsupport.ts).
- [PXT compiler folding and prefix emission](https://github.com/microsoft/pxt/blob/v13.2.1/pxtcompiler/emitter/emitter.ts).
- [Selected Arcade target revision](https://github.com/microsoft/pxt-arcade/tree/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea).

The existing PXT MIT notices remain in `scratch-gui/static/licenses`. Runtime,
Code graphs and native menu metadata are qualified here. A hosted full-editor
palette/menu journey remains a separate GUI acceptance task. Other Math APIs
and arbitrary compiler const propagation remain separate gaps.
