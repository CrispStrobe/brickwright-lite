#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab (docs/SIM-LAB-PLAN.md §0) in the SHIPPED GUI build, end to end:
//
//   1. the Robot Lab is its own editor tab (beside Blocks, Code, Circuit): the tab
//      loads the reference driving base from static/sim-lab/models/ with no error
//      issues and a WebGL 3D canvas that actually drew pixels; the SPIKE arena's
//      "Open in Robot Lab" reaches the same tab, and the arena stands aside while
//      the Lab drives the shared virtual hub (one hub, one world);
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
//  13. the build editor's Studio/LeoCAD tools (scripts/lib/sim-lab-editor-parity-gate.mjs, `--part=editor`),
//      real mouse and keys: a colour swatch paints a part (its pixels turn red) and the eyedropper copies
//      a colour, hide / isolate / show all (kept through Simulate), mirror puts a bent liftarm's holes on
//      their mirror images, align lines two beams up, the tape measures 120 LDU between a beam's end
//      holes, a double click edits inside a group, Ctrl+C / Ctrl+V carry LDraw text between models (and
//      from Studio), and ? opens the shortcut sheet;
//  14. big models and model files (scripts/lib/sim-lab-scale-gate.mjs, --part=scale): the 2,054-part
//      stress model opened through "Open…" is ready within 120 s, drawn instanced in at most 150 draw
//      calls and not blank, a frame finishes within 1 s; Build opens on the whole model (ready and drawn)
//      within its budget, an idle frame redraws nothing, a pointer move's handlers stay within budget
//      (hovering and dragging), a click on a grid beam selects that beam and its gizmo X arrow moves it by
//      grid steps (one undo puts it back); the hand-made .lxf opens with its unknown parts listed; a password-protected
//      .io is refused with the model left as it was; "Save as… → .io" downloads a ZIP whose model.ldr
//      is the model's LDraw text and reopens to it;
//  15. the tab, its icon toolbar and the movable 3D view (scripts/lib/sim-lab-toolbar-gate.mjs, --part=ui):
//      every control named, with a tooltip giving its name and shortcut, in English and German; every
//      Build action by click and by key; orbit, pan and zoom by mouse and keys in Simulate and Build, the
//      view buttons, and a drag on a part moving the part, not the camera;
//  16. no page errors;
//  17. connection-first building (scripts/lib/sim-lab-connect-gate.mjs, --part=editor, docs/ROBOT-LAB-UX.md §5):
//      a pin in hand lights the free pin holes and seats in the one under the pointer, with hysteresis,
//      Tab alternatives, a red refusal when blocked, R and [ ] turns, a multi-part group seating both pins,
//      Target-first and keyboard-only placement; the camera orbits and zooms about the point under the
//      pointer, looks from below in Build, eases a double-click focus, and the view cube turns the view.
//  18. the Lab steered from code (scripts/lib/sim-lab-api-gate.mjs, --part=api, docs/ROBOT-LAB-HUBS-PLAN.md P1):
//      a Blocks project of robotlab blocks (saved and reloaded as an .sb3) loads the hubless motor bench and
//      turns its motor 360 ± 2° through runtime.robotLab; the bench's example in `lab` words, through the UI
//      only, turns it 360°, rests there through its wait, runs on at 90 °/s and brakes.
//  19. the LEGO radio hubs (scripts/lib/sim-lab-hubs-gate.mjs, --part=hubs-ble, docs/ROBOT-LAB-HUBS-PLAN.md P3):
//      through the UI only, each example's pup / boost / wedo words become the REAL extension's blocks and
//      Run connects them to the scene's virtual hub (Scratch Link double or Web Bluetooth shim): legopoweredup
//      turns the Technic Hub's motor A 360 ± 2° and back; legoboostunified drives the Move Hub rover ahead and
//      turns it; wedo2unified runs the WeDo rover until its motion sensor sees the wall, and stops it.
//  20. the EV3 and NXT (scripts/lib/sim-lab-hubs-bt-gate.mjs, --part=hubs-bt, docs/ROBOT-LAB-EV3-NXT.md):
//      their extensions reach the Lab's bricks over Scratch Link (the BT-classic registry) — the NXT
//      bumper bot's example (legonxt blocks, UI only) turns both wheels 360 ± 2° and stops on its bumper
//      at the wall; stock Scratch EV3 blocks stop the EV3 wall stopper before the wall on its ultrasonic
//      sensor; the DEVICE EV3 example becomes ev3comprehensive blocks.
//  21. parts from the whole LDraw catalogue (scripts/lib/sim-lab-catalogue-gate.mjs, --part=editor,
//      docs/ROBOT-LAB-ARCHITECTURE.md §5.4.1), against a stand-in mirror: "+" finds, adds and places a
//      part the app does not ship; a sticker joins as decoration; credits name the files; a model with
//      both simulates; both are back after a reload.
//  22. Simulate's speed, Readings, sensor rays and replay (scripts/lib/sim-lab-simulate-ux-gate.mjs,
//      --part=ui), on the Wall stopper: ½× halves simulated time; Readings shows motors A, B and the
//      distance sensor, moving as it drives; the sensor's ray is drawn; paused, the replay slider shows
//      an earlier pose, and Run goes on from now.
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
import {editorParityInteractions} from './lib/sim-lab-editor-parity-gate.mjs';
import {connectInteractions} from './lib/sim-lab-connect-gate.mjs';
import {catalogueInteractions} from './lib/sim-lab-catalogue-gate.mjs';
import {simulateUxInteractions} from './lib/sim-lab-simulate-ux-gate.mjs';
import {apiInteractions, DEGREES_TOLERANCE} from './lib/sim-lab-api-gate.mjs';
import {hubsInteractions, HUB_DEGREES_TOLERANCE} from './lib/sim-lab-hubs-gate.mjs';
import {hubsBtInteractions} from './lib/sim-lab-hubs-bt-gate.mjs';
import {openRobotLabTab, tool, toolbarInteractions} from './lib/sim-lab-toolbar-gate.mjs';
import {scaleInteractions, OPEN_BUDGET_MS, DRAW_CALL_BUDGET, BUILD_OPEN_BUDGET_MS, IDLE_FRAME_BUDGET_MS, POINTER_MOVE_BUDGET_MS,
    DRAG_LINK_BUDGET, UNDO_DRAW_BUDGET} from './lib/sim-lab-scale-gate.mjs';
