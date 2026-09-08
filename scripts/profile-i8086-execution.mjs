#!/usr/bin/env node
// Same-run alternating baseline/candidate comparison; samples are separate from
// timings so profiler overhead cannot be mistaken for an optimization.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

if (process.env.I8086_BLOCK_MODE?.startsWith('devices')) {
    await import('./profile-i8086-devices.mjs');
    process.exit(0);
}

const root = resolve('.');
const baseline = resolve(process.env.I8086_BASELINE || '.');
const output = resolve(process.env.I8086_PROFILE_OUTPUT || 'artifacts/i8086-execution');
const repetitions = 5;
const cycles = 25_000_000;
const blockMode = process.env.I8086_BLOCK_MODE || 'none';
if (!['none','decoded','wasm','ram','full-pit-inline','full-pit-mode3'].includes(blockMode)) throw new Error('Invalid or removed block mode');
const deviceCandidate = blockMode.startsWith('full-') ? blockMode.slice(5) : null;
const blockOnly = blockMode === 'decoded' || blockMode === 'wasm';
const roots = {baseline, candidate: root};
const engineRoot = process.env.I8086_ENGINE_ROOT ? resolve(process.env.I8086_ENGINE_ROOT) : null;
const engineFiles = blockMode === 'none' ? (process.env.I8086_ENGINE_FILES || '').split(',').filter(Boolean) : [];
if (engineFiles.some(file => !/^(?:i8086(?:-[a-z]+)*|i8254)\.js$/.test(file)) || (engineFiles.length && !engineRoot)) {
    throw new Error('Invalid engine overlay');
}
const sha = directory => execFileSync('git', ['rev-parse', 'HEAD'], {cwd: directory, encoding: 'utf8'}).trim();
const identity = {baseline: sha(baseline), candidate: sha(root), runId: process.env.GITHUB_RUN_ID || null};
identity.blockMode = blockMode;
if (engineRoot) identity.engine = {sha: sha(engineRoot), files: engineFiles};
await mkdir(output, {recursive: true});
const server = createServer(async (req, res) => {
    try {
        const [, kind, ...parts] = new URL(req.url, 'http://localhost').pathname.split('/');
        if (!roots[kind]) { res.writeHead(404).end(); return; }
        if (!parts.join('/')) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>8086 profile</title>'); return; }
        // Use the candidate harness unchanged for both source trees.
        const isHarness = ['overlay/scratch-gui/src/lib/bw-i8086-lab/register-block-experiment.js',
            'scripts/lib/i8086-execution-workload.mjs',
            'scripts/lib/i8086-block-experiment.mjs', 'scripts/lib/i8086-ram-experiment.mjs',
            'scripts/lib/i8086-corpus-workload.mjs', 'scripts/lib/i8086-pit-scheduling-experiment.mjs',
            'scripts/lib/i8086-device-candidates.mjs'].includes(parts.join('/'));
        const sourceRoot = isHarness ? root : roots[kind];
        let path = resolve(sourceRoot, ...parts);
        if (!path.startsWith(sourceRoot + sep)) { res.writeHead(403).end(); return; }
        if (kind === 'candidate' && parts.slice(0, -1).join('/') === 'overlay/scratch-gui/src/lib/bw-board' &&
            engineFiles.includes(parts.at(-1))) path = resolve(engineRoot, 'src', parts.at(-1));
        res.setHeader('Content-Type', 'text/javascript');
        res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({headless: true});
const rows = [];
const profiles = [];
const comparisons = [];
const corpus = [];
let complete = false;
try {
    for (const rate of [1, 4]) {
        for (const workload of blockOnly ? ['mixed','words','strings','registers'] : ['mixed', 'words', 'strings']) {
            for (const layer of blockOnly ? ['core'] : ['core', 'machine', 'dos', 'debugger', 'peripherals']) {
                for (let repetition = 0; repetition < repetitions; repetition++) {
                    for (const kind of repetition % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
                        const context = await browser.newContext();
                        const page = await context.newPage();
                        const cdp = await context.newCDPSession(page);
                        await cdp.send('Emulation.setCPUThrottlingRate', {rate});
                        await page.goto(`http://127.0.0.1:${server.address().port}/${kind}/`);
                        const warmup = await page.evaluate(async ({kind, layer, workload, cycles, blockMode}) => {
                            const {setup} = await import(`/${kind}/scripts/lib/i8086-execution-workload.mjs`);
                            window.bench = setup(layer, workload,
                                kind !== 'candidate' || blockMode === 'none' ? {} :
                                    blockMode.startsWith('full-') ? {deviceCandidate:blockMode.slice(5)} :
                                    blockMode === 'ram' ? {ramWords: true} : {blockMode});
                            return window.bench.run(cycles); // warm-up excluded from timing
                        }, {kind, layer, workload, cycles, blockMode});
                        const result = await page.evaluate(cycles => window.bench.run(cycles), cycles);
                        if (!(result.wallMs > 0 && result.heartbeat > warmup.heartbeat && result.cycles >= cycles)) {
                            throw new Error(`No executed progress: ${JSON.stringify(result)}`);
                        }
                        rows.push({kind, rate, workload, layer, repetition, warmupWallMs: warmup.wallMs, ...result});
                        if (repetition === 0 && rate === 1) {
                            await cdp.send('Profiler.enable');
                            await cdp.send('Profiler.setSamplingInterval', {interval: 100});
                            await cdp.send('Profiler.start');
                            await page.evaluate(cycles => window.bench.run(cycles, false), cycles * 20);
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
                                line: node.callFrame.lineNumber + 1,
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
                const before = spread('baseline');
                const after = spread('candidate');
                const comparison = {rate, workload, layer, baseline: before, candidate: after,
                    throughputChangePercent: 100 * (before.median / after.median - 1),
                    rangesSeparated: after.max < before.min || before.max < after.min};
                comparisons.push(comparison);
                console.log(JSON.stringify(comparison));
            }
        }
    }
    if (process.env.I8086_CORPUS_ROOT && (blockMode === 'none' || deviceCandidate)) {
        const directory = resolve(process.env.I8086_CORPUS_ROOT);
        identity.corpus = {sha: sha(directory)};
        for (const name of ['bubble_sort.asm','insertion_sort.asm','heap_sort.asm']) {
            const source = await readFile(resolve(directory, 'Source Code/Sorting', name), 'utf8');
            const sourceHash = createHash('sha256').update(source).digest('hex');
            for (const rate of [1,4]) for (let repetition = 0; repetition < repetitions; repetition++) {
                let reference;
                for (const kind of repetition % 2 ? ['candidate','baseline'] : ['baseline','candidate']) {
                    const context = await browser.newContext();
                    try {
                        const page = await context.newPage();
                        const cdp = await context.newCDPSession(page);
                        await cdp.send('Emulation.setCPUThrottlingRate', {rate});
                        await page.goto(`http://127.0.0.1:${server.address().port}/${kind}/`);
                        const result = await page.evaluate(async ({kind,source,name,deviceCandidate}) => {
                            if(kind==='candidate' && deviceCandidate) {
                                const {installDeviceCandidate}=await import(`/${kind}/scripts/lib/i8086-device-candidates.mjs`);
                                installDeviceCandidate(deviceCandidate);
                            }
                            const {setupCorpus} = await import(`/${kind}/scripts/lib/i8086-corpus-workload.mjs`);
                            const workload = setupCorpus(source,name);
                            workload.run(10);
                            return workload.run(100);
                        }, {kind,source,name,deviceCandidate});
                        const {wallMs,programsPerSecond,...state} = result;
                        if (reference && JSON.stringify(state) !== JSON.stringify(reference)) throw new Error(`Corpus state mismatch: ${name}`);
                        reference = state;
                        corpus.push({kind,rate,repetition,name,sourceHash,...result});
                    } finally { await context.close(); }
                }
            }
        }
    }
    complete = true;
} finally {
    await writeFile(resolve(output, 'results.json'), JSON.stringify({identity, complete,
        repetitions, cycles, comparisons, rows, profiles, corpus}, null, 2));
    const lines = ['# 8086 engine comparison', '',
        `Baseline: ${identity.baseline}. Candidate: ${identity.candidate}. Complete: ${complete}.`, '',
        'Source-module throughput with UI pacing removed. Ranges overlap unless marked separated; a median change alone is not a verdict.', '',
        '| CPU throttle | Workload | Layer | Baseline median ms | Candidate median ms | Throughput change | Ranges separated |',
        '| --- | --- | --- | ---: | ---: | ---: | --- |',
        ...comparisons.map(c => `| ${c.rate}x | ${c.workload} | ${c.layer} | ${c.baseline.median.toFixed(2)} | ${c.candidate.median.toFixed(2)} | ${c.throughputChangePercent.toFixed(1)}% | ${c.rangesSeparated} |`)];
    await writeFile(resolve(output, 'summary.md'), lines.join('\n') + '\n');
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
