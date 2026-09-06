import assert from 'node:assert/strict';
import test from 'node:test';

import {validatePseudocodeActivationReceipt} from '../scripts/lib/p21-pseudocode-probe.mjs';

const sample = durationMs => ({
    durationMs,
    longTasks: [],
    scripts: [],
    pseudocodeScripts: [],
    errors: [],
    consoleErrors: [],
    failure: null,
    tab: {visible: true, exactName: true, ariaControls: 'code-panel'},
    panel: {id: 'code-panel', selected: true},
    editorKind: 'textarea'
});

const receipt = () => ({
    schema: 'brickwright/p21-pseudocode-activation/v1',
    mode: 'eager-baseline',
    run: 123,
    headSha: 'a'.repeat(40),
    absoluteLimitMs: 1000,
    maxLongTaskMs: 100,
    samples: [sample(10), sample(20), sample(30), sample(40), sample(50)],
    medianMs: 30
});

test('P21 eager receipt requires five bound and usable cold activations', () => {
    assert.deepEqual(validatePseudocodeActivationReceipt(receipt()), []);
    const mutations = [
        value => { value.schema = 'wrong'; },
        value => { value.run = 0; },
        value => { value.headSha = 'short'; },
        value => { value.samples.pop(); },
        value => { value.samples[0].tab.visible = false; },
        value => { value.samples[0].panel.id = 'wrong'; },
        value => { value.samples[0].editorKind = null; },
        value => { value.samples[0].durationMs = Number.NaN; },
        value => { value.samples[0].longTasks = [{ms: 101}]; },
        value => { value.samples[0].pseudocodeScripts = [{name: 'pseudocode-importer.js', encodedBodySize: 1}]; },
        value => { value.medianMs = 31; }
    ];
    for (const mutate of mutations) {
        const value = receipt();
        mutate(value);
        assert.notDeepEqual(validatePseudocodeActivationReceipt(value), []);
    }
});
