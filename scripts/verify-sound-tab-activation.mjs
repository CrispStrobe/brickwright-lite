#!/usr/bin/env node
/** Measure first Sounds-tab interactivity; the eager run establishes P17's baseline. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateSoundTabReceipt} from './lib/sound-tab-probe.mjs';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const output = path.resolve('artifacts/sound-tab-activation');
const baselineRun = 34055140364;
const baselineMs = 113.6;
const relativeLimitMs = 130.64;
const absoluteLimitMs = 1000;
const maxLongTaskMs = 100;
const minimumEncodedBytes = 20480;
await mkdir(output, {recursive: true});
let browser = null;
let page = null;
const errors = [];
const consoleErrors = [];
let stage = 'launch';
let startedAt = null;
let tab = null;
let panel = null;
let failure = null;

try {
    stage = 'import-playwright';
    const {chromium} = await import('playwright');
    stage = 'launch';
    browser = await chromium.launch();
    stage = 'new-page';
    page = await browser.newPage({viewport: {width: 1600, height: 1000}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('crash', () => errors.push('renderer crashed'));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    stage = 'initialize';
    await page.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
        } catch { /* private mode */ }
        const probe = window.__BW_SOUND_TAB_PERF__ = {longTasks: []};
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
    stage = 'bind-tab';
    tab = page.locator('[role="tab"]:visible').filter({hasText: /^Sounds?$/i});
    await tab.waitFor({timeout: 60000});
    if (await tab.count() !== 1) throw new Error(`expected one visible exact Sound tab, got ${await tab.count()}`);
    const panelId = await tab.getAttribute('aria-controls');
    if (!panelId) throw new Error('visible Sound tab has no aria-controls');
    const panels = page.locator('[role="tabpanel"]');
    const panelIndex = await panels.evaluateAll((nodes, id) => nodes.findIndex(node => node.id === id), panelId);
    if (panelIndex < 0) throw new Error(`Sound panel ${JSON.stringify(panelId)} is missing`);
    panel = panels.nth(panelIndex);
    await panel.waitFor({state: 'attached'});
    stage = 'await-target';
    await page.waitForFunction(() => Boolean(
        window.__brickwrightStore?.getState()?.scratchGui?.targets?.editingTarget
    ), null, {timeout: 60000});
    startedAt = await page.evaluate(() => performance.now());
    stage = 'activate';
    await tab.click();
    // Scratch's action menu intentionally renders a main button and a menu
    // arrow with the same accessible name. Either proves this exact panel is
    // interactive; bind the first within the already unique controlled panel.
    await panel.locator('button[aria-label="Choose a Sound"]').first().waitFor({timeout: 30000});
    stage = 'settle';
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
} catch (error) {
    failure = {stage, message: String(error?.message || error)};
} finally {
    let receipt;
    try {
        if (!page) throw new Error('browser page was not created');
        receipt = await page.evaluate(({start, panelId}) => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const readyAt = performance.now();
            const probe = window.__BW_SOUND_TAB_PERF__;
            for (const entry of probe?.observer?.takeRecords?.() || []) {
                probe.longTasks.push({at: entry.startTime, ms: entry.duration});
            }
            const scripts = performance.getEntriesByType('resource')
                .filter(entry => entry.initiatorType === 'script' && (start === null || entry.startTime >= start))
                .map(entry => ({name: entry.name, startTime: entry.startTime,
                    responseEnd: entry.responseEnd, encodedBodySize: entry.encodedBodySize || 0}));
            const tabNode = panelId ? document.querySelector(`[role="tab"][aria-controls="${panelId}"]`) : null;
            const panelNode = panelId ? document.getElementById(panelId) : null;
            const soundControls = [...(panelNode?.querySelectorAll('button[aria-label]') || [])]
                .filter(button => /^(Choose a Sound|Upload Sound|Surprise|Record|Generate)$/.test(
                    button.getAttribute('aria-label') || ''
                )).length;
            const loadError = panelNode?.querySelector('[data-sound-tab-load-error]')?.textContent || null;
            const state = window.__brickwrightStore?.getState()?.scratchGui;
            resolve({startedAt: start, readyAt, durationMs: start === null ? null : readyAt - start,
                longTasks: (probe?.longTasks || []).filter(task => task.at >= start && task.at <= readyAt), scripts,
                tab: {visible: Boolean(tabNode?.getClientRects().length),
                    exactName: /^Sounds?$/i.test(tabNode?.textContent?.trim() || ''),
                    ariaControls: panelId},
                panel: {id: panelNode?.id || null, selected: tabNode?.getAttribute('aria-selected') === 'true', soundControls},
                loadError, visibleTabs: [...document.querySelectorAll('[role="tab"]')]
                    .filter(node => node.getClientRects().length).map(node => node.textContent?.trim()),
                loading: Boolean(panelNode?.querySelector('[data-sound-tab-loading]')),
                vmTarget: state?.vm?.editingTarget?.id || null,
                reduxTarget: state?.targets?.editingTarget || null,
                activeTabIndex: state?.editorTab?.activeTabIndex ?? null,
                ariaLabels: [...document.querySelectorAll('[aria-label]')]
                    .map(element => element.getAttribute('aria-label')).filter(Boolean)});
        }));
        }), {start: startedAt, panelId: panel ? await panel.getAttribute('id') : null});
    } catch (diagnosticError) {
        receipt = {startedAt, readyAt: null, durationMs: null, longTasks: [], scripts: [],
            tab: {visible: false, exactName: false, ariaControls: null},
            panel: {id: null, selected: false, soundControls: 0}, loadError: null, visibleTabs: [],
            diagnosticError: String(diagnosticError?.message || diagnosticError)};
    }
    receipt.schema = 'brickwright/sound-tab-activation/v1';
    receipt.url = url;
    receipt.errors = errors;
    receipt.consoleErrors = consoleErrors;
    receipt.failure = failure;
    receipt.soundTabScripts = receipt.scripts.filter(resource => /sound-tab/i.test(resource.name));
    receipt.causalEncodedBytes = receipt.scripts.reduce((sum, resource) => sum + resource.encodedBodySize, 0);
    receipt.baselineRun = baselineRun;
    receipt.baselineMs = baselineMs;
    receipt.relativeLimitMs = relativeLimitMs;
    receipt.absoluteLimitMs = absoluteLimitMs;
    receipt.maxLongTaskMs = maxLongTaskMs;
    receipt.minimumEncodedBytes = minimumEncodedBytes;
    if (page) await page.screenshot({path: path.join(output, 'sounds-tab.png'), fullPage: true}).catch(() => {});
    await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    const failures = validateSoundTabReceipt(receipt);
    if (browser) await browser.close();
    if (failures.length) throw new Error(failures.join(' | '));
}
