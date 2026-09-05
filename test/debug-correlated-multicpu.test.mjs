import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorrelatedDebugger} from '../overlay/scratch-gui/src/lib/bw-debug/correlated-debug.js';

const fixture = () => {
    const state = {main: 1, io: 2}; const restored = [];
    const target = (id, clockDomain) => ({clockDomain,
        captureCheckpoint: () => ({value: state[id]}),
        prepareRestore: value => structuredClone(value),
        restoreCheckpoint: value => { state[id] = value.value; restored.push(id); return true; }});
    return {state, restored, model: createCorrelatedDebugger({targets: {
        main: target('main', 'z80-tstates'), io: target('io', 'mcu-clocks')}})};
};

test('named clock domains use explicit causal order rather than numeric cross-clock comparison', () => {
    const f = fixture();
    const sent = f.model.append('main', {targetId: 'main', kind: 'message',
        time: {domain: 'z80-tstates', ticks: 100}}).event;
    const irq = f.model.append('main', {targetId: 'io', kind: 'interrupt', cause: sent.cursor,
        time: {domain: 'mcu-clocks', ticks: 3}}).event;
    assert.equal(f.model.compareTimes(sent.time, irq.time).code, 'uncorrelated-clock-domains');
    assert.deepEqual(f.model.compareCursors(sent.cursor, irq.cursor), {accepted: true, order: -1});
    assert.deepEqual(irq.cause, sent.cursor);
});

test('cross-core triggers carry the source causal cursor', () => {
    const f = fixture();
    assert.equal(f.model.addTrigger({id: 'doorbell', sourceTarget: 'main', targetId: 'io',
        kind: 'message'}).accepted, true);
    const result = f.model.append('main', {targetId: 'main', kind: 'message',
        time: {domain: 'z80-tstates', ticks: 1}});
    assert.deepEqual(result.triggers, [{triggerId: 'doorbell', source: result.event.cursor,
        targetId: 'io', causeKind: 'message'}]);
});

test('branch-qualified cursors preserve total order across forks', () => {
    const f = fixture();
    const root = f.model.append('main', {targetId: 'main', kind: 'instruction',
        time: {domain: 'z80-tstates', ticks: 1}}).event;
    assert.equal(f.model.fork({branchId: 'fork', parentCursor: root.cursor}).accepted, true);
    const child = f.model.append('fork', {targetId: 'io', kind: 'interrupt', cause: root.cursor,
        time: {domain: 'mcu-clocks', ticks: 0}}).event;
    assert.equal(child.cursor.branchId, 'fork');
    assert.deepEqual(f.model.compareCursors(root.cursor, child.cursor), {accepted: true, order: -1});
});

test('whole-machine checkpoints stage all targets and roll back all on commit failure', async () => {
    const f = fixture();
    const captured = await f.model.captureCheckpoint();
    f.state.main = 10; f.state.io = 20;
    assert.equal((await f.model.restoreCheckpoint(captured.checkpoint)).accepted, true);
    assert.deepEqual(f.state, {main: 1, io: 2});

    const live = {a: 7, b: 8};
    const model = createCorrelatedDebugger({targets: {
        a: {clockDomain: 'a', captureCheckpoint: () => ({value: live.a}), prepareRestore: x => x,
            restoreCheckpoint: x => { live.a = x.value; return true; }},
        b: {clockDomain: 'b', captureCheckpoint: () => ({value: live.b}), prepareRestore: x => x,
            restoreCheckpoint: x => x.value === 2 ? {accepted: false} : (live.b = x.value, true)}
    }});
    const result = await model.restoreCheckpoint({schema: 1, cursor: {branchId: 'main', eventCursor: 0},
        states: {a: {value: 1}, b: {value: 2}}});
    assert.equal(result.code, 'whole-machine-restore-failed');
    assert.deepEqual(live, {a: 7, b: 8});
});

test('retention rejects dangling causal links instead of guessing from timestamps', () => {
    const f = fixture();
    assert.throws(() => f.model.append('main', {targetId: 'io', kind: 'interrupt',
        cause: {branchId: 'main', eventCursor: 99}, time: {domain: 'mcu-clocks', ticks: 1}}),
    /retained earlier event/);
});
