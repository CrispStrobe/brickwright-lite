# Arcade row 2c, part 3: procedure results into Number formals

Status: claim and change in one PR. Owner: Arcade lane. Base: main `266c320d`.
Part 1 is `2026-11-12-arcade-2c-class.md`.

Scope: one new test, `test/makecode-arcade-procedure-result-numbers.test.mjs`,
and its GUI-scope entry. No product source changes.

Finding: the source proof already admits a procedure result into a Number
formal when every actual return is proven Number and no path falls through.
In the staging fixture `nestedValue` looked unproven only because other calls
fed Boolean values into `pair.b`, which made `pair`'s own result unproven.
The native route accepts the same results.

What the test pins:
- Admitted: `pair(tap(1),pair(tap(2),3))`, the staging `nestedValue` shape,
  and a two-path procedure whose returns are both Number.
- Refused (`pair.a requires Number`): a Text return path, a Boolean return
  path, an `<any>` Text return, a fall-through path, a bare `return`, and a
  resultless recursive cycle.
- Values and traces match across native, Code, fresh SB3, export, PXT and
  reimport (`nestedValue` 33 with trace 321 in PXT staging order,
  `directValue` 123 with trace 123).
- Nonvacuity: three source mutants each fail the refusal test. They are a bare
  `return` adding no Undefined, fall-through adding no Undefined, and a call
  result typed Number without the return edges.

Part 2 (Boolean literal globals) is not in this PR: the source proof works,
but the native runtime check still sees the Boolean writer of the staged
local. See the 2c row.