import {brakingBound, judgeWallStop} from './lib/sim-lab-wall-stopper-judge.mjs';
import {STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';

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

const WALL_STOPPER_PROGRAM = await readFile(resolve(root, 'overlay/scratch-gui/static/sim-lab/programs/wall-stopper.bw'), 'utf8');

const JSZip = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url))('jszip');

/** One clock (8c): a timed drive whose distance depends on the program's clock agreeing with the world's. */
const TIMED_DRIVE = 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  wait 5 seconds\n  start moving steering 0\n  wait 2 seconds\n  stop movement\n';
const PROGRAM = 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  move forward 20 cm\n';

/** docs/SIM-LAB.md: the Colour Zones mat's red square, 0.3 m, centred at (-0.35, -0.35). */
const inRed = ([x, , z]) => Math.abs(x + 0.35) <= 0.15 && Math.abs(z + 0.35) <= 0.15;
const at = p => `(${p[0].toFixed(3)}, ${p[2].toFixed(3)})`;
/** The Robot Lab's other example robots: model, its mat, what lands in the Code tab, and how the outcome is judged. */
const EXAMPLES = [
    {name: 'Wall stopper', file: 'wall-stopper.ldr', mat: 'wall', sensor: 'distance', simMs: 10000,
        code: /wait until \(spike distance D\) < 10/, goal: /stop before the wall/,
        // scripts/lib/sim-lab-wall-stopper-judge.mjs: (a) never touches the wall, (b) the stop begins within two VM
        // frames and a sensor period after the reading first goes below 10 cm, (c) the overrun stays within the
        // crossing speed times that budget plus the braking distance of the shorted motors, from the model.
        judge: r => {
            assert.ok(r.faceX - r.startAxle[0] > 0.5, `the wall was not ahead: ${JSON.stringify(r)}`);
            const brake = brakingBound(r.mechanism, {speedPercent: Number(/set movement speed (\d+)/.exec(WALL_STOPPER_PROGRAM)[1]), hubBody: r.hubBody});
            const v = judgeWallStop(r.wallSamples, {faceX: r.faceX, thresholdMm: 100, frameMs: r.frameMs, sensorMs: STEP_MS, brakeM: brake.brakeM});
            const said = `front ${(v.frontGap * 100).toFixed(1)} cm, ray origin ${(v.rayGap * 100).toFixed(1)} cm from the wall; ` +
                `stop began ${v.reactionMs?.toFixed(1)} ms after the reading went below 10 cm (budget ${v.budgetMs.toFixed(1)}), ` +
                `ran on ${v.overrunM === null ? '-' : (v.overrunM * 100).toFixed(2)} cm (bound ${v.overrunBoundM === null ? '-' : (v.overrunBoundM * 100).toFixed(2)}, ` +
                `braking ${(brake.brakeM * 100).toFixed(2)} cm)`;
            assert.deepEqual(v.failures, [], `${said}: ${JSON.stringify({...r, mechanism: undefined, wallSamples: r.wallSamples.length})}`);
            return `stops ${said}, never touching it`;
        }},
    {name: 'Colour explorer', file: 'colour-explorer.ldr', mat: 'colour-zones', sensor: 'color', simMs: 15000,
        code: /wait until spike color C is red/, goal: /find the red square/,
        judge: r => {
            assert.ok(!inRed(r.startAxle), 'it started outside the red square');
            assert.ok(inRed(r.last.axle) && inRed(r.last.spot), `not at rest inside the red square: ${JSON.stringify(r)}`);
            return `comes to rest inside the red square: axle ${at(r.last.axle)}, sensor spot ${at(r.last.spot)}`;
        }}
];

/**
 * `--cpu-throttle=N` slows every page's CPU N-fold (CDP Emulation.setCPUThrottlingRate), as a busy
 * CI runner does: the VM's wall-clock blocks and the worker's simulated time then drift apart, which
 * is how the Forklift's lift was cut short in CI (run 39079251326). 1 (default) is no throttling.
 */
const CPU_THROTTLE = Number((process.argv.find(a => a.startsWith('--cpu-throttle=')) || '--cpu-throttle=1').slice('--cpu-throttle='.length));
/**
 * `--worker-latency=MS` delays every message the page posts to a Web Worker by MS of wall time: a
 * physics worker that answers slowly, as on a loaded runner. The session sends at most
 * MAX_BATCH_STEPS (100 ms) of simulated time per round trip and drops the rest, so simulated time
 * then runs slower than the VM's wall clock — the case CI's CPU throttling of the page cannot make
 * (it slows the VM and the ticks alike).
 */
const WORKER_LATENCY = Number((process.argv.find(a => a.startsWith('--worker-latency=')) || '--worker-latency=0').slice('--worker-latency='.length));
/**
 * Wall time to allow for `simMs` of simulated time. One clock (docs/SIM-LAB-PLAN.md §4.9): the VM
 * steps only when the world has caught up, so every VM frame of simulated time costs at least one
 * round trip to the worker (two when a command in flight redoes the batch): under --worker-latency
 * the whole program slows down instead of running ahead of the world, and the wait has to allow it.
 */
