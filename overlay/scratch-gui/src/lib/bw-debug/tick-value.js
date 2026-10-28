/**
 * A TICK COUNT HAS THREE SPELLINGS IN THIS SYSTEM, AND THEY MEAN THE SAME THING.
 *
 *   a Number   — most machines count in them; `machine.cycles`, a provider's own counter
 *   a BigInt   — `emu8051-debug` computes them with BigInt arithmetic, and
 *                `instruction-debug-events` stamps every fact with one
 *   a `0x…` string — what a BigInt becomes when it crosses a JSON boundary:
 *                `session-bundle.js`'s `canonical()` writes `0x${v.toString(16)}`
 *
 * The third is not a design choice anybody made; it is what JSON does to the
 * second, and it comes back as a string because `JSON.parse` has no reviver.
 *
 * WHY THIS IS ONE MODULE AND NOT A HELPER IN EACH FILE. There were FIVE
 * hand-written normalisers in `bw-debug/` when this was written — `ticks()`
 * twice, `asOrdinal`, `ordinal`, and a bare `BigInt()` — and TWO of them carry
 * an explicit `/^0x[0-9a-f]+$/i` branch, written by different people at
 * different times. Each was somebody hitting a hex tick and fixing the file in
 * front of them. Neither payment reached `session-bundle.js`, where the same
 * value was gated by `Number.isSafeInteger` and a recorded session therefore
 * exported fine and could not be re-imported.
 *
 * A local payment leaves the shape intact and removes the evidence that anyone
 * was ever hurt. So: one reader, one refusal, one place to change.
 *
 * @module
 */

/** The canonical wire spelling of a BigInt: what `canonical()` writes. */
const HEX = /^0x[0-9a-f]+$/i;

/**
 * Read a tick count in any spelling this system produces.
 *
 * @param {number|bigint|string} value
 * @returns {bigint|null} the count, or null if the value is not one
 */
export function readTicks(value) {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value === 'string' && HEX.test(value)) return BigInt(value);
  return null;
}

/** True if `readTicks` would accept it. */
export const isTicks = value => readTicks(value) !== null;

/**
 * What was there instead, for a refusal message.
 *
 * A REFUSAL MUST NAME THE SPELLING, and that is the lesson this module was
 * born from rather than a nicety. `session-bundle.js` refused a hex-string tick
 * with "input cursor must increase per branch with deterministic time" — a
 * message about ORDERING for a problem entirely about SPELLING. The cursors
 * were fine. A diagnostic that points away from the defect costs more than a
 * missing one, because it spends somebody's afternoon before they distrust it.
 *
 * @param {unknown} value
 * @returns {string} a short phrase naming what was found
 */
export function describeTicks(value) {
  if (typeof value === 'bigint') return `the negative bigint ${value}`;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return `the non-integer ${value}`;
    if (value < 0) return `the negative number ${value}`;
    return `${value}, which is beyond the safe integer range`;
  }
  if (typeof value === 'string') return `the string ${JSON.stringify(value)}`;
  if (value === null) return 'null';
  return `a value of type ${typeof value}`;
}

/** The wording every refusal shares, so the accepted set is stated once. */
export const TICKS_EXPECTED =
  'expected a non-negative safe integer, a bigint, or a canonical 0x… string';
