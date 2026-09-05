import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('costume roundtrip ratchets the accepted first-open performance receipt', () => {
    const gate = readFileSync(new URL('../scripts/verify-costume-roundtrip.mjs', import.meta.url), 'utf8');
    const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');

    assert.match(gate, /brickwright\/paint-first-costume\/v1/);
    assert.match(gate, /paint-performance\.json/);
    assert.match(gate, /durationMs: readyAt - start/);
    assert.match(gate, /activationLongTasks/);
    assert.match(gate, /PerformanceObserver/);
    assert.match(gate, /baselineMs = 390\.5/);
    assert.match(gate, /baselineRun = 33967333844/);
    assert.match(gate, /baselineLongTasksMs = \[50, 55\]/);
    assert.match(gate, /relativeLimitMs = 449\.075/);
    assert.match(gate, /absoluteLimitMs = 1000/);
    assert.match(gate, /maxLongTaskMs = 100/);
    assert.doesNotMatch(gate, /PAINT_FIRST_COSTUME_BASELINE_MS/,
        'the accepted hosted baseline must not be silently overridden');
    assert.match(workflow, /records first-open performance/);
    assert.match(workflow, /name: costume-roundtrip-proof[\s\S]*artifacts\/costume-roundtrip\/\*/,
        'the existing artifact upload must retain the new JSON receipt');
});

test('the readiness receipt targets PaperCanvas rather than the always-visible Stage', () => {
    const gate = readFileSync(new URL('../scripts/verify-costume-roundtrip.mjs', import.meta.url), 'utf8');
    assert.match(gate, /canvas\[resize="true"\]:visible/);
    assert.doesNotMatch(gate, /canvas:visible/);
});
