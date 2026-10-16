#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab (docs/SIM-LAB-PLAN.md §0) in the SHIPPED GUI build, end to end:
//
//   1. the Code tab opens the SPIKE simulator, whose "Sim Lab (beta)" tab loads
//      the reference driving base from static/sim-lab/models/ with no error
//      issues and a WebGL 3D canvas that actually drew pixels;
//   2. a real Scratch program (DEVICE SPIKE pseudocode → blocks, green flag)
//      drives the simulated robot through the virtual SPIKE hub: after Run the
//      hub body has moved forward and the drive motors' encoders have turned;
//   3. with WebGL forced off the pane says so and the simulation still runs;
//   4. no page errors.
//
// Run after the integrated GUI build:  node scripts/verify-sim-lab-browser.mjs
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = resolve(process.env.BW_BUILD || `${root}/packages/scratch-gui/build`);
const artifacts = resolve(root, 'artifacts/sim-lab');
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
await mkdir(artifacts, {recursive: true});
const url = `http://127.0.0.1:${server.address().port}/`;

const PROGRAM = 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  move forward 20 cm\n';

const openSimLab = async (page, {noWebgl = false} = {}) => {
    await page.addInitScript(force => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        if (force) window.__bwSimLabForceNoWebGL = true;
    }, noWebgl);
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-device-select').waitFor({timeout: 60000});
    await page.evaluate(code => window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {code, source: 'sim-lab-proof'}})), PROGRAM);
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent.includes('Blocks loaded.'),
        null, {timeout: 60000});
    await page.getByTestId('bw-open-spike-arena').click();
    await page.getByTestId('bw-spike-simulator').waitFor({timeout: 60000});
    await page.getByTestId('bw-spike-simulator-tab-simLab').click();
    await page.waitForFunction(() => ['ready', 'failed'].includes(window.__bwSimLab?.status), null, {timeout: 90000});
    const state = await page.evaluate(() => ({status: window.__bwSimLab.status, issues: window.__bwSimLab.issues,
        view3d: window.__bwSimLab.view3d, message: document.querySelector('[data-testid="bw-sim-lab-message"]')?.textContent || ''}));
    assert.equal(state.status, 'ready', `Sim Lab did not load: ${JSON.stringify(state)}`);
    assert.deepEqual(state.issues.filter(i => i.severity === 'error'), [], 'error issues on the reference model');
    return state;
};

/** Hub body position (first 3 floats of its body) and the two drive encoders. */
const reading = page => page.evaluate(() => {
    const pane = window.__bwSimLab._pane;
    const s = pane.session;
    const hub = s.bridge.hubBody;
    const i = s.snapshot().bodyIds.indexOf(hub);
    const b = s.snapshot().bodies;
    const motors = pane.props.hubState.data.motors;
    return {pos: [b[i * 7], b[i * 7 + 1], b[i * 7 + 2]], a: motors[0].position, b: motors[1].position, time: s.time};
});

