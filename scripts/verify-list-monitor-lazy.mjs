#!/usr/bin/env node
/**
 * Production proof for demand-loading the virtualized body of a large list.
 *
 * LIST_MONITOR_EAGER_BASELINE=1 runs the identical visible-activation probe
 * against the eager implementation. It intentionally records the missing
 * named chunk as a red boundary, but skips the impossible forced-fetch failure
 * rather than waiting for a request that cannot exist.
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

const requireFromGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const JSZip = requireFromGui('jszip');
const url = process.env.PROOF_URL || 'http://localhost:8617/';
const eagerBaseline = process.env.LIST_MONITOR_EAGER_BASELINE === '1';
const acceptedBaselineMs = Number(process.env.LIST_MONITOR_BASELINE_MS || 0);
const relativeLimitMs = acceptedBaselineMs ? acceptedBaselineMs * 1.15 : null;
const absoluteLimitMs = 1000;
const maxLongTaskMs = 100;
const OUT = path.resolve('artifacts/list-monitor-lazy');
const fixturePath = path.join(OUT, 'large-list.sb3');
const LIST_CHUNK = /\/chunks\/list-monitor-body(?:\.[^/?#]+)?\.js(?:[?#]|$)/;
const LIST_ID = 'brickwright_large_list';
const LIST_NAME = 'performance rows';
const ROW_COUNT = 1000;
const values = Array.from({length: ROW_COUNT}, (_, index) =>
    `row-${String(index + 1).padStart(4, '0')}`);

await mkdir(OUT, {recursive: true});
const zip = await JSZip.loadAsync(await readFile(path.resolve(
    'packages/scratch-gui/test/fixtures/project1.sb3')));
const project = JSON.parse(await zip.file('project.json').async('text'));
const stage = project.targets.find(target => target.isStage);
stage.lists[LIST_ID] = [LIST_NAME, values];
project.monitors = [{
    id: LIST_ID,
    mode: 'list',
    opcode: 'data_listcontents',
    params: {LIST: LIST_NAME},
    spriteName: null,
    value: values,
    width: 300,
    height: 300,
    x: 8,
    y: 8,
    visible: true
}];
zip.file('project.json', JSON.stringify(project));
await writeFile(fixturePath, await zip.generateAsync({type: 'nodebuffer'}));

let failed = 0;
const checks = [];
const record = (name, ok, detail = '') => {
    checks.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
};
const receipt = {
    schema: 'brickwright/list-monitor-lazy/v1',
    url,
    eagerBaseline,
    rows: ROW_COUNT,
    acceptedBaselineMs: acceptedBaselineMs || null,
    relativeLimitMs,
    absoluteLimitMs,
    maxLongTaskMs,
    checks
};
const setPhase = phase => {
    receipt.phase = phase;
    console.log(`PHASE: ${phase}`);
};
// The workflow gives this journey a hard wall-clock budget. Preserve the last
// reached phase before coreutils escalates from TERM to KILL, so a hung gate is
// evidence rather than an empty artifact.
process.once('SIGTERM', () => {
    receipt.timedOut = true;
    writeFileSync(path.join(OUT, 'result.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    process.exit(124);
});

const browser = await chromium.launch({headless: true});
const makeSession = async () => {
    const context = await browser.newContext({
        viewport: {width: 1600, height: 1000},
        serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const chunkRequests = [];
    const pageErrors = [];
    page.on('request', request => {
        if (LIST_CHUNK.test(request.url())) chunkRequests.push({url: request.url(), at: Date.now()});
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        // The stage remains mounted under display:none. Importing merely
        // because it mounted is earlier than the first visible list.
        localStorage.setItem('bw-right-pane-hidden', '1');
        const probe = window.__BW_LIST_MONITOR_PERF__ = {longTasks: []};
        if (typeof PerformanceObserver === 'function') {
            try {
                probe.observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        probe.longTasks.push({at: entry.startTime, ms: entry.duration});
                    }
                });
                probe.observer.observe({entryTypes: ['longtask']});
            } catch { /* unsupported browsers retain an empty receipt */ }
        }
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        if (!vm?.runtime) return false;
        window.__vm = vm;
        return true;
    }, null, {timeout: 60000});
    return {context, page, chunkRequests, pageErrors};
};

const loadFixture = async page => {
    await page.getByText('File', {exact: true}).click();
    const chooser = page.waitForEvent('filechooser', {timeout: 30000});
    await page.getByText('Load from your computer', {exact: true}).click();
    await (await chooser).setFiles(fixturePath);
    await page.waitForFunction(({id, count}) => {
        const stageTarget = window.__vm?.runtime?.getTargetForStage?.();
        return stageTarget?.variables?.[id]?.value?.length === count;
    }, {id: LIST_ID, count: ROW_COUNT}, {timeout: 60000});
};

