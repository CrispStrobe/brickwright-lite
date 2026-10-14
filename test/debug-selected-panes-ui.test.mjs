import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');
const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');

test('one selected event cursor drives all three recorded-evidence panes', () => {
    assert.match(runner, /selectedEventInspection\(\)[\s\S]*selectedEvent\.seq \+ 1/);
    assert.match(runner, /selectedInspectionStore\.load\(\{[\s\S]*events:[\s\S]*checkpoints/);
    assert.match(panel, /runner\.selectedEventInspection\(\)/);
    for (const marker of [
        'data-debug-selected-inspection',
        'data-debug-selected-registers',
        'data-debug-selected-disassembly',
        'data-debug-selected-memory'
    ]) assert.ok(panel.includes(marker), `missing synchronized pane marker ${marker}`);
});

test('historical panes label recorded provenance and do not query live target state', () => {
    assert.match(panel, /data-inspection-provenance="recorded-event"/);
    const start = panel.indexOf('{selectedInspection?.accepted ?');
    const end = panel.indexOf('{hasActionStatus ?', start);
    const panes = panel.slice(start, end);
    assert.doesNotMatch(panes, /runner\.(inspect|listing|readMem)\(/);
    assert.match(panes, /registers\.full\.refusal/);
    assert.match(panes, /No recorded instruction evidence/);
    assert.match(panes, /No recorded memory writes/);
});
