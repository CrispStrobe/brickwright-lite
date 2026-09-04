import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDebugFoundation} from '../overlay/scratch-gui/src/lib/bw-debug/debug-foundation.js';

test('foundation composes explicit capabilities with event predicates', () => {
    const foundation = createDebugFoundation();
    foundation.attachCapabilities({events: ['instruction'], steps: ['insn']}, {target: 'test'});
    assert.equal(foundation.capabilities().fidelity.cycle, 'unsupported');
    assert.equal(foundation.addBreakpoint({id: 'pc', kind: 'execute', address: 4}).ok, true);
    assert.deepEqual(foundation.evaluateBreakpoints({kind: 'instruction', pcBefore: 4}).matchingIds, ['pc']);
    assert.equal(foundation.addBreakpoint({id: 'bus', kind: 'event', eventKind: 'bus'}).refusal.code,
        'unsupported-event-kind');
});

test('attaching another target drops predicates compiled for the old address space', () => {
    const foundation = createDebugFoundation();
    foundation.attachCapabilities({events: ['instruction']});
    foundation.addBreakpoint({id: 'old', kind: 'execute', address: 1});
    foundation.attachCapabilities({events: ['instruction']});
    assert.deepEqual(foundation.evaluateBreakpoints({kind: 'instruction', pcBefore: 1}).matchingIds, []);
});
