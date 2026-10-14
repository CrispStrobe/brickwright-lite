import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const doc = readFileSync(new URL('../docs/LEGO-ARCHITECTURE.md', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../docs/plans/2026-09-26-lego-architecture-next.md', import.meta.url), 'utf8');

test('the LEGO architecture records the implemented virtual SPIKE boundary', () => {
    assert.match(doc, /Gap 3 .*partial for SPIKE/i);
    assert.match(doc, /VirtualSpikeHubState/);
    assert.doesNotMatch(doc, /There is no LEGO brick model/,
        'the pre-virtual-hub blanket claim must not return');
    for (const path of [
        '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js',
        '../overlay/scratch-gui/src/lib/virtual-hub/spike-prime-peripheral.js',
        '../test/virtual-spike-extension-e2e.test.mjs',
        '../test/virtual-spike-classic-extension-e2e.test.mjs'
    ]) assert.equal(existsSync(new URL(path, import.meta.url)), true, `${path} must exist`);
});

test('the remaining-work plan covers every declared gap and family boundary', () => {
    for (const phrase of ['Gap 1 is complete', 'Gap 2 is complete', 'Gap 3 is complete',
        'SPIKE', 'EV3', 'NXT', 'Boost', 'WeDo 2.0', 'Powered Up', 'RCX']) {
        assert.ok(plan.includes(phrase), `plan must name ${phrase}`);
    }
    assert.match(plan, /Owning-repository changes land first/);
});
