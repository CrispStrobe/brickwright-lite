import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panel = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');

test('selected-event execution is runner-gated and keeps inspection separate', () => {
    assert.match(panel,
        /const selectedSeek = this\.state\.runner \?[\s\S]{0,40}this\.state\.runner\.seekSelectedDebugStatus\(\) : null/);
    assert.match(panel, /const canSeekSelected = !!\(selectedSeek && selectedSeek\.accepted\)/);
    assert.match(panel, /onTimelineGoSelected \(\)[\s\S]{0,220}runner\.seekSelectedDebugEvent\(\)/);
    assert.doesNotMatch(panel,
        /onTimeline(?:Older|Newer|Latest|Checkpoint) \(\)[\s\S]{0,180}seekSelectedDebugEvent/,
        'moving the inspection cursor must not execute the target');
});

test('Go to selected control is gated and exposes the exact structured refusal', () => {
    const start = panel.indexOf('const selectedSeek =');
    const end = panel.indexOf('{hasActionStatus ?', start);
    assert.ok(start >= 0 && end > start);
    const section = panel.slice(start, end);
    assert.ok(section.includes('data-debug-timeline-go-selected'));
    assert.match(section, /style=\{canSeekSelected \? BTN : OFF\}/);
    assert.match(section, /disabled=\{!canSeekSelected\}/);
    assert.match(section, /timelineRefusalResult\.reason \|\| timelineRefusalResult\.code/);
    assert.match(section, /data-debug-timeline-refusal/);
    assert.match(section, /role="status"/);
    assert.doesNotMatch(section,
        /eventsFrom\(|checkpoints\(|captureCheckpoint\(|restoreCheckpoint\(|\.snapshot\b|reverseDebugToEvent/,
        'the UI must neither read payload history nor bypass the runner command');
});

test('Go to selected labels and explanation are bilingual', () => {
    for (const text of [
        'Go to selected', 'Restore and replay to the selected event boundary',
        'Zur Auswahl springen', 'Bis zur ausgewählten Ereignisgrenze wiederherstellen und abspielen'
    ]) assert.ok(panel.includes(text), text);
});
