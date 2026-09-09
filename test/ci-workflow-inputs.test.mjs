import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workflowSources, assertCheckoutPins} from '../scripts/ci-workflow-inputs.mjs';
import {vendorPinOutputs} from '../scripts/ci-vendor-pins.mjs';

const workflows = workflowSources(new URL('..', import.meta.url).pathname);
const names = ['bw-circuit-ui', 'bw-board', 'sb3-creator'];
const allowed = site => site.file === '.github/workflows/vendor-freshness.yml'
    && names.some(name => site.repository === `CrispStrobe/${name}`
        && site.ref === '${{ steps.vendor_pins.outputs.' + name + ' }}');

test('every external workflow checkout has a full pin or validated vendor-pin output', () => {
    const sites = assertCheckoutPins(workflows, allowed);
    const workflow = workflows.get('.github/workflows/vendor-freshness.yml');
    assert.match(workflow, /id: vendor_pins\n\s+run: node brickwright-lite\/scripts\/ci-vendor-pins.mjs >> "\$GITHUB_OUTPUT"/);
    assert.ok(workflow.indexOf('id: vendor_pins') < workflow.indexOf('repository: CrispStrobe/'));
    assert.equal(sites.filter(allowed).length, 3);
    assert.doesNotMatch(workflow, /staying on HEAD|comparing against HEAD/);
    console.log(`Audited ${sites.length} external checkout sites across ${workflows.size} workflows`);
});

test('vendor outputs reject a missing, abbreviated, moving or injected SHA before checkout', () => {
    const pins = JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url), 'utf8'));
    assert.equal(vendorPinOutputs(pins), names.map(name => `${name}=${pins[name]}\n`).join(''));
    for (const name of names) {
        for (const bad of [undefined, 'main', pins[name].slice(0, 7), pins[name] + '\ninjected=yes']) {
            assert.throws(() => vendorPinOutputs({...pins, [name]: bad}), new RegExp(name + ': missing or invalid'));
        }
    }
});

test('new checkout sites and unrecognized dynamic refs fail by repository', () => {
    const workflow = ref => 'steps:\n  - uses: actions/checkout@full\n    with:\n      repository: Acme/new\n' + (ref ? `      ref: ${ref}\n` : '');
    for (const ref of [null, 'main', 'abc1234', '${{ steps.unreviewed.outputs.sha }}']) {
        assert.throws(() => assertCheckoutPins(new Map([['new.yml', workflow(ref)]]), allowed), /Acme\/new: expected a full/);
    }
    assert.equal(assertCheckoutPins(new Map([['new.yml', workflow('a'.repeat(40))]])).length, 1);
});

test('duplicate-ref fixture: a checkout has exactly one ref field', () => {
    const base = 'steps:\n  - uses: actions/checkout@full\n    with:\n      repository: Acme/duplicate\n      ref: ' + 'a'.repeat(40) + '\n';
    assert.equal(assertCheckoutPins(new Map([['duplicate.yml', base]])).length, 1);
    assert.throws(() => assertCheckoutPins(new Map([['duplicate.yml', base + '      ref: ' + 'b'.repeat(40) + '\n']])), /duplicate checkout ref/);
});
