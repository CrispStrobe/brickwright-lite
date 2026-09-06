#!/usr/bin/env node
/** Measure first Sounds-tab interactivity; the eager run establishes P17's baseline. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const output = path.resolve('artifacts/sound-tab-activation');
const baselineRun = 34051772854;
const baselineMs = 205.5;
const relativeLimitMs = 236.325;
const absoluteLimitMs = 1000;
const maxLongTaskMs = 100;
const minimumEncodedBytes = 20480;
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
    await page.waitForFunction(() => Boolean(
        window.__vm?.editingTarget &&
        window.__brickwrightStore?.getState()?.scratchGui?.targets?.editingTarget
    ), null, {timeout: 60000});
    const startedAt = await page.evaluate(() => performance.now());
    await page.locator('[role="tab"]', {hasText: /Sounds?/i}).first().click();
    await page.locator('button[aria-label="Choose a Sound"]').first().waitFor({timeout: 30000});
    const receipt = await page.evaluate(start => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const readyAt = performance.now();
            const probe = window.__BW_SOUND_TAB_PERF__;
            for (const entry of probe?.observer?.takeRecords?.() || []) {
                probe.longTasks.push({at: entry.startTime, ms: entry.duration});
            }
            const scripts = performance.getEntriesByType('resource')
                .filter(entry => entry.initiatorType === 'script' && entry.startTime >= start)
                .map(entry => ({name: entry.name, startTime: entry.startTime,
                    responseEnd: entry.responseEnd, encodedBodySize: entry.encodedBodySize || 0}));
            const selected = [...document.querySelectorAll('[role="tab"]')]
                .find(tab => /sounds?/i.test(tab.textContent || '') && tab.getAttribute('aria-selected') === 'true');
            const soundControls = [...document.querySelectorAll('button[aria-label]')]
                .filter(button => /^(Choose a Sound|Upload Sound|Surprise|Record|Generate)$/.test(
                    button.getAttribute('aria-label') || ''
                )).length;
            const loadError = document.querySelector('[data-sound-tab-load-error]')?.textContent || null;
            resolve({startedAt: start, readyAt, durationMs: readyAt - start,
                longTasks: (probe?.longTasks || []).filter(task => task.at >= start && task.at <= readyAt), scripts,
                selected: Boolean(selected), soundControls, loadError});
        }));
    }), startedAt);
    receipt.schema = 'brickwright/sound-tab-activation/v1';
    receipt.url = url;
    receipt.errors = errors;
    receipt.soundTabScripts = receipt.scripts.filter(resource => /sound-tab/i.test(resource.name));
    receipt.baselineRun = baselineRun;
    receipt.baselineMs = baselineMs;
    receipt.relativeLimitMs = relativeLimitMs;
    receipt.absoluteLimitMs = absoluteLimitMs;
    receipt.maxLongTaskMs = maxLongTaskMs;
    receipt.minimumEncodedBytes = minimumEncodedBytes;
    await page.screenshot({path: path.join(output, 'sounds-tab.png'), fullPage: true});
    await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    if (errors.length) throw new Error(errors.join(' | '));
    if (receipt.loadError) throw new Error(receipt.loadError);
    if (!receipt.selected || receipt.soundControls < 3) {
        throw new Error(`Sound tab did not render its controls: selected=${receipt.selected}, ` +
            `controls=${receipt.soundControls}`);
    }
    if (receipt.durationMs > relativeLimitMs || receipt.durationMs > absoluteLimitMs) {
        throw new Error(`Sounds tab took ${receipt.durationMs} ms; limits are ${relativeLimitMs} / ${absoluteLimitMs} ms`);
    }
    const longestTask = Math.max(0, ...receipt.longTasks.map(task => task.ms));
    if (longestTask > maxLongTaskMs) {
        throw new Error(`Sounds tab added a ${longestTask} ms long task; limit is ${maxLongTaskMs} ms`);
    }
    if (receipt.soundTabScripts.length !== 1) {
        throw new Error(`expected one named sound-tab script, got ${receipt.soundTabScripts.length}`);
    }
    if (receipt.soundTabScripts[0].encodedBodySize < minimumEncodedBytes) {
        throw new Error(`sound-tab moved only ${receipt.soundTabScripts[0].encodedBodySize} encoded bytes; ` +
            `minimum is ${minimumEncodedBytes}`);
    }
} finally {
    await browser.close();
}
