import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDebugRecorder} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';

const runner = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');

test('recorder indexes strict recorded-cycle cursors without treating reconstruction as execution', () => {
    const recorder = createDebugRecorder();
    recorder.createCheckpoint({schema: 1, eventCursor: 0, inputCursor: 0,
        time: {ticks: 0, domain: 'cpu'}, snapshot: {}});
    const append = (seq, phase, fidelity) => recorder.appendEvent({schema: 1, seq,
        time: {ticks: seq, domain: 'cpu'}, cpuId: 'cpu0', kind: 'signal', phase, fidelity});
    append(0, 'tick', 'recorded');
    append(1, 'tick', 'reconstructed');
    append(2, 'edge', 'recorded');
    append(3, 'tick', 'recorded');
    assert.equal(recorder.previousCycleBoundaryCursor(4), 1,
        'strict reverse from cursor 4 skips the cycle ending at cursor 4');
    assert.equal(recorder.previousCycleBoundaryCursor(1), 0,
        'the complete checkpoint remains a valid earlier cycle replay anchor');
});

test('runner cycle reverse shares recording, cursor, output and reverse-continue lifecycles', () => {
    assert.match(runner, /createCycleReplayController\(\{/);
    assert.match(runner, /restoreCheckpoint: checkpoint => branchSession\.restore\(checkpoint\.eventCursor\)/);
    assert.match(runner, /captureSourceState:[\s\S]{0,180}captureHostState\(\)/);
    assert.match(runner, /restoreSourceState:[\s\S]{0,220}commitHostRestore/);
    assert.match(runner, /reverseDebugToCycle:[\s\S]{0,900}replayOutputGate\.resynchronize\(snapshot\(\)\)/);
    assert.match(runner, /reverseStepDebugCycleStatus\(\)[\s\S]{0,700}previousCycleBoundaryCursor\(before\)/);
    assert.match(runner, /reverseStepDebugCycle\(\)[\s\S]{0,300}reverseDebugToCycle/);
    assert.match(runner, /reverseToEvent: eventCursor => cycleReplay\.canReverse\(\)\.accepted \?\s*runner\.reverseDebugToCycle/,
        'reverse continue must use verified cycle replay when its provider qualifies');
    assert.match(runner, /destination\.recording\.cycleReplay\.reverseToCycle\(cursor\.eventCursor\)/,
        'branch activation must preserve the cycle-qualified replay boundary');
});
