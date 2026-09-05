import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('costume roundtrip retains a non-enforcing first-open performance receipt', () => {
    const gate = readFileSync(new URL('../scripts/verify-costume-roundtrip.mjs', import.meta.url), 'utf8');
    const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');

    assert.match(gate, /brickwright\/paint-first-costume-baseline\/v1/);
    assert.match(gate, /paint-performance\.json/);
    assert.match(gate, /durationMs: readyAt - start/);
    assert.match(gate, /activationLongTasks/);
    assert.match(gate, /PerformanceObserver/);
    assert.doesNotMatch(gate, /PAINT_FIRST_COSTUME_BASELINE_MS|relativeLimitMs|maxLongTaskMs/,
        'the baseline probe must measure before it sets a regression policy');
    assert.match(workflow, /records first-open performance/);
    assert.match(workflow, /name: costume-roundtrip-proof[\s\S]*artifacts\/costume-roundtrip\/\*/,
        'the existing artifact upload must retain the new JSON receipt');
});
