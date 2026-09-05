import test from 'node:test';
import assert from 'node:assert/strict';

import {createInstructionReplayController} from
    '../overlay/scratch-gui/src/lib/bw-debug/instruction-replay.js';

const facts = [
    {schema: 1, seq: 0, time: {ticks: 1, domain: 'cpu'}, cpuId: 'cpu0',
        kind: 'memory', phase: 'access', fidelity: 'recorded',
        memory: {space: 'mem', address: 2, value: 3, direction: 'write'}},
    {schema: 1, seq: 1, time: {ticks: 2, domain: 'cpu'}, cpuId: 'cpu0',
        kind: 'instruction', phase: 'retire', fidelity: 'recorded', pcBefore: 1, pcAfter: 2}
];

test('host reconstruction follows verified event order and reports its failing cursor', () => {
    let listener = null;
    let restores = 0;
    let hostProgress = 0;
    const target = {
        capabilities: () => ({recording: ['restore']}),
        restoreCheckpoint: () => { restores++; hostProgress = 0; return true; },
        replayInstruction: () => {
            for (const event of facts) listener({...event, seq: event.seq + 20});
            return {accepted: true};
        },
        applyReplayInput: () => true,
        debugTime: () => ({ticks: 0, domain: 'cpu'})
    };
    const recorder = {
        findCheckpoint: () => ({id: 4, eventCursor: 0, inputCursor: 0,
            time: {ticks: 0, domain: 'cpu'}, snapshot: {}}),
        eventsFrom: () => structuredClone(facts),
        inputsFrom: () => []
    };
    const seen = [];
    const controller = createInstructionReplayController({
        recorder,
        getTarget: () => target,
        subscribeEvents: callback => { listener = callback; return () => { listener = null; }; },
        normalizeEvent: event => {
            const {seq, ...value} = event;
            return value;
        },
        replayHostEvent: (event, context) => {
            seen.push([event.kind, context.eventCursor]);
            hostProgress++;
            if (event.kind === 'instruction') throw new Error('host predicate failed');
        }
    });

    const result = controller.reverseToEvent(2);
    assert.deepEqual(seen, [['memory', 0], ['instruction', 1]]);
    assert.deepEqual(result, {accepted: false, code: 'reverse-host-replay-failed',
        reason: 'host predicate failed', eventCursor: 1});
    assert.equal(restores, 2, 'failure restores the source checkpoint after initial replay restore');
    assert.equal(hostProgress, 0, 'partially reconstructed host state is rolled back atomically');
});

const replayFixture = ({step, restore, teardown = () => {}, normalizeEvent, inputs = [],
    replayToInputBoundary, initialTime = 0} = {}) => {
    let listener;
    let restores = 0;
    let now = initialTime;
    const expected = [{...facts[1], seq: 0, inputCursor: inputs.length}];
    const target = {
        capabilities: () => ({recording: ['restore']}),
        restoreCheckpoint: () => {
            restores++;
            return restore ? restore(restores) : true;
        },
        replayInstruction: () => {
            if (step) return step(listener, expected[0]);
            listener(structuredClone(expected[0]));
            return {accepted: true};
        },
        applyReplayInput: input => input.applyResult ?? true,
        debugTime: () => ({ticks: now, domain: 'cpu'}),
        ...(replayToInputBoundary ? {replayToInputBoundary: boundary => {
            const result = replayToInputBoundary(boundary);
            if (result?.time) now = result.time.ticks;
            return result;
        }} : {})
    };
    const controller = createInstructionReplayController({
        recorder: {
            findCheckpoint: () => ({id: 1, eventCursor: 0, inputCursor: 0,
                time: {ticks: 0, domain: 'cpu'}, snapshot: {}}),
            eventsFrom: () => structuredClone(expected),
            inputsFrom: () => inputs.map(input => ({...input, time: {...input.time}, payload: {...input.payload}}))
        },
        getTarget: () => target,
        subscribeEvents: callback => { listener = callback; return teardown; },
        normalizeEvent: normalizeEvent || (event => {
            const {seq, inputCursor, ...value} = event;
            return value;
        })
    });
    return {controller, restores: () => restores};
};

test('every replay/compare failure after restore rolls back the source checkpoint', () => {
    const cases = [
        {code: 'reverse-step-failed', step: () => ({refused: 'no step'})},
        {code: 'reverse-step-failed', step: () => Promise.resolve({accepted: true})},
        {code: 'REPLAY_DIVERGED', step: listener => {
            listener({...facts[1], seq: 0, pcAfter: 99});
            return {accepted: true};
        }},
        {code: 'reverse-compare-failed', normalizeEvent: () => { throw new Error('bad normalizer'); }},
        {code: 'reverse-unsubscribe-failed', teardown: () => false}
    ];
    for (const fixtureOptions of cases) {
        const fixture = replayFixture(fixtureOptions);
        const result = fixture.controller.reverseToEvent(1);
        assert.equal(result.code, fixtureOptions.code);
        assert.equal(fixture.restores(), 2, `${fixtureOptions.code} must restore source after failure`);
    }
});