const wallBudget = simMs => 240000 + Math.ceil(simMs / (1000 / 30)) * (2 * WORKER_LATENCY + 20);
/** `--examples=a,b` runs only those example robots in the examples part (line-follower, wall-stopper, colour-explorer, forklift, sumo, timed-drive). */
const ONLY_EXAMPLES = (process.argv.find(a => a.startsWith('--examples=')) || '').slice('--examples='.length).split(',').filter(Boolean);
const runExample = file => !ONLY_EXAMPLES.length || ONLY_EXAMPLES.includes(file.replace(/\.ldr$/, ''));

/**
 * Opens the Robot Lab with `program` in the Code tab. `via: 'tab'` (default) clicks the Robot Lab tab;
 * `via: 'arena'` takes the SPIKE arena's "Open in Robot Lab" (the arena in the right pane). `stage`
 * keeps the right pane (stage, arena) open beside the editor, so the Lab gets only part of the width.
 */
const openSimLab = async (page, {noWebgl = false, typed = false, program = PROGRAM, via = 'tab', stage = via === 'arena'} = {}) => {
    if (CPU_THROTTLE > 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', {rate: CPU_THROTTLE});
    }
    if (WORKER_LATENCY > 0) {
        await page.addInitScript(ms => {
            const post = Worker.prototype.postMessage;
            Worker.prototype.postMessage = function (...args) { setTimeout(() => post.apply(this, args), ms); };
        }, WORKER_LATENCY);
    }
    await page.addInitScript(([force, rightPane]) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', rightPane ? '0' : '1');
        if (force) window.__bwSimLabForceNoWebGL = true;
    }, [noWebgl, stage]);
    // Camera moves the program makes ease over 300 ms (docs/ROBOT-LAB-UX.md §3.7); these checks read the camera
    // right after a view button, so they run with reduced motion (a jump). The connect checks test the easing.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    // The Code tab ("Skripte" on a German page).
    await page.getByRole('tab', {name: /^(Code|Skripte)$/}).click();
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
    if (via === 'arena') {
        // The arena (right pane) offers the Robot Lab; it opens in its own tab and the arena stands aside.
        await page.getByTestId('bw-open-spike-arena').click();
        await page.getByTestId('bw-spike-simulator').waitFor({timeout: 60000});
        await page.getByTestId('bw-spike-simulator-open-robot-lab').click();
    } else {
        await openRobotLabTab(page);
    }
    await page.waitForFunction(() => ['ready', 'failed'].includes(window.__bwSimLab?.status), null, {timeout: 90000});
    if (via === 'arena') {
        await page.getByTestId('bw-spike-simulator-lab-active').waitFor({timeout: 10000});
        assert.equal(await page.getByTestId('bw-spike-arena-start').count(), 0, 'the arena stands aside while the Robot Lab drives the hub');
    }
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
    const motors = pane.hub.data.motors;
    return {pos: [b[i * 7], b[i * 7 + 1], b[i * 7 + 2]], a: motors[0].position, b: motors[1].position, time: s.time};
});

// One gate, six CI steps (each within the per-step budget, gen-gate-budgets.mjs):
// `--part=core|examples|ui|tablet|layout|editor|scale|api|hubs-ble|hubs-bt` runs one section; no flag runs all of them.
const PART = (process.argv.find(a => a.startsWith('--part=')) || '--part=all').slice('--part='.length);
const PARTS = ['core', 'examples', 'ui', 'tablet', 'layout', 'editor', 'scale', 'api', 'hubs-ble', 'hubs-bt'];
if (PART !== 'all' && !PARTS.includes(PART)) throw new Error(`--part must be one of ${PARTS.join(', ')} (got ${PART})`);
const want = part => PART === 'all' || PART === part;

