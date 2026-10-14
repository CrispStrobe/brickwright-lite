/**
 * Choosing the rotating slice of the corpus a differential run compares.
 *
 * Its own module, and exported, because the previous version was a one-line
 * `pairs.slice(offset, offset + count)` buried inside a network-bound CLI, and
 * it was wrong in a way no gate could reach: an offset at or past the end
 * produced an EMPTY sample, whereupon the caller's loop ran zero comparisons,
 * its failure flag stayed false, and the run exited 0. A green that compared
 * nothing is the exact failure this differential exists to catch in the
 * emitter; it must not be the harness's own behaviour.
 *
 * The caller cannot bound the offset itself — only the corpus walk knows how
 * many eligible pairs the gallery yields today (224 on 2026-09-03, against a
 * caller wrapping at a hardcoded 200, so the last 24 were unreachable).
 */

/**
 * `count` items from `offset`, wrapping, never empty.
 *
 * @param {Array} pairs every eligible pair, in corpus order
 * @param {number} count how many to compare this run
 * @param {number} offset where to start; any integer, wrapped into range
 * @returns {{sample: Array, start: number, wrapped: boolean}}
 */
export function wrappedSample (pairs, count, offset) {
    if (!Array.isArray(pairs) || pairs.length === 0) {
        throw new Error('corpus sample: no eligible pairs at all');
    }
    const n = Math.trunc(Number(count));
    if (!Number.isFinite(n) || n < 1) {
        throw new Error(`corpus sample: count must be at least 1, got ${count}`);
    }
    const raw = Math.trunc(Number(offset)) || 0;
    // Two-step modulo: JS `%` keeps the sign, so a negative offset would index
    // backwards off the front of the array and yield undefined entries.
    const start = ((raw % pairs.length) + pairs.length) % pairs.length;
    const take = Math.min(n, pairs.length);
    const sample = Array.from({length: take}, (_, i) => pairs[(start + i) % pairs.length]);
    return {sample, start, wrapped: start !== raw};
}

/**
 * Does this program target a CHIP at all?
 *
 * The emitter decides its own target, and says so at `sb3-creator.js:8243`:
 * "Which target a project gets is decided by the project — declared pins mean
 * the chip, everything else means the host." A program that binds no hardware
 * is a HOST program, and gets portable C99 with `stdio.h` and a 64 KiB arena.
 *
 * So pairing such a program with a microcontroller is a category error in the
 * harness, not a defect it has detected: compiling host C with avr-gcc fails on
 * `bw_arena[1 << 16]` (AVR's `int` is 16 bits) and with arm-none-eabi on the
 * missing `stdio.h`, every time, for every one of them. Those are facts about
 * the pairing, not about the emitter, and a differential that reports them as
 * emitter disagreement is measuring its own input.
 *
 * The gallery's `devices` list is COMPUTED and does claim those targets for
 * programs that bind nothing — 24 of the 113 claiming nano/pico. That is a real
 * defect and it is filed as D-CORPUS1 against the producer; it is not fixable
 * from here, and it must not be quietly absorbed either, so the caller reports
 * how many pairs this dropped.
 *
 * Deliberately syntactic, over the program source, because that is the same
 * evidence the emitter uses. The keyword set is taken from the emitter's own
 * predicate rather than guessed: `generateC` takes the device path when the
 * project has `pins || ports || parts || ledcube`, so PORT and LEDCUBE bind
 * hardware exactly as PIN does, and `PART leds = 74HC595 data P1.0 clock P1.1`
 * is a pin binding written another way.
 *
 * The first version of this listed only PIN, PART and CHIP. No program in
 * today's corpus is PORT-only or LEDCUBE-only, so it was right by luck — and
 * would have silently dropped the first one that appeared, which is the
 * expensive direction of this mistake and the one this comment already warned
 * about. Missing a device program removes it from the differential entirely;
 * including a host program only costs a compile that fails loudly.
 */
export function bindsHardware (programSource) {
    return /^[ \t]*(PIN|PORT|PART|LEDCUBE|CHIP)\b/m.test(String(programSource || ''));
}
