#!/usr/bin/env node
/** P21: five cold Code-tab activations; first run pins the unchanged eager baseline. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {validatePseudocodeActivationReceipt} from './lib/p21-pseudocode-probe.mjs';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const output = path.resolve(process.env.P21_RECEIPT_DIR || 'artifacts/pseudocode-importer-activation');
const eagerBaseline = process.env.P21_EAGER_BASELINE === '1';
const run = Number(process.env.GITHUB_RUN_ID || 0);
const headSha = process.env.GITHUB_SHA || '';
const absoluteLimitMs = 1000;
const maxLongTaskMs = 100;
const baseline = {
    run: 34061190255,
    headSha: '513237241a68dd374a7e3040a2f73cab4e89c347',
    medianMs: 129.2
};
// The eager five-sample range was 124–153 ms. Permit the observed median plus
// one bounded 150 ms network/evaluation interval; the independent 1 s and
// 100 ms long-task ceilings still catch a stalled or blocking first gesture.
const relativeLimitMs = 279.2;

const receipt = {
    schema: 'brickwright/p21-pseudocode-activation/v1',
    mode: eagerBaseline ? 'eager-baseline' : 'lazy-candidate',
    run,
    headSha,
    url,
    absoluteLimitMs,
    maxLongTaskMs,
    samples: [],
    medianMs: null,
    ...(eagerBaseline ? {} : {baseline, relativeLimitMs, scenarios: null}),
    terminal: {ok: false, stage: 'initialize', message: null}
};
let browser = null;
let terminalError = null;
let terminalStage = 'prepare-output';
const closeWithTimeout = async (target, label) => {
    let timer;
    try {
        await Promise.race([
            target.close(),
            new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`timed out closing ${label}`)), 10000);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
};
try {
    await mkdir(output, {recursive: true});
    terminalStage = 'import-playwright';
    const playwrightModule = process.env.P21_PLAYWRIGHT_MODULE || 'playwright';
    const {chromium} = await import(playwrightModule);
    terminalStage = 'launch-browser';
    browser = await chromium.launch();

    for (let index = 0; index < 5; index++) {
        let context = null;
        terminalStage = `sample-${index + 1}-context`;
        try {
            context = await browser.newContext({viewport: {width: 1600, height: 1000}});
            const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    let stage = 'initialize';
    let failure = null;
    let startedAt = null;
    let panelId = null;
    let beforePseudocodeScripts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('crash', () => errors.push('renderer crashed'));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    try {
        await page.addInitScript(() => {
            try {
                localStorage.clear();
                localStorage.setItem('bw-starter-v1-complete', '1');
            } catch { /* private mode */ }
            const probe = window.__BW_P21_CODE_PERF__ = {longTasks: []};
            try {
                probe.observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        probe.longTasks.push({at: entry.startTime, ms: entry.duration});
                    }
                });
                probe.observer.observe({entryTypes: ['longtask']});
            } catch { /* retain an empty receipt when unsupported */ }
        });
        stage = 'navigate';
        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
        stage = 'await-target';
        await page.waitForFunction(() => Boolean(
            window.__brickwrightStore?.getState()?.scratchGui?.targets?.editingTarget
        ), null, {timeout: 60000});
        stage = 'bind-tab';
        const tab = page.locator('[role="tab"]:visible').filter({hasText: /^Code$/});
        await tab.waitFor({timeout: 30000});
        if (await tab.count() !== 1) throw new Error(`expected one visible exact Code tab, got ${await tab.count()}`);
        panelId = await tab.getAttribute('aria-controls');
        if (!panelId) throw new Error('visible Code tab has no aria-controls');
        // Bind by id without interpolating it into a selector: React Tabs ids may contain punctuation.
        const panelIndex = await page.locator('[role="tabpanel"]').evaluateAll(
            (nodes, id) => nodes.findIndex(node => node.id === id), panelId);
        if (panelIndex < 0) throw new Error(`Code panel ${JSON.stringify(panelId)} is missing`);
        const boundPanel = page.locator('[role="tabpanel"]').nth(panelIndex);
        await boundPanel.waitFor({state: 'attached'});
        beforePseudocodeScripts = await page.evaluate(() => performance.getEntriesByType('resource')
            .filter(entry => entry.initiatorType === 'script' && /pseudocode-importer/i.test(entry.name))
            .map(entry => ({name: entry.name, encodedBodySize: entry.encodedBodySize || 0})));
        startedAt = await page.evaluate(() => performance.now());
        stage = 'activate';
        await tab.click();
        await boundPanel.locator('textarea:visible, .cm-editor:visible').first().waitFor({timeout: 30000});
    } catch (error) {
        failure = {stage, message: String(error?.message || error)};
    }
    let diagnostic;
    try {
        diagnostic = await page.evaluate(({start, id, before}) => new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const readyAt = performance.now();
                const probe = window.__BW_P21_CODE_PERF__;
                for (const entry of probe?.observer?.takeRecords?.() || []) {
                    probe.longTasks.push({at: entry.startTime, ms: entry.duration});
                }
                const scripts = performance.getEntriesByType('resource')
                    .filter(entry => entry.initiatorType === 'script' && (start === null || entry.startTime >= start))
                    .map(entry => ({name: entry.name, encodedBodySize: entry.encodedBodySize || 0,
                        startTime: entry.startTime, responseEnd: entry.responseEnd}));
                const tabNode = id ? [...document.querySelectorAll('[role="tab"]')]
                    .find(node => node.getAttribute('aria-controls') === id) : null;
                const panelNode = id ? document.getElementById(id) : null;
                const textarea = panelNode?.querySelector('textarea');
                const codemirror = panelNode?.querySelector('.cm-editor');
                resolve({
                    durationMs: start === null ? null : readyAt - start,
                    longTasks: (probe?.longTasks || []).filter(task => start !== null && task.at >= start && task.at <= readyAt),
                    scripts,
                    beforePseudocodeScripts: before,
                    pseudocodeScripts: scripts.filter(script => /pseudocode-importer/i.test(script.name)),
                    tab: {visible: Boolean(tabNode?.getClientRects().length), exactName: tabNode?.textContent?.trim() === 'Code',
                        ariaControls: id},
                    panel: {id: panelNode?.id || null, selected: tabNode?.getAttribute('aria-selected') === 'true'},
                    editorKind: codemirror?.getClientRects().length ? 'codemirror' :
                        textarea?.getClientRects().length ? 'textarea' : null
                });
            }));
        }), {start: startedAt, id: panelId, before: beforePseudocodeScripts});
    } catch (error) {
        diagnostic = {durationMs: null, longTasks: [], scripts: [], beforePseudocodeScripts, pseudocodeScripts: [],
            tab: {visible: false, exactName: false, ariaControls: panelId},
            panel: {id: null, selected: false}, editorKind: null,
            diagnosticError: String(error?.message || error)};
    }
            receipt.samples.push({...diagnostic, errors, consoleErrors, failure});
        } finally {
            if (context) await closeWithTimeout(context, `sample ${index + 1} context`);
        }
    }

