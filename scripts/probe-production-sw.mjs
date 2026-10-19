#!/usr/bin/env node
/**
 * Production service-worker probe (#306): does a returning visitor get the
 * CURRENT lazy chunks after a deploy, or the copies their service worker
 * cached from the previous deploy?
 *
 * Unhashed lazy chunks (chunks/[name].js, e.g. the pseudocode importer)
 * keep their URL across deploys. Before brickwright-v5 the service worker
 * served them stale-while-revalidate, so a page from the new deploy could
 * be handed the old deploy's chunk. scripts/verify-service-worker.mjs
 * reproduces that against a local server; this probe checks the live sites.
 *
 *   seed   Open URL in a persistent Chromium profile, let the service worker
 *          take control, and load the lazy chunks through it so they are in
 *          its cache (as for a visitor who used the importer). Writes the
 *          chunk hashes to <profile>/probe-seed.json.
 *   check  Reopen the same profile after a newer deploy. Each probed chunk
 *          is fetched through the page (so through the service worker) and
 *          directly from the network (Playwright's request API, which
 *          bypasses it). Fails if any differ or a chunk fails to load.
 *          If no probed chunk changed since the seed, the deploy could not
 *          have exposed a stale chunk: the result is "inconclusive", which
 *          is reported as such and is not a pass.
 *
 *   node scripts/probe-production-sw.mjs seed  --url URL --profile DIR
 *   node scripts/probe-production-sw.mjs check --url URL --profile DIR [--json F]
 *
 * Exit: 0 pass, 1 stale chunk or load failure, 3 inconclusive.
 */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {chromium} from 'playwright';

const [stage] = process.argv.slice(2);
const arg = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const url = arg('--url');
const profile = arg('--profile');
const jsonOut = arg('--json');
if (!['seed', 'check'].includes(stage) || !url || !profile) {
    console.error('usage: probe-production-sw.mjs seed|check --url URL --profile DIR [--json F]');
    process.exit(2);
}
const base = url.endsWith('/') ? url : `${url}/`;
// The lazy, unhashed chunks a visitor is most likely to have cached.
const CHUNKS = ['chunks/pseudocode-importer.js', 'chunks/pseudocode-examples.js'];
const sha = text => createHash('sha256').update(text).digest('hex');
const seedFile = `${profile}/probe-seed.json`;

mkdirSync(profile, {recursive: true});
const context = await chromium.launchPersistentContext(profile, {headless: true});
const errors = [];
let code = 0;
const result = {stage, url: base, at: new Date().toISOString(), chunks: {}};
try {
    const page = context.pages()[0] || await context.newPage();
    // Only chunk-loading failures count: other page errors are not this probe's subject.
    page.on('pageerror', e => { if (/ChunkLoadError|Loading chunk/.test(String(e))) errors.push(String(e).split('\n')[0]); });
    page.on('console', m => { if (/ChunkLoadError|Loading chunk/.test(m.text())) errors.push(m.text().split('\n')[0]); });

    await page.goto(base, {waitUntil: 'load', timeout: 120000});
    // Let the (possibly new) worker install, activate and take control.
    await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        await reg.update().catch(() => {});
    });
    await page.reload({waitUntil: 'load', timeout: 120000});
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 60000});
    result.cacheNames = await page.evaluate(() => caches.keys());
    result.swSha = sha((await (await context.request.get(`${base}sw.js`)).text()));

    for (const chunk of CHUNKS) {
        const viaWorker = await page.evaluate(async path => {
            const r = await fetch(path);
            return {status: r.status, text: await r.text()};
        }, chunk);
        const net = await context.request.get(`${base}${chunk}?probe=${Date.now()}`);
        const netText = await net.text();
        result.chunks[chunk] = {
            workerStatus: viaWorker.status, workerSha: sha(viaWorker.text),
            networkStatus: net.status(), networkSha: sha(netText),
        };
    }

    if (stage === 'seed') {
        writeFileSync(seedFile, JSON.stringify(result, null, 2) + '\n');
        console.log(`seeded ${base}: caches ${result.cacheNames.join(',')}`);
    } else {
        const seed = existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')) : null;
        if (!seed) throw new Error(`no seed in ${profile}`);
        result.seedAt = seed.at;
        const stale = [], failed = [], changed = [];
        for (const [chunk, c] of Object.entries(result.chunks)) {
            if (c.workerStatus !== 200 || c.networkStatus !== 200) failed.push(`${chunk} worker ${c.workerStatus} network ${c.networkStatus}`);
            else if (c.workerSha !== c.networkSha) stale.push(chunk);
            if (seed.chunks?.[chunk] && seed.chunks[chunk].networkSha !== c.networkSha) changed.push(chunk);
        }
        result.stale = stale; result.failed = failed; result.changedSinceSeed = changed; result.errors = errors;
        if (stale.length || failed.length || errors.length) {
            result.verdict = 'FAIL';
            code = 1;
        } else if (!changed.length) {
            result.verdict = 'INCONCLUSIVE';
            code = 3;
        } else {
            result.verdict = 'PASS';
        }
        console.log(`${result.verdict} ${base}: seeded ${seed.at}, changed since seed: ${changed.join(', ') || 'none'}`);
        for (const s of stale) console.log(`  stale through the service worker: ${s}`);
        for (const f of failed) console.log(`  failed: ${f}`);
        for (const e of errors) console.log(`  page error: ${e}`);
    }
} finally {
    await context.close();
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 2) + '\n');
process.exit(code);
