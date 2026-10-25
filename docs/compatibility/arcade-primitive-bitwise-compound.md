# Primitive bitwise compound assignments

## Original gap

Arcade already supports primitive binary bitwise operations and arithmetic
identifier compound assignments. Its identifier assignment statement branch
still refuses `|=`, `&=`, `^=`, `<<=`, `>>=` and `>>>=`. The authenticated Carnival
`formatDecimal` function uses `val |= 0` before its existing Number-to-text
operation. Supporting that statement does not qualify the complete dependency
or any game that uses it.

## Scope and implementation

Extend that statement branch through the existing primitive binary expression
path. Require the actual current operand producers; a type annotation or cast
cannot authorize opaque conversion. Reuse the current global, procedure-local,
parameter and captured-variable setters. Preserve left-value read before the
right operand, right-side effects exactly once, actual lexical binding and
32-bit signed/unsigned conversion and masked shift counts.

Member/index assignments and assignments used as expression results remain
separate operations. Preserve existing reference-coercion diagnostics. No new
canonical word, runtime approximation, source-body restoration, dependency pin,
annotation authority or broad class/callback admission belongs in this lane.

## Acceptance

- Exercise all six operators with negative, fractional, high-bit and overflowing
  primitive Numbers and shift counts outside 0 through 31. Bind expected values
  to the selected PXT compiler/runtime rather than assuming host JavaScript
  agreement for folded and nonfolded expressions.
- Verify actual global, parameter/local and captured bindings, shadowed names,
  right-side mutation and operand evaluation order. Preserve every adjacent
  diagnostic for unsupported objects, unresolved producers or bodies.
- Use actual source conversion, Code parsing, current native execution, same and
  fresh SB3, current export and source reimport. Verify actual connected blocks
  and visibly edited operator/operand values; no retained-source substitute.
- Execute genuinely new selected-original source and changed export programs
  with consumed inputs, binary, observations and source/bridge hashes retained.
  Original compilation/execution requires the shared reservation and unchanged
  previous failures remain preserved.
- Record which ordinary value-operation blocks and operator menus expose the
  capability. A native/portable check does not establish a visible editor
  journey; retain that GUI qualification gap until an actual browser control.

The raw corpus and authenticated complete-context counts remain distinct.
Report only measured changes and do not promote a game from this operation.


## Reached implementation and remaining acceptance — 2026-10-15

Source `1e65f988c24df35ec99a33ba68520ec529f7fb7a` implements all six
identifier operators with the existing primitive operations and setters. Eighteen
focused checks pass independently in both integration and review; another 24
source probes preserve actual numeric helper admission and reject opaque,
reassigned and constructor callees. Controls cover ordinary globals, parameters,
local shadowing, captured factories, aliases, right-side effects, current
operator/operand edits, Code, same/fresh SB3 and current export/reimport.

Two genuinely new exact source and edited-export programs compiled and executed
successfully in the selected original SDK. Their input bytes match the tracked
regression; this proves those bounded ordinary/parameter programs. The captured
factory matrix currently has native and portable evidence only. Negative unary
factory inputs remain a separate acceptance investigation; do not infer their
support from the positive fractional/high-bit/overflow matrix.

The existing `arrays_valueBinary` block and its connected operands carry these
operations. Visible Code/Blocks authoring, operator menu accessibility, edited
save/reopen and graphics integration still need browser qualification. This
lane adds no graphics operation. The immutable raw184 corpus remains **147
translated / 36 partial / one parse failure**; no complete game is promoted.
