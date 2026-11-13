import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const gui = readFileSync(new URL('../overlay/scratch-gui/src/components/gui/gui.jsx', import.meta.url), 'utf8');
const scenario = readFileSync(new URL('../scripts/verify-i80386-local-hdd-gui.mjs', import.meta.url), 'utf8');

test('forward-debug circuit-tab selector matches the actual English accessible label', () => {
    const labels = [...gui.matchAll(/aria-label=\{intl\.formatMessage\(\{id: 'gui\.gui\.circuitTab', defaultMessage: '([^']+)'\}\)\}/g)];
    assert.equal(labels.length, 1, 'one circuit tab accessible label');
    const match = scenario.match(/page\.getByRole\('tab',\{name:'([^']+)',exact:true\}\)\.click\(\);await snap\('circuits'\)/);
    assert.ok(match, 'actual forward-debug tab switch');
    assert.equal(match[1], labels[0][1], 'selector matches the frontend label');
    assert.match(scenario, /await snap\('circuits'\);[\s\S]*?name:'Code',exact:true[\s\S]*?assert\.deepEqual\(retained\.regs,finalPause\.regs\);assert\.equal\(retained\.cpuCycles,finalPause\.cpuCycles\)/,
        'return to Code still requires the unchanged paused state');
});