let browser;
const errors = [];
try {
    browser = await chromium.launch({headless: true, args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']});

    if (want('core')) { // load, run hint, drive pad, mats, Build/CAD, palette, a program drives it, save and reopen
        const page = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        // Through the SPIKE arena's "Open in Robot Lab" (the route the Lab had before it was a tab).
        const state = await openSimLab(page, {typed: true, via: 'arena'});
        assert.equal(state.view3d, 'webgl', `3D view: ${JSON.stringify(state)}`);
        assert.equal(await page.getByRole('tab', {name: 'Robots', exact: true}).getAttribute('aria-selected'), 'true',
            'the arena\'s Open in Robot Lab shows the Robot Lab tab');
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

        // 3. Load the typed program with "⇦ To blocks" in the Code tab (as a person would), back to the
        //    Robot Lab tab, then Run: the program drives it.
        await page.getByRole('tab', {name: 'Code', exact: true}).click();
        await page.getByRole('button', {name: '⇦ To blocks'}).first().click();
        if (process.env.SIM_DEBUG) {
            await page.screenshot({path: resolve(artifacts, 'to-blocks.png'), fullPage: true});
            console.log('DEBUG to-blocks', await page.getByRole('button', {name: '⇦ To blocks'}).count(),
                JSON.stringify(await page.evaluate(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent || '(none)')));
        }
        await page.waitForFunction(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent.includes('Blocks loaded.'),
            null, {timeout: 60000});
        await openRobotLabTab(page);
        await page.getByTestId('bw-sim-lab-pause').click();
        const before = await reading(page);
        // Run starts the program on the green flag, as the arena's Start does.
        await page.getByTestId('bw-sim-lab-run').click();
        if (process.env.SIM_DEBUG) {
            console.log('DEBUG', JSON.stringify(await page.evaluate(() => {
                const h = window.__bwSimLab._pane.hub;
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
        await tool(page, 'undo');
        assert.equal(await count(), start + 2);
        await tool(page, 'redo');
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
            localStorage.setItem('bw-right-pane-hidden', '1');
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
        await openRobotLabTab(reopen);
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
    }

    if (want('examples')) { // the example robots run their programs to the end
        // 6. The line follower: model, mat, example program, Run — a lap on the line.
        if (runExample('line-follower.ldr')) {
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
            null, {timeout: wallBudget(60000)});
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
        }

        // 7. The Wall stopper and 8. the Colour explorer, through the UI only: choose the model,
        // "Load example program" (it lands in the Code tab, becomes blocks, and puts the robot on
        // the example's mat by itself), Run, and judge where the robot comes to rest.
        for (const example of EXAMPLES.filter(e => runExample(e.file))) {
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
                const hubState = window.__bwSimLab._pane.hub;
                const drivePorts = (s.mechanism.actuators || []).map(a => a.port);
                s.onAdvance(() => {
                    const sample = {t: s.time - rec.start, axle: carried(hubId, axle0), spot: carried(sensor.body, sensor.origin)};
                    if (wall) {
                        sample.front = Math.max(...robot.flatMap(b => b.colliders.map(c => reachX(b.id, c))));
                        rec.closestGap = Math.min(rec.closestGap, rec.faceX - sample.front);
                        // What the hub holds after this advance: the distance reading and whether both drive motors run.
                        sample.reading = hubState.data.sensors['ABCDEF'.indexOf(sensor.port)].distance;
                        sample.driving = drivePorts.every(port => hubState.motors.busy(port));
                    }
                    rec.samples.push(sample);
                });
            }, {sensor: example.sensor});
            await ex.getByTestId('bw-sim-lab-run').click();
            // Simulated time decides: the run is judged after example.simMs of it, however long that takes in wall time.
            await ex.waitForFunction(ms => window.__bwSimLab._pane.session.time - window.__bwExample.start > ms, example.simMs, {timeout: wallBudget(example.simMs)});
            const rec = await ex.evaluate(() => {
                const r = window.__bwExample;
                const last = r.samples.at(-1);
                const before = r.samples.find(p => p.t >= last.t - 1000);
                const pane = window.__bwSimLab._pane;
                const wall = r.faceX !== null;
                return {worker: r.worker, stats: pane.session.stats, motors: pane.hub.data.motors.slice(0, 2),
                    mechanism: wall ? pane.session.mechanism : null, hubBody: pane.session.bridge.hubBody,
                    frameMs: pane.props.vm.runtime.currentStepTime,
                    wallSamples: wall ? r.samples.map(p => ({t: p.t, front: p.front, ray: p.spot[0], reading: p.reading, driving: p.driving})) : null,
                    sensors: pane.hub.data.sensors.slice(2, 4), faceX: r.faceX, closestGap: r.closestGap, last, samples: r.samples.length,
                    restMm: 1000 * Math.hypot(last.axle[0] - before.axle[0], last.axle[2] - before.axle[2]),
                    startAxle: r.samples[0].axle};
            });
            await ex.screenshot({path: resolve(artifacts, `sim-lab-${example.file.replace('.ldr', '')}.png`), fullPage: true});
            assert.equal(rec.worker, true, `the ${example.name} ran its physics in the worker`);
            assert.ok(rec.restMm < 2, `the ${example.name} is not at rest: ${JSON.stringify(rec)}`);
            console.log(`PASS the ${example.name}'s example program, loaded from the pane, ${example.judge(rec)}`);
            await ex.close();
        }

        if (runExample('forklift.ldr')) {
        // 8b. The Forklift (R4): choose it, "Load example program" (it puts the robot on the Warehouse
        // mat with its pallet), Run, and judge the pallet's height from its body's pose: up 40 mm, held,
        // and back down — a rack and pinion and a world load, through the worker.
        const fl = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
        fl.on('pageerror', error => errors.push(error.message));
        fl.on('dialog', dialog => dialog.accept());
        await openSimLab(fl, {program: null});
        await fl.getByTestId('bw-sim-lab-model').selectOption('forklift.ldr');
        await fl.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.modelFile === 'forklift.ldr' &&
            window.__bwSimLab._pane.session, null, {timeout: 60000});
        await fl.getByRole('button', {name: 'Load example program'}).click();
        await fl.waitForFunction(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent.includes('Blocks loaded.'),
            null, {timeout: 60000});
        assert.match(await fl.locator('.cm-content').first().textContent(), /run motor C clockwise 573 degrees/, 'the Forklift\'s example is in the Code tab');
        await fl.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session?.mat === 'warehouse', null, {timeout: 60000});
        await fl.evaluate(() => {
            const s = window.__bwSimLab._pane.session;
            const rec = window.__bwForklift = {start: s.time, y0: s.core.bodyPose('load:pallet').position[1], max: 0, last: 0, worker: s.worker,
                loads: s.mechanism.bodies.filter(b => b.role === 'load').map(b => b.id)};
            s.onAdvance(() => {
                const dy = s.core.bodyPose('load:pallet').position[1] - rec.y0;
                rec.max = Math.max(rec.max, dy);
                rec.last = dy;
            });
        });
        const wall0 = Date.now();
        await fl.getByTestId('bw-sim-lab-run').click();
        await fl.waitForFunction(() => window.__bwSimLab._pane.session.time - window.__bwForklift.start > 14000, null, {timeout: wallBudget(14000)});
        console.log(`  (14 s simulated took ${((Date.now() - wall0) / 1000).toFixed(1)} s of wall time)`);
        const lift = await fl.evaluate(() => ({...window.__bwForklift, stats: window.__bwSimLab._pane.session.stats}));
        await fl.screenshot({path: resolve(artifacts, 'sim-lab-forklift.png'), fullPage: true});
        assert.equal(lift.worker, true, 'the Forklift ran its physics in the worker');
        assert.deepEqual(lift.loads, ['load:pallet'], 'the Warehouse mat put its pallet in the scene');
        assert.ok(Math.abs(lift.max - 0.04) <= 0.001, `the pallet rose ${lift.max} m, not 40 mm: ${JSON.stringify(lift)}`);
        assert.ok(Math.abs(lift.last) <= 0.001, `the pallet ended ${lift.last} m up: ${JSON.stringify(lift)}`);
        console.log(`PASS the Forklift's example program, loaded from the pane, lifts the pallet ${(lift.max * 1000).toFixed(2)} mm and sets it down (${(lift.last * 1000).toFixed(2)} mm); ` +
            `worker: ${lift.stats.batches} batches, round trip ${(lift.stats.roundTripMs / lift.stats.batches).toFixed(1)} ms mean, ${lift.stats.redos} redone, ${lift.stats.droppedMs} ms dropped`);
        await fl.close();
        }

        if (runExample('timed-drive.ldr')) {
        // 8c. Program time IS simulated time (one clock, docs/SIM-LAB-PLAN.md §4.9): `wait 5 seconds`,
        // `start moving`, `wait 2 seconds`, `stop movement` on the driving base. The drive must last
        // 2.00 s of SIMULATED time (± one VM frame) and cover the same distance however slowly the
        // physics worker answers (--worker-latency): a program's clock that ran on wall time ended the
        // wait early in simulated time whenever the world could not keep up.
        const td = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
        td.on('pageerror', error => errors.push(error.message));
        td.on('dialog', dialog => dialog.accept());
        await openSimLab(td, {program: TIMED_DRIVE});
        await td.evaluate(() => {
            const pane = window.__bwSimLab._pane;
            const s = pane.session;
            const hubState = pane.hub;
            const hub = s.bridge.hubBody;
            const rec = window.__bwTimed = {start: s.time, samples: [], frameMs: pane.props.vm.runtime.currentStepTime};
            s.onAdvance(() => {
                const p = s.core.bodyPose(hub).position;
                rec.samples.push({t: s.time - rec.start, x: p[0], z: p[2], driving: hubState.motors.busy('A') && hubState.motors.busy('B')});
            });
        });
        const wallTd = Date.now();
        await td.getByTestId('bw-sim-lab-run').click();
        await td.waitForFunction(() => window.__bwSimLab._pane.session.time - window.__bwTimed.start > 9000, null, {timeout: wallBudget(9000)});
        const timed = await td.evaluate(() => ({...window.__bwTimed, stats: window.__bwSimLab._pane.session.stats,
            rtfShown: document.querySelector('[data-testid="bw-sim-lab-status"]')?.textContent || ''}));
        const tdWallS = (Date.now() - wallTd) / 1000;
        const ts = timed.samples;
        const on = ts.findIndex(p => p.driving);
        const off = on < 0 ? -1 : ts.findIndex((p, i) => i > on && !p.driving);
        assert.ok(on > 0 && off > on, `the timed drive started and stopped: ${JSON.stringify({on, off, n: ts.length})}`);
        // The command took effect from the sample BEFORE the one that first shows it (see sim-lab-wall-stopper-judge.mjs).
        const startedMs = ts[on - 1].t;
        const stoppedMs = ts[off - 1].t;
        const spanMs = stoppedMs - startedMs;
        const rest = ts.at(-1);
        const origin = ts[on - 1];
        const travelled = Math.hypot(rest.x - origin.x, rest.z - origin.z);
        assert.ok(Math.abs(spanMs - 2000) <= timed.frameMs + 1, `the 2 s drive lasted ${spanMs} ms simulated: ${JSON.stringify({startedMs, stoppedMs, frameMs: timed.frameMs})}`);
        // The distance is printed, not judged against a number: it must be the same at every --worker-latency
        // (compare the PASS lines), which test/bw-sim-program-clock.test.mjs asserts headless (± 1 %).
        assert.ok(travelled > 0.1, `the 2 s drive barely moved the robot: ${travelled} m`);
        await td.screenshot({path: resolve(artifacts, 'sim-lab-timed-drive.png'), fullPage: true});
        console.log(`PASS wait 5 s, start moving, wait 2 s, stop: moved at ${(startedMs / 1000).toFixed(3)} s simulated, drove ` +
            `${(spanMs / 1000).toFixed(3)} s simulated and ${(travelled * 1000).toFixed(1)} mm (9 s simulated took ${tdWallS.toFixed(1)} s of wall time; ` +
            `status "${timed.rtfShown}"; ${timed.stats.batches} batches, ${timed.stats.redos} redone, ${timed.stats.droppedMs} ms dropped)`);
        await td.close();
        }

        if (runExample('sumo.ldr')) {
        // 8d. The Sumo ring (the Colour explorer with sumo.bw): 20 s of simulated time, inside the ring, to
        // the band and back (thresholds: test/bw-sim-sumo-program.test.mjs). The final pose is printed: one
        // clock makes it the same at every --worker-latency.
        const su = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
        su.on('pageerror', error => errors.push(error.message));
        su.on('dialog', dialog => dialog.accept());
        await openSimLab(su, {program: null});
        await su.getByTestId('bw-sim-lab-model').selectOption('sumo');
        await su.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.shipped === 'sumo' &&
            window.__bwSimLab._pane.session, null, {timeout: 60000});
        await su.getByRole('button', {name: 'Load example program'}).click();
        await su.waitForFunction(() => document.querySelector('[data-testid="bw-code-status"]')?.textContent.includes('Blocks loaded.'),
            null, {timeout: 60000});
        assert.match(await su.locator('.cm-content').first().textContent(), /wait until spike color C is black/, 'the sumo example is in the Code tab');
        await su.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session?.mat === 'sumo', null, {timeout: 60000});
        await su.evaluate(() => {
            const s = window.__bwSimLab._pane.session;
            const hubId = s.bridge.hubBody;
            const hinges = s.mechanism.joints.filter(j => j.motor);
            const axle0 = [0, 1, 2].map(i => (hinges[0].point[i] + hinges[1].point[i]) / 2);
            const hub0 = s.mechanism.bodies.find(b => b.id === hubId).position;
            const rotate = ([x, y, z, w], v) => {
                const ix = w * v[0] + y * v[2] - z * v[1];
                const iy = w * v[1] + z * v[0] - x * v[2];
                const iz = w * v[2] + x * v[1] - y * v[0];
                const iw = -x * v[0] - y * v[1] - z * v[2];
                return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
            };
            const rec = window.__bwSumo = {start: s.time, t: 0, maxR: 0, entries: 0, travel: 0, prev: null, axle: null};
            s.onAdvance(() => {
                if (rec.t >= 20000) return; // judged over the first 20 s of simulated time
                const pose = s.core.bodyPose(hubId);
                const p = rotate(pose.rotation, axle0.map((v, i) => v - hub0[i])).map((v, i) => v + pose.position[i]);
                const r = Math.hypot(p[0], p[2]);
                rec.maxR = Math.max(rec.maxR, r);
                if (rec.prev) {
                    rec.travel += Math.hypot(p[0] - rec.prev[0], p[2] - rec.prev[2]);
                    if (Math.hypot(rec.prev[0], rec.prev[2]) < 0.3 && r >= 0.3) rec.entries++;
                }
                rec.prev = p;
                rec.axle = p;
                rec.t = s.time - rec.start;
            });
        });
        await su.getByTestId('bw-sim-lab-run').click();
        await su.waitForFunction(() => window.__bwSumo.t >= 20000, null, {timeout: wallBudget(20000)});
        const sumo = await su.evaluate(() => window.__bwSumo);
        assert.ok(sumo.maxR < 0.385, `the robot left the ring: ${JSON.stringify(sumo)}`);
        assert.ok(sumo.entries >= 2, `it drove to the band only ${sumo.entries} times in 20 s: ${JSON.stringify(sumo)}`);
        console.log(`PASS the Sumo example keeps the robot in the ring for 20 s simulated: at most ${(sumo.maxR * 1000).toFixed(1)} mm from the centre, ` +
            `${sumo.entries} drives to the band, ${sumo.travel.toFixed(3)} m travelled, axle at (${sumo.axle[0].toFixed(4)}, ${sumo.axle[2].toFixed(4)}) at ${(sumo.t / 1000).toFixed(3)} s`);
        await su.close();
        }
    }

    if (want('ui')) { // the tab, its toolbar and camera; seeing the model, instructions, no-WebGL fallback
        // 15. The Robot Lab tab: icon toolbar (names, tooltips with shortcuts, every action by click and key)
        //     and the movable 3D view (orbit, pan, zoom by mouse and keys; part drags move parts), in English…
        const bar = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block'});
        bar.on('pageerror', error => errors.push(error.message));
        bar.on('dialog', dialog => dialog.accept());
        await openSimLab(bar, {program: null});
        const moved = await toolbarInteractions(bar, {shotsDir: artifacts, labels: {
            simulate: {'mode-simulate': 'Simulate', 'mode-build': 'Build', instructions: 'Instructions', run: 'Run', reset: 'Reset',
                'view-home': 'Home view', 'view-fit': 'Fit in view', 'show-ports': 'Show ports', 'file-menu': 'File', help: 'Help'},
            build: {'mode-move': 'Move with arrows', turn: 'Turn 90°', undo: 'Undo', 'view-top': 'View from the top', 'parts-toggle': 'Parts'}}});
        console.log('PASS the Robot Lab tab: every toolbar control is named and its tooltip gives its shortcut; every Build action works by click and by key');
        for (const mode of ['simulate', 'build']) {
            const m = moved[`${mode}Camera`];
            console.log(`PASS camera (${mode}): Top/Front/Side/Home frame the model; a left drag on empty space orbits ${(m.orbitM * 100).toFixed(1)} cm ` +
                `about a fixed target, a right drag pans ${(m.panM * 100).toFixed(1)} cm, the wheel zooms ×${m.zoom.toFixed(2)}, arrows orbit, Shift+arrows pan, - zooms out`);
        }
        console.log(`PASS Build: a drag on a part moves it ${moved.partDrag.movedLdu.toFixed(0)} LDU and leaves the camera; with a part selected the arrows leave the camera`);
        await bar.close();
        // …and in German (a de-DE page): the same controls, German names and German shortcut keys.
        const de = await browser.newPage({viewport: {width: 1366, height: 900}, serviceWorkers: 'block', locale: 'de-DE'});
        de.on('pageerror', error => errors.push(error.message));
        await openSimLab(de, {program: null});
        const german = await toolbarInteractions(de, {shotsDir: artifacts, full: false, labels: {
            simulate: {'mode-simulate': 'Simulieren', 'mode-build': 'Bauen', instructions: 'Bauanleitung', run: 'Start', reset: 'Zurücksetzen',
                'view-home': 'Startansicht', 'show-ports': 'Ports zeigen', help: 'Hilfe'},
            build: {'mode-move': 'Mit Pfeilen schieben', turn: 'Um 90° drehen', undo: 'Rückgängig', 'parts-toggle': 'Teile'}}});
        assert.match(german.buildControls.find(c => c.id === 'bw-sim-lab-undo').title, /^Rückgängig \(Strg\+Z\)$/, 'German tooltips name German keys');
        assert.equal(await de.getByRole('tab', {name: 'Roboter', exact: true}).getAttribute('aria-selected'), 'true', 'the tab is called Roboter-Labor');
        console.log('PASS the Robot Lab tab in German: Roboter, every control named in German, tooltips with Strg/Umschalt shortcuts');
        await de.close();

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
        // 22. Simulate's speed, Readings, sensor rays and replay (scripts/lib/sim-lab-simulate-ux-gate.mjs).
        const ux = await browser.newPage({viewport: {width: 1440, height: 900}, serviceWorkers: 'block'});
        ux.on('pageerror', error => errors.push(error.message));
        ux.on('dialog', dialog => dialog.accept());
        await openSimLab(ux, {program: null});
        const u = await simulateUxInteractions(ux, {shotsDir: artifacts});
        console.log(`PASS simulate: ½× runs at ${u.halfRate.toFixed(2)} of 1×'s rate; Readings shows ${u.readings} rows that move with the robot; ` +
            `the distance sensor's ray is drawn (${u.rayCm} cm); paused, the replay goes back ${u.replayBackM.toFixed(2)} m of motion and Run goes on from now`);
        await ux.close();
    }

    if (want('tablet')) { // a 1024×768 touch page, real fingers only
        // 11. A school tablet: a 1024×768 touch page, real fingers only (scripts/lib/sim-lab-touch-gate.mjs).
        const tablet = await browser.newPage({viewport: {width: 1024, height: 768}, hasTouch: true, serviceWorkers: 'block'});
        tablet.on('pageerror', error => errors.push(error.message));
        tablet.on('dialog', dialog => dialog.accept());
        // The stage column open beside the tab (as on a fresh tablet that uses it), so the Lab starts compact.
        await openSimLab(tablet, {program: null, stage: true});
        await touchInteractions(tablet, {shotsDir: artifacts});
        await tablet.close();
    }

    if (want('layout')) { // the pane's layout at five window sizes, Simulate and Build
        // 12. The layout at five window sizes, Simulate and Build.
        const layout = await layoutInteractions(browser, {open: openSimLab, shotsDir: artifacts, errors});
        for (const row of layout) {
            console.log(`PASS layout ${row.size} ${row.mode}: ${row.layout} pane ${row.pane.join('×')}, 3D view ${row.canvas.join('×')} px (≥ ${MIN_CANVAS_PX} and half the pane), controls on screen` +
                (row.mode === 'Build' ? `, toolbar ${row.toolbarPx} px tall${row.more ? ' with More' : ''}` : ''));
        }
    }

    if (want('editor')) { // the build editor's Studio/LeoCAD tools, real mouse and keys
        // 13. Colour, hide / isolate, mirror, align, measure, edit inside a group, LDraw clipboard, shortcut sheet.
        const studio = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block',
            permissions: ['clipboard-read', 'clipboard-write']});
        studio.on('pageerror', error => errors.push(error.message));
        studio.on('dialog', dialog => dialog.accept());
        await openSimLab(studio, {program: null});
        await editorParityInteractions(studio, {shotsDir: artifacts});
        await studio.close();
        // 17. Connection-first building (scripts/lib/sim-lab-connect-gate.mjs, docs/ROBOT-LAB-UX.md §5).
        const connect = await browser.newPage({viewport: {width: 1280, height: 800}, serviceWorkers: 'block'});
        connect.on('pageerror', error => errors.push(error.message));
        connect.on('dialog', dialog => dialog.accept());
        await openSimLab(connect, {program: null});
        const c = await connectInteractions(connect, {shotsDir: artifacts, shots: process.env.BW_UX_SHOTS || artifacts});
        console.log(`PASS connect: the hole under the pointer lights alone (holes ${c.pitchPx.toFixed(0)} px apart), a pin in hand lights pin holes only, ` +
            `h3 kept 5 px towards h4 (and at the midpoint: ${c.hysteresisKept}), a click seats it ${c.t2.engaged} LDU in with one pair; Tab / Shift+Tab; ` +
            `a brick in the way: red, refused; a gear finds the axle's tip, not pin holes; [ on an axle refused, on a pin 15°; R mid-drag turns a Beam 3 about its pin, one undo; ` +
            `a grouped Beam 3 seats both pins (${c.t9.join(', ')}); a lit hole then a tile; keyboard only ("${c.announce}")`);
        console.log(`PASS connect camera: a middle drag keeps its point within ${c.orbitDriftPx.toFixed(2)} px, the wheel ${c.wheelDriftPx.toFixed(2)} px, a pinch ` +
            `${c.pinchDriftPx.toFixed(2)} px; Build looks from ${c.buildPolar.toFixed(0)}°, Simulate stops at ${c.simulatePolar.toFixed(0)}°; a double click centres on its point ` +
            `(eased ${c.focusOff.toFixed(2)} LDU off, reduced motion at once ${c.focusReducedOff.toFixed(2)} LDU; tolerance ${c.focusTol.toFixed(2)} = one pixel there); a trackpad scroll orbits; the view cube's top looks down`);
        await connect.close();
        // 21. Parts from the whole LDraw catalogue (scripts/lib/sim-lab-catalogue-gate.mjs, docs/ROBOT-LAB-ARCHITECTURE.md §5.4.1).
        const cat = await browser.newPage({viewport: {width: 1280, height: 800}, serviceWorkers: 'block'});
        cat.on('pageerror', error => errors.push(error.message));
        cat.on('dialog', dialog => dialog.accept());
        await openSimLab(cat, {program: null});
        const k = await catalogueInteractions(cat, {root, shotsDir: artifacts});
        console.log(`PASS catalogue: "+" finds a part the app does not ship, adds it (${k.brickConnectors} connectors) and a click places it; ` +
            `a sticker joins as decoration and an alias is not offered; the credits name the files' author and licence; ` +
            `${k.chunkRequests} range requests to the mirror and none to static/ldraw for its parts; the model with both simulates; both are back after a reload`);
        await cat.close();
    }
    if (want('scale')) { // a 2,054-part model, instanced, and the .lxf/.io model files
        const page = await browser.newPage({viewport: {width: 1600, height: 1050}, serviceWorkers: 'block', acceptDownloads: true});
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await openSimLab(page, {program: null});
        const r = await scaleInteractions(page, {root, shotsDir: artifacts, JSZip});
        console.log(`PASS a ${r.stats.parts}-part model opens in ${(r.openMs / 1000).toFixed(1)} s (budget ${OPEN_BUDGET_MS / 1000} s), drawn instanced: ` +
            `${r.stats.calls} draw calls (budget ${DRAW_CALL_BUDGET}), ${r.stats.instanced.drawObjects} instanced objects, a frame ${r.frame.median.toFixed(1)} ms ` +
            `(p90 ${r.frame.p90.toFixed(1)}), not blank (${r.colours} byte values)`);
        console.log(`PASS Build opens on the whole ${r.buildParts}-part model in ${(r.buildMs / 1000).toFixed(1)} s (budget ${BUILD_OPEN_BUDGET_MS / 1000} s); ` +
            `an idle frame ${r.idle.median.toFixed(1)} ms (budget ${IDLE_FRAME_BUDGET_MS}; a forced full frame ${r.buildFrame.median.toFixed(0)} ms); ` +
            `a pointer move ${r.hover.median.toFixed(1)} ms hovering, ${r.drag.median.toFixed(1)} ms dragging the gizmo (medians, budget ${POINTER_MOVE_BUDGET_MS}); ` +
            `a click on grid beam ${r.picked} selects it (${r.clickMs} ms), its X arrow moves it ${r.dragged} LDU ` +
            `(${r.dragLinks} shader programs linked, budget ${DRAG_LINK_BUDGET}) and one undo puts it back ` +
            `(${r.undoDraws} frame drawn, budget ${UNDO_DRAW_BUDGET}; on screen ${(r.undoShotMs / 1000).toFixed(1)} s)`);
        console.log('PASS the hand-made .lxf opens with its unknown, mirrored and uncoloured parts listed; a password-protected .io is refused and the model stays');
        console.log('PASS Save as… → BrickLink Studio (.io) downloads a ZIP whose model.ldr is the model\'s LDraw text, and it reopens to it');
        await page.close();
    }

    if (want('api')) { // the Lab steered from blocks and from `lab` words (runtime.robotLab)
        const r = await apiInteractions({browser, errors, openSimLab, wallBudget});
        console.log(`PASS a Blocks project (robotlab blocks, saved and reloaded as .sb3) loads the hubless motor bench on the lab-direct hub ` +
            `and turns motor A ${r.blocks.angle}° for "run for 360 degrees" (±${DEGREES_TOLERANCE}), in the worker; Robot Lab status "${r.blocks.status}"`);
        console.log(`PASS the motor bench's example in lab words (Load example program, Run): rests at ${r.words.restAngle.toFixed(2)}° ` +
            `for ${r.words.restMs.toFixed(0)} ms of simulated time, runs on to ${r.words.final.toFixed(1)}° at 90 °/s and brakes`);
    }

    if (want('hubs-ble')) { // the LEGO radio hubs driven by the real extensions (Scratch Link double, Web Bluetooth shim)
        const r = await hubsInteractions({browser, errors, openSimLab, wallBudget});
        console.log(`PASS legopoweredup blocks (the Technic Hub bench's example) connect to the Lab's Technic Hub and turn motor A to ` +
            `${r.technic.rest.toFixed(2)}° for "turn motor A on for 360 degrees" (±${HUB_DEGREES_TOLERANCE}), then back to ${r.technic.end.toFixed(2)}°`);
        console.log(`PASS legoboostunified blocks ("AB") drive the BOOST Move Hub rover ${(r.boost.driven * 100).toFixed(1)} cm ahead with its ` +
            `built-in motors A and B, holding a ${r.boost.heading.toFixed(1)}° heading (spread ${r.boost.cruiseSpread.toFixed(2)}°), then spin it ${r.boost.turned.toFixed(0)}°`);
        console.log(`PASS wedo2unified blocks run the WeDo 2.0 rover ${(r.wedo.driven * 100).toFixed(1)} cm until its motion sensor sees the ` +
            `wall (${r.wedo.seenAtStop} mm), and stop it ${r.wedo.rest} mm short of it`);
    }

    if (want('hubs-bt')) { // the EV3 and NXT, their extensions over Scratch Link to the Lab's bricks
        const r = await hubsBtInteractions({browser, errors, openSimLab, wallBudget});
        console.log(`PASS NXT bumper bot (Load example program, Run): legonxt over Scratch Link turns B and C to TachoCount ` +
            `${r.nxt.tacho.join(' and ')} for 360° (±${DEGREES_TOLERANCE}), then drives until the bumper is pressed (${r.nxt.pressedAtMs} ms) and stops`);
        console.log(`PASS EV3 wall stopper with stock Scratch EV3 blocks: drove ${r.ev3.travelled.toFixed(3)} m and stopped ${r.ev3.cm} cm from the wall`);
        console.log(`PASS the EV3 wall stopper's DEVICE EV3 example becomes ${r.device.ops.join(', ')}`);
    }

    assert.deepEqual(errors, [], `page errors: ${errors.join('\n')}`);
    console.log('PASS no page errors');
} finally {
    await browser?.close();
    server.close();
}
