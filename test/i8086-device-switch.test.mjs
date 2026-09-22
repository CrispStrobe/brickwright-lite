// Selecting "Intel 8086 (DOS bench)" in the Code tab must WORK on a program
// that declares pins — the user hit "Cannot retarget to Intel 8086 (DOS bench):
// unknown device: i8086" and the dropdown snapped back.
//
// Root cause: pseudocode-importer.jsx's setDevice routed ANY pin-bearing
// program through SB3Creator.retargetPseudocode (the MCU pin-pool remapper),
// which legitimately refuses the 8086 — it has, and should have, no pin pools.
// The refusal aborted the switch. The fix gates the retarget on the device
// actually having a pool, so a CPU bench (i8086) falls through to the plain
// DEVICE-line rewrite and reaches the existing 8086 ASM/BASIC toolchain.
//
// This suite locks BOTH halves: the vendored contract the fix relies on
// (i8086 has no pools, and retarget refuses it), and that setDevice carries the
// pool guard (so the refusal can no longer abort the switch). Source-text
// assertions match this harness's idiom for the JSX importer (device-choice-
// contract.test.mjs does the same — JSX cannot be imported into node:test).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const IMPORTER = join(HERE,
    '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');

const PIN_PROGRAM =
    'DEVICE STC12C5A60S2\nPIN led1 = P1.0 OUTPUT ACTIVE LOW\n' +
    'WHEN green flag clicked\nFOREVER\n  turn on led1\nEND FOREVER';

// ── The vendored contract the fix depends on ─────────────────────────────────

test('i8086 has no retarget pool — a CPU bench is not a pin MCU', () => {
    const pools = SB3Creator.RETARGET_POOLS;
    assert.ok(pools && typeof pools === 'object', 'RETARGET_POOLS exists');
    // MCUs have pools…
    assert.ok(pools.eater6502 || pools.z80 || pools['arduino-nano'],
        'at least one MCU/CPU-with-pins has a pool');
    // …the 8086 DOS bench does not, and must not (it has no GPIO pin pool).
    assert.equal(pools.i8086, undefined, 'i8086 must not be given a pin pool');
});

test('retargetPseudocode refuses i8086 — which is why setDevice must not call it', () => {
    const result = SB3Creator.retargetPseudocode(PIN_PROGRAM, 'i8086');
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some(r => /unknown device/i.test(r)),
        `should refuse with "unknown device": ${result.reasons}`);
});

// ── The fix: setDevice gates retarget on a pool, then falls through ──────────

test('setDevice retargets only when the device has a pool (i8086 falls through)', () => {
    const src = readFileSync(IMPORTER, 'utf8');
    // The guard: retarget is computed from the pool table, not attempted blindly.
    assert.match(src, /RETARGET_POOLS\s*&&\s*SB3Creator\.RETARGET_POOLS\[deviceId\]/,
        'setDevice must derive canRetarget from RETARGET_POOLS[deviceId]');
    // retargetPseudocode is now reached only under that guard…
    assert.match(src, /if\s*\(\s*hasPins\s*&&\s*canRetarget\s*\)/,
        'the retarget branch must require canRetarget');
    // …and a pool-less device still writes its DEVICE line (the else branch).
    assert.match(src, /DEVICE \$\{deviceId\.toUpperCase\(\)\}/,
        'the fall-through must rewrite the DEVICE line');
});

test('loadExample also skips retarget for a pool-less device and switches DEVICE', () => {
    const src = readFileSync(IMPORTER, 'utf8');
    // loadExample (bundled examples) guards the same way: no pool → no retarget,
    // switch the DEVICE line so an example loads onto the i8086 DOS bench.
    assert.match(src, /RETARGET_POOLS\s*&&\s*SB3Creator\.RETARGET_POOLS\[device\]/,
        'loadExample must gate retarget on the device pool table');
    assert.match(src, /DEVICE \$\{device\.toUpperCase\(\)\}/,
        'loadExample must rewrite the DEVICE line for a pool-less target');
});
