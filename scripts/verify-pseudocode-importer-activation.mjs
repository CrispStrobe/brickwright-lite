#!/usr/bin/env node
/** P21: five cold Code-tab activations; first run pins the unchanged eager baseline. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {validatePseudocodeActivationReceipt} from './lib/p21-pseudocode-probe.mjs';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const output = path.resolve('artifacts/pseudocode-importer-activation');
const eagerBaseline = process.env.P21_EAGER_BASELINE === '1';
if (!eagerBaseline) throw new Error('P21 candidate mode is not enabled until the eager receipt is reviewed');
const run = Number(process.env.GITHUB_RUN_ID || 0);
const headSha = process.env.GITHUB_SHA || '';
const absoluteLimitMs = 1000;
const maxLongTaskMs = 100;
await mkdir(output, {recursive: true});

const {chromium} = await import('playwright');
const browser = await chromium.launch();
const samples = [];

for (let index = 0; index < 5; index++) {
    const context = await browser.newContext({viewport: {width: 1600, height: 1000}});
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    let stage = 'initialize';
    let failure = null;
    let startedAt = null;
    let panelId = null;
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
        startedAt = await page.evaluate(() => performance.now());
        stage = 'activate';
        await tab.click();
        await boundPanel.locator('textarea:visible, .cm-editor:visible').first().waitFor({timeout: 30000});
    } catch (error) {
        failure = {stage, message: String(error?.message || error)};
    }
    let diagnostic;
    try {
        diagnostic = await page.evaluate(({start, id}) => new Promise(resolve => {
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
                    pseudocodeScripts: scripts.filter(script => /pseudocode-importer/i.test(script.name)),
                    tab: {visible: Boolean(tabNode?.getClientRects().length), exactName: tabNode?.textContent?.trim() === 'Code',
                        ariaControls: id},
                    panel: {id: panelNode?.id || null, selected: tabNode?.getAttribute('aria-selected') === 'true'},
                    editorKind: codemirror?.getClientRects().length ? 'codemirror' :
                        textarea?.getClientRects().length ? 'textarea' : null
                });
            }));
        }), {start: startedAt, id: panelId});
    } catch (error) {
        diagnostic = {durationMs: null, longTasks: [], scripts: [], pseudocodeScripts: [],
            tab: {visible: false, exactName: false, ariaControls: panelId},
            panel: {id: null, selected: false}, editorKind: null,
            diagnosticError: String(error?.message || error)};
    }
    samples.push({...diagnostic, errors, consoleErrors, failure});
    await context.close();
}

await browser.close();
const durations = samples.map(sample => sample.durationMs).slice().sort((a, b) => a - b);
const receipt = {
    schema: 'brickwright/p21-pseudocode-activation/v1',
    mode: 'eager-baseline',
    run,
    headSha,
    url,
    absoluteLimitMs,
    maxLongTaskMs,
    samples,
    medianMs: durations[2]
};
await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
const failures = validatePseudocodeActivationReceipt(receipt);
if (failures.length) throw new Error(failures.join(' | '));
