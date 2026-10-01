#!/usr/bin/env node
import {privateSpikeEvidenceDirectory} from './lib/private-spike-evidence.mjs';
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Full shipped GUI proof. Run after the normal integrated GUI build.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const build = resolve(process.env.BW_SPIKE_BUILD_ROOT || `${root}/packages/scratch-gui/build`);
const evidence = resolve(privateSpikeEvidenceDirectory(), 'gui-browser');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png'};
const server = createServer(async (request, response) => {
    try {
        const name = decodeURIComponent(request.url.split('?')[0]);
        const file = resolve(build, `.${name.endsWith('/') ? `${name}index.html` : name}`);
        if (!file.startsWith(`${build}${sep}`)) throw new Error('invalid path');
        const data = await readFile(file);
        response.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'}); response.end(data);
    } catch { response.writeHead(404); response.end('not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await mkdir(evidence, {recursive: true});
let browser, page;
const checks = [], errors = [], pybricksRequests = [];
const check = (name, detail = null) => { checks.push({name, passed: true, detail}); console.log(`PASS ${name}`); };
try {
    browser = await chromium.launch({headless: true, args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']});
    page = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    page.on('request', request => { if (request.url().includes('/pybricks-sim/')) pybricksRequests.push(request.url()); });
    await page.addInitScript(() => {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-device-select').waitFor({timeout: 60000});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {
        code: 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  move forward 1 cm\n', source: 'spike-browser-proof'
    }})));
    await page.getByTestId('bw-open-spike-arena').waitFor({timeout: 60000});
    await page.getByTestId('bw-open-spike-arena').click();
    const selector = page.getByTestId('bw-spike-backend');
    await selector.waitFor();
    assert.equal(await selector.inputValue(), 'native');
    await page.waitForFunction(() => window.__bwSpikeArena?.bridge);
    assert.equal(pybricksRequests.length, 0);
    check('native GUI opens without requesting Pybricks assets');
    await page.getByTestId('bw-spike-arena-load-solution').click();
    // Loading the solution includes compilation; wait for the native VM project.
    await page.waitForFunction(() => window.__bwSpikeArena?._pane.spikeLoaded(), null, {timeout: 60000});
    await page.getByTestId('bw-spike-arena-start').click();
    await page.waitForFunction(() => window.__bwSpikeArena?.verdict?.status === 'pass', null, {timeout: 60000});
    const mission = await page.evaluate(() => ({verdict: window.__bwSpikeArena.verdict,
        pose: window.__bwSpikeArena.bridge.sim.pose, timeMs: window.__bwSpikeArena.bridge.sim.timeMs}));
    check('actual Scratch VM reference mission completes through the native backend', mission);
    await page.screenshot({path: `${evidence}/native-mission.png`, fullPage: true});
    await page.getByTestId('bw-spike-arena-reset').click();
    const nativeEnvelope = await page.evaluate(() => {
        const hub = window.__bwSpikeArena._pane.hubState;
        hub.setMotorSpeed('B', 100);
        hub.backend.step(1000);
        return {nominalLimit: hub.backend.maxSpeed('B'), shaftSpeed: hub.data.motors[1].degPerSec};
    });
    assert.equal(nativeEnvelope.nominalLimit, 1110);
    assert.equal(nativeEnvelope.shaftSpeed, 950);
    check('shared GUI hub applies the measured envelope to a full-speed native command', nativeEnvelope);
    await page.getByTestId('bw-spike-arena-reset').click();
    await page.evaluate(() => { window.__spikeProofArena = window.__bwSpikeArena.bridge; });
    await selector.selectOption('pybricks');
    await page.getByTestId('bw-pybricks-status').filter({hasText: 'Ready'}).waitFor({timeout: 60000});
    check('GUI selection lazily loads the audited Python backend');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-pybricks-run', {detail: {code:
        'from pybricks.pupdevices import Motor\nfrom pybricks.parameters import Port\nfrom pybricks.tools import wait\nfrom pybricks.hubs import PrimeHub\na=Motor(Port.A)\nb=Motor(Port.B)\na.run(-300)\nb.run(300)\nwait(400)\na.brake()\nb.brake()\nwait(100)\nPrimeHub().display.pixel(1,2,100)\nprint("browser-shared-done")\n'}})));
    await page.getByTestId('bw-pybricks-output').filter({hasText: 'browser-shared-done'}).waitFor({timeout: 30000});
    await page.waitForFunction(() => window.__bwSpikeArena?._pane.hubState.clockOwner === null);
    const python = await page.evaluate(() => ({sameWorld: window.__spikeProofArena === window.__bwSpikeArena.bridge,
        pose: window.__bwSpikeArena.bridge.sim.pose, start: window.__bwSpikeArena.bridge.sim.world.start,
        pixel: window.__bwSpikeArena._pane.hubState.data.display[7]}));
    assert.equal(python.sameWorld, true); assert.equal(python.pixel, 9); assert.ok(python.pose.x > python.start.x + 1);
    check('Python motor motion and matrix reach the same arena and shared hub', python);
    await page.screenshot({path: `${evidence}/python-shared-arena.png`, fullPage: true});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-pybricks-run', {detail: {code:
        'from pybricks.tools import wait\nprint("browser-loop")\nwhile True:\n    wait(10)\n'}})));
    await page.waitForFunction(() => window.__bwSpikeArena?._pane.hubState.clockOwner === 'pybricks');
    await selector.selectOption('native');
    await page.waitForFunction(() => window.__bwSpikeArena?._pane.hubState.clockOwner === null);
    assert.equal(await selector.inputValue(), 'native');
    assert.equal(await page.evaluate(() => window.__spikeProofArena === window.__bwSpikeArena.bridge), true);
    check('switching from a running Python loop cancels execution and preserves the world');
    await page.getByTestId('bw-spike-arena-view-toggle').click();
    await page.waitForFunction(() => ['webgl','fallback'].includes(window.__bwSpikeArena?.view3d));
    const view3d = await page.evaluate(() => window.__bwSpikeArena.view3d);
    assert.equal(view3d, 'webgl', 'software WebGL must render the shared world');
    check('3D arena renders after backend switching');
    await page.screenshot({path: `${evidence}/native-3d-arena.png`, fullPage: true});
    // A fresh page under an explicit missing-assets route exercises the shipped
    // native UI with the optional runtime truly unreachable.
    await page.route('**/static/pybricks-sim/**', route => route.fulfill({status: 404, body: 'optional assets absent'}));
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-device-select').waitFor({timeout: 60000});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {
        code: 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  move forward 1 cm\n', source: 'spike-browser-proof'
    }})));
    await page.getByTestId('bw-open-spike-arena').waitFor({timeout: 60000});
    await page.getByTestId('bw-open-spike-arena').click();
    await selector.waitFor();
    assert.equal(await selector.inputValue(), 'native');
    await page.getByTestId('bw-spike-arena-load-solution').click();
    await page.waitForFunction(() => window.__bwSpikeArena?._pane.spikeLoaded(), null, {timeout: 60000});
    await page.getByTestId('bw-spike-arena-start').click();
    await page.waitForFunction(() => window.__bwSpikeArena?.verdict?.status === 'pass', null, {timeout: 60000});
    check('Scratch mission also completes in the browser with Pybricks assets returning 404');
    await selector.selectOption('pybricks');
    await page.getByTestId('bw-pybricks-status').filter({hasText: 'Could not load'}).waitFor({timeout: 30000});
    await selector.selectOption('native');
    assert.equal(await page.getByTestId('bw-spike-arena-start').isEnabled(), true);
    check('optional backend failure is visible and native selection remains available');
    assert.deepEqual(errors, [], 'no uncaught browser exceptions');
} catch (error) {
    checks.push({name: 'browser proof', passed: false, detail: error.stack});
    if (page) {
        await page.screenshot({path: `${evidence}/failure.png`, fullPage: true}).catch(() => {});
        console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 5000));
    }
    process.exitCode = 1; console.error(error);
} finally {
    await writeFile(`${evidence}/result.json`, JSON.stringify({node: process.version, checks, errors,
        pybricksRequests, build, success: !process.exitCode}, null, 2) + '\n');
    if (browser) await browser.close();
    await new Promise(done => server.close(done));
}
