import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {createReverseContinueCoordinator} from
    '../overlay/scratch-gui/src/lib/bw-debug/reverse-continue.js';

const hit = {boundaryCursor: 12, occurrenceCursor: 4,
    matchingIds: ['address:16'], generation: 2};

test('unsupported targets fail closed before history lookup or replay', () => {
    const calls = [];
    const coordinator = createReverseContinueCoordinator({
        canReverse: () => ({accepted: false, code: 'unsupported-restore',
            reason: 'target has no complete checkpoint'}),
        haltOccurrences: {
            previousBeforeBoundary: () => { calls.push('boundary lookup'); return hit; },
            previousByOccurrenceCursor: () => { calls.push('occurrence lookup'); return hit; }
        },
        reverseToEvent: () => { calls.push('replay'); return {accepted: true}; }
    });

    const refusal = {accepted: false, code: 'unsupported-restore',
        reason: 'target has no complete checkpoint'};
    assert.deepEqual(coordinator.status(30), refusal);
    assert.deepEqual(coordinator.reverse(30), refusal);
    assert.deepEqual(calls, [], 'a capability refusal must not touch plausible-looking history');
});

test('reset returns a chained reverse continue to boundary lookup at live end', () => {
    const lookups = [];
    const coordinator = createReverseContinueCoordinator({
        canReverse: () => ({accepted: true}),
        haltOccurrences: {
            previousBeforeBoundary: before => { lookups.push(['boundary', before]); return hit; },
            previousByOccurrenceCursor: before => { lookups.push(['occurrence', before]); return null; }
        },
        reverseToEvent: () => ({accepted: true, verified: true})
    });

    assert.equal(coordinator.reverse(30).accepted, true);
    assert.equal(coordinator.status(12).code, 'no-previous-breakpoint');
    coordinator.reset();
    assert.equal(coordinator.status(40).accepted, true);
    assert.deepEqual(lookups, [['boundary', 30], ['occurrence', 4], ['boundary', 40]]);
});

test('failed replay does not advance the occurrence chain', () => {
    const lookups = [];
    let accepted = false;
    const coordinator = createReverseContinueCoordinator({
        canReverse: () => ({accepted: true}),
        haltOccurrences: {
            previousBeforeBoundary: before => { lookups.push(['boundary', before]); return hit; },
            previousByOccurrenceCursor: before => { lookups.push(['occurrence', before]); return null; }
        },
        reverseToEvent: () => accepted ? {accepted: true} :
            {accepted: false, code: 'replay-diverged'}
    });

    assert.equal(coordinator.reverse(30).code, 'replay-diverged');
    accepted = true;
    assert.equal(coordinator.reverse(30).accepted, true);
    assert.equal(coordinator.status(12).code, 'no-previous-breakpoint');
    assert.deepEqual(lookups, [['boundary', 30], ['boundary', 30], ['occurrence', 4]]);
});

test('runner resets reverse chaining for every new forward lifecycle', () => {
    const source = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    const body = (start, end) => {
        const from = source.indexOf(start);
        const to = source.indexOf(end, from + start.length);
        assert.ok(from >= 0 && to > from, `${start} must have a stable test boundary`);
        return source.slice(from, to);
    };

    for (const [name, section] of [
        ['new run', body('async start()', '\n        pause()')],
        ['resume', body('resume()', '/** One block')],
        ['forward block step', body("step(kind = 'block')", '\n        stop()')],
        ['new recording', body('startDebugRecording()', 'stopDebugRecording')],
        ['forward instruction step', body('stepInstruction(count = 1)', '/** `over`')],
        ['step over', body('stepOver()', 'stepOut()')],
        ['step out', body('stepOut()', '/**\n         * The user')]
    ]) {
        assert.match(section, /reverseCursor = null;[\s\S]*reverseContinue\.reset\(\)/, name);
    }
});
