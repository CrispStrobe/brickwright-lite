#!/usr/bin/env node
/** Measure first Sounds-tab interactivity; the eager run establishes P17's baseline. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const output = path.resolve('artifacts/sound-tab-activation');
await mkdir(output, {recursive: true});
const {chromium} = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('crash', () => errors.push('renderer crashed'));

try {
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
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.locator('[role="tab"]', {hasText: /Sounds?/i}).first().waitFor({timeout: 60000});
    const startedAt = await page.evaluate(() => performance.now());
    await page.locator('[role="tab"]', {hasText: /Sounds?/i}).first().click();
    await page.waitForFunction(() => {
        const selected = [...document.querySelectorAll('[role="tab"]')]
            .find(tab => /sounds?/i.test(tab.textContent || '') && tab.getAttribute('aria-selected') === 'true');
        const panel = [...document.querySelectorAll('[role="tabpanel"]')]
            .find(item => item.getAttribute('aria-hidden') !== 'true' && item.offsetParent !== null);
        return selected && panel && panel.querySelectorAll('button').length >= 3 &&
            !panel.querySelector('[data-sound-tab-loading], [data-sound-tab-load-error]');
    }, null, {timeout: 30000});
    const receipt = await page.evaluate(start => new Promise(resolve => requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            const readyAt = performance.now();
            const probe = window.__BW_SOUND_TAB_PERF__;
            for (const entry of probe?.observer?.takeRecords?.() || []) {
                probe.longTasks.push({at: entry.startTime, ms: entry.duration});
            }
            const scripts = performance.getEntriesByType('resource')
                .filter(entry => entry.initiatorType === 'script' && entry.startTime >= start)
                .map(entry => ({name: entry.name, startTime: entry.startTime,
                    responseEnd: entry.responseEnd, encodedBodySize: entry.encodedBodySize || 0}));
            resolve({startedAt: start, readyAt, durationMs: readyAt - start,
                longTasks: (probe?.longTasks || []).filter(task => task.at >= start && task.at <= readyAt), scripts});
        })), start));
    receipt.schema = 'brickwright/sound-tab-activation/v1';
    receipt.url = url;
    receipt.errors = errors;
    receipt.soundTabScripts = receipt.scripts.filter(resource => /sound-tab/i.test(resource.name));
    await page.screenshot({path: path.join(output, 'sounds-tab.png'), fullPage: true});
    await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    if (errors.length) throw new Error(errors.join(' | '));
} finally {
    await browser.close();
}
