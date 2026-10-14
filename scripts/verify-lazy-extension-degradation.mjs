#!/usr/bin/env node
/**
 * A built-in extension that arrives as a chunk can fail to arrive.
 *
 * Before the boot-payload split a built-in could not fail to load: its code was
 * already in the bundle, so `loadExtensionURL` was a formality. Since the split
 * it is a network fetch, and a fetch can fail — an offline reload, or a cache
 * miss against a redeployed content hash. `deserializeProject` awaits those
 * loads, so without a per-extension catch ONE unavailable chunk would reject
 * the whole `Promise.all` and the project would not open at all, where the old
 * behaviour was "opens, with that extension's blocks missing".
 *
 * That degradation is the only new user-visible behaviour in the change, and it
 * is the one CI structurally cannot observe by accident, because CI always has
 * the chunk. So this gate removes it on purpose.
 *
 * It runs the same project twice:
 *
 *   CONTROL — no interception. Both the music block and the pen block must
 *             survive. This is what stops the gate being vacuous: if the
 *             fixture did not really exercise a lazy extension, the abort run
 *             below would pass for the wrong reason and say nothing.
 *   ABORTED — the music chunk is aborted. The project must still open,
 *             the pen blocks (a SYNC builtin) must be intact, and nothing may
 *             reach the page as an uncaught error.
 *
 * The abort is counted and asserted, not assumed. An interception that never
 * fires produces exactly the same green as a correct one, and a route pattern
 * is one chunkFilename change away from matching nothing at all.
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

const requireFromGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const JSZip = requireFromGui('jszip');
const url = process.env.PROOF_URL || 'http://localhost:8617/';
const artifacts = resolve('artifacts/lazy-extension-degradation');
await mkdir(artifacts, {recursive: true});
const basePath = resolve(artifacts, 'base.sb3');
const fixturePath = resolve(artifacts, 'music-and-pen.sb3');
// The built filename is NOT `chunks/ext-music.js`. `chunkFilename:
// 'chunks/[name].js'` only governs chunks made of overlay source — that is why
// asset-library-index.js, guided-lessons.js and pseudocode-examples.js are
// unhashed. A lazy EXTENSION chunk is node_modules code, so splitChunks' own
// defaultVendors cacheGroup names it and the emitted file carries a content
// hash: `chunks/ext-music.<hash>.js` — and a cacheGroup is also free to PREFIX
// the name, so the pattern matches any chunk basename containing `ext-music`
// rather than pinning a shape. Matched loosely for the same reason
// verify-boot-payload matches by prefix. The first version of this gate pinned
// the exact name, matched nothing, and was caught by the abort counter below
// rather than by going quietly green — which is the whole reason it counts.
const CHUNK_MATCH = /\/chunks\/[^/]*ext-music[^/]*\.js$/;
const CHUNK_LABEL = 'chunks/ext-music.*.js';

const browser = await chromium.launch({headless: true});
const newPage = async () => {
    // serviceWorkers: 'block' is LOAD-BEARING, not hygiene. index.ejs registers
    // sw.js, which calls skipWaiting() on install and clients.claim() on
    // activate, so the worker owns the client within the same page load --
    // before the lazy ext-music chunk is ever requested. Chromium does not
    // surface service-worker-originated requests to page.route, so the worker
    // fetches the chunk itself and the abort below never runs: the route
    // matches nothing and the gate reports on a chunk it never removed. A
    // fresh context does not help, because the worker installs inside the run.
    // Blocked for ALL THREE runs so control and abort see the same world.
    // verify-service-worker.mjs is the gate that WANTS the worker; this one
    // must not have it.
    const context = await browser.newContext({viewport: {width: 1280, height: 900},
        acceptDownloads: true, serviceWorkers: 'block'});
    const page = await context.newPage();
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    return {context, page};
};
const waitForVM = page => page.waitForFunction(() => {
    const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
    if (!vm?.runtime) return false;
    window.__vm = vm;
    return true;
}, null, {timeout: 60000});
const opcodes = page => page.evaluate(() => [...new Set((window.__vm?.runtime?.targets || [])
    .flatMap(target => Object.values(target.blocks?._blocks || {}).map(block => block.opcode)))]);

try {
    // 1. A real project from the app itself, so the costume assets are genuine.
    let {context, page} = await newPage();
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await waitForVM(page);
    await page.getByText('File', {exact: true}).click();
    const downloadPromise = page.waitForEvent('download', {timeout: 30000});
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await downloadPromise).saveAs(basePath);
    await context.close();

    // 2. Declare one LAZY builtin (music) and one SYNC builtin (pen), with a
    //    block from each. The pen block is the control surface: it must survive
    //    the music chunk going missing, or the degradation is not graceful.
    const zip = await JSZip.loadAsync(await readFile(basePath));
    const project = JSON.parse(await zip.file('project.json').async('text'));
    const sprite = project.targets.find(target => !target.isStage);
    if (!sprite) throw new Error('saved project has no sprite to attach blocks to');
    sprite.blocks.bwHat = {opcode: 'event_whenflagclicked', next: 'bwTempo', parent: null,
        inputs: {}, fields: {}, shadow: false, topLevel: true, x: 40, y: 40};
    sprite.blocks.bwTempo = {opcode: 'music_setTempo', next: 'bwPen', parent: 'bwHat',
        inputs: {TEMPO: [1, [4, '80']]}, fields: {}, shadow: false, topLevel: false};
    sprite.blocks.bwPen = {opcode: 'pen_clear', next: null, parent: 'bwTempo',
        inputs: {}, fields: {}, shadow: false, topLevel: false};
    project.extensions = [...new Set([...(project.extensions || []), 'music', 'pen'])];
    zip.file('project.json', JSON.stringify(project));
    await writeFile(fixturePath, await zip.generateAsync({type: 'nodebuffer'}));

    const openFixture = async page => {
        await page.getByText('File', {exact: true}).click();
        const chooserPromise = page.waitForEvent('filechooser', {timeout: 30000});
        await page.getByText('Load from your computer', {exact: true}).click();
        (await chooserPromise).setFiles(fixturePath);
    };

    // 3. CONTROL. Proves the fixture reaches the lazy path at all.
    ({context, page} = await newPage());
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await waitForVM(page);
    await openFixture(page);
    await page.waitForFunction(() => (window.__vm?.runtime?.targets || []).some(target =>
        Object.values(target.blocks?._blocks || {}).some(block => block.opcode === 'pen_clear')),
    null, {timeout: 45000});
    const control = await opcodes(page);
    for (const opcode of ['music_setTempo', 'pen_clear']) {
        if (!control.includes(opcode)) {
            throw new Error(`control run lost ${opcode} — the fixture does not exercise ` +
                'the lazy path, so the abort run below would prove nothing');
        }
    }
    console.log('  ok: control run keeps music_setTempo and pen_clear');
    await context.close();

    // 4. ABORTED.
    ({context, page} = await newPage());
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let aborted = 0;
    await page.route(CHUNK_MATCH, route => {
        aborted++;
        return route.abort('failed');
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await waitForVM(page);
    await openFixture(page);
    // The project must still OPEN. Keyed on the sync extension's block, which
    // has nothing to do with the missing chunk and must be unaffected by it.
    await page.waitForFunction(() => (window.__vm?.runtime?.targets || []).some(target =>
        Object.values(target.blocks?._blocks || {}).some(block => block.opcode === 'pen_clear')),
    null, {timeout: 45000});
    const degraded = await opcodes(page);

    if (aborted === 0) {
        throw new Error(`nothing matched ${CHUNK_LABEL} — the interception never fired, so ` +
            'this run says nothing about a missing chunk. The lazy extension chunks are ' +
            'hashed by splitChunks, not by chunkFilename, so check the emitted names in ' +
            'the build output before widening this pattern.');
    }
    if (!degraded.includes('pen_clear')) {
        throw new Error('a missing music chunk took the pen blocks with it');
    }
    if (pageErrors.length) {
        throw new Error(`a missing chunk reached the page as an uncaught error: ` +
            pageErrors.join(' | '));
    }
    await page.screenshot({path: resolve(artifacts, 'degraded.png'), fullPage: true});
    await writeFile(resolve(artifacts, 'result.json'), JSON.stringify({
        url, chunk: CHUNK_LABEL, aborted, control, degraded, pageErrors
    }, null, 2));
    console.log(`  ok: ${aborted} abort(s) of ${CHUNK_LABEL}; project still opened`);
    console.log(`  note: music_setTempo ${degraded.includes('music_setTempo') ? 'survived' : 'was dropped'} ` +
        '(either is acceptable — the contract is that the PROJECT opens)');
    console.log('Lazy extension degradation: a missing chunk costs its own blocks, not the project.');
    await context.close();
} finally {
    await browser.close();
}