const waitFor = async (promise, label) => {
    let timer;
    try {
        return await Promise.race([promise, new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), 10000);
        })]);
    } finally {
        clearTimeout(timer);
    }
};

const prepareCandidatePage = async (storage = {}) => {
    // Network fault scenarios must bypass the production service worker so
    // Playwright can hold or abort the lazy script request deterministically.
    const context = await browser.newContext({
        viewport: {width: 1600, height: 1000},
        serviceWorkers: 'block'
    });
    try {
        const page = await context.newPage();
        await page.addInitScript(values => {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
            for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
        }, storage);
        const bind = async () => {
            await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
            await page.waitForFunction(() => Boolean(
                window.__brickwrightStore?.getState()?.scratchGui?.targets?.editingTarget
            ), null, {timeout: 60000});
            const tab = page.locator('[role="tab"]:visible').filter({hasText: /^Code$/});
            await tab.waitFor({timeout: 30000});
            const panelId = await tab.getAttribute('aria-controls');
            const panelIndex = await page.locator('[role="tabpanel"]').evaluateAll(
                (nodes, id) => nodes.findIndex(node => node.id === id), panelId);
            if (panelIndex < 0) throw new Error(`Code panel ${JSON.stringify(panelId)} is missing`);
            return {tab, panel: page.locator('[role="tabpanel"]').nth(panelIndex)};
        };
        return {context, page, bind};
    } catch (error) {
        try {
            await closeWithTimeout(context, 'candidate setup context');
        } catch { /* preserve the setup error in the terminal receipt */ }
        throw error;
    }
};

const scenario = async (label, storage, operation) => {
    let prepared = null;
    let result;
    terminalStage = `scenario-${label}`;
    try {
        prepared = await prepareCandidatePage(storage);
        result = await operation(prepared);
    } catch (error) {
        result = {failure: `${label}: ${String(error?.message || error)}`};
    } finally {
        if (prepared?.context) {
            try {
                await closeWithTimeout(prepared.context, `${label} context`);
            } catch (error) {
                result = {failure: `${label} close: ${String(error?.message || error)}`};
            }
        }
    }
    return result;
};

