#!/usr/bin/env node
/**
 * The optional heavy engine must not be downloaded before anyone asks for it.
 *
 * WHY THIS EXISTS AND WHY THE EXISTING GATE COULD NOT SEE IT.
 * `verify-labwired-lazy-bundle.mjs` asserts WHERE the loader sits — out of the
 * entry bundle, behind a named chunk. That assertion was true the whole time
 * and is still true. It says nothing about whether the running app FETCHES the
 * engine anyway, and it did: `isLabwiredAvailable()` called `loadLabwired()`,
 * so the debug panel's mount-time probe pulled the artifact on every first
 * load. Location and traffic are different claims, and only one of them was
 * gated.
 *
 * Measured against the deployed site on 2026-09-04, before the fix:
 *   26 requests, 8.5 MB, of which labwired_wasm_bg.wasm 3.40 MB and its glue
 *   chunk 3.41 MB. First paint 7.6-9.7 s from a datacentre with an empty cache.
 *
 * So this gate watches the network, not the bundle. It is deliberately about
 * the FIRST load: reaching the heavy tier later, on purpose, is the feature.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const OUT = path.resolve('artifacts/first-load-weight');
/** Ratchet. Lower it when the app gets lighter; never raise it to make CI pass. */
const BUDGET_MB = 4.0;

let failed = 0;
const record = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed++;
};

await mkdir(OUT, {recursive: true});
const {chromium} = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1400, height: 900}});
const seen = [];
page.on('response', res => {
    const len = Number(res.headers()['content-length'] || 0);
    seen.push({url: res.url(), bytes: len});
});

try {
    const started = Date.now();
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => document.querySelectorAll('[role="tab"]').length > 0,
        null, {timeout: 60000});
    const firstPaint = Date.now() - started;
    // Settle: anything the app kicks off at mount is still "first load".
    await page.waitForTimeout(5000);

    const heavy = seen.filter(r => /labwired_wasm_bg\.wasm|labwired_wasm\.js/.test(r.url));
    const total = seen.reduce((sum, r) => sum + r.bytes, 0) / 1048576;

    record('the heavy labwired engine is NOT fetched on first load',
        heavy.length === 0,
        heavy.length
            ? `${heavy.length} request(s): ${heavy.map(h => h.url.split('/').pop()).join(', ')} — ` +
              'the availability probe must ask whether the artifact is deployed, not download it'
            : 'no request for the engine or its glue');

    record(`first load stays under the ${BUDGET_MB} MB ratchet`,
        total <= BUDGET_MB,
        `${total.toFixed(2)} MB over ${seen.length} requests, first paint ${(firstPaint / 1000).toFixed(1)}s`);

    const heaviest = [...seen].sort((a, b) => b.bytes - a.bytes).slice(0, 8)
        .map(r => `${(r.bytes / 1048576).toFixed(2)} MB  ${r.url.split('/').pop()}`);
    console.log('heaviest responses:\n  ' + heaviest.join('\n  '));
    await writeFile(path.join(OUT, 'first-load.json'),
        JSON.stringify({url, firstPaintMs: firstPaint, totalMB: Number(total.toFixed(3)),
            requests: seen.length, heavy: heavy.map(h => h.url)}, null, 2));
} catch (e) {
    record('the first-load measurement completed', false, e && e.message);
} finally {
    await browser.close();
}

console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
