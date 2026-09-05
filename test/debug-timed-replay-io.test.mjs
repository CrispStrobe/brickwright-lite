import assert from 'node:assert/strict';
import test from 'node:test';

import {createHistoricalOutputGate, createTimedInputReplay} from
    '../overlay/scratch-gui/src/lib/bw-debug/timed-replay-io.js';

const input = (cursor, ticks, producer, payload = {}) => ({cursor,
    time: {domain: 'cpu', ticks}, producer, payload});

test('same-time inputs replay in cursor order and wake a waiting CPU at the exact boundary', () => {
    let time = 4n;
    let waiting = true;
    const applied = [];
    const published = [];
    const gate = createHistoricalOutputGate({publishState: (state, meta) => published.push({state, meta})});
    const target = {
        debugTime: () => ({domain: 'cpu', ticks: time}),
        replayToInputBoundary: boundary => { time = BigInt(boundary.ticks); return {accepted: true,
            time: {domain: 'cpu', ticks: time}, cpuState: waiting ? 'wai' : 'running'}; },
        applyReplayInput: fact => {
            applied.push(fact.cursor);
            if (fact.producer === 'irq') waiting = false;
            gate.emit({pin: fact.producer});
            return {accepted: true};
        }
    };
    const replay = createTimedInputReplay({target, outputGate: gate,
        inputs: [input(7, 10, 'irq'), input(8, 10, 'key', {code: 1})]});
    assert.equal(replay.start().accepted, true);
    assert.deepEqual(replay.replayNextBoundary(), {accepted: true, complete: true, applied: 2,
        boundary: {domain: 'cpu', ticks: 10n}, nextCursor: null});
    assert.deepEqual(applied, [7, 8]);
    assert.equal(waiting, false);
    assert.equal(published.length, 0, 'historical input effects did not escape');
    assert.deepEqual(replay.restoreAndResume({pins: {irq: 0}, screen: 'restored'}),
        {accepted: true, suppressedEffects: 2, resumed: true});
    assert.deepEqual(published, [{state: {pins: {irq: 0}, screen: 'restored'}, meta: {complete: true}}]);
    assert.equal(replay.restoreAndResume({screen: 'duplicate'}).accepted, false);
});

test('a HALT target may advance external time without executing the CPU before wake input', () => {
    let time = 20n;
    let halted = true;
    let instructions = 0;
    const gate = createHistoricalOutputGate({publishState () {}});
    const replay = createTimedInputReplay({outputGate: gate, inputs: [input(0, 25, 'interrupt')], target: {
        debugTime: () => ({domain: 'cpu', ticks: time}),
        replayToInputBoundary: boundary => { time = boundary.ticks; return {accepted: true,
            time: {domain: 'cpu', ticks: time}, cpuState: 'halt'}; },
        applyReplayInput: () => { halted = false; return {accepted: true}; }
    }});
    replay.start();
    assert.equal(replay.replayNextBoundary().accepted, true);
    assert.equal(halted, false);
    assert.equal(instructions, 0);
});

test('an instruction-only approximation cannot stand in for an exact input boundary', () => {
    const gate = createHistoricalOutputGate({publishState () {}});
    const replay = createTimedInputReplay({outputGate: gate, inputs: [input(1, 9, 'irq')], target: {
        debugTime: () => ({domain: 'cpu', ticks: 5n}),
        replayToInputBoundary: () => ({accepted: true, time: {domain: 'cpu', ticks: 12n}}),
        applyReplayInput: () => { throw new Error('must not apply at wrong time'); }
    }});
    replay.start();
    const result = replay.replayNextBoundary();
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'input-boundary-inexact');
    assert.equal(replay.restoreAndResume({}).code, 'timed-replay-inputs-pending');
});

test('output gate emits live deltas normally and exactly one complete resync per history transaction', () => {
    const output = [];
    const gate = createHistoricalOutputGate({publishState: (state, meta) => output.push({state, meta})});
    gate.emit({serial: 'live'});
    gate.begin();
    gate.emit({serial: 'historical'});
    gate.emit({audio: 'historical'});
    assert.deepEqual(output, [{state: {serial: 'live'}, meta: {complete: false}}]);
    assert.equal(gate.resynchronize({serial: 'restored', audio: 'restored'}).suppressedEffects, 2);
    assert.equal(gate.resynchronize({serial: 'again'}).accepted, false);
    assert.equal(output.length, 2);
    assert.deepEqual(output[1], {state: {serial: 'restored', audio: 'restored'}, meta: {complete: true}});
});

test('clock mismatch, passed inputs, and asynchronous target hooks fail closed', () => {
    const make = target => createTimedInputReplay({target, inputs: [input(0, 4, 'x')],
        outputGate: createHistoricalOutputGate({publishState () {}})});
    let replay = make({debugTime: () => ({domain: 'other', ticks: 0}),
        replayToInputBoundary () {}, applyReplayInput () {}});
    replay.start();
    assert.equal(replay.replayNextBoundary().code, 'input-clock-mismatch');
    replay = make({debugTime: () => ({domain: 'cpu', ticks: 5}),
        replayToInputBoundary () {}, applyReplayInput () {}});
    replay.start();
    assert.equal(replay.replayNextBoundary().code, 'input-boundary-passed');
    replay = make({debugTime: () => ({domain: 'cpu', ticks: 0}),
        replayToInputBoundary: async () => ({accepted: true}), applyReplayInput () {}});
    replay.start();
    assert.match(replay.replayNextBoundary().reason, /synchronous/);
});
