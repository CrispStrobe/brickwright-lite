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
//   4. the model saved with the project comes back (C8): "Save to your computer"
//      writes the built model's LDraw text into the .sb3's Brickwright bundle,
//      and loading that file restores it byte for byte, both into a Sim Lab
//      opened afterwards and into one that is already open;
//   5. the Build mode works like a CAD editor, driven by real mouse moves, drags
//      and keys only (internal APIs are used to READ results and to find where a
//      part is on screen): a click on the floor places a part under the pointer,
//      a click selects a part, dragging the gizmo's X arrow moves it by a grid
//      multiple, R turns it 90°, the rotate ring turns it, a press-and-drag on
//      the part slides it, Shift+click selects two parts which the gizmo moves
//      in ONE undo step, Shift+drag box-selects, a pin dragged over a beam hole
//      from above snaps in from the top, a beam clicked onto another beam's top
//      rests on it, and a beam pushed into the hub turns red, the status names
//      the hub and the move is refused on release;
//   6. a child's line follower, through the UI only: with no program loaded,
//      choosing the Line follower model offers its example program; the Line
//      Oval mat, "Load example program" (it lands in the Code tab and becomes
//      blocks), Run — and the robot follows the line once round the oval:
//      ≥ 95 of 100 centre-line checkpoints in order, within 4 cm, inside 60 s
//      of simulated time, never more than 5 cm off the line (sim-time waits);
//   7. the Wall stopper, through the UI only: its model, "Load example program"
//      (which also puts it on the Wall mat), Run — it comes to rest 8–12 cm
//      before the wall (its foremost collider point and the distance sensor's
//      ray origin, against the compiled wall's face) and never touches it;
//   8. the Colour explorer likewise on the Colour Zones mat: at rest, its
//      drive-axle midpoint and colour-sensor spot are inside the red square
//      (both judged after a span of simulated time, not wall time);
//   9. seeing the model (scripts/lib/sim-lab-insight-gate.mjs): port badges A/B or "?"
//      in both views, "Show how it moves" draws the hinge axes and body tints in both,
//      unplugging a motor from its badge lists the issue, clicking the issue selects the
//      motor, the "?" badge's picker plugs it back in, and "Before you press Run" warns
//      when no motor is plugged in;
//  10. building instructions (scripts/lib/sim-lab-instructions-gate.mjs): "Instructions"
//      opens step 1 of the driving base with its new parts in the highlight orange
//      and a "parts needed" callout counting them; Next and → / ← turn the pages; the
//      last page is the parts list; "Print / Save as PDF" opens one picture per step;
//  11. a school tablet (scripts/lib/sim-lab-touch-gate.mjs), a 1024×768 touch page and real
//      touch input only: tap a tile then the floor places a part, one finger drags a part by
//      grid steps, drags a tile out of the palette, a long press adds to the selection, a long
//      press then drag on open floor box-selects, a finger drags the gizmo's X arrow, the build
//      bar's Select all / Copy / Paste / Turn ↺ / Undo, one finger orbits and two pinch-zoom
//      (Build and Simulate), and holding ▲ drives with lifting the finger stopping both motors;
//  12. the layout at school-device sizes (scripts/lib/sim-lab-layout-gate.mjs): at 1024×768,
//      1280×800, 1366×768, 1600×1050 and 1920×1080, in Simulate and Build, the 3D view is at
//      least 300 px and half the pane tall, wholly visible with nothing scrolled; Run, Reset,
//      Build/Simulate, Drive ▲, Move/Turn, Undo and the palette are on screen and on top; the
//      pane never scrolls sideways; the palette (a drawer when compact) places a part, Undo
//      takes it away, the compact "More…" menu works, and "open large" goes full screen;
//  13. no page errors.
//
// Every Sim Lab here runs its physics in the Web Worker (ROADMAP §4.9): each load
// asserts `window.__bwSimLab.worker === true`, so the line-follower lap, the wall
// stopper and the colour explorer — the checks most sensitive to a step of lag
// between a sensor, an encoder and the motion — judge the worker. The instruments
// sample after every advance of simulated time (session.onAdvance: on the worker,
// when a batch has reached the hub), not inside tick(), which only sends the batch.
//
// Run after the integrated GUI build:  node scripts/verify-sim-lab-browser.mjs
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {cadInteractions} from './lib/sim-lab-cad-gate.mjs';
import {insightInteractions} from './lib/sim-lab-insight-gate.mjs';
import {instructionsInteractions} from './lib/sim-lab-instructions-gate.mjs';
import {touchInteractions} from './lib/sim-lab-touch-gate.mjs';
import {layoutInteractions, MIN_CANVAS_PX} from './lib/sim-lab-layout-gate.mjs';

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

