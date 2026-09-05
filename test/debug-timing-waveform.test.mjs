import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTimingWaveform} from '../overlay/scratch-gui/src/lib/bw-debug/timing-waveform.js';

const event = (seq, signals, fidelity = 'recorded') => ({schema: 1, seq,
    time: {ticks: seq * 2, domain: 'z80-tstates', hz: 4_000_000}, cpuId: 'z80',
    kind: 'bus', phase: 'tick', fidelity, signals});

test('waveform derives bounded grouped lanes and retains per-sample provenance', () => {
    const model = createTimingWaveform({capacity: 3, maxLanes: 4});
    model.append([
        event(10, {address: 0x1000, data: 0x3e, rd: 0, gpio0: 1, ignored: 1}),
        event(11, {address: 0x1001, data: 0x55, rd: 1, gpio0: 0}, 'reconstructed')
    ]);
    const view = model.view();
    assert.deepEqual(view.lanes, [
        {id: 'address', group: 'address'}, {id: 'data', group: 'data'},
        {id: 'rd', group: 'control'}, {id: 'gpio0', group: 'pin'}
    ]);
    assert.deepEqual(view.samples.map(sample => sample.provenance), ['recorded', 'reconstructed']);
    assert.equal(Object.isFrozen(view), true);
    assert.equal(Object.isFrozen(view.samples[0].values), true);
    assert.equal(Object.hasOwn(view.samples[0].values, 'ignored'), false);
});

test('selection, range, zoom and edge triggers share one canonical event cursor', () => {
    const model = createTimingWaveform({capacity: 8});
    model.append([0, 1, 0, 1, 0].map((rd, seq) => event(seq, {address: seq, data: seq, rd})));
    assert.deepEqual(model.selectEvent(0), {accepted: true, selectedSeq: 0});
    assert.equal(model.setTrigger({lane: 'rd', edge: 'rising'}).accepted, true);
    assert.deepEqual(model.nextTrigger(), {accepted: true, selectedSeq: 1});
    assert.deepEqual(model.nextTrigger(), {accepted: true, selectedSeq: 3});
    assert.deepEqual(model.previousTrigger(), {accepted: true, selectedSeq: 1});
    assert.equal(model.setRange({startSeq: 0, endSeq: 4}).accepted, true);
    assert.equal(model.zoom(2).accepted, true);
    assert.deepEqual(model.view().range, {startSeq: 0, endSeq: 2});
    assert.equal(model.pan(2).accepted, true);
    assert.deepEqual(model.view().range, {startSeq: 2, endSeq: 4});
});

test('retention is explicit and JSON/VCD exports are deterministic evidence', () => {
    const model = createTimingWaveform({capacity: 2});
    model.append([event(7, {address: 0x20, data: 1, wr: 1}),
        event(8, {address: 0x21, data: 2, wr: 0}), event(9, {address: 0x22, data: 3, wr: 1})]);
    const parsed = JSON.parse(model.exportJSON());
    assert.equal(parsed.schema, 1);
    assert.equal(parsed.dropped, 1);
    assert.deepEqual(parsed.range, {endSeq: 9, startSeq: 8});
    const vcd = model.exportVCD();
    assert.match(vcd, /\$timescale 1ps \$end/);
    assert.match(vcd, /\$var wire 6 ! address \$end/);
    assert.match(vcd, /#4000000\n/);
    assert.match(vcd, /#4500000\n/);
});

test('memory facts supply address/data lanes without inventing recorded provenance', () => {
    const model = createTimingWaveform();
    model.append([{seq: 1n, time: {ticks: 1n, domain: 'cpu'}, cpuId: 'cpu', fidelity: 'reconstructed',
        memory: {space: 'ram', address: 0x1234, value: 0xab}}]);
    const view = model.view();
    assert.equal(view.samples[0].provenance, 'reconstructed');
    assert.deepEqual(view.samples[0].values, {address: 0x1234, data: 0xab});
    assert.match(model.exportJSON(), /"seq":"0x1"/);
});
