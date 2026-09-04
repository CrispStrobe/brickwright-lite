#!/usr/bin/env node
// Production-bundle 8086 benchmark, measured at the same pump boundary the UI
// uses. It records desktop and phone-sized viewports; thresholds are deliberately
// limited to catching a machine that cannot sustain one quarter of an XT, while
// the JSON artifact carries the distributions used for performance work.
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const url = process.env.PROOF_URL || process.env.BW_URL || 'http://localhost:8617/';
const outDir = resolve(process.env.I8086_PERF_ARTIFACTS || 'artifacts/i8086-performance');
const profiles = [
    {name: 'desktop', viewport: {width: 1440, height: 900}, deviceScaleFactor: 1},
    {name: 'mobile', viewport: {width: 412, height: 915}, deviceScaleFactor: 2, isMobile: true},
];
const percentile = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))];

await mkdir(outDir, {recursive: true});
const browser = await chromium.launch({headless: true});
const results = [];
try {
    for (const profile of profiles) {
        const context = await browser.newContext(profile);
        const page = await context.newPage();
        await page.addInitScript(() => {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
            window.__BW_I8086_PERF__ = {samples: [], longTasks: [], limit: 1000};
            if (typeof PerformanceObserver === 'function') {
                try {
                    new PerformanceObserver((list) => {
                        for (const e of list.getEntries()) {
                            window.__BW_I8086_PERF__.longTasks.push({at: e.startTime, ms: e.duration});
                        }
                    }).observe({entryTypes: ['longtask']});
                } catch { /* unsupported browsers report an empty list */ }
            }
        });
        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
        await page.getByRole('tab', {name: 'Code', exact: true}).click();
        const device = page.getByTestId('bw-device-select');
        await device.waitFor({state: 'visible', timeout: 30000});
        await device.selectOption('i8086');
        await page.getByTestId('bw-lang-row').getByRole('button', {name: /ASM/}).click();
        const examples = page.getByTestId('bw-asm-examples');
        await examples.waitFor({state: 'visible', timeout: 15000});
        await examples.selectOption('pins');
        // On the phone layout the example picker can overlap this control.
        // Setup is not the subject of this benchmark; dispatch the enabled
        // production button and measure only the resulting machine pump.
        await page.getByTestId('bw-asm-assemble').click({force: true});
        await page.waitForFunction(() => /booting the 8086 bench/.test(
            document.querySelector('[data-testid="bw-code-status"]')?.textContent || ''),
        null, {timeout: 30000});
        await page.getByRole('tab', {name: /Circuit/}).click({force: true});
        await page.waitForFunction(() => window.__BW_I8086_PERF__?.samples?.length >= 180,
            null, {timeout: 30000, polling: 'raf'});
        const raw = await page.evaluate(() => ({
            ...window.__BW_I8086_PERF__,
            heapBytes: performance.memory?.usedJSHeapSize ?? null,
            userAgent: navigator.userAgent,
        }));
        const samples = raw.samples.filter(s => s.simNs > 0);
        const pump = samples.map(s => s.wallMs).sort((a, b) => a - b);
        const simMs = samples.reduce((n, s) => n + s.simNs / 1e6, 0);
        const sampleStart = samples[0].at;
        const sampleEnd = samples.at(-1).at + samples.at(-1).wallMs;
        const elapsedMs = sampleEnd - sampleStart;
        const runtimeLongTasks = raw.longTasks.filter(task =>
            task.at <= sampleEnd && task.at + task.ms >= sampleStart);
        const ratio = simMs / elapsedMs;
        const result = {
            profile: profile.name,
            samples: samples.length,
            simulatedMs: simMs,
            elapsedMs,
            realTimeRatio: ratio,
            pumpMs: {p50: percentile(pump, 0.50), p95: percentile(pump, 0.95), max: pump.at(-1)},
            longTasks: runtimeLongTasks,
            startupLongTaskCount: raw.longTasks.filter(task => task.at + task.ms < sampleStart).length,
            heapBytes: raw.heapBytes,
            userAgent: raw.userAgent,
        };
        results.push(result);
        console.log(`${profile.name}: ${ratio.toFixed(2)}x XT, pump p50 `
            + `${result.pumpMs.p50.toFixed(2)} ms, p95 ${result.pumpMs.p95.toFixed(2)} ms, `
            + `${runtimeLongTasks.length} runtime long task(s)`);
        if (samples.length < 150 || ratio < 0.25) {
            throw new Error(`${profile.name} 8086 benchmark did not sustain 0.25x real time`);
        }
        await context.close();
    }
} finally {
    await writeFile(resolve(outDir, 'report.json'), `${JSON.stringify({
        schema: 'brickwright/i8086-browser-performance/v1', url, results,
    }, null, 2)}\n`);
    await browser.close();
}