let scenarios = null;
if (!eagerBaseline) {
    const delay = await scenario('delay', {}, async prepared => {
        const {page} = prepared;
        let requestCount = 0;
        let release;
        let announce;
        const released = new Promise(resolve => { release = resolve; });
        const requested = new Promise(resolve => { announce = resolve; });
        await page.route(/pseudocode-importer.*\.js(?:\?|$)/, async route => {
            requestCount += 1;
            announce();
            await released;
            await route.continue();
        });
        try {
            const {tab, panel} = await prepared.bind();
            await tab.evaluate(node => node.click());
            await waitFor(requested, 'held pseudocode-importer request');
            const loadingVisible = await panel.locator('[data-pseudocode-importer-loading]').isVisible();
            const editorBeforeRelease = await panel.locator('[data-testid="bw-code-editor"]').isVisible();
            release();
            await panel.locator('[data-testid="bw-code-editor"]').waitFor({timeout: 30000});
            return {loadingVisible, editorBeforeRelease, usable: true, requestCount};
        } finally {
            release();
        }
    });
    const retry = await scenario('retry', {}, async prepared => {
        const {page} = prepared;
        let requestCount = 0;
        await page.route(/pseudocode-importer.*\.js(?:\?|$)/, route => {
            requestCount += 1;
            return requestCount === 1 ? route.abort('failed') : route.continue();
        });
        const {tab, panel} = await prepared.bind();
        await tab.evaluate(node => node.click());
        await panel.locator('[data-pseudocode-importer-load-error]').waitFor({timeout: 10000});
        const errorVisible = await panel.locator('[data-pseudocode-importer-load-error]').isVisible();
        await panel.getByRole('button', {name: 'Retry code editor'}).click();
        await panel.locator('[data-testid="bw-code-editor"]').waitFor({timeout: 30000});
        return {errorVisible, usable: true, requestCount};
    });
    const presetLayout = JSON.stringify({
        left: {upper: 'blocks-palette', lower: null, size: 'xs'},
        middle: {upper: 'code', lower: null, size: 'xl'},
        right: {upper: 'stage', lower: 'sprites', size: 's'},
        activePreset: 'code'
    });
    const preset = await scenario('preset', {'bw-pane-layout': presetLayout}, async prepared => {
        const {page} = prepared;
        let requestCount = 0;
        page.on('request', request => {
            if (/pseudocode-importer.*\.js(?:\?|$)/.test(request.url())) requestCount += 1;
        });
        await prepared.bind();
        await page.locator('[data-testid="bw-code-editor"]:visible').waitFor({timeout: 30000});
        const editorCount = await page.locator('[data-testid="bw-code-editor"]').count();
        return {usable: true, editorCount, requestCount};
    });
    const stateValue = (kind, marker) => scenario(kind,
        kind === 'autosave' ? {'bw-code-autosave': JSON.stringify({lang: 'pseudocode', code: marker})} : {},
        async prepared => {
            const {page} = prepared;
            const {tab, panel} = await prepared.bind();
            if (kind === 'bundle') {
                await page.evaluate(code => {
                    localStorage.setItem('bw-code-autosave', JSON.stringify({lang: 'pseudocode', code}));
                    window.dispatchEvent(new CustomEvent('bw-project-bundle-loaded', {detail: {outcome: 'loaded', version: 2}}));
                }, marker);
            } else if (kind === 'circuit') {
                await page.evaluate(code => {
                    const vm = window.__brickwrightStore.getState().scratchGui.vm;
                    vm.runtime.bwPseudocodeSource = code;
                    vm.runtime.emit('PROJECT_CHANGED');
                }, marker);
            }
            await tab.evaluate(node => node.click());
            await panel.locator('[data-testid="bw-code-editor"]').waitFor({timeout: 30000});
            await page.waitForFunction(code => {
                const root = document.querySelector('[data-testid="bw-code-editor"]');
                return (root?.querySelector('textarea')?.value || root?.querySelector('.cm-content')?.textContent || '').includes(code);
            }, marker, {timeout: 10000});
            return true;
        });
    scenarios = {
        delay,
        retry,
        preset,
        state: {
            autosave: await stateValue('autosave', 'P21 AUTOSAVE MARKER'),
            bundle: await stateValue('bundle', 'P21 BUNDLE MARKER'),
            circuit: await stateValue('circuit', 'P21 CIRCUIT MARKER')
        }
    };
}

    const durations = receipt.samples.map(sample => sample.durationMs).slice().sort((a, b) => a - b);
    receipt.medianMs = durations[2] ?? null;
    if (!eagerBaseline) receipt.scenarios = scenarios;
    terminalStage = 'validate-receipt';
    const failures = validatePseudocodeActivationReceipt(receipt);
    if (failures.length) throw new Error(failures.join(' | '));
    receipt.terminal = {ok: true, stage: 'complete', message: null};
} catch (error) {
    terminalError = error;
    receipt.terminal = {ok: false, stage: terminalStage, message: String(error?.message || error)};
} finally {
    if (browser) {
        try {
            await closeWithTimeout(browser, 'browser');
        } catch (error) {
            if (!terminalError) {
                terminalError = error;
                receipt.terminal = {ok: false, stage: 'close-browser', message: String(error?.message || error)};
            }
        }
    }
    await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
}
if (terminalError) throw terminalError;
