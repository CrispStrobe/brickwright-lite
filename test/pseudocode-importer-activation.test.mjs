import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
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

test('the exact hosted P21 eager receipt remains valid', () => {
    const hosted = JSON.parse(readFileSync(new URL(
        './fixtures/p21-pseudocode-eager-receipt.json', import.meta.url)));
    assert.deepEqual(validatePseudocodeActivationReceipt(hosted), []);
    assert.equal(hosted.run, 34061190255);
    assert.equal(hosted.headSha, '513237241a68dd374a7e3040a2f73cab4e89c347');
    assert.equal(Math.round(hosted.medianMs * 10) / 10, 129.2);
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
        value => { value.samples[0].consoleErrors = 'bad'; },
        value => { value.samples[0].consoleErrors = [42]; },
        value => { value.samples[0].consoleErrors = ['uncaught']; },
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

test('P21 candidate receipt binds baseline, deferral, retry, preset and state seams', () => {
    const value = receipt();
    value.mode = 'lazy-candidate';
    value.baseline = {run: 34061190255, headSha: 'b'.repeat(40), medianMs: 129.2};
    value.relativeLimitMs = 279.2;
    value.samples = value.samples.map(item => ({...item, beforePseudocodeScripts: [],
        pseudocodeScripts: [{name: 'pseudocode-importer.js', encodedBodySize: 60000}]}));
    value.scenarios = {
        delay: {loadingVisible: true, editorBeforeRelease: false, usable: true, requestCount: 1},
        retry: {errorVisible: true, usable: true, requestCount: 2},
        preset: {usable: true, editorCount: 1, requestCount: 1},
        state: {autosave: true, bundle: true, circuit: true}
    };
    assert.deepEqual(validatePseudocodeActivationReceipt(value), []);
    const mutations = [
        receipt => { receipt.baseline.run = 0; },
        receipt => { receipt.relativeLimitMs = 0; },
        receipt => { receipt.samples[0].beforePseudocodeScripts.push({name: 'early.js'}); },
        receipt => { receipt.samples[0].pseudocodeScripts = []; },
        receipt => { receipt.medianMs = 280; receipt.samples[2].durationMs = 280; },
        receipt => { receipt.scenarios.delay.loadingVisible = false; },
        receipt => { receipt.scenarios.retry.requestCount = 1; },
        receipt => { receipt.scenarios.preset.editorCount = 2; },
        receipt => { receipt.scenarios.state.bundle = false; }
    ];
    for (const mutate of mutations) {
        const changed = structuredClone(value);
        mutate(changed);
        assert.notDeepEqual(validatePseudocodeActivationReceipt(changed), []);
    }
});

test('P21 browser CLI writes a terminal receipt when Playwright launch fails', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'p21-browser-failure-'));
    const fake = path.join(directory, 'fake-playwright.mjs');
    writeFileSync(fake, `export const chromium = {launch: async () => { throw new Error('launch denied'); }};\n`);
    try {
        const result = spawnSync(process.execPath, [path.resolve(
            import.meta.dirname, '../scripts/verify-pseudocode-importer-activation.mjs')], {
            cwd: path.resolve(import.meta.dirname, '..'),
            encoding: 'utf8',
            env: {...process.env,
                GITHUB_RUN_ID: '34060000002',
                GITHUB_SHA: 'e'.repeat(40),
                P21_PLAYWRIGHT_MODULE: new URL(`file://${fake}`).href,
                P21_RECEIPT_DIR: directory}
        });
        assert.equal(result.status, 1);
        const value = JSON.parse(readFileSync(path.join(directory, 'receipt.json')));
        assert.deepEqual(value.terminal, {ok: false, stage: 'launch-browser', message: 'launch denied'});
        assert.equal(value.run, 34060000002);
        assert.equal(value.headSha, 'e'.repeat(40));
        assert.deepEqual(value.samples, []);
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});
