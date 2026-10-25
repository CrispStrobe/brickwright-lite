import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditCycleBrowserReceipt, CYCLE_BROWSER_LIMITS} from
    '../scripts/lib/cycle-browser-receipt.mjs';

const workflow = readFileSync(new URL('../.github/workflows/cycle-core-qualification.yml', import.meta.url), 'utf8');
const browserGate = readFileSync(new URL('../scripts/verify-cycle-candidate-browser.mjs', import.meta.url), 'utf8');
const valid = () => ({schema: 1, runtime: 'chromium-wasm', wasmBytes: 12000,
    compileMs: 10, instantiateMs: 5, batchMs: 20,
    benchmarkTicks: CYCLE_BROWSER_LIMITS.benchmarkTicks, ticksPerSecond: 10000000,
    jsWasmCrossings: 2, stateBytes: 128, traceHash: 123});

test('browser receipt accepts only the bounded batched WASM contract', () => {
    assert.deepEqual(auditCycleBrowserReceipt(valid()), {accepted: true, errors: []});
    const mutations = {
        schema: value => { value.schema++; },
        runtime: value => { value.runtime = 'node-wasm'; },
        wasmBytes: value => { value.wasmBytes = CYCLE_BROWSER_LIMITS.maxWasmBytes + 1; },
        compileMs: value => { value.compileMs = Infinity; },
        instantiateMs: value => { value.instantiateMs = -1; },
        batchMs: value => { value.batchMs = 0; },
        benchmarkTicks: value => { value.benchmarkTicks--; },
        ticksPerSecond: value => { value.ticksPerSecond = 0; },
        jsWasmCrossings: value => { value.jsWasmCrossings++; },
        stateBytes: value => { value.stateBytes = value.wasmBytes + 1; },
        traceHash: value => { value.traceHash = 0; }
    };
    for (const [field, mutate] of Object.entries(mutations)) {
        const receipt = valid();
        mutate(receipt);
        const result = auditCycleBrowserReceipt(receipt);
        assert.equal(result.accepted, false, `${field} mutation survived`);
        assert.ok(result.errors.includes(field), `${field} refusal was not named`);
    }
});

test('hosted workflow compiles freestanding WASM, runs Chromium, and always uploads its receipt', () => {
    assert.match(workflow, /qualify-floooh-z80-wasm\.c/);
    assert.match(workflow, /--target=wasm32/);
    assert.match(workflow, /apt-get install -y lld-18/);
    assert.match(workflow, /playwright install --with-deps chromium/);
    assert.match(workflow, /verify-cycle-candidate-browser\.mjs/);
    assert.match(workflow, /browser-report\.json/);
    assert.match(workflow, /if: always\(\)/);
    assert.match(browserGate, /browser qualification is CI-only/);
    assert.match(browserGate, /candidate_run_batch/);
});
