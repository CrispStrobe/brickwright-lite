// A GUARD PUT IN PLACE BEFORE THE HAZARD ARRIVES.
//
// bw-board's three machines cache a flattened advance schedule: iterating
// `Object.keys(this.chips)` in `_advanceChips` was allocating a fresh array
// every instruction, measured at 89% of `machine.step()` on a 7-chip 8086.
// Lite's vendored copies do NOT have that cache yet — they still walk the
// object every time, which is slower and unconditionally correct.
//
// SO WHY A TEST FOR A BUG THIS TREE CANNOT CURRENTLY HAVE?
//
// Because the cache is two pieces that must travel together:
//
//   1. `_advList = null` + `_buildAdvanceList()` + the flat loop — the
//      visible part, and the whole reason anyone would port it.
//   2. `_advList = null` inside `attachDevice` — one line, easy to miss.
//
// Take (1) without (2) and any device attached after the first `step()`
// SILENTLY NEVER TICKS. No exception, no wrong value, nothing red: the
// defect has no symptom at the layer it lives in. bw-board's author found
// it by deleting the invalidation and watching three machines go red — and
// that guard lives in `test/machine-contract.test.mjs`, which this tree does
// not have. **The one file that makes the graft safe is not in the repo
// where the graft would happen.**
//
// This file closes that. It passes today against the uncached loop, and it
// is what will fail the day someone ports half the optimisation.
//
// RED-PROVED, AND THE FIRST ATTEMPT AT THE PROOF WAS WRONG — which is worth
// recording, because it is the same species one level up. Simulating the bad
// graft by caching only `this.chips` left the test GREEN: the probe is
// attached as a DEVICE, and devices were still walked fresh, so the hazard
// was never reproduced. For thirty seconds this looked like a guard that
// could not fail.
//
// The real `_buildAdvanceList` caches chips AND devices in one flat array.
// Re-simulated faithfully, the i8086 case goes RED and green again on
// restore. A mutation that does not reproduce the mechanism proves nothing
// about the test, only about the mutation.
//
// Attach-then-step is covered incidentally by every other test in the tier.
// Step-then-attach is covered by nothing, which is why it needs provoking
// by ORDER rather than by behaviour.
import {test} from 'node:test';
import assert from 'node:assert/strict';

const L = new URL('../overlay/scratch-gui/src/lib/bw-board/', import.meta.url);
const {I8086Machine} = await import(new URL('i8086-machine.js', L).href);
const {Z80Machine} = await import(new URL('z80-machine.js', L).href);
const {M6502Machine} = await import(new URL('m6502-machine.js', L).href);

const MACHINES = [
    ['i8086', () => new I8086Machine({
        clockHz: 5_000_000,
        regions: [{kind: 'ram', start: 0, end: 0xbffff}],
        chips: [{kind: 'ppi', name: 'ppi1', at: 0x60}],
    })],
    ['z80', () => new Z80Machine({
        clockHz: 4_000_000,
        regions: [{kind: 'ram', start: 0, end: 0xffff}],
        chips: [],
    })],
    ['6502', () => new M6502Machine({
        clockHz: 1_000_000,
        regions: [{kind: 'ram', start: 0, end: 0xffff}],
        chips: [],
    })],
];

for (const [name, make] of MACHINES) {
    test(`${name}: a device attached AFTER stepping still gets advanced`, () => {
        let m;
        try {
            m = make();
        } catch (e) {
            assert.fail(`${name}: could not build a minimal machine — ${e.message}`);
        }
        if (typeof m.attachDevice !== 'function') {
            assert.fail(`${name}: no attachDevice(); this guard needs updating rather than skipping`);
        }
        for (let i = 0; i < 50; i++) m.step();      // force any schedule to build

        let ticks = 0;
        m.attachDevice('probe', {advance: () => { ticks++; }});
        for (let i = 0; i < 50; i++) m.step();

        assert.ok(ticks > 0,
            `${name}: a device attached after the first step() was never advanced. `
            + 'If an advance-schedule cache was ported into this tree, attachDevice '
            + 'must null it — see docs/VENDOR-DIVERGENCE-I8086-MACHINE.md.');
    });
}
