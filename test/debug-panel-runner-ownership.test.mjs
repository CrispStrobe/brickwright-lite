// A replaced debug runner that is still inside its attach await must not
// publish its late attaching/ready phase over the replacement's running phase
// (the debug-history browser gate's intermittent disabled-Pause timeout).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRunnerOwnership} from '../overlay/scratch-gui/src/lib/bw-debug/runner-ownership.js';

const panelSource = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
const runnerSource = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');

test('a replaced runner finishing its attach late cannot overwrite the replacement phase', () => {
    const ownership = createRunnerOwnership();
    const ui = [];
    // Default Z80 bench: runner A starts and awaits its BBC BASIC fetch.
    const a = ownership.claim();
    const publishA = ownership.guard(a, phase => ui.push(['A', phase]));
    publishA('attaching');
    // The assembled ROM arrives: A is torn down and B replaces it.
    ownership.release();
    const b = ownership.claim();
    const publishB = ownership.guard(b, phase => ui.push(['B', phase]));
    publishB('attaching');
    publishB('running');
    // A's fetch resolves only now.
    publishA('ready');
    assert.deepEqual(ui.at(-1), ['B', 'running']);
    assert.deepEqual(ui.filter(([who]) => who === 'A'), [['A', 'attaching']]);
    assert.equal(ownership.isCurrent(a), false);
    assert.equal(ownership.isCurrent(b), true);
});

test('release without a replacement silences the torn-down runner too', () => {
    const ownership = createRunnerOwnership(), seen = [];
    const claim = ownership.claim();
    const publish = ownership.guard(claim, v => seen.push(v));
    publish(1);ownership.release();publish(2);
    assert.deepEqual(seen, [1]);
    assert.equal(ownership.isCurrent(claim), false);
    assert.equal(ownership.isCurrent(null), false);
});

test('the panel wires every runner notification and adoption through its claim', () => {
    assert.match(panelSource, /this\._runnerPromise = this\._createRunner\(this\._runnerOwnership\.claim\(\)\)/);
    assert.match(panelSource, /this\._runnerPromise = null;\s+this\._runnerOwnership\.release\(\);/);
    assert.match(panelSource, /onChange: this\._runnerOwnership\.guard\(claim, \(ui\) =>/);
    assert.match(panelSource, /if \(!this\._runnerOwnership\.isCurrent\(claim\)\) return runner;\s+if \(this\.props\.onRunnerChange\)/);
    assert.equal((panelSource.match(/this\._runnerPromise = this\._createRunner\(/g) || []).length, 1);
});

test('a destroyed runner publishes nothing', () => {
    assert.match(runnerSource, /function emit\(\) \{[^}]*?if \(destroyed\) return undefined;/);
    assert.match(runnerSource, /function emitLive\(\) \{\s+if \(destroyed\) return undefined;/);
});