test('input refusal and async input both roll back without stepping', () => {
    for (const applyResult of [{refused: 'bad input'}, Promise.resolve(true), false]) {
        let stepped = false;
        const fixture = replayFixture({
            inputs: [{schema: 1, cursor: 0, time: {ticks: 0, domain: 'cpu'},
                producer: 'test', payload: {}, applyResult}],
            step: () => { stepped = true; return {accepted: true}; }
        });
        const result = fixture.controller.reverseToEvent(1);
        assert.equal(result.code, 'reverse-input-refused');
        assert.equal(fixture.restores(), 2);
        assert.equal(stepped, false);
    }
});

test('future inputs require an exact target boundary and never apply late after an instruction', () => {
    const inputs = [{schema: 1, cursor: 0, time: {ticks: 1, domain: 'cpu'},
        producer: 'irq', payload: {}}];
    let stepped = false;
    let applied = false;
    let fixture = replayFixture({inputs, step: () => { stepped = true; return {accepted: true}; }});
    assert.equal(fixture.controller.reverseToEvent(1).code, 'reverse-input-boundary-unsupported');
    assert.equal(stepped, false);
    assert.equal(fixture.restores(), 2);

    fixture = replayFixture({inputs,
        replayToInputBoundary: boundary => ({accepted: true, time: structuredClone(boundary)}),
        step: (listener, expected) => { applied = true; listener(structuredClone(expected));
            return {accepted: true}; }});
    const result = fixture.controller.reverseToEvent(1);
    assert.equal(result.accepted, true);
    assert.equal(applied, true);
});

test('an inexact target input boundary rolls back before applying or stepping', () => {
    const inputs = [{schema: 1, cursor: 0, time: {ticks: 1, domain: 'cpu'},
        producer: 'irq', payload: {}}];
    let stepped = false;
    const fixture = replayFixture({inputs,
        replayToInputBoundary: () => ({accepted: true, time: {ticks: 2, domain: 'cpu'}}),
        step: () => { stepped = true; return {accepted: true}; }});
    assert.equal(fixture.controller.reverseToEvent(1).code, 'reverse-input-boundary-inexact');
    assert.equal(stepped, false);
    assert.equal(fixture.restores(), 2);
});

test('late target time and contradictory recorded input ordering fail before mutation', () => {
    const base = {schema: 1, cursor: 0, time: {ticks: 1, domain: 'cpu'},
        producer: 'irq', payload: {}};
    let fixture = replayFixture({inputs: [base], initialTime: 2});
    assert.equal(fixture.controller.reverseToEvent(1).code, 'reverse-input-boundary-passed');
    fixture = replayFixture({inputs: [{...base, time: {ticks: 3, domain: 'cpu'}}]});
    assert.equal(fixture.controller.reverseToEvent(1).code, 'reverse-input-time-order-invalid');
    assert.equal(fixture.restores(), 2);
});

test('rollback refusal has a distinct code and preserves the original failure code', () => {
    const fixture = replayFixture({
        step: () => ({accepted: false, reason: 'cannot step'}),
        restore: count => count === 1 ? true : {refused: 'cannot roll back'}
    });
    const result = fixture.controller.reverseToEvent(1);
    assert.equal(result.code, 'reverse-source-rollback-failed');
    assert.equal(result.failureCode, 'reverse-step-failed');
    assert.match(result.reason, /cannot roll back/);
});

test('async or invalid subscription setup rolls back after source restore', () => {
    for (const subscription of [() => Promise.resolve(() => {}), () => null]) {
        let restores = 0;
        const controller = createInstructionReplayController({
            recorder: {
                findCheckpoint: () => ({id: 1, eventCursor: 0, inputCursor: 0,
                    time: {ticks: 0, domain: 'cpu'}, snapshot: {}}),
                eventsFrom: () => [], inputsFrom: () => []
            },
            getTarget: () => ({
                capabilities: () => ({recording: ['restore']}),
                restoreCheckpoint: () => { restores++; return true; },
                replayInstruction: () => ({accepted: true}), applyReplayInput: () => true
            }),
            subscribeEvents: subscription
        });
        const result = controller.reverseToEvent(0);
        assert.equal(result.code, 'reverse-subscribe-failed');
        assert.equal(restores, 2);
    }
});
