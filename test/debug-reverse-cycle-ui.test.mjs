import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reverseCycleControlStatus} from
    '../overlay/scratch-gui/src/lib/bw-debug/reverse-cycle-ui.js';

const panel = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
const policy = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/reverse-cycle-ui.js', import.meta.url), 'utf8');
const ready = {schema: 1, fidelity: 'recorded', resumable: true, checkpoint: true};

test('reverse-cycle dock gating requires complete recorded resumable cycle execution', () => {
    assert.equal(reverseCycleControlStatus({provider: ready, capabilities: {steps: ['cycle']},
        runnerStatus: {accepted: true}}).accepted, true);
    for (const provider of [null, {...ready, fidelity: 'predicted'},
        {...ready, fidelity: 'reconstructed'}, {...ready, resumable: false}, {...ready, checkpoint: false}]) {
        assert.equal(reverseCycleControlStatus({provider, capabilities: {steps: ['cycle']},
            runnerStatus: {accepted: true}}).accepted, false);
    }
    assert.equal(reverseCycleControlStatus({provider: ready, capabilities: {steps: ['insn']},
        runnerStatus: {accepted: true}}).accepted, false);
    assert.equal(reverseCycleControlStatus({provider: ready, capabilities: {steps: ['cycle']},
        runnerStatus: {accepted: false, reason: 'recording empty'}}).reason, 'recording empty');
});

test('dock delegates reverse-cycle execution and readiness to composed runner methods', () => {
    assert.match(panel, /runner\.reverseStepDebugCycleStatus\(\)/);
    assert.match(panel, /runner\.reverseStepDebugCycle\(\)/);
    assert.match(panel, /data-debug-reverse-cycle/);
    assert.match(panel, /disabled=\{!canReverseCycle \|\| busy\}/);
    assert.match(panel, /provider: ui\.cycleProvider/);
    assert.doesNotMatch(policy, /provider\.engine|floooh|emu8051/,
        'the dock must gate contracts, not special-case cycle engines');
});
