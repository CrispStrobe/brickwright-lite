/**
 * The rotating corpus slice — the harness's own gate.
 *
 * `scripts/oracle-differential.mjs corpus N OFFSET` is the emitter-vs-oracle
 * differential. Its sampling was `pairs.slice(offset, offset + count)`, which
 * fails in a way the differential itself would have called a defect: an offset
 * at or past the end returns an EMPTY array, the comparison loop runs zero
 * times, the failure flag stays false, and the process exits 0. The run
 * reports success having compared nothing.
 *
 * That could not be gated where it lived — inside a network-bound CLI that
 * calls `process.exit` — so it was lifted into `scripts/corpus-sample.mjs`.
 * Same lesson as D-EMU-BP2: a rule reachable only through a live session is a
 * rule with no gate.
 *
 * The second defect was in the caller: it wrapped at a hardcoded 200 while the
 * gallery yields 224 eligible pairs, so 24 were unreachable by the rotation.
 * Only the corpus walk knows that bound, so the wrap belongs here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const {wrappedSample, bindsHardware} = await import(path.join(ROOT, 'scripts/corpus-sample.mjs'));

const pairs = n => Array.from({length: n}, (_, i) => `p${i}`);

test('an offset past the end wraps instead of comparing nothing', () => {
    // The original defect, stated as the number that produced it.
    const {sample, start, wrapped} = wrappedSample(pairs(224), 6, 5000);
    assert.equal(sample.length, 6, 'slice(5000, 5006) was [] and the run exited 0');
    assert.equal(start, 5000 % 224);
    assert.equal(wrapped, true, 'and it must say it wrapped, not pretend it did not');
});

test('the tail is reachable — the whole point of not wrapping at 200', () => {
    // Offsets 200..223 were unreachable while the caller wrapped at 200.
    for (const off of [200, 210, 223]) {
        const {sample} = wrappedSample(pairs(224), 6, off);
        assert.equal(sample.length, 6);
        assert.equal(sample[0], `p${off}`, `pair ${off} must be reachable`);
    }
});

test('a sample that runs off the end continues from the front', () => {
    const {sample} = wrappedSample(pairs(10), 4, 8);
    assert.deepEqual(sample, ['p8', 'p9', 'p0', 'p1'],
        'a short tail slice under-samples the end of the corpus forever');
});

test('the sample is never empty, whatever it is asked for', () => {
    for (const [n, count, off] of [[224, 6, 5000], [1, 6, 99], [10, 10, 0], [3, 7, 2]]) {
        const {sample} = wrappedSample(pairs(n), count, off);
        assert.ok(sample.length > 0, `empty sample for (${n}, ${count}, ${off})`);
        assert.equal(sample.length, Math.min(count, n));
        assert.ok(sample.every(Boolean), 'no undefined entries — an index ran out of range');
    }
});

test('a negative offset does not index backwards off the front', () => {
    // JS `%` keeps the sign: -1 % 224 is -1, and pairs[-1] is undefined, which
    // would compare `undefined` and throw somewhere far from the cause.
    const {sample, start} = wrappedSample(pairs(224), 3, -1);
    assert.equal(start, 223);
    assert.deepEqual(sample, ['p223', 'p0', 'p1']);
});

test('an impossible request is refused loudly rather than silently empty', () => {
    assert.throws(() => wrappedSample([], 6, 0), /no eligible pairs/,
        'an empty corpus is a broken harness, not a passing run');
    for (const bad of [0, -3, NaN, 'x']) {
        assert.throws(() => wrappedSample(pairs(10), bad, 0), /at least 1/,
            `count=${bad} must be refused, not turned into an empty comparison`);
    }
});

// ── which programs may be paired with a chip at all ──────────────────────

test('a program that binds hardware is a device program — PIN, PORT, PART, LEDCUBE, CHIP', () => {
    assert.equal(bindsHardware('DEVICE ARDUINO-UNO\nPIN led = D13 OUTPUT\n'), true);
    // The one that caught me out. `08-led-chaser-595` binds three pins through a
    // PART and no PIN line at all; a PIN-only test called it a host program and
    // would have dropped a real device program from the comparison — the
    // expensive direction of this mistake.
    assert.equal(bindsHardware('DEVICE STC12C5A60S2\nPART leds = 74HC595 data P1.0 clock P1.1 latch P1.2\n'),
        true, 'PART binds pins as surely as PIN does');
    assert.equal(bindsHardware('CHIP something\n'), true);
    // PORT and LEDCUBE were MISSING from the first version of this rule. The
    // emitter takes the device path on `pins || ports || parts || ledcube`, so
    // both bind hardware; no program in today's corpus is PORT-only, so the
    // omission was right by luck and would have dropped the first one silently.
    assert.equal(bindsHardware('DEVICE STC12C5A60S2\nPORT segments = P0 OUTPUT\n'), true,
        'a PORT-only program is a device program — 77-keypad-keyshow declares one');
    assert.equal(bindsHardware('DEVICE STC12C5A60S2\nLEDCUBE 4\n'), true,
        'a LEDCUBE-only program is a device program');
    assert.equal(bindsHardware('  PIN led = D13 OUTPUT'), true, 'indented declarations still bind');
});

test('a print-only program is a HOST program by the emitter’s own rule', () => {
    // sb3-creator.js:8243 — "declared pins mean the chip, everything else means
    // the host". These get stdio.h and a 64 KiB arena, which cannot build for
    // AVR (16-bit int) or bare-metal ARM (no stdio.h), every time.
    const src = 'DEVICE ARDUINO-UNO\nCLOCK 16000000\n\nSPRITE Cat:\n  WHEN flag clicked:\n    print "hi"\n';
    assert.equal(bindsHardware(src), false);
});

test('the word appearing in prose is not a declaration', () => {
    assert.equal(bindsHardware('# the PIN is described in this comment\n'), false,
        'a comment mentioning PIN must not promote a host program to a device one');
    assert.equal(bindsHardware('print "PART of the string"\n'), false);
    assert.equal(bindsHardware(''), false);
    assert.equal(bindsHardware(null), false, 'an unreadable program is not a device program');
});