// P14's candidate must use its owned selectors. The pre-P14 eager baseline has
// no such attributes yet, so only explicit baseline mode uses old DOM shape.
const monitorFor = page => eagerBaseline ?
    page.locator('.monitor-overlay .ReactVirtualized__List').first()
        .locator('xpath=ancestor::div[./div[normalize-space(.)="performance rows"]][1]') :
    page.locator(`[data-testid="list-monitor-shell"][data-list-monitor-label="${LIST_NAME}"]`);
// react-virtualized owns the actual scroll element. Scope that one necessary
// implementation selector beneath our product-owned body marker.
const gridFor = monitor => monitor.locator(eagerBaseline ?
    '.ReactVirtualized__List' :
    '[data-testid="list-monitor-scroll-body"] .ReactVirtualized__List').first();
const rowFor = (monitor, index) => monitor.locator(eagerBaseline ?
    `[dataindex="${index}"]` : `[data-list-index="${index}"]`).first();
const valueFor = row => eagerBaseline ? row : row.locator('[dataindex]');
const geometry = monitor => monitor.evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
        cssWidth: style.width,
        cssHeight: style.height,
        box: {x: box.x, y: box.y, width: box.width, height: box.height}
    };
});

const activateAndMeasure = async (page, monitor) => {
    const before = await geometry(monitor);
    const toggle = page.locator('[data-right-pane-toggle]');
    // gate-shapes-allow: synchronization before the aria state, chunk-count,
    // geometry and behavior assertions below; this persistent control must not disappear.
    await toggle.waitFor({state: 'visible', timeout: 15000}); // gate-shapes-allow
    if (await toggle.getAttribute('aria-pressed') !== 'false') {
        throw new Error('right pane was not hidden before first-list activation');
    }
    const startedAt = await page.evaluate(() => performance.now());
    await toggle.click();
    await gridFor(monitor).waitFor({state: 'visible', timeout: 30000});
    await rowFor(monitor, 0).waitFor({state: 'visible', timeout: 30000});
    return page.evaluate(({start, beforeGeometry}) => new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const readyAt = performance.now();
            const probe = window.__BW_LIST_MONITOR_PERF__;
            for (const entry of probe?.observer?.takeRecords?.() || []) {
                probe.longTasks.push({at: entry.startTime, ms: entry.duration});
            }
            resolve({
                startedAt: start,
                readyAt,
                durationMs: readyAt - start,
                beforeGeometry,
                longTasks: (probe?.longTasks || []).filter(task => task.at >= start && task.at < readyAt),
                resources: performance.getEntriesByType('resource')
                    .filter(entry => LIST_CHUNK.test(new URL(entry.name).pathname))
                    .map(entry => ({name: new URL(entry.name).pathname, startTime: entry.startTime,
                        responseEnd: entry.responseEnd, transferSize: entry.transferSize}))
            });
        }))), {start: startedAt, beforeGeometry: before});
};

const exerciseList = async (page, monitor) => {
    const grid = gridFor(monitor);
    const initialRows = await monitor.locator(eagerBaseline ? '[dataindex]' : '[data-list-index]').count();
    const lastInitiallyPresent = await rowFor(monitor, ROW_COUNT - 1).count();
    const scroll = await grid.evaluate(element => {
        const before = {clientHeight: element.clientHeight, scrollHeight: element.scrollHeight};
        element.scrollTop = element.scrollHeight;
        element.dispatchEvent(new Event('scroll', {bubbles: true}));
        return {...before, scrollTop: element.scrollTop};
    });
    const last = rowFor(monitor, ROW_COUNT - 1);
    await last.waitFor({state: 'visible', timeout: 15000});
    const lastText = await valueFor(last).textContent();
    await valueFor(last).click();
    let input = last.locator('input');
    await input.waitFor({state: 'visible', timeout: 15000});
    await input.fill('edited-row-1000');
    await input.press('Enter');
    input = rowFor(monitor, ROW_COUNT).locator('input');
    await input.waitFor({state: 'visible', timeout: 15000});
    await input.fill('temporary-row-1001');
    const semanticRemove = monitor.locator('[data-list-row-remove]').first();
    if (await semanticRemove.count()) {
        await semanticRemove.dispatchEvent('mousedown');
    } else if (eagerBaseline) {
        // P14 adds the owned selector; only the pre-P14 baseline may use the
        // historical sibling relationship.
        await input.locator('xpath=following-sibling::div').dispatchEvent('mousedown');
    } else {
        throw new Error('P14 candidate lacks [data-list-row-remove] on the row remove control');
    }
    await page.waitForFunction(id => {
        const value = window.__vm.runtime.getTargetForStage().variables[id].value;
        return value.length === 1000 && value[999] === 'edited-row-1000';
    }, LIST_ID, {timeout: 15000});
    const model = await page.evaluate(id => {
        const value = window.__vm.runtime.getTargetForStage().variables[id].value;
        return {length: value.length, last: value[value.length - 1]};
    }, LIST_ID);
    return {initialRows, lastInitiallyPresent, scroll, lastText, model};
};

