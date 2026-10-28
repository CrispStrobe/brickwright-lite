import test from 'node:test';
import assert from 'node:assert/strict';

import {createSelectedEventInspectionStore} from
    '../overlay/scratch-gui/src/lib/bw-debug/selected-event-inspection.js';

const time = ticks => ({ticks: BigInt(ticks), domain: 'cpu', hz: 1_000_000});
const recording = () => ({
    checkpoints: [
        {id: 0, eventCursor: 10, time: time(0), snapshot: {opaqueMachineState: 'do not inspect'}},
        {id: 1, eventCursor: 14, time: time(4), snapshot: {opaqueMachineState: 'still opaque'}}
    ],
    events: [
        {schema: 1, seq: 10, kind: 'instruction', phase: 'retire', time: time(1),
            pcBefore: 0x100, pcAfter: 0x102, fidelity: 'recorded',
            instruction: {address: 0x100, bytes: [0x3e, 0x04], text: 'LD A,4'},
            registersAfter: {a: 4, pc: 0x102, flags: 0x40},
            changes: {registers: {a: {before: 1, after: 4}, pc: {before: 0x100, after: 0x102}}}},
        {schema: 1, seq: 11, kind: 'memory', phase: 'access', time: time(2), fidelity: 'reconstructed',
            memory: {space: 'ram', address: 0x20, width: 1, direction: 'read', value: 2}},
        {schema: 1, seq: 12, kind: 'memory', phase: 'access', time: time(3), fidelity: 'recorded',
            memory: {space: 'ram', address: 0x20, width: 1, direction: 'write', before: 2, value: 4}},
        {schema: 1, seq: 13, kind: 'instruction', phase: 'retire', time: time(4),
            pcBefore: 0x102, pcAfter: 0x104, fidelity: 'recorded',
            instruction: {address: 0x102, bytes: [0x00], text: 'NOP'}}
    ]
});

test('selected cursor derives registers, disassembly and writes only from retained values', () => {
    const store = createSelectedEventInspectionStore();
    const source = recording();
    store.load(source);
    source.events[0].instruction.text = 'corrupted after load';
    const view = store.select(13);
    assert.equal(view.accepted, true);
    assert.deepEqual(view.registers, {
        full: {available: true, refusal: null, values: {a: 4, pc: 0x102, flags: 0x40},
            provenance: {eventSeq: 10, fidelity: 'recorded'}},
        changes: {available: true, refusal: null, values: {
            a: {before: 1, after: 4}, pc: {before: 0x100, after: 0x102}
        }}
    });
    assert.equal(view.disassembly.instruction.text, 'LD A,4');
    assert.equal(view.disassembly.eventSeq, 10);
    assert.deepEqual(view.memory.changes.map(item => [item.seq, item.memory.direction]), [[12, 'write']]);
    assert.equal(view.memory.truncated, 0);
    assert.equal(store.status().selectedCursor, 13);
});

test('opaque checkpoint snapshots never fabricate a register diff', () => {
    const store = createSelectedEventInspectionStore();
    const source = recording();
    delete source.events[0].changes;
    store.load(source);
    const view = store.select(14).registers;
    assert.equal(view.full.available, false,
        'the latest retire at seq 13, not an older retire, defines cursor state');
    assert.equal(view.changes.available, false);
});

test('full registers follow event-cursor semantics and only the latest retire', () => {
    const store = createSelectedEventInspectionStore();
    store.load(recording());
    assert.equal(store.select(10).registers.full.available, false,
        'cursor 10 is before event 10');
    assert.deepEqual(store.select(11).registers.full, {available: true, refusal: null,
        values: {a: 4, pc: 0x102, flags: 0x40}, provenance: {eventSeq: 10, fidelity: 'recorded'}});
    assert.equal(store.select(14).registers.full.available, false,
        'a missing snapshot on the latest retire must not reuse stale state from event 10');
});

test('oversized full register snapshots fail visibly instead of truncating state', () => {
    const store = createSelectedEventInspectionStore({maxRegisters: 2});
    store.load(recording());
    assert.deepEqual(store.select(11).registers.full, {available: false,
        refusal: 'canonical register snapshot exceeds 2 entries', values: null, provenance: null});
});

test('load does not read or retain opaque checkpoint snapshot payloads', () => {
    const store = createSelectedEventInspectionStore();
    const source = recording();
    Object.defineProperty(source.checkpoints[0], 'snapshot', {
        enumerable: true,
        get () { throw new Error('destructive device snapshot read'); }
    });
    assert.doesNotThrow(() => store.load(source));
    assert.equal(store.select(10).accepted, true);
});

test('absence of register evidence is explicit and never filled from a live target', () => {
    const store = createSelectedEventInspectionStore();
    const source = recording();
    delete source.events[0].changes;
    store.load(source);
    const view = store.select(13);
    assert.deepEqual(view.registers.changes, {available: false,
        refusal: 'canonical events contain no register-change evidence', values: {}});
    assert.equal(Object.hasOwn(view, 'target'), false);
});

test('memory history is bounded, write-only, ordered, and reports exact truncation', () => {
    const store = createSelectedEventInspectionStore({maxMemoryChanges: 2});
    const source = recording();
    source.events.splice(1, 0,
        {schema: 1, seq: 11, kind: 'memory', time: time(1),
            memory: {space: 'ram', address: 1, direction: 'write', value: 1}},
        {schema: 1, seq: 12, kind: 'memory', time: time(1),
            memory: {space: 'ram', address: 2, direction: 'write', value: 2}});
    source.events[3].seq = 13;
    source.events[4].seq = 14;
    source.events[5].seq = 15;
    source.checkpoints[1].eventCursor = 16;
    store.load(source);
    const memory = store.select(16).memory;
    assert.deepEqual(memory.changes.map(change => change.memory.address), [2, 0x20]);
    assert.equal(memory.truncated, 1);
});

test('selection fails closed outside retention and load rejects ambiguous ordering', () => {
    const store = createSelectedEventInspectionStore();
    assert.equal(store.select(0).code, 'inspection-unavailable');
    store.load(recording());
    assert.equal(store.select(9).code, 'inspection-cursor-not-retained');
    assert.equal(store.select(15).code, 'inspection-cursor-not-retained');
    assert.equal(store.select(-1).code, 'invalid-inspection-cursor');
    const bad = recording();
    bad.events[1].seq = 10;
    assert.throws(() => store.load(bad), /strictly increasing/);
});

test('clear drops payload and cursor without retaining caller-owned objects', () => {
    const store = createSelectedEventInspectionStore();
    store.load(recording());
    store.select(12);
    assert.deepEqual(store.clear(), {loaded: false, selectedCursor: null,
        firstCursor: null, lastCursor: null});
});
