import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceDebugPhase} from '../overlay/scratch-gui/src/lib/bw-debug/debug-phase-transition.js';

const source = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx', import.meta.url), 'utf8');
const handlerStart = source.indexOf('    handleRunnerChange (runner, ui) {');
const handlerEnd = source.indexOf('\n    /** Resolve a Scratch block id', handlerStart);
const handler = handlerStart >= 0 && handlerEnd > handlerStart ?
    source.slice(handlerStart, handlerEnd) : '';

test('a published runner snapshot is not rebuilt in the circuit bridge', () => {
    assert.ok(handler.length > 1000, 'handleRunnerChange capture is empty or truncated');
    const code = handler.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /runner\.state\s*\(/,
        'each UI publish would pay for a second full snapshot');
    assert.match(handler, /ui\.session \? ui\.session\.tasks/,
        'live tasks must come from the snapshot already delivered to the handler');
});

test('serial stamping follows the runner snapshot contract', () => {
    assert.match(handler, /const so = ui && ui\.serialOutput;/,
        'serialOutput is top-level runner state, not nested session state');
    assert.match(handler, /serialStamp !== \(prev\._serialStamp \?\? ''\)/,
        'serial changes must remain an immediate content reason to update');
});

test('only distinct debugger phases wake global lesson observers', () => {
    assert.match(handler, /advanceDebugPhase\(this\._lastDebugPhase, phase, runnerChanged\)/);
    assert.match(handler,
        /this\._lastDebugPhase = phaseTransition\.next;\s*this\._lastDebugRunner = phase \? runner : null;\s*if[^]*phaseTransition\.dispatch/,
        'transition state must be stored before dispatch so re-entrant updates cannot duplicate it');
});

test('phase notification state resets across runner teardown and restart', () => {
    let transition = advanceDebugPhase(null, 'running');
    assert.deepEqual(transition, {next: 'running', dispatch: true});

    transition = advanceDebugPhase(transition.next, 'running');
    assert.deepEqual(transition, {next: 'running', dispatch: false});

    transition = advanceDebugPhase(transition.next, null);
    assert.deepEqual(transition, {next: null, dispatch: false});

    transition = advanceDebugPhase(transition.next, 'running');
    assert.deepEqual(transition, {next: 'running', dispatch: true},
        'a replacement runner entering the same phase must announce its transition');

    transition = advanceDebugPhase('running', 'running', true);
    assert.deepEqual(transition, {next: 'running', dispatch: true},
        'runner replacement must be observable even if no phase-less snapshot was delivered');
});
