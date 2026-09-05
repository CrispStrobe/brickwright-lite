#!/usr/bin/env node
// Production-bundle 8086 benchmark, measured at the same pump boundary the UI
// uses. It records repeated desktop, phone-sized and honestly CPU-throttled
// minimum-device runs; thresholds are deliberately limited to catching a machine
// that cannot sustain one quarter of an XT, while raw and statistical JSON
// receipts carry the distributions used for performance work.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {
    attributeReactCommits,
    summarizeI8086Pump,
    summarizeI8086Repetitions,
    summarizeI8086Timeline,
    summarizeReactProfiles
} from './lib/i8086-performance.mjs';
import {auditWebpackResourceWindow} from './lib/webpack-ownership.mjs';

const url = process.env.PROOF_URL || process.env.BW_URL || 'http://localhost:8617/';
const outDir = resolve(process.env.I8086_PERF_ARTIFACTS || 'artifacts/i8086-performance');
const rawDir = resolve(outDir, 'raw');
const requestedRepetitions = Number.parseInt(process.env.I8086_PERF_REPETITIONS || '3', 10);
const repetitions = Number.isFinite(requestedRepetitions) ? Math.max(3, requestedRepetitions) : 3;
const webpackStatsPath = process.env.I8086_WEBPACK_STATS;
const webpackStats = webpackStatsPath ? JSON.parse(await readFile(resolve(webpackStatsPath), 'utf8')) : null;
const profiles = [
    {name: 'desktop', viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, cpuThrottleRate: 1},
    {name: 'mobile', viewport: {width: 412, height: 915}, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, cpuThrottleRate: 1},
    // Honest minimum-device proxy: small touch viewport plus Chromium renderer
    // CPU throttling. This does not claim to emulate RAM, core count or network.
    {name: 'minimum-device-4x', viewport: {width: 360, height: 640}, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, cpuThrottleRate: 4},
];
const percentile = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))];

