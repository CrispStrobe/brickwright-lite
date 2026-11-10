# Arcade row 2g animation-export: lookup call-site pruning (Array part)

Status: claim and change in one PR. Owner: Arcade lane. Base: main `e26b3bf9b254`.

Scope: `array-reference-export-authority.js`, limited to one new helper
(`prunedLookupReturn`, with `constantText`) just above `computeNode`, the
`computeNode` call branch, and the call branch of `initialized()`. Also a new
`test/makecode-arcade-animation-lookup-pruning.test.mjs` and its GUI-scope entry.
The `id` String refusal (`export-arcade.js`, `"" + id` emitted as `__bwBinaryAdd`)
is owned by a peer and not touched here.

Problem: after a native round trip, the lookup functions become procedures
`IF id == "<key>" THEN return frames`, then a fallback `return undefined`.
The result of a call was typed as the union of all returns, so `first`,
`second`, `shared` and `third` were "Array or undefined", and their item, take
and length reads were refused.

Change: a call is pruned to X only in this case:
- its argument for P is a constant string literal;
- the body is parameter declarations, then exactly `IF P ==/=== <same literal>
  THEN return X` (no else, nothing else in THEN), then any fallback;
- P has no writer other than call arguments.

The call then takes only X's types and initialization. Any other shape keeps
the old behaviour.

Verification: the new file has 1 accepted case (`==` and `===`) and 11 refusals.
Every guard has a mutation that fails a test. The animation-resources TODO stays
until the peer's String fix lands: its argument is still `"" + key`, which is not
a literal.

Follow-up 2026-11-10 (global key variant): claim and change in one PR.
- Pruning also accepts a call argument that reads a global G as the constant S
  when all of these hold:
  - the only write to G in the whole project is a literal `set G to "S"`;
  - that write definitely ran earlier in the same once-only script as the call;
  - every other block naming G is a plain read;
  - no slider or other writable monitor is attached to G.
- This is the real re-imported shape: `GLOBAL key` (initial 0), then
  `set key to ("<uuid>")` at top level before the calls.
- Refusals, each failing under its own mutant: a second writer in another
  script, a different string, a writer inside an IF, a writer after the call,
  a computed or call writer, a change-by, a non-writing block naming the key,
  a slider monitor, and an initial value with no writer.
- The `(key)` animation test no longer has a todo.
