/**
 * resolveNetlist — the ONE place the run board is chosen, now a leaf module so
 * the debugger and the MicroPython simulator Run share it (and its phantom-
 * inferred-bench rejection) instead of keeping two copies.
 *
 * The rejection is the load-bearing case (owner reports 2026-08-16/17): a
 * circuit the engine REJECTED leaves the designer board empty, and inferring a
 * bench there drove a phantom set of LEDs while the canvas showed the real,
 * broken circuit. It must refuse by name, never fall back. These are pure —
 * resolveNetlist takes vm/stc/inferNetlist as plain objects.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveNetlist} from '../overlay/scratch-gui/src/lib/bw-board/resolve-netlist.js';

test('a rejected netlist is refused by name, never papered over with an inferred bench', async () => {
    const vm = {runtime: {circuitBoard: null, circuitModel: {netlistError: 'R3 has no connection\n(more detail)'}}};
    const infer = () => { throw new Error('inferNetlist must NOT run on a rejected circuit'); };
    await assert.rejects(
        () => resolveNetlist(vm, {}, infer, 30),
        (e) => {
            assert.match(e.message, /rejected by the engine/);
            assert.match(e.message, /phantom inferred bench/);
            assert.match(e.message, /R3 has no connection/, 'the first engine error is not surfaced to the user');
            return true;
        },
        'a rejected circuit was silently run against an inferred bench — the "Blink stopped blinking" bug');
});

test('a live designer board is used directly, not inferred', async () => {
    const board = {parts: [{id: 'led1'}], getNets: () => [{id: 'n0', terminals: []}]};
    const vm = {runtime: {circuitBoard: board}};
    const got = await resolveNetlist(vm, {}, () => { throw new Error('should not infer'); }, 30);
    assert.deepEqual(got.parts, board.parts);
    assert.deepEqual(got.nets, board.getNets());
});

test('an empty designer with NO rejection falls back to the inferred netlist, loudly', async () => {
    const vm = {runtime: {}};
    const inferred = {parts: [{id: 'mcu'}], nets: []};
    const warn = console.warn;
    console.warn = () => {};               // the fallback warns on purpose; keep the test quiet
    try {
        const got = await resolveNetlist(vm, {}, () => inferred, 30);
        assert.deepEqual(got, inferred, 'an empty, un-rejected designer did not fall back to inference');
    } finally {
        console.warn = warn;
    }
});
