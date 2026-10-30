// Original side: the pinned PXT Arcade simulator in headless Chromium, stepped
// on a paused fake clock so that sample k is observed at exactly t_k simulated
// milliseconds. Inputs are applied between samples (the input grid), never
// inside a frame, on both sides.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {compile, STATIC} from '../pxt-node.mjs';
import {preparePxtInitialClock, assertPxtInitialClock, bootstrapPxtProfilerClock} from '../../../test/helpers/pxt-initial-clock.mjs';
import {PXT_BUTTON} from './script.mjs';
import {PXT_SNAPSHOT_SOURCE} from './pxt-snapshot.mjs';
import {sampleTimes} from './script.mjs';
import {packSamples} from './compare.mjs';

export const PRNG_SOURCE = `(seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })`;

/**
 * Record `source` once per schedule, in one browser, with a fresh simulator
 * context per schedule. `onResult(name, result)` receives each finished run.
 * Guest errors are data in the result; this never throws for them.
 */
export async function recordOriginal(source, schedules, {seconds, fps = 30, seed = 1, entropy = 'sequence', files = null, dependencies = {device: '*'}, globalsOf = []}, onResult) {
    const projectFiles = files || {'main.ts': source, 'pxt.json': JSON.stringify({name: 'bw-differential', dependencies, files: ['main.ts']})};
    const built = await compile('arcade', projectFiles);
    if (!built.success) {
        const diagnostics = built.diagnostics.slice(0, 5).map(d => `${d.file}:${d.line + 1}: ${d.message}`);
        for (const schedule of schedules) await onResult(schedule.name, {status: 'compile-error', diagnostics, samples: []});
        return;
    }
    const root = path.join(STATIC, 'arcade/sim');
    const server = createServer(async (req, res) => {
        try {
            const name = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
            if (!name.startsWith(root + path.sep)) throw new Error('outside simulator root');
            const bytes = await fs.promises.readFile(name);
            res.writeHead(200, {'content-type': path.extname(name) === '.js' ? 'text/javascript' : path.extname(name) === '.html' ? 'text/html' : 'application/octet-stream'});
            res.end(bytes);
        } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    let browser;
    try {
        browser = await chromium.launch(process.env.BW_PXT_CLOCK_BROWSER_EXECUTABLE ? {executablePath: process.env.BW_PXT_CLOCK_BROWSER_EXECUTABLE} : {});
        for (const schedule of schedules) {
            let result;
            try { result = await recordOne(browser, server.address().port, built.outfiles['binary.js'], schedule, {seconds, fps, seed, entropy, globalsOf}); }
            catch (e) { result = {status: 'error', error: String(e?.message || e).slice(0, 500), samples: []}; }
            await onResult(schedule.name, result);
        }
    } finally { try { await browser?.close(); } catch { /* the watchdog also reaps the tree */ } await new Promise(done => server.close(done)); }
}

async function recordOne(browser, port, code, schedule, {seconds, fps, seed, entropy, globalsOf}) {
    const context = await browser.newContext();
    try {
        await preparePxtInitialClock(context);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error.message).slice(0, 500)));
        await page.goto(`http://127.0.0.1:${port}/simulator.html`);
        await assertPxtInitialClock(page);
        await bootstrapPxtProfilerClock(page);
        await page.evaluate(({code, seed, entropy, prng, snapshotSource}) => {
            pxsim.AudioContextManager.mute(true);
            Math.random = entropy === 'constant' ? () => 0.5 : (0, eval)(prng)(seed);
            window.__bwSnapshot = (0, eval)(snapshotSource);
            const msg = {type: 'run', id: 'bw-differential', code, options: {}, mute: true};
            const runtime = new pxsim.Runtime(msg); window.__bwPxtRuntime = runtime;
            return runtime.board.initAsync(msg).then(() => runtime.run(() => { window.__bwPxtDone = true; }));
        }, {code, seed, entropy, prng: PRNG_SOURCE, snapshotSource: PXT_SNAPSHOT_SOURCE});
        const times = sampleTimes(seconds, fps), samples = [];
        let now = 0, error = null;
        for (let k = 0; k < times.length; k++) {
            for (const edge of schedule.edgesAt(k)) {
                await page.evaluate(({button, down}) => window.__bwPxtRuntime.board.setButton(button, down), {button: PXT_BUTTON[edge.button], down: edge.down});
            }
            if (times[k] > now) { await page.clock.runFor(times[k] - now); now = times[k]; }
            const snap = await page.evaluate(globals => window.__bwSnapshot(globals), globalsOf);
            if (errors.length) { error = errors[0]; break; }
            samples.push({k, t: times[k], ...snap});
            if (snap.dead) break;
        }
        return {status: error ? 'error' : 'ok', error, ...packSamples(samples)};
    } finally { await context.close().catch(() => {}); }
}