const JSZip = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url))('jszip');

const PROGRAM = 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  move forward 20 cm\n';

/** docs/SIM-LAB.md: the Colour Zones mat's red square, 0.3 m, centred at (-0.35, -0.35). */
const inRed = ([x, , z]) => Math.abs(x + 0.35) <= 0.15 && Math.abs(z + 0.35) <= 0.15;
const at = p => `(${p[0].toFixed(3)}, ${p[2].toFixed(3)})`;
/** The Robot Lab's other example robots: model, its mat, what lands in the Code tab, and how the outcome is judged. */
const EXAMPLES = [
    {name: 'Wall stopper', file: 'wall-stopper.ldr', mat: 'wall', sensor: 'distance', simMs: 10000,
        code: /wait until \(spike distance D\) < 10/, goal: /stop before the wall/,
        judge: r => {
            const frontGap = r.faceX - r.last.front;
            const rayGap = r.faceX - r.last.spot[0];
            assert.ok(r.faceX - r.startAxle[0] > 0.5, `the wall was not ahead: ${JSON.stringify(r)}`);
            assert.ok(r.closestGap > 0, `the robot touched the wall: ${JSON.stringify(r)}`);
            assert.ok(frontGap >= 0.08 && frontGap <= 0.12 && rayGap >= 0.08 && rayGap <= 0.12, `stopped ${frontGap} m from the wall: ${JSON.stringify(r)}`);
            return `stops ${(frontGap * 100).toFixed(1)} cm before the wall (ray origin ${(rayGap * 100).toFixed(1)} cm), never touching it`;
        }},
    {name: 'Colour explorer', file: 'colour-explorer.ldr', mat: 'colour-zones', sensor: 'color', simMs: 15000,
        code: /wait until spike color C is red/, goal: /find the red square/,
        judge: r => {
            assert.ok(!inRed(r.startAxle), 'it started outside the red square');
            assert.ok(inRed(r.last.axle) && inRed(r.last.spot), `not at rest inside the red square: ${JSON.stringify(r)}`);
            return `comes to rest inside the red square: axle ${at(r.last.axle)}, sensor spot ${at(r.last.spot)}`;
        }}
];

