import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {createConditionalCycleProviderBoundary} from
    '../overlay/scratch-gui/src/lib/bw-debug/conditional-cycle-provider.js';
import {createW65C02ProviderBoundary, JSMOO_W65C02_REJECTION} from
    '../overlay/scratch-gui/src/lib/bw-board/w65c02-cycle-provider.js';

const fast = {capabilities: () => ({steps: ['insn'], reverse: [], fidelity: {cycle: 'unsupported'}})};

test('W65C02 defaults to the fast core and publishes immutable rejection evidence', () => {
    const boundary = createW65C02ProviderBoundary(fast);
    const selected = boundary.select();
    assert.equal(selected.accepted, true);
    assert.equal(selected.activeProvider, 'fast-w65c02');
    assert.equal(selected.target, fast);
    assert.equal(selected.cycleProvider, null);

    const status = boundary.status();
    const rejected = status.providers.find(provider => provider.id === 'jsmoo-w65c02');
    assert.equal(rejected.state, 'rejected');
    assert.equal(rejected.evidence.cycleStep, false);
    assert.equal(rejected.evidence.reverseCycle, false);
    assert.equal(rejected.reasons.length, 3);
    assert.throws(() => rejected.reasons.push('waive it'), TypeError);
});

test('requesting rejected JSMoo keeps fast target active and cannot claim cycle controls', () => {
    const result = createW65C02ProviderBoundary(fast).select('jsmoo-w65c02');
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'cycle-provider-rejected');
    assert.equal(result.activeProvider, 'fast-w65c02');
    assert.equal(result.target, fast);
    assert.ok(!fast.capabilities().steps.includes('cycle'));
    assert.ok(!fast.capabilities().reverse.includes('cycle'));
    assert.equal(typeof result.target.cycleProvider, 'undefined');
});

test('provider-neutral gate never loads rejected code but accepts a qualified recorded provider', () => {
    let rejectedLoads = 0;
    const recorded = {capabilities: () => ({steps: ['insn', 'cycle']}), cycleProvider: () => ({
        schema: 1, engine: 'qualified-test', boundary: 'bus-cycle', timeDomain: 'cpu',
        fidelity: 'recorded', resumable: true, signals: ['address'], checkpoint: true
    })};
    const boundary = createConditionalCycleProviderBoundary({defaultId: 'fast', defaultTarget: fast,
        candidates: [
            {id: 'bad', state: 'rejected', reasons: ['failed'], load: () => { rejectedLoads++; }},
            {id: 'good', state: 'qualified', reasons: [], load: () => recorded}
        ]});
    assert.equal(boundary.select('bad').accepted, false);
    assert.equal(rejectedLoads, 0);
    const selected = boundary.select('good');
    assert.equal(selected.accepted, true);
    assert.equal(selected.target, recorded);
    assert.equal(selected.cycleProvider.fidelity, 'recorded');
});

test('rejection receipt is pinned to qualification identities', () => {
    assert.match(JSMOO_W65C02_REJECTION.evidence.candidateCommit, /^[0-9a-f]{40}$/);
    assert.match(JSMOO_W65C02_REJECTION.evidence.oracleCommit, /^[0-9a-f]{40}$/);
});

test('a qualified loader failure returns to the default instead of escaping', () => {
    const boundary = createConditionalCycleProviderBoundary({defaultId: 'fast', defaultTarget: fast,
        candidates: [{id: 'broken', state: 'qualified', reasons: [],
            load: () => { throw new Error('module absent'); }}]});
    const result = boundary.select('broken');
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'cycle-provider-load-failed');
    assert.equal(result.target, fast);
    assert.match(result.receipt.reasons.at(-1), /module absent/);
});

test('the 6502 factory selects through the boundary without importing JSMoo', () => {
    const factory = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-board/debug-target-factory.js', import.meta.url), 'utf8');
    assert.match(factory, /createW65C02ProviderBoundary/);
    assert.match(factory, /providerBoundary\.select\(opts\.cycleProvider \|\| 'fast-w65c02'\)/);
    assert.doesNotMatch(factory, /(?:import|require)\([^)]*jsmoo/i);
});
