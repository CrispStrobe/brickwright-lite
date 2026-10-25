import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');
const waveform = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-timing-waveform.jsx');
const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');

test('waveform uses the canonical timeline sequence as its only selected cursor', () => {
    assert.match(panel, /selectedSeq=\{timeline\?\.selectedSeq\}/);
    assert.match(panel, /debugTimeline\(\)\.selectEvent\(seq\)/);
    assert.match(panel, /debugTimingWaveform\(\)\.selectEvent\(seq\)/);
    assert.match(waveform, /data-selected-event-seq=\{String\(selectedSeq \?\? ''\)\}/);
    assert.doesNotMatch(waveform, /this\.state|useState|runner\.|target\.(?:state|inspect|readMem)/,
        'the view must not grow a second mutable cursor or inspect the live target');
});

test('canonical drained events feed a bounded runner-owned waveform view', () => {
    assert.match(runner, /createTimingWaveform\(\{capacity: 4096, maxLanes: 64\}\)/);
    assert.match(runner, /debugFoundation\.ingestTimeline\(batch\);[\s\S]{0,160}debugTimingWaveform\.append/);
    assert.match(runner, /debugTimingWaveform: \(\) => debugTimingWaveform/);
    assert.doesNotMatch(panel, /debugTimeline\(\)\.range\(\)/,
        'render must consume the bounded waveform view, not clone the timeline');
});

test('timing dock exposes lanes, fidelity, navigation, range and exports to browser tests', () => {
    for (const hook of [
        'data-debug-timing-waveform', 'data-debug-waveform-fidelity',
        'data-debug-waveform-lane', 'data-debug-waveform-sample',
        'data-debug-waveform-sample-fidelity',
        'data-debug-waveform-zoom-in', 'data-debug-waveform-zoom-out',
        'data-debug-waveform-pan-older', 'data-debug-waveform-pan-newer',
        'data-debug-waveform-trigger-lane', 'data-debug-waveform-trigger-previous',
        'data-debug-waveform-trigger-next', 'data-debug-waveform-export-json',
        'data-debug-waveform-export-vcd', 'data-debug-waveform-refusal'
    ]) assert.ok(waveform.includes(hook), `missing browser hook ${hook}`);
    assert.match(waveform, /lane\.group \|\| lane\.kind \|\| 'signal'/);
    assert.match(waveform, /sample\.provenance/,
        'recorded and reconstructed samples must retain visible provenance');
    assert.match(panel, /waveform\.exportVCD\(\)/);
    assert.match(panel, /waveform\.exportJSON\(\)/);
});
