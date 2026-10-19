# Arcade signed integer division

Status: proposed bounded contract. Product edits follow normal claim merge.
This is not an implementation, reduced diagnostic count or whole-game result.

## Actual source gap and selected semantics

The stopwatch dependency in complete Sparks projects calls `Math.idiv` while
formatting time. Current recognition knows that API but cannot lower its value.
Downstream Number formatting and Font obligations require actual producers;
a desired return annotation cannot close them.

Use the selected runtime acquired by
[`scripts/sync-makecode-runtime.mjs`](../scripts/sync-makecode-runtime.mjs),
its actual `sim/pxtsim.js` integer-division function and exact input identity.
For primitive Numbers the operation is `((a | 0) / (b | 0)) | 0`.
The generated internal HUD helper omits operand conversion; it cannot establish
this public API's behavior for arbitrary fractional or large Number inputs.

Select only the unchanged unshadowed SDK root/member, exact two arguments and
actual Number operand obligations. Check aliases and root/member writes with
the existing lexical graph. Refuse Text, references, unknown values and wrong
arity. Neither an annotation nor a matching SDK-looking name grants authority.

Reuse existing divide and bitwise value blocks. Evaluate each operand once,
left to right; retain editable current inputs. An equivalent standard expression
is a valid current export. Do not restore source text or synthesize a new word.

Signed conversion occurs before and after division. Negative quotients truncate
toward zero, a converted zero divisor gives zero, and minimum signed32 divided
by minus one wraps to minimum signed32. Fractional/out-of-range operands each
undergo conversion. Computed Infinity and NaN follow actual bitwise conversion.

## Acceptance

- Compare the selected original's signed, fractional, wrap, zero-divisor,
  overflow and computed nonfinite values. Bind exact source and runtime inputs.
- Observe left/right effects once in order. Local/captured/stored operands need
  their actual existing producer and writer proof; mixed writes still refuse.
- Exercise Code, editable Blocks, same/fresh SB3 and current export/reimport.
  Edit real inputs, observe changed results, then separately compile/run that
  genuinely edited export. Preserve first failures and all diagnostic channels.
- Refuse shadowed/replaced SDK roots/members, unknown aliases, wrong arity and
  non-Number operands. Do not use a broad API return-type seed.
- Keep immutable corpus counts separate; reassess affected projects only after
  qualification. HUD renderable lifetime, Font formals, event forwarding and
  other APIs retain their independent gaps.

The existing visible arithmetic/bitwise operands must remain authorable.
Actual browser editing is a separate gate from native execution; no dedicated
menu item or canonical compiler change is claimed here.