const openSimLab = async (page, {noWebgl = false, typed = false, program = PROGRAM} = {}) => {
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
    if (typed) {
        // As a person does it: type the program into the editor. Typing does NOT load it into
        // blocks — that takes the "⇦ To blocks" button, which the flow below presses later.
        await page.locator('.cm-content').first().click();
        await page.keyboard.press('ControlOrMeta+a');
        // Paste it (insertText), as a person pasting the example would: typing it key by key
        // fights the editor's auto-indent and indents the last line twice.
        await page.keyboard.insertText(program);
    } else if (program) {
        await page.evaluate(code => window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {code, source: 'sim-lab-proof'}})), program);
        await page.waitForFunction(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent.includes('Blocks loaded.'),
            null, {timeout: 60000});
    }
    await page.getByTestId('bw-open-spike-arena').click();
    await page.getByTestId('bw-spike-simulator').waitFor({timeout: 60000});
    await page.getByTestId('bw-spike-simulator-tab-simLab').click();
    await page.waitForFunction(() => ['ready', 'failed'].includes(window.__bwSimLab?.status), null, {timeout: 90000});
    const state = await page.evaluate(() => ({status: window.__bwSimLab.status, issues: window.__bwSimLab.issues,
        view3d: window.__bwSimLab.view3d, message: document.querySelector('[data-testid="bw-sim-lab-message"]')?.textContent || '',
        worker: window.__bwSimLab.worker, workerError: window.__bwSimLab.workerError}));
    assert.equal(state.status, 'ready', `Sim Lab did not load: ${JSON.stringify(state)}`);
    assert.deepEqual(state.issues.filter(i => i.severity === 'error'), [], 'error issues on the reference model');
    assert.equal(state.worker, true, `the physics runs in the Web Worker: ${JSON.stringify(state)}`);
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
    const state = await openSimLab(page, {typed: true});
    assert.equal(state.view3d, 'webgl', `3D view: ${JSON.stringify(state)}`);
    const canvas = page.getByTestId('bw-sim-lab-3d-canvas');
    await canvas.waitFor({timeout: 30000});
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 200 && box.height > 150, `canvas size ${JSON.stringify(box)}`);
    // The canvas drew something: not one flat colour.
    const shot = await canvas.screenshot();
    assert.ok(new Set(shot.subarray(shot.length - 40000)).size > 20, '3D canvas looks blank');
    console.log('PASS the Robot Lab tab loads the reference driving base with a WebGL view');

    // 1. A typed program that was never loaded into blocks: Run says so, and nothing drives by itself.
    const idle = await reading(page);
    await page.getByTestId('bw-sim-lab-run').click();
    await page.getByTestId('bw-sim-lab-info').waitFor({timeout: 10000});
    assert.match(await page.getByTestId('bw-sim-lab-info').textContent(), /To blocks/);
    await page.waitForFunction(t => window.__bwSimLab._pane.session.time > t + 1000, idle.time, {timeout: 60000});
    const still = await reading(page);
    assert.ok(Math.hypot(still.pos[0] - idle.pos[0], still.pos[2] - idle.pos[2]) < 0.01, 'without a program the robot stays put');
    console.log('PASS Run without a loaded program says how to load one, and the robot stays put');

    // 2. The drive pad moves it with no program at all: hold ▲.
    const drivePad = await reading(page);
    const fwd = page.getByTestId('bw-sim-lab-drive-forward');
    const fb = await fwd.boundingBox();
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.waitForFunction(t => window.__bwSimLab._pane.session.time > t + 1500, drivePad.time, {timeout: 60000});
    await page.mouse.up();
    const driven = await reading(page);
    assert.ok(driven.pos[2] < drivePad.pos[2] - 0.03, `holding ▲ drove forward: ${JSON.stringify({drivePad, driven})}`);
    assert.match(await page.getByTestId('bw-sim-lab-readout').textContent(), /A -?\d+°/);
    console.log(`PASS holding ▲ drives the robot ${((drivePad.pos[2] - driven.pos[2]) * 100).toFixed(1)} cm with no program`);

    // 3. Load the typed program with "⇦ To blocks" (as a person would), then Run: the program drives it.
    await page.getByRole('button', {name: '⇦ To blocks'}).first().click();
    if (process.env.SIM_DEBUG) {
        await page.screenshot({path: resolve(artifacts, 'to-blocks.png'), fullPage: true});
        console.log('DEBUG to-blocks', await page.getByRole('button', {name: '⇦ To blocks'}).count(),
            JSON.stringify(await page.evaluate(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent || '(none)')));
    }
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent.includes('Blocks loaded.'),
        null, {timeout: 60000});
    await page.getByTestId('bw-sim-lab-pause').click();
    const before = await reading(page);
    // Run starts the program on the green flag, as the arena's Start does.
    await page.getByTestId('bw-sim-lab-run').click();
    if (process.env.SIM_DEBUG) {
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
    assert.equal(await page.getByTestId('bw-sim-lab-info').count(), 0, 'the no-program note is gone once a program runs');
    assert.ok(after.pos[2] < before.pos[2] - 0.1, `the robot did not drive forward: ${JSON.stringify({before, after})}`);
    assert.ok(Math.abs(after.a - before.a) > 90 && Math.abs(after.b - before.b) > 90, `encoders: ${JSON.stringify({before, after})}`);
    await page.screenshot({path: resolve(artifacts, 'sim-lab-driving.png'), fullPage: true});

    // The line-oval mat: the robot is placed on its start pose, the floor shows the line.
    await page.getByTestId('bw-sim-lab-mat').selectOption('line-oval');
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session?.mat === 'line-oval', null, {timeout: 60000});
    const onMat = await page.evaluate(() => {
        const s = window.__bwSimLab._pane.session;
        const hinges = s.mechanism.joints.filter(j => j.motor);
        return {mid: [0, 2].map(i => (hinges[0].point[i] + hinges[1].point[i]) / 2), ground: s.mechanism.bodies.find(b => b.id === 'ground').mat};
    });
    assert.equal(onMat.ground, 'line-oval');
    assert.ok(Math.hypot(onMat.mid[0] - 0, onMat.mid[1] - 0.25) < 1e-6, `drive axle on the start pose: ${onMat.mid}`);
    await page.screenshot({path: resolve(artifacts, 'sim-lab-line-oval.png'), fullPage: true});
    console.log('PASS choosing the line-oval mat puts the robot on the line');
    await page.getByTestId('bw-sim-lab-mat').selectOption('plain');
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && !window.__bwSimLab._pane.session?.mat, null, {timeout: 60000});

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
    await cadInteractions(page, beam.id, {shotsDir: artifacts});
    const builtInEditor = await count();
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && ['ready', 'failed'].includes(window.__bwSimLab.status), null, {timeout: 60000});
    const simulated = await page.evaluate(() => ({status: window.__bwSimLab.status, worker: window.__bwSimLab.worker, workerError: window.__bwSimLab.workerError,
        message: document.querySelector('[data-testid="bw-sim-lab-message"]')?.textContent || ''}));
    assert.equal(simulated.status, 'ready', `Simulate after Build: ${JSON.stringify(simulated)}`);
    assert.equal(simulated.worker, true, `the built model runs in the physics worker: ${JSON.stringify(simulated)}`);
    const built = await page.evaluate(() => window.__bwSimLab._pane.session.model.parts.length);
    assert.equal(built, builtInEditor, 'the built model is what Simulate runs');
    console.log('PASS Build → Simulate compiles and runs the built model');
    console.log(`PASS a green-flag Scratch program drives the simulated robot (${(before.pos[2] - after.pos[2]).toFixed(3)} m, encoders A ${after.a.toFixed(0)}°, B ${after.b.toFixed(0)}°)`);

    // C8: the built model is saved inside the project and comes back.
    const shown = await page.evaluate(() => window.__bwSimLab.projectRecord);
    assert.ok(shown && /^1 /m.test(shown.ldraw), 'the pane reports the model it shows');
    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download', {timeout: 30000});
    await page.getByText('Save to your computer', {exact: true}).click();
    const savedPath = resolve(artifacts, 'sim-lab-model.sb3');
    await (await download).saveAs(savedPath);
    const sidecar = JSON.parse(await (await JSZip.loadAsync(await readFile(savedPath))).file('brickwright/state.json').async('text'));
    assert.deepEqual(sidecar.state.simLab, shown, 'the saved .sb3 carries the model the pane showed');
    assert.equal((sidecar.state.simLab.ldraw.match(/^1 /gm) || []).length, built, 'every built part is in the file');
    await page.close();

    const reopen = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
    reopen.on('pageerror', error => errors.push(error.message));
    reopen.on('dialog', dialog => dialog.accept());
    await reopen.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
    });
    await reopen.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    const loadSaved = async () => {
        await reopen.getByText('File', {exact: true}).click();
        await reopen.getByText('Load from your computer', {exact: true}).click();
        await reopen.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(savedPath);
    };
    // Loaded BEFORE the Sim Lab is open: the pane finds the model on mount.
    await loadSaved();
    await reopen.waitForFunction(() => localStorage.getItem('bw-sim-lab-model-v1'), null, {timeout: 60000});
    await reopen.getByRole('tab', {name: 'Code', exact: true}).click();
    await reopen.getByTestId('bw-open-spike-arena').click();
    await reopen.getByTestId('bw-spike-simulator').waitFor({timeout: 60000});
    await reopen.getByTestId('bw-spike-simulator-tab-simLab').click();
    await reopen.waitForFunction(() => window.__bwSimLab?.status === 'ready' && window.__bwSimLab._pane.session, null, {timeout: 90000});
    const restored = await reopen.evaluate(() => window.__bwSimLab.projectRecord);
    assert.equal(restored.ldraw, shown.ldraw, 'reopened model text is byte-identical to the saved one');
    assert.deepEqual(restored, shown);
    console.log(`PASS the model saved with the project reopens byte-identical (${built} parts, ${shown.ldraw.length} bytes)`);

    // Loaded while the Sim Lab is OPEN: change the model, load the file again, the saved one is back.
    await reopen.getByTestId('bw-sim-lab-mode-build').click();
    await reopen.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab.editor, null, {timeout: 60000});
    await reopen.evaluate(() => {
        const editor = window.__bwSimLab.editor;
        editor.apply({type: 'delete', id: editor.model.parts.at(-1).id});
    });
    assert.notEqual((await reopen.evaluate(() => window.__bwSimLab.projectRecord)).ldraw, shown.ldraw);
    await loadSaved();
    await reopen.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' &&
        window.__bwSimLab._pane.session, null, {timeout: 90000});
    await reopen.waitForFunction(text => window.__bwSimLab.projectRecord?.ldraw === text, shown.ldraw, {timeout: 30000});
    console.log('PASS loading a project into an open Sim Lab replaces the model with the saved one');
    await reopen.close();

    // 6. The line follower: model, mat, example program, Run — a lap on the line.
    const lf = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
    lf.on('pageerror', error => errors.push(error.message));
    lf.on('dialog', dialog => dialog.accept());
    await openSimLab(lf, {program: null});
    await lf.getByTestId('bw-sim-lab-model').selectOption('line-follower.ldr');
    await lf.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.modelFile === 'line-follower.ldr' &&
        window.__bwSimLab._pane.session, null, {timeout: 60000});
    const offer = lf.getByTestId('bw-sim-lab-info');
    await offer.waitFor({timeout: 10000});
    assert.match(await offer.textContent(), /Load example program/, 'with no program loaded, the Line follower offers its example');
    await lf.getByTestId('bw-sim-lab-mat').selectOption('line-oval');
    await lf.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session?.mat === 'line-oval', null, {timeout: 60000});
    await lf.getByRole('button', {name: 'Load example program'}).click();
    await lf.waitForFunction(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent.includes('Blocks loaded.'),
        null, {timeout: 60000});
    assert.match(await lf.locator('.cm-content').first().textContent(), /IF spike color C is black THEN:/, 'the example is in the Code tab');
    assert.ok(await lf.evaluate(() => window.__bwSimLab._pane.spikeLoaded()), 'the example became SPIKE blocks');
    assert.match(await offer.textContent(), /follow the black line/);
    // Read-only instrument: after every simulated tick, judge where the drive-axle midpoint is
    // (the motor hinges' midpoint carried by the hub body's pose) against the oval's centre line.
    await lf.evaluate(() => {
        const pane = window.__bwSimLab._pane;
        const s = pane.session;
        const {ovalCentreAt, distanceToOvalCentre, createMat} = pane.lib;
        const hubId = s.bridge.hubBody;
        const hub0 = s.mechanism.bodies.find(b => b.id === hubId).position;
        const hinges = s.mechanism.joints.filter(j => j.motor);
        const axle0 = [0, 1, 2].map(i => (hinges[0].point[i] + hinges[1].point[i]) / 2);
        const rotate = ([x, y, z, w], v) => {
            const ix = w * v[0] + y * v[2] - z * v[1];
            const iy = w * v[1] + z * v[0] - x * v[2];
            const iz = w * v[2] + x * v[1] - y * v[0];
            const iw = -x * v[0] - y * v[1] - z * v[2];
            return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
        };
        const length = createMat('line-oval').centreLineLengthM;
        const lap = window.__bwLineLap = {start: null, next: 1, passed: 0, maxOff: 0, lapMs: null, samples: 0, worker: s.worker};
        s.onAdvance(() => {
            if (lap.start === null || lap.lapMs !== null) return;
            const pose = s.core.bodyPose(hubId);
            const p = rotate(pose.rotation, axle0.map((v, i) => v - hub0[i])).map((v, i) => v + pose.position[i]);
            lap.samples++;
            lap.maxOff = Math.max(lap.maxOff, distanceToOvalCentre(p[0], p[2]));
            // In order: the next checkpoint, or one of the five after it (the ones jumped are missed).
            for (let k = lap.next; k <= Math.min(100, lap.next + 5); k++) {
                const c = ovalCentreAt(k * length / 100);
                if (Math.hypot(p[0] - c[0], p[2] - c[1]) >= 0.04) continue;
                lap.passed++;
                lap.next = k + 1;
                if (k === 100 && lap.passed >= 95) lap.lapMs = s.time - lap.start;
                break;
            }
        });
        lap.start = s.time;
    });
    await lf.getByTestId('bw-sim-lab-run').click();
    // Simulated time decides: the lap, or 60 s of simulated time without one.
    await lf.waitForFunction(() => window.__bwLineLap.lapMs !== null || window.__bwSimLab._pane.session.time - window.__bwLineLap.start > 60000,
        null, {timeout: 240000});
    const lapResult = await lf.evaluate(() => ({...window.__bwLineLap, stats: window.__bwSimLab._pane.session.stats}));
    assert.equal(lapResult.worker, true, 'the line follower ran its physics in the worker');
    await lf.screenshot({path: resolve(artifacts, 'sim-lab-line-follower.png'), fullPage: true});
    assert.ok(lapResult.lapMs !== null && lapResult.lapMs <= 60000, `no lap in 60 s of simulated time: ${JSON.stringify(lapResult)}`);
    assert.ok(lapResult.passed >= 95, `checkpoints: ${JSON.stringify(lapResult)}`);
    assert.ok(lapResult.maxOff <= 0.05, `off the line: ${JSON.stringify(lapResult)}`);
    console.log(`PASS the Line follower's example program, loaded from the pane, follows the Line Oval once round: ` +
        `${lapResult.passed}/100 checkpoints in ${(lapResult.lapMs / 1000).toFixed(1)} s simulated, ` +
        `at most ${(lapResult.maxOff * 1000).toFixed(1)} mm off the centre line`);
    const st = lapResult.stats;
    assert.equal(st.diverged, 0, `the main thread's motor controller commanded what the worker's mirror did: ${JSON.stringify(st)}`);
    console.log(`PASS the lap ran in the physics worker: ${st.batches} batches of ${(st.steps / st.batches).toFixed(1)} steps, ` +
        `round trip ${(st.roundTripMs / st.batches).toFixed(2)} ms mean (max ${st.maxRoundTripMs.toFixed(1)}), ` +
        `worker ${(st.workerMs / st.batches).toFixed(2)} ms and main thread ${(st.mainMs / st.batches).toFixed(2)} ms per batch, ` +
        `${st.redos} batches redone for a command in flight, ${st.droppedMs} ms dropped`);
    await lf.close();

    // 7. The Wall stopper and 8. the Colour explorer, through the UI only: choose the model,
    // "Load example program" (it lands in the Code tab, becomes blocks, and puts the robot on
    // the example's mat by itself), Run, and judge where the robot comes to rest.
    for (const example of EXAMPLES) {
        const ex = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
        ex.on('pageerror', error => errors.push(error.message));
        ex.on('dialog', dialog => dialog.accept());
        await openSimLab(ex, {program: null});
        await ex.getByTestId('bw-sim-lab-model').selectOption(example.file);
        await ex.waitForFunction(file => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.modelFile === file &&
            window.__bwSimLab._pane.session, example.file, {timeout: 60000});
        const info = ex.getByTestId('bw-sim-lab-info');
        await info.waitFor({timeout: 10000});
        assert.match(await info.textContent(), /Load example program/, `with no program loaded, the ${example.name} offers its example`);
        await ex.getByRole('button', {name: 'Load example program'}).click();
        await ex.waitForFunction(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent.includes('Blocks loaded.'),
            null, {timeout: 60000});
        assert.match(await ex.locator('.cm-content').first().textContent(), example.code, `the ${example.name}'s example is in the Code tab`);
        assert.ok(await ex.evaluate(() => window.__bwSimLab._pane.spikeLoaded()), 'the example became SPIKE blocks');
        assert.match(await info.textContent(), example.goal);
        // Loading the example put the robot on its mat (with the mat's obstacles compiled in).
        await ex.waitForFunction(mat => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session?.mat === mat,
            example.mat, {timeout: 60000});
        assert.equal(await ex.getByTestId('bw-sim-lab-mat').inputValue(), example.mat, 'the Mat list shows the example\'s mat');
        // Read-only instrument: after every simulated tick, where the robot is, from the bodies' poses.
        await ex.evaluate(mode => {
            const s = window.__bwSimLab._pane.session;
            const rotate = ([x, y, z, w], v) => {
                const ix = w * v[0] + y * v[2] - z * v[1];
                const iy = w * v[1] + z * v[0] - x * v[2];
                const iz = w * v[2] + x * v[1] - y * v[0];
                const iw = -x * v[0] - y * v[1] - z * v[2];
                return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
            };
            const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
            const bodies = new Map(s.mechanism.bodies.map(b => [b.id, b]));
            /** A point fixed to a body at t = 0, where the body has carried it now. */
            const carried = (bodyId, p0) => {
                const pose = s.core.bodyPose(bodyId);
                const b0 = bodies.get(bodyId).position;
                return rotate(pose.rotation, p0.map((v, i) => v - b0[i])).map((v, i) => v + pose.position[i]);
            };
            /** How far a collider reaches along +x at its body's pose. */
            const reachX = (bodyId, c) => {
                const pose = s.core.bodyPose(bodyId);
                const q = c.rotation || [0, 0, 0, 1];
                const axis = v => rotate(pose.rotation, rotate(q, v));
                const centre = rotate(pose.rotation, c.position || [0, 0, 0]).map((v, i) => v + pose.position[i]);
                if (c.shape === 'sphere') return centre[0] + c.radius;
                if (c.shape === 'box') return centre[0] + [[1, 0, 0], [0, 1, 0], [0, 0, 1]].reduce((sum, a, i) => sum + Math.abs(axis(a)[0]) * c.halfExtents[i], 0);
                const a = Math.abs(axis([0, 1, 0])[0]);
                return centre[0] + a * c.halfHeight + Math.sqrt(Math.max(0, 1 - a * a)) * c.radius;
            };
            const hubId = s.bridge.hubBody;
            const hinges = s.mechanism.joints.filter(j => j.motor);
            const axle0 = [0, 1, 2].map(i => (hinges[0].point[i] + hinges[1].point[i]) / 2);
            const sensor = s.mechanism.sensors.find(x => x.kind === mode.sensor);
            const robot = s.mechanism.bodies.filter(b => b.motion === 'dynamic');
            const wall = s.mechanism.bodies.find(b => b.id === 'obstacle:wall');
            const rec = window.__bwExample = {start: s.time, samples: [], closestGap: Infinity,
                faceX: wall ? wall.position[0] - wall.colliders[0].halfExtents[0] : null};
            rec.worker = s.worker;
            s.onAdvance(() => {
                const sample = {t: s.time - rec.start, axle: carried(hubId, axle0), spot: carried(sensor.body, sensor.origin)};
                if (wall) {
                    sample.front = Math.max(...robot.flatMap(b => b.colliders.map(c => reachX(b.id, c))));
                    rec.closestGap = Math.min(rec.closestGap, rec.faceX - sample.front);
                }
                rec.samples.push(sample);
            });
        }, {sensor: example.sensor});
        await ex.getByTestId('bw-sim-lab-run').click();
        // Simulated time decides: the run is judged after example.simMs of it, however long that takes in wall time.
        await ex.waitForFunction(ms => window.__bwSimLab._pane.session.time - window.__bwExample.start > ms, example.simMs, {timeout: 240000});
        const rec = await ex.evaluate(() => {
            const r = window.__bwExample;
            const last = r.samples.at(-1);
            const before = r.samples.find(p => p.t >= last.t - 1000);
            const pane = window.__bwSimLab._pane;
            return {worker: r.worker, stats: pane.session.stats, motors: pane.props.hubState.data.motors.slice(0, 2),
                sensors: pane.props.hubState.data.sensors.slice(2, 4), faceX: r.faceX, closestGap: r.closestGap, last, samples: r.samples.length,
                restMm: 1000 * Math.hypot(last.axle[0] - before.axle[0], last.axle[2] - before.axle[2]),
                startAxle: r.samples[0].axle};
        });
        await ex.screenshot({path: resolve(artifacts, `sim-lab-${example.file.replace('.ldr', '')}.png`), fullPage: true});
        assert.equal(rec.worker, true, `the ${example.name} ran its physics in the worker`);
        assert.ok(rec.restMm < 2, `the ${example.name} is not at rest: ${JSON.stringify(rec)}`);
        console.log(`PASS the ${example.name}'s example program, loaded from the pane, ${example.judge(rec)}`);
        await ex.close();
    }

    // 9. Seeing the model: port badges, issues that show their parts, "Show how it moves".
    const see = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
    see.on('pageerror', error => errors.push(error.message));
    see.on('dialog', dialog => dialog.accept());
    await openSimLab(see, {program: null});
    await insightInteractions(see, {shotsDir: artifacts});
    await see.close();

    // 10. Building instructions: step pages, the parts list, the print page.
    const manual = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
    manual.on('pageerror', error => errors.push(error.message));
    await openSimLab(manual, {program: null});
    await instructionsInteractions(manual, {shotsDir: artifacts});
    await manual.close();

    // 11. A school tablet: a 1024×768 touch page, real fingers only (scripts/lib/sim-lab-touch-gate.mjs).
    const tablet = await browser.newPage({viewport: {width: 1024, height: 768}, hasTouch: true, serviceWorkers: 'block'});
    tablet.on('pageerror', error => errors.push(error.message));
    tablet.on('dialog', dialog => dialog.accept());
    await openSimLab(tablet, {program: null});
    await touchInteractions(tablet, {shotsDir: artifacts});
    await tablet.close();

    // 12. The layout at five window sizes, Simulate and Build.
    const layout = await layoutInteractions(browser, {open: openSimLab, shotsDir: artifacts, errors});
    for (const row of layout) {
        console.log(`PASS layout ${row.size} ${row.mode}: ${row.layout} pane ${row.pane.join('×')}, 3D view ${row.canvas.join('×')} px (≥ ${MIN_CANVAS_PX} and half the pane), controls on screen`);
    }

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
