import test from 'node:test';
import assert from 'node:assert/strict';

import {createDebugTimeline} from
    '../overlay/scratch-gui/src/lib/bw-debug/timeline.js';

const event = (seq, ticks = seq, kind = 'instruction') => ({
    schema: 1, seq, kind, time: {domain: 'cpu', ticks}
});

test('one selected event drives navigation and time seeking', () => {
    const timeline = createDebugTimeline();
    timeline.append([event(3, 10), event(4, 20), event(5, 30)]);
    assert.equal(timeline.state().selectedSeq, 3);
    assert.equal(timeline.latest().event.seq, 5);
    assert.equal(timeline.older().event.seq, 4);
    assert.equal(timeline.seekTime({domain: 'cpu', ticks: 19}).event.seq, 3);
    assert.equal(timeline.newer().event.seq, 4);
    assert.equal(timeline.seekCursor(5).event.seq, 4,
        'a checkpoint cursor selects the event immediately before its boundary');
    assert.equal(timeline.seekCursor(3).code, 'cursor-not-retained');
    assert.equal(timeline.seekCursor(6).event.seq, 5,
        'a checkpoint immediately after the latest event selects that latest event');
});

test('bounded retention moves an evicted selection and preserves gap evidence', () => {
    const timeline = createDebugTimeline({capacity: 3});
    timeline.append([event(1), event(2), event(3)]);
    timeline.selectEvent(1);
    timeline.append([{schema: 1, kind: 'gap', dropped: 7, beforeSeq: 4}, event(4)]);
    const state = timeline.state();
    assert.equal(state.evicted, 1);
    assert.equal(state.selectedSeq, 2);
    assert.deepEqual(state.gaps.map(item => item.beforeSeq), [4]);
    assert.equal(timeline.selectEvent(1).code, 'event-not-retained');
});

test('rejects ambiguous ordering and returns defensive views', () => {
    const timeline = createDebugTimeline();
    const source = event(1);
    timeline.append([source]);
    source.kind = 'mutated';
    const view = timeline.state();
    view.selectedEvent.kind = 'also-mutated';
    assert.equal(timeline.state().selectedEvent.kind, 'instruction');
    assert.throws(() => timeline.append([event(1)]), /does not follow/);
    assert.equal(timeline.seekTime({domain: 'wall', ticks: 1}).code, 'time-not-retained');
});

test('selected retire resolves its strict after-event boundary without snapshots', () => {
    const timeline = createDebugTimeline();
    assert.deepEqual(timeline.selectedBoundaryCursor(), {accepted: false, code: 'no-selected-event'});
    timeline.append([
        {...event(4), phase: 'retire', snapshot: {cpu: new Uint8Array([1])}},
        {...event(5), phase: 'execute'},
        event(6, 6, 'memory')
    ]);
    assert.deepEqual(timeline.selectedBoundaryCursor(), {
        accepted: true, boundaryCursor: 5, selectedSeq: 4
    });
    timeline.selectEvent(5);
    assert.deepEqual(timeline.selectedBoundaryCursor(), {
        accepted: false, code: 'selected-event-not-retire',
        selectedSeq: 5, kind: 'instruction', phase: 'execute'
    });
    timeline.selectEvent(6);
    assert.deepEqual(timeline.selectedBoundaryCursor(), {
        accepted: false, code: 'selected-event-not-retire',
        selectedSeq: 6, kind: 'memory', phase: null
    });
});

test('selected boundary preserves ordinal precision and refuses unsafe numeric addition', () => {
    const bigintTimeline = createDebugTimeline();
    bigintTimeline.append([{...event(1n), phase: 'retire'}]);
    assert.deepEqual(bigintTimeline.selectedBoundaryCursor(), {
        accepted: true, boundaryCursor: 2n, selectedSeq: 1n
    });

    const overflowTimeline = createDebugTimeline();
    overflowTimeline.append([{...event(Number.MAX_SAFE_INTEGER), phase: 'retire'}]);
    assert.deepEqual(overflowTimeline.selectedBoundaryCursor(), {
        accepted: false, code: 'invalid-boundary-cursor', selectedSeq: Number.MAX_SAFE_INTEGER
    });
});
