#!/usr/bin/env node
// Production-bundle 8086 benchmark, measured at the same pump boundary the UI
// uses. It records desktop and phone-sized viewports; thresholds are deliberately
// limited to catching a machine that cannot sustain one quarter of an XT, while
// the JSON artifact carries the distributions used for performance work.
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {
    summarizeI8086Pump,
    summarizeI8086Timeline,
    summarizeReactProfiles
} from './lib/i8086-performance.mjs';

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
            window.__BW_I8086_PERF__ = {
                samples: [], longTasks: [], reactProfiles: [], milestones: [
                    {name: 'probe-installed', at: performance.now()}
                ], limit: 1000, profileLimit: 2000
            };
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
        const mark = name => page.evaluate(markName => {
            const probe = window.__BW_I8086_PERF__;
            if (probe) probe.milestones.push({name: markName, at: performance.now()});
        }, name);
        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
        await mark('dom-ready');
        await page.getByRole('tab', {name: 'Code', exact: true}).click();
        const device = page.getByTestId('bw-device-select');
        await device.waitFor({state: 'visible', timeout: 30000});
        await mark('device-ready');
        await device.selectOption('i8086');
        await mark('i8086-selected');
        await page.getByTestId('bw-lang-row').getByRole('button', {name: /ASM/}).click();
        const examples = page.getByTestId('bw-asm-examples');
        await examples.waitFor({state: 'visible', timeout: 15000});
        await mark('asm-ready');
        await examples.selectOption('pins');
        await mark('example-ready');
        // On the phone layout the example picker can overlap this control.
        // Setup is not the subject of this benchmark; dispatch the enabled
        // production button and measure only the resulting machine pump.
        await page.getByTestId('bw-asm-assemble').click({force: true});
        await page.waitForFunction(() => /booting the 8086 bench/.test(
            document.querySelector('[data-testid="bw-code-status"]')?.textContent || ''),
        null, {timeout: 30000});
        await mark('bench-booted');
        await page.locator('[data-debug-panel][data-debug-phase="running"]')
            .waitFor({state: 'attached', timeout: 30000});
        await mark('runner-running');
        await mark('circuit-open-request');
        await page.getByRole('tab', {name: /Circuit/}).click({force: true});
        await page.locator('[data-debug-panel]').waitFor({state: 'visible', timeout: 30000}); // gate-shapes-allow: synchronization before the measured two-frame paint boundary below; this persistent panel must not disappear
        // The click promise ends after the event handler, not after React's
        // commit and paint. Two frames put the sample window on the far side
        // of the first visible Circuit render instead of quietly charging
        // that setup task to steady execution.
        await page.evaluate(() => new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await mark('steady-window-ready');
        const steadyBaseline = await page.evaluate(() => window.__BW_I8086_PERF__?.samples?.length || 0);
        await page.waitForFunction(baseline =>
            window.__BW_I8086_PERF__?.samples?.length >= baseline + 180,
        steadyBaseline, {timeout: 30000, polling: 'raf'});
        const raw = await page.evaluate(() => ({
            ...window.__BW_I8086_PERF__,
            heapBytes: performance.memory?.usedJSHeapSize ?? null,
            userAgent: navigator.userAgent,
            resources: performance.getEntriesByType('resource').map(entry => ({
                name: entry.name,
                kind: entry.initiatorType,
                at: entry.startTime,
                ms: entry.duration,
                bytes: entry.transferSize || 0
            }))
        }));
        const steadyAt = raw.milestones.find(mark => mark.name === 'steady-window-ready')?.at ?? 0;
        const samples = raw.samples.filter(s => s.simNs > 0 && s.at >= steadyAt);
        const pump = samples.map(s => s.wallMs).sort((a, b) => a - b);
        const simMs = samples.reduce((n, s) => n + s.simNs / 1e6, 0);
        const sampleStart = samples[0].at;
        const sampleEnd = samples.at(-1).at + samples.at(-1).wallMs;
        const elapsedMs = sampleEnd - sampleStart;
        const runtimeLongTasks = raw.longTasks.filter(task =>
            task.at <= sampleEnd && task.at + task.ms >= sampleStart);
        const steadyLongTasks = raw.longTasks.filter(task =>
            task.at >= sampleStart && task.at < sampleEnd);
        const startupProfiles = raw.reactProfiles.filter(sample => sample.commitTime < sampleStart);
        const runtimeProfiles = raw.reactProfiles.filter(sample =>
            sample.commitTime >= sampleStart && sample.commitTime <= sampleEnd);
        const timeline = summarizeI8086Timeline({
            milestones: raw.milestones,
            longTasks: raw.longTasks,
            resources: raw.resources,
            sampleStart,
            sampleEnd
        });
        const ratio = simMs / elapsedMs;
        const result = {
            profile: profile.name,
            samples: samples.length,
            simulatedMs: simMs,
            elapsedMs,
            realTimeRatio: ratio,
            pumpMs: {p50: percentile(pump, 0.50), p95: percentile(pump, 0.95), max: pump.at(-1)},
            pumpBreakdown: summarizeI8086Pump(samples),
            longTasks: runtimeLongTasks,
            steadyLongTasks,
            setupTimeline: timeline,
            startupLongTaskCount: raw.longTasks.filter(task => task.at + task.ms < sampleStart).length,
            reactProfiles: {
                startup: summarizeReactProfiles(startupProfiles),
                runtime: summarizeReactProfiles(runtimeProfiles),
                all: summarizeReactProfiles(raw.reactProfiles)
            },
            heapBytes: raw.heapBytes,
            userAgent: raw.userAgent,
        };
        results.push(result);
        console.log(`${profile.name}: ${ratio.toFixed(2)}x XT, pump p50 `
            + `${result.pumpMs.p50.toFixed(2)} ms, p95 ${result.pumpMs.p95.toFixed(2)} ms, `
            + `${runtimeLongTasks.length} runtime long task(s)`);
        console.log(`  long tasks: ${steadyLongTasks.length} started during steady pump, `
            + `${timeline.boundaryCrossingLongTasks.length} crossed into it from setup`);
        console.log(`  setup ownership: ${timeline.phases
            .filter(phase => phase.name !== 'steady-pump' && phase.longTasksStarted)
            .map(phase => `${phase.name}=${phase.longTasksStarted}`)
            .join(', ') || 'no setup long tasks'}`);
        console.log(`  pump CPU: run ${result.pumpBreakdown.phases.runMs.percentOfPump.toFixed(1)}%, `
            + `board ${result.pumpBreakdown.phases.boardMs.percentOfPump.toFixed(1)}%, `
            + `publish ${result.pumpBreakdown.phases.publishMs.percentOfPump.toFixed(1)}%; `
            + `${result.pumpBreakdown.snapshots.built}/${samples.length} snapshots built`);
        const missingProfiles = ['DebugPanel', 'CircuitDesigner'].filter(id =>
            !raw.reactProfiles.some(sample => sample.id === id));
        if (missingProfiles.length) {
            throw new Error(`${profile.name} profiling build emitted no ${missingProfiles.join(', ')} commits`);
        }
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
