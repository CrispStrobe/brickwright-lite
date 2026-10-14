import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panel = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');

const start = panel.indexOf('const actionStatus =');
const end = panel.indexOf("{/* What this target cannot do", start);
assert.ok(start >= 0 && end > start, 'action summary render section must be identifiable');
const actionSection = panel.slice(start, end);

test('event action status renders only the runner-owned bounded summary', () => {
    assert.match(actionSection, /runner\.eventBreakpointActionStatus\(\)/);
    assert.match(actionSection, /failures \|\| \[\]\)\.slice\(-3\)/);
    assert.match(actionSection, /log \|\| \[\]\)\.slice\(-3\)/);
    assert.match(actionSection, /Object\.entries\(actionStatus\?\.counters \|\| \{\}\)\.slice\(-4\)/);
    assert.doesNotMatch(actionSection,
        /eventsFrom|checkpoints\(|captureCheckpoint|restoreCheckpoint|debugRecorder|debugTimeline|snapshot/,
        'render must not clone event, checkpoint, or machine-state payloads');
});

test('failures, log entries, and counters have compact visible surfaces', () => {
    for (const marker of [
        'data-debug-event-action-status',
        'data-debug-event-action-failures',
        'data-debug-event-action-log',
        'data-debug-event-action-counters'
    ]) assert.ok(actionSection.includes(marker), marker);
    assert.match(actionSection, /data-debug-event-action-failures role="status"/,
        'action failures must be announced rather than silently styled');
    assert.match(actionSection, /item\.breakpointId/);
    assert.match(actionSection, /item\.actionType/);
    assert.match(actionSection, /item\.code \|\| item\.message/);
    assert.match(actionSection, /item\.eventSeq/);
});

test('event action summary labels are bilingual', () => {
    for (const text of [
        'Breakpoint actions', 'Failures', 'Counters',
        'Haltepunkt-Aktionen', 'Fehler', 'Zähler'
    ]) assert.ok(panel.includes(text), text);
});
