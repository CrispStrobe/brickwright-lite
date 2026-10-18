// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Big models and model files in the shipped Robot Lab, for
// scripts/verify-sim-lab-browser.mjs --part=scale and
// scripts/measure-sim-lab-scale.mjs. A model is opened the way a learner
// opens one — "Open…" and a file — and internal APIs are used only to READ
// what happened (status, the view's draw statistics) and to time frames.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {stressModel} from './sim-lab-stress-model.mjs';

/** Two animation frames: the renderer has drawn what the page now holds (a condition, not a sleep). */
const nextFrames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

/** Open a model file through the pane's "Open…" file input; resolves with the wall time until it is ready. */
export const openFile = async (page, {name, buffer, mimeType = 'application/octet-stream', timeout = 120000}) => {
    const started = Date.now();
    await page.getByTestId('bw-sim-lab-file').setInputFiles({name, mimeType, buffer});
    await page.waitForFunction(n => {
        const lab = window.__bwSimLab;
        return lab && lab._pane.state.modelFile === n && ['ready', 'failed'].includes(lab.status);
    }, name.replace(/\.(io|lxf)$/i, '.ldr'), {timeout, polling: 250}); // not per animation frame: a big first frame may take long
    return Date.now() - started;
};

/** The scale model's text (the driving base and eight grid tiles, 2,054 parts; `tiles` changes the count). */
export const stressText = async (root, tiles = 8) => stressModel(await readFile(resolve(root, 'overlay/scratch-gui/static/sim-lab/models/driving-base.ldr'), 'utf8'), {tiles});

/**
 * Frame cost: `n` renders of the current view, each waited for by reading back one pixel (gl.finish alone
 * returns before a software GPU has rasterised the frame), timed in the page.
 * @returns {Promise<{median: number, p90: number, stats: object}>} milliseconds, and the last frame's renderStats
 */