await mkdir(rawDir, {recursive: true});
const browser = await chromium.launch({headless: true});
const results = [];
const summaries = [];
try {
    for (const profile of profiles) {
        const profileResults = [];
        for (let repetition = 1; repetition <= repetitions; repetition++) {
        const {name, cpuThrottleRate, ...contextOptions} = profile;
        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        let cdp = null;
        try {
        cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', {rate: cpuThrottleRate});
        await page.addInitScript(() => {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
            window.__BW_I8086_PERF__ = {
                samples: [], longTasks: [], reactProfiles: [], reactUpdateSources: [], milestones: [
                    {name: 'probe-installed', at: performance.now()}
                ], limit: 1000, profileLimit: 2000, sourceLimit: 4000
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
        await device.waitFor({state: 'visible', timeout: 30000}); // gate-shapes-allow: synchronization before `device.selectOption` three lines below -- the detector looks at the IMMEDIATELY following statement and sees `mark()`, which is a timestamp rather than a use
        await mark('device-ready');
        await page.waitForLoadState('networkidle', {timeout: 20000}).catch(() => {});
        await mark('dos-load-start');
        await device.selectOption('i8086');
        await mark('i8086-selected');
        // The minimum-width language row overlaps sibling controls visually;
        // dispatch the enabled production control just as the assemble step
        // below does. Setup interaction is outside the measured window.
        await page.getByTestId('bw-lang-row').getByRole('button', {name: /ASM/}).click({force: true});
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
            resources: [...performance.getEntriesByType('navigation'),
                ...performance.getEntriesByType('resource')].map(entry => ({
                name: entry.name,
                kind: entry.entryType === 'navigation' ? 'document' : entry.initiatorType,
                at: entry.startTime,
                ms: entry.duration,
                transferSize: entry.transferSize || 0,
                encodedBodySize: entry.encodedBodySize || 0,
                decodedBodySize: entry.decodedBodySize || 0
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
        const probeInstalledAt = raw.milestones.find(mark => mark.name === 'probe-installed')?.at ?? 0;
        const circuitOpenMilestone = raw.milestones.find(mark => mark.name === 'circuit-open-request');
        if (!circuitOpenMilestone) {
            throw new Error(`${name} #${repetition} lost the pre-Circuit resource boundary`);
        }
        const circuitOpenAt = circuitOpenMilestone.at;
        const dosLoadAt = raw.milestones.find(mark => mark.name === 'dos-load-start')?.at ?? 0;
        const runnerRunningAt = raw.milestones.find(mark => mark.name === 'runner-running')?.at ?? sampleStart;
        const dosLoadResources = webpackStats ? auditWebpackResourceWindow(webpackStats, raw.resources, {
            from: dosLoadAt,
            to: runnerRunningAt,
            origin: new URL(url).origin
        }) : null;
        // The causal window above answers what selection/assembly requested.
        // This cold journey also includes chunks fetched when opening Code;
        // otherwise an eager bw-board barrel looks "absent" merely because it
        // finished downloading before the device picker appeared.
        const dosJourneyResources = webpackStats ? auditWebpackResourceWindow(webpackStats, raw.resources, {
            from: 0,
            to: runnerRunningAt,
            origin: new URL(url).origin
        }) : null;
        // Product gate for the debugger-only Code-tab layout. The existing
        // milestone is recorded immediately before the Circuit click, so this
        // reuses the same cold journey and cannot accidentally charge the
        // designer's intentional post-click load to the deferral verdict.
        const preCircuitResources = webpackStats ? auditWebpackResourceWindow(webpackStats, raw.resources, {
            from: 0,
            to: circuitOpenAt,
            origin: new URL(url).origin
        }) : null;
        const startupAttribution = attributeReactCommits(
            raw.reactProfiles, raw.reactUpdateSources, {from: probeInstalledAt, to: sampleStart});
        const circuitOpenAttribution = attributeReactCommits(
            raw.reactProfiles, raw.reactUpdateSources, {from: circuitOpenAt, to: sampleStart});
        const ratio = simMs / elapsedMs;
        const result = {
            profile: name,
            repetition,
            cpuThrottleRate,
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
            reactAttribution: {
                startup: startupAttribution,
                circuitOpen: circuitOpenAttribution
            },
            dosLoadResources,
            dosJourneyResources,
            preCircuitResources,
            heapBytes: raw.heapBytes,
            userAgent: raw.userAgent,
        };
        results.push(result);
        profileResults.push(result);
        await writeFile(resolve(rawDir, `${name}-${String(repetition).padStart(2, '0')}.json`),
            `${JSON.stringify({
                schema: 'brickwright/i8086-browser-performance-raw/v4',
                url,
                profile: {name, ...contextOptions, cpuThrottleRate},
                repetition,
                raw,
                result
            }, null, 2)}\n`);
        console.log(`${name} #${repetition}: ${ratio.toFixed(2)}x XT, pump p50 `
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
        const startupDesigner = startupAttribution.boundaries.CircuitDesigner;
        if (startupDesigner) console.log(`  React attribution: CircuitDesigner `
            + `${startupDesigner.attributedCommits}/${startupDesigner.commits} startup commits attributed, `
            + `${startupDesigner.unattributedCommits} unknown`);
        const missingProfiles = ['DebugPanel', 'CircuitDesigner', 'BoardCanvas'].filter(id =>
            !raw.reactProfiles.some(sample => sample.id === id));
        if (missingProfiles.length) {
            throw new Error(`${name} #${repetition} profiling build emitted no ${missingProfiles.join(', ')} commits`);
        }
        if (dosLoadResources) {
            console.log(`  DOS load: ${(dosLoadResources.encodedBodyBytes / 1024).toFixed(1)} KiB encoded, ` +
                `${dosLoadResources.assets.length} webpack asset(s), ` +
                `${dosLoadResources.forbiddenModules.length} forbidden module(s)`);
            if (dosLoadResources.unmatchedAssets.length) {
                throw new Error(`${name} #${repetition} DOS load fetched JavaScript absent from webpack stats: ` +
                    dosLoadResources.unmatchedAssets.join(', '));
            }
            if (dosLoadResources.forbiddenModules.length) {
                throw new Error(`${name} #${repetition} DOS load fetched unrelated webpack modules: ` +
                    dosLoadResources.forbiddenModules.map(module =>
                        `${module.reason}: ${module.name}`).join(', '));
            }
        }
        if (dosJourneyResources) {
            console.log(`  cold DOS journey: ${(dosJourneyResources.encodedBodyBytes / 1048576).toFixed(2)} MiB ` +
                `encoded, ${dosJourneyResources.forbiddenModules.length} unrelated module(s)`);
        }
        if (preCircuitResources) {
            const eagerCircuitAssets = preCircuitResources.assets.filter(asset =>
                /(?:^|\/)bw-(?:board|circuit-ui)\.js$/.test(asset));
            const speculativeCompilerAssets = preCircuitResources.assets.filter(asset =>
                /(?:^|\/)sb3-creator\.js$/.test(asset));
            const speculativeExampleAssets = preCircuitResources.assets.filter(asset =>
                /(?:^|\/)pseudocode-examples\.js$/.test(asset));
            console.log(`  pre-Circuit: ${(preCircuitResources.encodedBodyBytes / 1048576).toFixed(2)} MiB ` +
                `encoded, ${eagerCircuitAssets.length} deferred circuit asset(s) and ` +
                `${speculativeCompilerAssets.length} speculative compiler asset(s), ` +
                `${speculativeExampleAssets.length} speculative examples asset(s) fetched early`);
            if (preCircuitResources.unmatchedAssets.length) {
                throw new Error(`${name} #${repetition} pre-Circuit window fetched JavaScript absent ` +
                    `from webpack stats: ${preCircuitResources.unmatchedAssets.join(', ')}`);
            }
            if (eagerCircuitAssets.length) {
                throw new Error(`${name} #${repetition} debugger-only Code layout fetched deferred assets ` +
                    `before Circuit opened: ${eagerCircuitAssets.join(', ')}`);
            }
            if (speculativeCompilerAssets.length) {
                throw new Error(`${name} #${repetition} Code layout fetched the compiler without a ` +
                    `retarget, conversion, compile, or export request: ${speculativeCompilerAssets.join(', ')}`);
            }
            if (speculativeExampleAssets.length) {
                throw new Error(`${name} #${repetition} Code layout fetched bundled examples before ` +
                    `the no-device Tools menu opened: ${speculativeExampleAssets.join(', ')}`);
            }
        }
        for (const [windowName, attribution] of Object.entries(result.reactAttribution)) {
            for (const [id, boundary] of Object.entries(attribution.boundaries)) {
                if (boundary.attributedCommits + boundary.unattributedCommits !== boundary.commits) {
                    throw new Error(`${name} #${repetition} ${windowName}/${id} attribution lost commits`);
                }
            }
        }
        if (samples.length < 150 || ratio < 0.25) {
            throw new Error(`${name} #${repetition} 8086 benchmark did not sustain 0.25x real time`);
        }
        } finally {
            if (cdp) await cdp.detach().catch(() => {});
            await context.close();
        }
        }
        const summary = summarizeI8086Repetitions(profileResults);
        summaries.push({profile: profile.name, cpuThrottleRate: profile.cpuThrottleRate, ...summary});
        console.log(`${profile.name}: ${summary.realTimeRatio.median.toFixed(2)}x XT median `
            + `[${summary.realTimeRatio.min.toFixed(2)}, ${summary.realTimeRatio.max.toFixed(2)}], `
            + `range ${summary.realTimeRatio.range.toFixed(2)} across ${summary.repetitions} repetitions`);
    }
} finally {
    await writeFile(resolve(outDir, 'report.json'), `${JSON.stringify({
        schema: 'brickwright/i8086-browser-performance/v5', url, repetitions, results, summaries,
    }, null, 2)}\n`);
    await browser.close();
}
