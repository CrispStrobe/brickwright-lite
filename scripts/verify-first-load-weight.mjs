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
 *   26 requests, 8.5 MB over the wire, of which labwired_wasm_bg.wasm was
 *   3.40 MB. First paint 7.6-9.7 s from a datacentre with an empty cache.
 *
 * CORRECTION to my own first write-up: I also charged the 3.41 MB
 * `2923.<hash>.js` to labwired and called the saving 6.8 MB. It is not labwired
 * — grepping the chunk finds zero mentions, and it still loads on a build with
 * the fix. Its contents are the bundled gallery EXTENSIONS and locale data
 * (`ArgumentType`, `blockType`, `parentLocale`). The saving is the wasm alone:
 * about 3.40 MB of 8.5, so ~40%, not ~80%. That chunk is now the heaviest single
 * item on first load and is its own question for someone.
 *
 * So this gate watches the network, not the bundle. It is deliberately about
 * the FIRST load: reaching the heavy tier later, on purpose, is the feature.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const OUT = path.resolve('artifacts/first-load-weight');
/** Ratchet, in UNCOMPRESSED bytes. Lower it when the app gets lighter; never
 *  raise it to make CI pass.
 *
 *  Uncompressed because that is what this gate sees: CI serves the build with
 *  `python3 -m http.server`, which does not gzip, so `content-length` is the raw
 *  size. On GitHub Pages the same payload arrives at roughly 40% of this. The
 *  first version of this ratchet was 4 MB, taken from a PRODUCTION measurement
 *  and then applied to an uncompressed local server — comparing a wire number
 *  against a disk number, which fails a build for being served differently.
 *
 *  Measured 2026-09-04 on a build carrying the probe fix: 14.90 MB over 26
 *  requests. 16 MB leaves headroom without hiding a regression the size of the
 *  one this gate was written for (the engine alone was 20 MB uncompressed). */
const BUDGET_MB = 16.0;

let failed = 0;
const record = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed++;
};

await mkdir(OUT, {recursive: true});
const {chromium} = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1400, height: 900}});
// METHOD MATTERS, and getting this wrong is what the gate's first CI run
// caught — in itself. A HEAD response still carries `content-length`, so
// counting that header charged the cheap availability probe the full 20 MB of a
// body it never transferred, and the URL check flagged the very request the fix
// introduced. The gate failed the fix for doing exactly the right thing.
//
// So: only a GET that returns a body counts as "fetched". A HEAD, or a 206 from
// the ranged-GET fallback, is the probe working and costs nothing.
const seen = [];
page.on('response', res => {
    const method = res.request().method();
    const len = Number(res.headers()['content-length'] || 0);
    const transferred = method === 'HEAD' ? 0 : (res.status() === 206 ? 1 : len);
    seen.push({url: res.url(), bytes: transferred, method, status: res.status()});
});

try {
    const started = Date.now();
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => document.querySelectorAll('[role="tab"]').length > 0,
        null, {timeout: 60000});
    const firstPaint = Date.now() - started;
    // Settle: anything the app kicks off at mount is still "first load".
    await page.waitForTimeout(5000);

    // A HEAD or a 206 is the probe; a GET with a body is the download.
    const heavy = seen.filter(r => /labwired_wasm_bg\.wasm|labwired_wasm\.js/.test(r.url))
        .filter(r => r.method !== 'HEAD' && r.status !== 206);
    const probes = seen.filter(r => /labwired_wasm_bg\.wasm/.test(r.url) &&
        (r.method === 'HEAD' || r.status === 206));
    const total = seen.reduce((sum, r) => sum + r.bytes, 0) / 1048576;

    record('the heavy labwired engine is NOT fetched on first load',
        heavy.length === 0,
        heavy.length
            ? `${heavy.length} request(s): ${heavy.map(h => h.url.split('/').pop()).join(', ')} — ` +
              'the availability probe must ask whether the artifact is deployed, not download it'
            : `no body fetched; ${probes.length} cheap probe(s) — ` +
              (probes.map(p => `${p.method} ${p.status}`).join(', ') || 'none'));

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
