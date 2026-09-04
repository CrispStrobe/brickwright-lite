import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

test('the production 8086 benchmark covers desktop and mobile pump health', () => {
    const script = readFileSync(new URL('../scripts/bench-i8086-browser.mjs', import.meta.url), 'utf8');
    for (const fact of [
        "name: 'desktop'", "name: 'mobile'", '__BW_I8086_PERF__',
        "selectOption('i8086')", "selectOption('pins')", 'realTimeRatio',
        'pumpMs', 'longTasks', 'heapBytes', "ratio < 0.25",
    ]) assert.ok(script.includes(fact), `benchmark lost ${fact}`);
});

test('CI retains the browser performance receipt', () => {
    const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
    assert.match(workflow, /node scripts\/bench-i8086-browser\.mjs/);
    assert.match(workflow, /name: i8086-browser-performance/);
    assert.match(workflow, /path: artifacts\/i8086-performance\/report\.json/);
});