let browser;
const errors = [];
try {
    browser = await chromium.launch({headless: true, args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']});

    const page = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const state = await openSimLab(page);
    assert.equal(state.view3d, 'webgl', `3D view: ${JSON.stringify(state)}`);
    const canvas = page.getByTestId('bw-sim-lab-3d-canvas');
    await canvas.waitFor({timeout: 30000});
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 200 && box.height > 150, `canvas size ${JSON.stringify(box)}`);
    // The canvas drew something: not one flat colour.
    const shot = await canvas.screenshot();
    assert.ok(new Set(shot.subarray(shot.length - 40000)).size > 20, '3D canvas looks blank');
    console.log('PASS the Sim Lab tab loads the reference driving base with a WebGL view');

    const before = await reading(page);
    // Run starts the program on the green flag, as the arena's Start does.
    await page.getByTestId('bw-sim-lab-run').click();
    if (process.env.SIM_DEBUG) {
        await page.waitForTimeout(3000);
        console.log('DEBUG', JSON.stringify(await page.evaluate(() => {
            const h = window.__bwSimLab._pane.props.hubState;
            return {connected: h.data.connected, sim: h.data.simulationEnabled, motors: h.data.motors.slice(0, 2), last: h.data.lastCommand,
                pair: h.movementPair, owner: h.clockOwner, sameHub: h === window.__brickwrightVirtualSpike?.hubState, time: window.__bwSimLab._pane.session.time,
                status: window.__bwSimLab.status, code: document.querySelector('[data-testid="bw-code-status"]')?.textContent};
        })));
    }
    await page.waitForFunction(start => {
        const s = window.__bwSimLab._pane.session;
        const hub = s.bridge.hubBody;
        const i = s.snapshot().bodyIds.indexOf(hub);
        const b = s.snapshot().bodies;
        return Math.hypot(b[i * 7] - start[0], b[i * 7 + 2] - start[2]) > 0.1;
    }, before.pos, {timeout: 60000});
    const after = await reading(page);
    assert.ok(after.pos[2] < before.pos[2] - 0.1, `the robot did not drive forward: ${JSON.stringify({before, after})}`);
    assert.ok(Math.abs(after.a - before.a) > 90 && Math.abs(after.b - before.b) > 90, `encoders: ${JSON.stringify({before, after})}`);
    await page.screenshot({path: resolve(artifacts, 'sim-lab-driving.png'), fullPage: true});

    // Build mode: the editor opens on the current model; real clicks place a part;
    // a pin dropped onto a beam hole snaps; undo/redo; back to Simulate compiles it.
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.getByTestId('bw-sim-lab-editor-canvas').waitFor({timeout: 60000});
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab.editor, null, {timeout: 60000});
    const count = () => page.evaluate(() => window.__bwSimLab.editor.model.parts.length);
    const start = await count();
    await page.getByTestId('bw-sim-lab-part-32524.dat').click();
    const editorCanvas = page.getByTestId('bw-sim-lab-editor-canvas');
    const ebox = await editorCanvas.boundingBox();
    await page.mouse.move(ebox.x + ebox.width * 0.15, ebox.y + ebox.height * 0.85);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, start, {timeout: 10000});
    console.log('PASS Build: a palette pick and a click on the canvas place a part');
    // The click may have attached that beam anywhere on the robot. For the snap check, lay a
    // second beam on open floor 0.3 m to the side, where nothing else is near its holes.
    const free = await page.evaluate(() => window.__bwSimLab.editView.placeAt('32524.dat', [0.3, 0, 0]));
    assert.equal(free.snapped, false, 'a beam dropped on open floor lies on the floor');
    const beam = await page.evaluate(() => {
        const parts = window.__bwSimLab.editor.model.parts;
        return parts[parts.length - 1];
    });
    // Drop a friction pin just off the beam's end hole: the hole at (0, 0, 60) in the beam's frame,
    // 15 LDU out along its axis, through the beam's actual pose (the click may have snapped it
    // onto the robot at any rotation), then LDraw → world (x, -y, -z) × 0.4 mm.
    const R = beam.rotation;
    const local = [0, -15, 60];
    const ldraw = [0, 1, 2].map(i => R[i * 3] * local[0] + R[i * 3 + 1] * local[1] + R[i * 3 + 2] * local[2] + beam.position[i]);
    const holeWorld = [ldraw[0] * 0.0004, (0 - ldraw[1]) * 0.0004, (0 - ldraw[2]) * 0.0004];
    if (process.env.SIM_DEBUG) {
        console.log('DEBUG beam', JSON.stringify(beam), 'hole', JSON.stringify(ldraw), 'parts', await count());
        console.log('DEBUG direct', JSON.stringify(await page.evaluate(h => {
            const pane = window.__bwSimLab._pane;
            const model = pane.editor.model;
            const c = pane.lib.snapCandidates({model, catalog: pane.lib.CATALOG, part: '2780.dat', pose: {position: h, rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}});
            return {n: c.length, first: c[0] && c[0].position, ids: model.parts.map(p => p.id), pin: pane.lib.CATALOG.get('2780.dat')?.connectors};
        }, ldraw)));
    }
    const pin = await page.evaluate(p => window.__bwSimLab.editView.placeAt('2780.dat', p), holeWorld);
    assert.equal(pin.snapped, true, 'a pin dropped on a beam hole snaps');
    assert.equal(await count(), start + 3);
    await page.getByTestId('bw-sim-lab-undo').click();
    assert.equal(await count(), start + 2);
    await page.getByTestId('bw-sim-lab-redo').click();
    assert.equal(await count(), start + 3);
    await page.screenshot({path: resolve(artifacts, 'sim-lab-build.png'), fullPage: true});
    console.log('PASS Build: a pin snaps into a beam hole; undo and redo');
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready', null, {timeout: 60000});
    const built = await page.evaluate(() => window.__bwSimLab._pane.session.model.parts.length);
    assert.equal(built, start + 3, 'the built model is what Simulate runs');
    console.log('PASS Build → Simulate compiles and runs the built model');
    console.log(`PASS a green-flag Scratch program drives the simulated robot (${(before.pos[2] - after.pos[2]).toFixed(3)} m, encoders A ${after.a.toFixed(0)}°, B ${after.b.toFixed(0)}°)`);
    await page.close();

    const fallback = await browser.newPage({viewport: {width: 1400, height: 900}, serviceWorkers: 'block'});
    fallback.on('pageerror', error => errors.push(error.message));
    const forced = await openSimLab(fallback, {noWebgl: true});
    assert.equal(forced.view3d, 'fallback');
    assert.match(forced.message, /3D/);
    assert.equal(await fallback.getByTestId('bw-sim-lab-3d-canvas').count(), 0);
    const f0 = await reading(fallback);
    await fallback.getByTestId('bw-sim-lab-run').click();
    await fallback.waitForFunction(t => window.__bwSimLab._pane.session.time > t + 500, f0.time, {timeout: 30000});
    console.log('PASS without WebGL the pane says so and the simulation still runs');
    await fallback.close();

    assert.deepEqual(errors, [], `page errors: ${errors.join('\n')}`);
    console.log('PASS no page errors');
} finally {
    await browser?.close();
    server.close();
}
