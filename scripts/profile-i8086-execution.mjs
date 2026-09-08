#!/usr/bin/env node
// Same-run alternating baseline/candidate comparison; samples are separate from
// timings so profiler overhead cannot be mistaken for an optimization.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const root = resolve('.');
const baseline = resolve(process.env.I8086_BASELINE || '.');
const output = resolve(process.env.I8086_PROFILE_OUTPUT || 'artifacts/i8086-execution');
const repetitions = 5;
const cycles = 5_000_000;
const roots = {baseline, candidate: root};
const sha = directory => execFileSync('git', ['rev-parse', 'HEAD'], {cwd: directory, encoding: 'utf8'}).trim();
const identity = {baseline: sha(baseline), candidate: sha(root), runId: process.env.GITHUB_RUN_ID || null};
await mkdir(output, {recursive: true});
const server = createServer(async (req, res) => {
    try {
        const [, kind, ...parts] = new URL(req.url, 'http://localhost').pathname.split('/');
        if (!roots[kind]) { res.writeHead(404).end(); return; }
        if (!parts.join('/')) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>8086 profile</title>'); return; }
        // Use the candidate harness unchanged for both source trees.
        const isHarness = parts.join('/') === 'scripts/lib/i8086-execution-workload.mjs';
        const sourceRoot = isHarness ? root : roots[kind];
        const path = resolve(sourceRoot, ...parts);
        if (!path.startsWith(sourceRoot + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', 'text/javascript');
        res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({headless: true});
const rows = [];
const profiles = [];
try {
    for (const rate of [1, 4]) {
        for (const workload of ['mixed', 'words', 'strings']) {
            for (const layer of ['core', 'machine', 'dos', 'debugger', 'peripherals']) {
                for (let repetition = 0; repetition < repetitions; repetition++) {
                    for (const kind of repetition % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
                        const context = await browser.newContext();
                        const page = await context.newPage();
                        const cdp = await context.newCDPSession(page);
                        await cdp.send('Emulation.setCPUThrottlingRate', {rate});
                        await page.goto(`http://127.0.0.1:${server.address().port}/${kind}/`);
                        await page.evaluate(async ({kind, layer, workload, cycles}) => {
                            const {setup} = await import(`/${kind}/scripts/lib/i8086-execution-workload.mjs`);
                            window.bench = setup(layer, workload);
                            window.bench.run(cycles); // warm-up excluded from timing
                        }, {kind, layer, workload, cycles});
                        const result = await page.evaluate(cycles => window.bench.run(cycles), cycles);
                        if (!(result.wallMs > 0 && result.heartbeat > 0 && result.cycles >= cycles)) {
                            throw new Error(`No executed progress: ${JSON.stringify(result)}`);
                        }
                        rows.push({kind, rate, workload, layer, repetition, ...result});
                        if (repetition === 0 && rate === 1) {
                            await cdp.send('Profiler.enable');
                            await cdp.send('Profiler.setSamplingInterval', {interval: 100});
                            await cdp.send('Profiler.start');
                            await page.evaluate(cycles => window.bench.run(cycles), cycles * 4);
                            const {profile} = await cdp.send('Profiler.stop');
                            const file = `${kind}-${workload}-${layer}.cpuprofile`;
                            await writeFile(resolve(output, file), JSON.stringify(profile));
                            const counts = new Map();
                            for (let i = 0; i < (profile.samples || []).length; i++) {
                                const id = profile.samples[i];
                                counts.set(id, (counts.get(id) || 0) + (profile.timeDeltas[i] || 0));
                            }
                            const total = [...counts.values()].reduce((a, b) => a + b, 0);
                            profiles.push({kind, workload, layer, file, self: profile.nodes.map(node => ({
                                function: node.callFrame.functionName, url: node.callFrame.url,
                                percent: 100 * (counts.get(node.id) || 0) / total,
                            })).filter(node => node.percent > 0).sort((a, b) => b.percent - a.percent).slice(0, 25)});
                        }
                        await context.close();
                    }
                }
                const group = rows.filter(row => row.rate === rate && row.layer === layer && row.workload === workload);
                const reference = group[0];
                for (const row of group) {
                    for (const key of ['cycles', 'totalCycles', 'heartbeat', 'registers', 'memoryHash']) {
                        if (JSON.stringify(row[key]) !== JSON.stringify(reference[key])) {
                            throw new Error(`State mismatch: ${workload}/${layer}/${key}`);
                        }
                    }
                }
                const spread = kind => {
                    const values = group.filter(row => row.kind === kind).map(row => row.wallMs).sort((a, b) => a - b);
                    return {min: values[0], median: values[2], max: values[4]};
                };
                console.log(JSON.stringify({rate, workload, layer, baseline: spread('baseline'), candidate: spread('candidate')}));
            }
        }
    }
} finally {
    await writeFile(resolve(output, 'results.json'), JSON.stringify({identity, repetitions, cycles, rows, profiles}, null, 2));
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
