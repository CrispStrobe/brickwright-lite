# SpriteKind initializer conversion

Sprite kinds are numbers allocated by the original runtime. A display name is
an alias for that number. Import must preserve allocation and observation order,
including declarations that the main program never uses.

## Source lowering contract

`lowerNamespaceBindings` has an opt-in `spriteKinds` path. Arcade import enables
it; other callers keep their existing behavior. Exported SpriteKind values become
numeric namespace globals. They start as typed `undefined` before source execution,
and their original initializer executes at its original declaration point.
A forward read therefore sees `undefined`; it does not allocate a kind early.
After an initializer completes, a display-name binding references the stored
number. Reopened namespaces retain source ordering and their existing visibility
rules. Ordinary namespace reads before initialization still report a gap.

`SpriteKind.create()` lowers to the runtime allocation reporter. Even a discarded
call executes. Builtin kind members use a nonallocating numeric lookup. Dynamic
creation, kind changes, collection queries and callback registrations wire the
actual kind value into the native operation. Sprite `.kind()` uses the existing
numeric `kind` property reporter. Objects, arrays and unsupported namespace-object
access retain explicit diagnostics.

## Exact TextSprite dependency initialization

The exact TextSprite source receipt retains its original namespace initializer
at the original dependency-file phase. For that admitted initializer, import
initializes the complete native TextSprite module and then reads its single shared
numeric Text kind into the namespace global. It does not execute a second
`SpriteKind.create()` for the same module. This path requires both prepared
library metadata and the byte-identical retained internal initializer source.
Additional dependency files remain in their original order.

## Acceptance checks

- `test/makecode-arcade-sprite-kind-lowering.test.mjs`: syntax/lowering, forward
  values, unused allocations, actual operation wires and retained Text phase.
- `test/makecode-namespace-bindings.test.mjs`: ordinary namespace regressions.
- `test/makecode-arcade-sprite-kind-original.test.mjs`: owned source fixtures run
  through unchanged original MakeCode compilation/simulation.
- `test/makecode-arcade-sprite-kind-code.test.mjs`: the production Code/blocks
  compiler and its decompiler, using the matching SpriteKind vocabulary.

These checks have distinct authority. Source lowering and original-only fixtures
do not qualify native execution, saved SB3 reopening, exported original execution,
a hosted editor journey or whole corpus projects. Native registry and exporter
integration must pass those separate comparisons before closing runtime gaps.

## Combined native and export qualification

`test/makecode-arcade-sprite-kind-roundtrip.test.mjs` now runs three owned
programs through unchanged original compilation/simulation, the native registry,
Code reconstruction, same and fresh VM SB3 reopening, exported original execution
and prepared reimport. The combined worker batch passes 14 controls. Nullable
creation, unused/dependency allocations, zero/unused callback parameters, numeric
queries and captured event IDs have separate controls.

Those finite comparisons supersede the pending native/export integration status
for the covered cases. Original MakeCode Blockly decompilation, direct GUI
custom-kind authoring, broader dynamic binding, scheduling/cadence and complete
authentic games remain separate acceptance gates. An exact timing control still
reports its known failure; it is not included as a passing compatibility result.
