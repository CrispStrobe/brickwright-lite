import assert from 'node:assert/strict';
import test from 'node:test';

import {createCorrelatedDebugger} from
    '../overlay/scratch-gui/src/lib/bw-debug/correlated-debug.js';

const fixture = ({failCommit = null, failRollback = null} = {}) => {
    const shared = {mailbox: null};
    const state = {cpu: {pc: 0, irq: false}, mcu: {pc: 0, messages: 0}};
    const initial = structuredClone({state, shared});
    const target = (id, clockDomain) => ({clockDomain,
        captureCheckpoint: () => ({local: structuredClone(state[id]), shared: structuredClone(shared)}),
        prepareRestore: snapshot => structuredClone(snapshot),
        restoreCheckpoint: snapshot => {
            const isRollback = snapshot.local.pc === initial.state[id].pc;
            if (id === failCommit && !isRollback) return {accepted: false, reason: `${id} commit failed`};
            if (id === failRollback && isRollback) return {accepted: false, reason: `${id} rollback failed`};
            state[id] = structuredClone(snapshot.local);
            Object.assign(shared, structuredClone(snapshot.shared));
            return {accepted: true};
        }});
    const model = createCorrelatedDebugger({targets: {
        cpu: target('cpu', 'z80-tstates'), mcu: target('mcu', 'mcu-oscillators')
    }});
    return {model, state, shared, initial};
};

test('two live clocks correlate a mailbox message and interrupt only through an explicit causal edge', () => {
    const f = fixture();
    f.state.cpu.pc = 4;
    f.shared.mailbox = 0x41;
    const message = f.model.append('main', {targetId: 'cpu', kind: 'mailbox-write',
        time: {domain: 'z80-tstates', ticks: 400}}).event;
    f.state.mcu.messages++;
    f.state.mcu.irq = true;
    const interrupt = f.model.append('main', {targetId: 'mcu', kind: 'interrupt-edge',
        cause: message.cursor, time: {domain: 'mcu-oscillators', ticks: 7}}).event;

    assert.equal(f.model.compareTimes(message.time, interrupt.time).code, 'uncorrelated-clock-domains');
    assert.deepEqual(f.model.compareCursors(message.cursor, interrupt.cursor), {accepted: true, order: -1});
    assert.deepEqual(interrupt.cause, message.cursor);
    assert.equal(f.model.compareTimes({ticks: 1}, {ticks: 2}).code, 'invalid-clock-time');
});

test('whole-machine checkpoint restores both CPUs and shared mailbox atomically', async () => {
    const f = fixture();
    f.state.cpu.pc = 10; f.state.mcu.pc = 20; f.shared.mailbox = 3;
    const saved = await f.model.captureCheckpoint();
    f.state.cpu.pc = 99; f.state.mcu.pc = 88; f.shared.mailbox = 0xff;
    const result = await f.model.restoreCheckpoint(saved.checkpoint);
    assert.equal(result.accepted, true, result.reason);
    assert.deepEqual(f.state, {cpu: {pc: 10, irq: false}, mcu: {pc: 20, messages: 0}});
    assert.equal(f.shared.mailbox, 3);
});

test('one CPU commit failure rolls both CPUs and shared state back to the live source', async () => {
    const f = fixture({failCommit: 'mcu'});
    const destination = {schema: 1, cursor: {branchId: 'main', eventCursor: 0}, states: {
        cpu: {local: {pc: 10, irq: false}, shared: {mailbox: 1}},
        mcu: {local: {pc: 20, messages: 2}, shared: {mailbox: 1}}
    }};
    const result = await f.model.restoreCheckpoint(destination);
    assert.equal(result.code, 'whole-machine-restore-failed');
    assert.deepEqual({state: f.state, shared: f.shared}, f.initial,
        'a partial CPU commit must not survive failure of its peer');
});

test('a participant rollback refusal is reported instead of claiming atomic recovery', async () => {
    const f = fixture({failCommit: 'mcu', failRollback: 'cpu'});
    const result = await f.model.restoreCheckpoint({schema: 1,
        cursor: {branchId: 'main', eventCursor: 0}, states: {
            cpu: {local: {pc: 10, irq: false}, shared: {mailbox: 1}},
            mcu: {local: {pc: 20, messages: 2}, shared: {mailbox: 1}}
        }});
    assert.equal(result.code, 'whole-machine-rollback-failed');
    assert.match(result.reason, /cpu refused rollback/);
});

test('restore refuses before preparation when one CPU cannot capture rollback state', async () => {
    let prepared = 0;
    const target = (clockDomain, captureCheckpoint) => ({clockDomain, captureCheckpoint,
        prepareRestore: value => { prepared++; return value; }, restoreCheckpoint: () => true});
    const model = createCorrelatedDebugger({targets: {
        cpu: target('cpu-clock', () => ({pc: 1})),
        mcu: target('mcu-clock', () => ({accepted: false, reason: 'opaque peripheral'}))
    }});
    const result = await model.restoreCheckpoint({schema: 1,
        cursor: {branchId: 'main', eventCursor: 0}, states: {cpu: {pc: 2}, mcu: {pc: 3}}});
    assert.equal(result.code, 'whole-machine-rollback-capture-failed');
    assert.equal(prepared, 0, 'no participant stages a restore without rollback state for every CPU');
});