export const frameTimes = (page, n = 30, mode = 'simulate') => page.evaluate(([count, which]) => {
    const pane = window.__bwSimLab._pane;
    const view = which === 'build' ? pane.editView : pane.view;
    const canvas = view.canvas || document.querySelector('[data-testid="bw-sim-lab-3d-canvas"]') || document.querySelector('canvas');
    const gl = canvas.getContext('webgl2');
    const times = [];
    const pixel = new Uint8Array(4);
    for (let i = 0; i < count; i++) {
        const t = performance.now();
        if (which === 'build') view.render({force: true}); // Build draws only when something changed (editor-view3d.js)
        else view.render(pane.session.snapshot(), {force: true}); // a big model is otherwise drawn only when something changed
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    return {median: times[Math.floor(count / 2)], p90: times[Math.floor(count * 0.9)], stats: which === 'build' ? null : view.renderStats()};
}, [n, mode]);

/** Frames the pane's own animation loop managed in `ms` of wall time. */
export const loopFps = (page, ms = 3000) => page.evaluate(span => new Promise(done => {
    let frames = 0;
    const start = performance.now();
    const tick = now => {
        frames++;
        if (now - start < span) requestAnimationFrame(tick);
        else done(frames * 1000 / (now - start));
    };
    requestAnimationFrame(tick);
}), ms);

/** A canvas that drew a model, not one flat colour (as the core part judges the driving base). */
export const assertDrew = async (page, what, testid = 'bw-sim-lab-3d-canvas') => {
    // A page screenshot of the canvas's box: an element screenshot first waits for the element to be
    // "stable" over animation frames, which a busy software renderer (SwiftShader) may not grant in time.
    const box = await page.getByTestId(testid).boundingBox();
    const shot = await page.screenshot({clip: box, timeout: 120000});
    const colours = new Set(shot.subarray(shot.length - 40000)).size;
    assert.ok(colours > 20, `${what}: the 3D canvas looks blank (${colours} byte values)`);
    return colours;
};

/**
 * Listener time per pointer event on the page: a capturing listener on the window starts the clock,
 * a bubbling one on the window (the last to run) stops it, so the number is every handler's work
 * for that event (the editor's hover, picking, gizmo, preview and overlap checks), not the frame.
 */
const timePointerEvents = page => page.evaluate(() => {
    const times = window.__bwPointerMs = {move: [], down: [], up: []};
    let start = 0;
    for (const type of ['pointermove', 'pointerdown', 'pointerup']) {
        window.addEventListener(type, () => { start = performance.now(); }, true);
        window.addEventListener(type, () => { times[type.slice(7)].push(performance.now() - start); }, false);
    }
});
/** The pointer-move times since the last call: {n, median, max} (ms), and a fresh list. */
const pointerMoves = page => page.evaluate(() => {
    const all = window.__bwPointerMs.move.slice().sort((a, b) => a - b);
    window.__bwPointerMs.move.length = 0;
    return {n: all.length, median: all[Math.floor(all.length / 2)] ?? 0, max: all.at(-1) ?? 0};
});
/** Intervals between animation frames over `ms` (Build idle: nothing to redraw). */
const idleFrames = (page, ms = 1500) => page.evaluate(span => new Promise(done => {
    const gaps = [];
    let last = null;
    const start = performance.now();
    const tick = now => {
        if (last !== null) gaps.push(now - last);
        last = now;
        if (now - start < span || gaps.length < 10) requestAnimationFrame(tick);
        else {
            gaps.sort((a, b) => a - b);
            done({n: gaps.length, median: gaps[Math.floor(gaps.length / 2)], p90: gaps[Math.floor(gaps.length * 0.9)]});
        }
    };
    requestAnimationFrame(tick);
}), ms);

/** Budgets for the gate (headless Chromium on SwiftShader, a CI runner): generous, and named. */
export const OPEN_BUDGET_MS = 120000;
// SwiftShader rasterises the stress model's 4.3 M triangles and 3.4 M line segments on the CPU: about
// 3 s a frame here (2026-10-18, either way: instancing saves draw calls and memory, not raster work); a
// real GPU draws it in ~20 ms (scripts/measure-sim-lab-scale.mjs --gpu=metal). A guard against a frame
// that draws the model twice over or falls back to thousands of meshes, not a smoothness claim.
export const FRAME_BUDGET_MS = 20000;
export const DRAW_CALL_BUDGET = 150;
// Build on the full 2,054-part model, measured 2026-10-18 on an 8-core Mac under heavy load (load
// average 12-20) with SwiftShader (scripts/measure-sim-lab-scale.mjs prints the same numbers):
//   open (click to ready and a first frame drawn)  21-32 s, before this change 98 s and click-select never;
//   an idle frame                                  16.7 ms (a 60 Hz animation frame: nothing is redrawn),
//                                                  before 4,650 ms (the model redrawn every frame);
//   a pointer move's handlers (hover, gizmo drag)  median 11-15 ms, max 42 ms, before 8,200 ms.
// Budgets: twice the worst open seen; the task's 100 ms for an idle frame (six times the measured);
// a pointer move's median within 100 ms (seven times the worst median measured: CI runners are slower).
export const BUILD_OPEN_BUDGET_MS = 65000;
export const IDLE_FRAME_BUDGET_MS = 100;
export const POINTER_MOVE_BUDGET_MS = 100;

/**
 * Finds a gizmo handle the way a person does: move the pointer over the gizmo until that handle
 * lights up (rings around its centre), as scripts/lib/sim-lab-cad-gate.mjs does on a small model.
 */
const findHandle = async (page, axis) => {
    const centre = await page.evaluate(() => {
        const v = window.__bwSimLab.editView;
        return v.toScreen(v.debugPoint('gizmo'));
    });
    for (let radius = 20; radius <= 220; radius += 8) {
        for (let a = 0; a < 360; a += 6) {
            const x = centre[0] + radius * Math.cos(a * Math.PI / 180);
            const y = centre[1] + radius * Math.sin(a * Math.PI / 180);
            await page.mouse.move(x, y);
            if (await page.evaluate(() => window.__bwSimLab.editView.gizmoAxis) === axis) return {at: [x, y], centre};
        }
    }
    throw new Error(`no gizmo handle '${axis}' found`);
};

/**
 * The scale checks: the 2,054-part model opens within OPEN_BUDGET_MS, is drawn instanced in at most
 * DRAW_CALL_BUDGET draw calls and non-blank, a frame finishes within FRAME_BUDGET_MS; Build opens on
 * the SAME full model within BUILD_OPEN_BUDGET_MS (ready and a first frame drawn), an idle frame takes
 * at most IDLE_FRAME_BUDGET_MS (nothing redrawn), a pointer move's handlers at most
 * POINTER_MOVE_BUDGET_MS (median), a click on a grid beam selects exactly that beam, and dragging the
 * gizmo's X arrow moves it along x by whole grid steps (one undo puts it back); then the hand-made
 * .lxf opens with its unknown parts listed, a password-protected .io is refused with the model
 * left as it was, and "Save as… → BrickLink Studio (.io)" downloads a ZIP whose model.ldr reopens.
 */
export const scaleInteractions = async (page, {root, shotsDir, JSZip}) => {
    const results = {};
    const text = await stressText(root);
    results.openMs = await openFile(page, {name: 'stress-model.ldr', buffer: Buffer.from(text), mimeType: 'text/plain'});
    const state = await page.evaluate(() => ({status: window.__bwSimLab.status, parts: window.__bwSimLab._pane.session?.model.parts.length,
        errors: window.__bwSimLab.issues.filter(i => i.severity === 'error').map(i => i.code)}));
    assert.equal(state.status, 'ready', `the stress model did not load: ${JSON.stringify(state)}`);
    assert.ok(state.parts > 2000, `${state.parts} parts`);
    assert.ok(results.openMs < OPEN_BUDGET_MS, `opening 2,054 parts took ${results.openMs} ms (budget ${OPEN_BUDGET_MS})`);
    await nextFrames(page);
    results.colours = await assertDrew(page, 'the stress model');
    const frames = await frameTimes(page, 3);
    results.frame = {median: frames.median, p90: frames.p90};
    results.stats = frames.stats;
    assert.ok(frames.stats.instanced && frames.stats.instanced.instances >= state.parts, `drawn instanced: ${JSON.stringify(frames.stats)}`);
    assert.ok(frames.stats.calls <= DRAW_CALL_BUDGET, `${frames.stats.calls} draw calls (budget ${DRAW_CALL_BUDGET})`);
    assert.ok(frames.median < FRAME_BUDGET_MS, `a frame took ${frames.median.toFixed(1)} ms (budget ${FRAME_BUDGET_MS})`);
    // Idle (nothing moves, the camera stays): the pane's animation loop asks for frames, the big model
    // is not drawn again (sim-view3d.js draws it on demand) — else a software GPU queues seconds of
    // frames that everything after (Build opening included) waits behind.
    const drawnBefore = await page.evaluate(() => window.__bwSimLab._pane.view.renderStats().frames);
    results.simIdle = await idleFrames(page, 1000);
    results.simIdleDrawn = await page.evaluate(() => window.__bwSimLab._pane.view.renderStats().frames) - drawnBefore;
    assert.equal(results.simIdleDrawn, 0, `an idle Simulate view redrew the big model ${results.simIdleDrawn} times in ${results.simIdle.n} frames`);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-scale-simulate.png'), timeout: 120000});

    // Build on the full model: open, an idle frame, a pointer move, a click that selects, a gizmo drag.
    await timePointerEvents(page);
    results.buildParts = state.parts;
    const buildStart = Date.now();
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.editView && window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready',
        null, {timeout: BUILD_OPEN_BUDGET_MS, polling: 250});
    await nextFrames(page);
    results.buildMs = Date.now() - buildStart;
    assert.equal(await page.evaluate(() => window.__bwSimLab.editor.model.parts.length), state.parts, 'Build holds the whole model');
    assert.ok(results.buildMs < BUILD_OPEN_BUDGET_MS, `Build took ${results.buildMs} ms to open (budget ${BUILD_OPEN_BUDGET_MS})`);
    results.buildColours = await assertDrew(page, 'Build on the 2,054-part model', 'bw-sim-lab-editor-canvas');
    results.idle = await idleFrames(page);
    assert.ok(results.idle.median < IDLE_FRAME_BUDGET_MS, `an idle Build frame took ${results.idle.median.toFixed(1)} ms (budget ${IDLE_FRAME_BUDGET_MS})`);
    const buildFrames = await frameTimes(page, 2, 'build');
    results.buildFrame = {median: buildFrames.median, p90: buildFrames.p90};
    assert.ok(buildFrames.median < FRAME_BUDGET_MS, `a full Build frame took ${buildFrames.median.toFixed(1)} ms (budget ${FRAME_BUDGET_MS})`);
    // A beam on the upper layer of the fourth tile (front row, on the camera's side of the robot, so nothing
    // stands between it and the home view), in the middle: a click on its top face between two holes is a
    // click on it and nothing else.
    const target = await page.evaluate(() => {
        const parts = window.__bwSimLab.editor.model.parts.filter(p => p.part === '32278.dat');
        const upper = parts.filter(p => p.rotation[2] === 1);
        return upper[3 * 15 + 7].id;
    });
    // Where the beam's top face is on screen, as a person sees it (reading only; the click below is a real click).
    const at = await page.evaluate(id => {
        const v = window.__bwSimLab.editView;
        return v.toScreen(v.debugPoint(id, [0, -10, 10]));
    }, target);
    const box = await page.getByTestId('bw-sim-lab-editor-canvas').boundingBox();
    assert.ok(at[0] > box.x && at[0] < box.x + box.width && at[1] > box.y && at[1] < box.y + box.height, `the beam is on screen: ${at}`);
    // The pointer comes to the beam over the model (hover: picking and highlights on 2,054 parts).
    await pointerMoves(page);
    for (let i = 10; i >= 0; i--) await page.mouse.move(at[0] - i * 12, at[1] - i * 6);
    results.hover = await pointerMoves(page);
    assert.ok(results.hover.n >= 10 && results.hover.median < POINTER_MOVE_BUDGET_MS,
        `a hovering pointer move took ${results.hover.median.toFixed(1)} ms (median of ${results.hover.n}, budget ${POINTER_MOVE_BUDGET_MS})`);
    const clickStart = Date.now();
    await page.mouse.click(at[0], at[1]);
    await page.waitForFunction(id => window.__bwSimLab.editView.selection.length === 1 && window.__bwSimLab.editView.selection[0] === id, target, {timeout: 10000})
        .catch(async () => {
            throw new Error(`clicking beam ${target} selected ${JSON.stringify(await page.evaluate(() => window.__bwSimLab.editView.selection))}`);
        });
    results.clickMs = Date.now() - clickStart;
    results.picked = target;
    // The gizmo's X arrow, found by hovering as a person does, dragged along x: whole grid steps, only x.
    const pose = () => page.evaluate(id => {
        const p = window.__bwSimLab.editor.model.parts.find(x => x.id === id);
        return {position: [...p.position], rotation: [...p.rotation]};
    }, target);
    const p0 = await pose();
    const handle = await findHandle(page, 'X');
    const dir = [handle.at[0] - handle.centre[0], handle.at[1] - handle.centre[1]];
    const len = Math.hypot(...dir);
    await pointerMoves(page);
    await page.mouse.move(handle.at[0], handle.at[1]);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(handle.at[0] + dir[0] / len * 10 * i, handle.at[1] + dir[1] / len * 10 * i);
    results.drag = await pointerMoves(page);
    await page.mouse.up();
    const p1 = await pose();
    const grid = await page.evaluate(() => window.__bwSimLab.editView.grid);
    const dx = p1.position[0] - p0.position[0];
    assert.ok(dx !== 0 && Number.isInteger(dx / grid), `the X arrow moved the beam by a grid multiple (${dx} LDU)`);
    assert.deepEqual([p1.position[1], p1.position[2]], [p0.position[1], p0.position[2]], 'only x changed');
    assert.deepEqual(p1.rotation, p0.rotation);
    assert.ok(results.drag.n >= 12 && results.drag.median < POINTER_MOVE_BUDGET_MS,
        `a gizmo-drag pointer move took ${results.drag.median.toFixed(1)} ms (median of ${results.drag.n}, budget ${POINTER_MOVE_BUDGET_MS})`);
    results.dragged = dx;
    await page.keyboard.press('Control+z');
    assert.deepEqual(await pose(), p0, 'one undo puts the beam back');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-scale-build.png'), timeout: 120000});
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready', null, {timeout: OPEN_BUDGET_MS, polling: 250});

    // Model files: the hand-made .lxf, a password-protected .io, and a .io written by Save as….
    const lxf = await readFile(resolve(root, 'test/fixtures/bw-sim/interop/interop-fixture.lxf'));
    await openFile(page, {name: 'interop-fixture.lxf', buffer: lxf});
    const opened = await page.evaluate(() => ({status: window.__bwSimLab.status, parts: window.__bwSimLab._pane.session?.model.parts.map(p => p.part),
        codes: window.__bwSimLab.issues.map(i => i.code)}));
    assert.equal(opened.status, 'ready', JSON.stringify(opened));
    assert.deepEqual(opened.parts, ['32523.dat', '3705.dat', '32525.dat', '3648.dat']);
    for (const code of ['lxf-unknown-design', 'lxf-bad-transform', 'lxf-unknown-material']) {
        assert.ok(opened.codes.includes(code), `${code} listed: ${opened.codes}`);
    }
    const issuesText = await page.getByTestId('bw-sim-lab-issues').textContent();
    assert.match(issuesText, /LEGO Digital Designer part 3001/);
    results.lxf = opened;

    const encrypted = await readFile(resolve(root, 'test/fixtures/bw-sim/interop/studio-encrypted.io'));
    await page.getByTestId('bw-sim-lab-file').setInputFiles({name: 'old-studio.io', mimeType: 'application/octet-stream', buffer: encrypted});
    await page.getByTestId('bw-sim-lab-message').waitFor({timeout: 10000});
    assert.match(await page.getByTestId('bw-sim-lab-message').textContent(), /password-protected/);
    assert.equal(await page.evaluate(() => window.__bwSimLab._pane.state.modelFile), 'interop-fixture.ldr', 'the model on show stays');

    const before = await page.evaluate(() => window.__bwSimLab._pane.lastText);
    await page.getByTestId('bw-sim-lab-save').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('bw-sim-lab-save-io').click()]);
    assert.equal(download.suggestedFilename(), 'interop-fixture.io');
    const zipBytes = await readFile(await download.path());
    const zip = await JSZip.loadAsync(zipBytes);
    assert.deepEqual(Object.keys(zip.files), ['model.ldr']);
    const inner = await zip.file('model.ldr').async('string');
    assert.equal(inner, before, 'the .io holds the model\'s LDraw text byte for byte');
    await openFile(page, {name: 'interop-fixture.io', buffer: zipBytes});
    assert.equal(await page.evaluate(() => window.__bwSimLab._pane.lastText), before, 'and opens back to it');
    return results;
};