try {
    setPhase('successful-session');
    let session = await makeSession();
    let {context, page, chunkRequests, pageErrors} = session;
    setPhase('successful-fixture');
    await loadFixture(page);
    const monitor = monitorFor(page);
    setPhase('successful-monitor');
    await monitor.waitFor({state: 'attached', timeout: 30000});
    record('a saved list remains lazy while the right pane is hidden', chunkRequests.length === 0,
        chunkRequests.map(item => new URL(item.url).pathname).join(', ') || 'zero requests');
    const state = await page.evaluate(id => {
        const data = window.__brickwrightStore.getState().scratchGui.monitors.get(id);
        return data?.toJS?.() || null;
    }, LIST_ID);
    record('saved monitor position and dimensions reach the GUI unchanged', state?.x === 8 && state?.y === 8 &&
        state?.width === 300 && state?.height === 300, JSON.stringify(state));

    // This assignment deliberately precedes the eager baseline's expected red
    // named-load assertion, preserving the same-probe timing artifact.
    setPhase('successful-activation');
    const activation = await activateAndMeasure(page, monitor);
    activation.afterGeometry = await geometry(monitor);
    receipt.successfulActivation = activation;
    const longestTask = Math.max(0, ...activation.longTasks.map(task => task.ms));
    record('first visible list requests the named body chunk exactly once', chunkRequests.length === 1,
        chunkRequests.map(item => new URL(item.url).pathname).join(', ') || 'eager baseline: no named request');
    record('list activation stays under the absolute and pinned relative limits',
        activation.durationMs <= absoluteLimitMs &&
        (!relativeLimitMs || activation.durationMs <= relativeLimitMs),
        `${activation.durationMs.toFixed(1)} ms; limits ${relativeLimitMs?.toFixed(1) || 'not pinned'} / ` +
        `${absoluteLimitMs} ms`);
    record('list activation adds no task longer than 100 ms', longestTask <= maxLongTaskMs,
        `${activation.longTasks.length} task(s), longest ${longestTask.toFixed(1)} ms`);
    const geometryStable = activation.beforeGeometry.cssWidth === '300px' &&
        activation.beforeGeometry.cssHeight === '300px' && activation.afterGeometry.cssWidth === '300px' &&
        activation.afterGeometry.cssHeight === '300px' && activation.afterGeometry.box.width > 0 &&
        activation.afterGeometry.box.height > 0;
    record('the synchronous monitor shell preserves its saved 300x300 geometry', geometryStable,
        JSON.stringify({before: activation.beforeGeometry, after: activation.afterGeometry}));

    setPhase('successful-behavior');
    const behavior = await exerciseList(page, monitor);
    receipt.behavior = behavior;
    record('the 1,000-row body renders only a bounded window', behavior.initialRows >= 2 &&
        behavior.initialRows < 100 && behavior.lastInitiallyPresent === 0,
        `${behavior.initialRows} initial rows; last initially present=${behavior.lastInitiallyPresent}`);
    record('scroll reaches the correct final row', behavior.scroll.scrollHeight > behavior.scroll.clientHeight &&
        behavior.scroll.scrollTop > 0 && behavior.lastText === values.at(-1),
        `${behavior.lastText}; ${JSON.stringify(behavior.scroll)}`);
    record('editing through the real row controls updates the VM list', behavior.model.length === ROW_COUNT &&
        behavior.model.last === 'edited-row-1000', JSON.stringify(behavior.model));
    record('the successful activation emits no uncaught page errors', pageErrors.length === 0,
        pageErrors.join(' | ') || 'clean');

    setPhase('successful-reopen');
    const toggle = page.locator('[data-right-pane-toggle]');
    await toggle.click();
    await page.waitForFunction(() =>
        document.querySelector('[data-right-pane-toggle]')?.getAttribute('aria-pressed') === 'false');
    await toggle.click();
    await page.waitForFunction(() =>
        document.querySelector('[data-right-pane-toggle]')?.getAttribute('aria-pressed') === 'true');
    await gridFor(monitor).waitFor({state: 'visible', timeout: 15000});
    record('reopening the pane does not duplicate the named chunk request', chunkRequests.length === 1,
        `${chunkRequests.length} request(s)`);
    await page.screenshot({path: path.join(OUT, '01-large-list-edited.png'), fullPage: true});
    await context.close();

    if (eagerBaseline) {
        setPhase('eager-baseline-complete');
        receipt.failureRetry = {skipped: true, reason: 'eager baseline has no chunk request to abort'};
        console.log('BASELINE: forced chunk failure skipped; successfulActivation is preserved above.');
    } else {
        setPhase('failure-session');
        session = await makeSession();
        ({context, page, chunkRequests, pageErrors} = session);
        setPhase('failure-fixture');
        await loadFixture(page);
        const retryMonitor = monitorFor(page);
        await retryMonitor.waitFor({state: 'attached', timeout: 30000});
        record('failure context also stays lazy while hidden', chunkRequests.length === 0);
        let heldRoute;
        let revealHeld;
        const held = new Promise(resolve => { revealHeld = resolve; });
        const holdFirstChunk = async route => {
            if (!heldRoute && LIST_CHUNK.test(route.request().url())) {
                heldRoute = route;
                revealHeld(route);
                return;
            }
            await route.continue();
        };
        await context.route('**/*', holdFirstChunk);
        const firstRequest = page.waitForEvent('request', {
            predicate: request => LIST_CHUNK.test(request.url()), timeout: 30000
        });
        setPhase('failure-held-request');
        await page.locator('[data-right-pane-toggle]').click();
        await firstRequest;
        const route = await held;
        const loading = retryMonitor.locator('[data-testid="list-monitor-body-loading"]');
        await loading.waitFor({state: 'visible', timeout: 15000});
        const loadingGeometry = await geometry(retryMonitor);
        await route.abort('failed');
        await context.unroute('**/*', holdFirstChunk);
        const errorState = retryMonitor.locator('[data-testid="list-monitor-body-retry"]');
        await errorState.waitFor({state: 'visible', timeout: 15000});
        const errorGeometry = await geometry(retryMonitor);
        const unchanged = await page.evaluate(id => {
            const value = window.__vm.runtime.getTargetForStage().variables[id].value;
            return {length: value.length, first: value[0], last: value[value.length - 1]};
        }, LIST_ID);
        record('a failed grid chunk keeps the 300x300 shell and all list data',
            loadingGeometry.cssWidth === '300px' && loadingGeometry.cssHeight === '300px' &&
            errorGeometry.cssWidth === '300px' && errorGeometry.cssHeight === '300px' &&
            unchanged.length === ROW_COUNT && unchanged.first === values[0] && unchanged.last === values.at(-1),
            JSON.stringify({loadingGeometry, errorGeometry, unchanged}));

        const secondRequest = page.waitForEvent('request', {
            predicate: request => LIST_CHUNK.test(request.url()), timeout: 30000
        });
        setPhase('failure-retry');
        await retryMonitor.locator('[data-testid="list-monitor-body-retry"]').click();
        await secondRequest;
        await gridFor(retryMonitor).waitFor({state: 'visible', timeout: 30000});
        await rowFor(retryMonitor, 0).waitFor({state: 'visible', timeout: 30000});
        const retryGeometry = await geometry(retryMonitor);
        record('retry performs one new request and restores the same-size functional list',
            chunkRequests.length === 2 && retryGeometry.cssWidth === errorGeometry.cssWidth &&
            retryGeometry.cssHeight === errorGeometry.cssHeight,
            `${chunkRequests.length} requests; ${JSON.stringify(retryGeometry)}`);
        receipt.failureRetry = {chunkRequests, loadingGeometry, errorGeometry, retryGeometry,
            unchanged, pageErrors};
        await page.screenshot({path: path.join(OUT, '02-failure-retried.png'), fullPage: true});
        await context.close();
    }
} catch (error) {
    receipt.failurePhase = receipt.phase;
    record('the list-monitor browser journey ran to completion', false,
        error?.stack || error?.message || String(error));
} finally {
    setPhase(receipt.timedOut ? receipt.phase : 'complete');
    await writeFile(path.join(OUT, 'result.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    await browser.close();
}

console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'}`);
console.log(`proof: ${OUT}`);
process.exit(failed ? 1 : 0);
