#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's cost on a big model, per-part meshes against instancing, in
// the shipped GUI build and headless Chromium with the browser gate's GPU
// flags (SwiftShader): the 2,054-part stress model (scripts/lib/
// sim-lab-stress-model.mjs) opened through "Open…", then
//   - open: wall time from choosing the file to a ready scene;
//   - frame: one render waited for by reading back a pixel, median and p90 of 10;
//   - loop: frames per second the pane's own animation loop manages over 3 s;
//   - draw calls, triangles and GPU geometries of a frame (three's renderer.info);
//   - JS heap after a forced GC (CDP), and Build: time to open, frame median.
// `window.__bwSimLabInstancing` forces each mode (view/instanced-parts.js).
//
//   node scripts/measure-sim-lab-scale.mjs [--json=out.json] [--gpu=swiftshader|metal|vulkan|gl]
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openFile, stressText, frameTimes, loopFps} from './lib/sim-lab-scale-gate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = resolve(process.env.BW_BUILD || `${root}/packages/scratch-gui/build`);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ldr': 'text/plain', '.dat': 'text/plain'};
const server = createServer(async (request, response) => {
    try {
        const name = decodeURIComponent(request.url.split('?')[0]);
        const file = resolve(build, `.${name.endsWith('/') ? `${name}index.html` : name}`);
        if (!file.startsWith(`${build}${sep}`)) throw new Error('invalid path');
        const data = await readFile(file);
        response.writeHead(200, {'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream'});
        response.end(data);
    } catch {
        response.writeHead(404);
        response.end('not found');
    }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;
const jsonOut = (process.argv.find(a => a.startsWith('--json=')) || '').slice('--json='.length);
const text = await stressText(root);

const heapMb = async page => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const {usedSize} = await cdp.send('Runtime.getHeapUsage');
    await cdp.detach();
    return usedSize / 1048576;
};

const measure = async (browser, instancing) => {
    const page = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
    await page.addInitScript(on => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        window.__bwSimLabInstancing = on;
    }, instancing);
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click({timeout: 180000});
    await page.getByTestId('bw-open-spike-arena').click({timeout: 180000});
    await page.getByTestId('bw-spike-simulator-tab-simLab').click({timeout: 180000});
    await page.waitForFunction(() => window.__bwSimLab?.status === 'ready', null, {timeout: 120000});
    const heapBefore = await heapMb(page);
    const openMs = await openFile(page, {name: 'stress-model.ldr', buffer: Buffer.from(text), mimeType: 'text/plain', timeout: 600000});
    await page.waitForTimeout(1000);
    const frame = await frameTimes(page, 10);
    const fps = await loopFps(page, 3000); // instanced: idle frames are not redrawn (sim-view3d.js), so this is the page's idle rate
    const heap = await heapMb(page);
    const buildStart = Date.now();
    await page.getByTestId('bw-sim-lab-mode-build').click({timeout: 600000});
    await page.waitForFunction(() => window.__bwSimLab.editView && window.__bwSimLab.mode === 'build', null, {timeout: 600000});
    const buildMs = Date.now() - buildStart;
    await page.waitForTimeout(500);
    const buildFrame = await frameTimes(page, 10, 'build');
    const buildFps = await loopFps(page, 3000);
    await page.close();
    return {instancing, openMs, frameMedianMs: +frame.median.toFixed(1), frameP90Ms: +frame.p90.toFixed(1), loopFps: +fps.toFixed(1),
        drawCalls: frame.stats.calls, triangles: frame.stats.triangles, gpuGeometries: frame.stats.geometries,
        instancedObjects: frame.stats.instanced?.drawObjects ?? null, parts: frame.stats.parts,
        heapMbBeforeOpen: +heapBefore.toFixed(1), heapMbAfterOpen: +heap.toFixed(1),
        buildOpenMs: buildMs, buildFrameMedianMs: +buildFrame.median.toFixed(1), buildLoopFps: +buildFps.toFixed(1)};
};

let browser;
try {
    // --gpu=swiftshader (default): the browser gate's software GPU. --gpu=metal|vulkan|gl: a real GPU through ANGLE.
    const gpu = (process.argv.find(a => a.startsWith('--gpu=')) || '--gpu=swiftshader').slice('--gpu='.length);
    const args = gpu === 'swiftshader' ? ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] :
        ['--disable-dev-shm-usage', '--use-gl=angle', `--use-angle=${gpu}`, '--ignore-gpu-blocklist', '--enable-gpu'];
    browser = await chromium.launch({headless: true, args});
    console.log(JSON.stringify({gpu}));
    const rows = [];
    for (const instancing of [true, false]) {
        const row = await measure(browser, instancing);
        rows.push(row);
        console.log(JSON.stringify(row));
    }
    if (jsonOut) await writeFile(jsonOut, `${JSON.stringify({measuredAt: new Date().toISOString(), rows}, null, 1)}\n`);
} finally {
    await browser?.close();
    server.close();
}
