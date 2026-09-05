#!/usr/bin/env node
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {auditCycleBrowserReceipt, CYCLE_BROWSER_LIMITS} from './lib/cycle-browser-receipt.mjs';

if (!process.env.CI && process.env.BW_ALLOW_LOCAL_CYCLE_BROWSER !== '1') {
    throw new Error('cycle candidate browser qualification is CI-only; set BW_ALLOW_LOCAL_CYCLE_BROWSER=1 explicitly');
}

const wasmPath = resolve(process.env.Z80_QUALIFICATION_WASM || 'artifacts/cycle-core-qualification/z80.wasm');
const output = resolve(process.env.CYCLE_BROWSER_OUTPUT ||
    'artifacts/cycle-core-qualification/browser-report.json');
await mkdir(resolve(output, '..'), {recursive: true});

let browser;
let receipt = null;
let failure = null;
try {
    const bytes = await readFile(wasmPath);
    browser = await chromium.launch({headless: true});
    const page = await browser.newPage();
    receipt = await page.evaluate(async ({moduleBytes, limits}) => {
        const bytes = Uint8Array.from(moduleBytes);
        const compileStart = performance.now();
        const module = await WebAssembly.compile(bytes);
        const compileMs = performance.now() - compileStart;
        const instantiateStart = performance.now();
        const instance = await WebAssembly.instantiate(module, {});
        const instantiateMs = performance.now() - instantiateStart;
        let jsWasmCrossings = 0;
        const stateBytes = instance.exports.candidate_init();
        jsWasmCrossings++;
        const batchStart = performance.now();
        const traceHash = instance.exports.candidate_run_batch(limits.benchmarkTicks) >>> 0;
        jsWasmCrossings++;
        const batchMs = performance.now() - batchStart;
        return {schema: 1, runtime: 'chromium-wasm', wasmBytes: bytes.byteLength,
            compileMs, instantiateMs, batchMs, benchmarkTicks: limits.benchmarkTicks,
            ticksPerSecond: limits.benchmarkTicks / (batchMs / 1000), jsWasmCrossings,
            stateBytes, traceHash};
    }, {moduleBytes: [...bytes], limits: CYCLE_BROWSER_LIMITS});
    const audit = auditCycleBrowserReceipt(receipt);
    if (!audit.accepted) failure = `receipt refused: ${audit.errors.join(', ')}`;
} catch (error) {
    failure = error?.stack || error?.message || String(error);
} finally {
    if (browser) await browser.close();
}

const report = {schema: 1, generatedAt: new Date().toISOString(), limits: CYCLE_BROWSER_LIMITS,
    receipt, accepted: failure === null, ...(failure ? {failure} : {})};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({accepted: report.accepted, output, receipt}));
process.exit(report.accepted ? 0 : 1);
