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
        if (which === 'build') view.render();
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

/** Budgets for the gate (headless Chromium on SwiftShader, a CI runner): generous, and named. */
export const OPEN_BUDGET_MS = 120000;
export const BUILD_BUDGET_MS = 60000;
// SwiftShader rasterises the stress model's 4.3 M triangles and 3.4 M line segments on the CPU: about
// 3 s a frame here (2026-10-18, either way: instancing saves draw calls and memory, not raster work); a
// real GPU draws it in ~20 ms (scripts/measure-sim-lab-scale.mjs --gpu=metal). A guard against a frame
// that draws the model twice over or falls back to thousands of meshes, not a smoothness claim.
export const FRAME_BUDGET_MS = 20000;
export const DRAW_CALL_BUDGET = 150;

/**
 * The scale checks: the 2,054-part model opens within OPEN_BUDGET_MS, is drawn instanced in at most
 * DRAW_CALL_BUDGET draw calls and non-blank, a frame finishes within FRAME_BUDGET_MS; Build, on the
 * driving base with one grid tile (269 parts, still instanced: Build on the full model is held up by
 * the editor cloning its model on every read, not by drawing), opens within BUILD_BUDGET_MS and a
 * click on a grid beam selects exactly that beam; then the hand-made
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
    await page.waitForTimeout(500);
    results.colours = await assertDrew(page, 'the stress model');
    const frames = await frameTimes(page, 3);
    results.frame = {median: frames.median, p90: frames.p90};
    results.stats = frames.stats;
    assert.ok(frames.stats.instanced && frames.stats.instanced.instances >= state.parts, `drawn instanced: ${JSON.stringify(frames.stats)}`);
    assert.ok(frames.stats.calls <= DRAW_CALL_BUDGET, `${frames.stats.calls} draw calls (budget ${DRAW_CALL_BUDGET})`);
    assert.ok(frames.median < FRAME_BUDGET_MS, `a frame took ${frames.median.toFixed(1)} ms (budget ${FRAME_BUDGET_MS})`);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-scale-simulate.png'), timeout: 120000});

    // Build: an instanced model (one tile, 269 parts), picked by clicking a part.
    await openFile(page, {name: 'stress-one-tile.ldr', buffer: Buffer.from(await stressText(root, 1)), mimeType: 'text/plain'});
    results.buildParts = await page.evaluate(() => window.__bwSimLab._pane.session.model.parts.length);
    const buildStart = Date.now();
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.editView && window.__bwSimLab.mode === 'build', null, {timeout: BUILD_BUDGET_MS, polling: 250});
    results.buildMs = Date.now() - buildStart;
    assert.ok(results.buildMs < BUILD_BUDGET_MS, `Build took ${results.buildMs} ms to open (budget ${BUILD_BUDGET_MS})`);
    await page.waitForTimeout(500);
    results.buildColours = await assertDrew(page, 'Build on the one-tile model', 'bw-sim-lab-editor-canvas');
    assert.ok(results.buildParts >= 200, `${results.buildParts} parts: Build draws them instanced`);
    const buildFrames = await frameTimes(page, 3, 'build');
    results.buildFrame = {median: buildFrames.median, p90: buildFrames.p90};
    // A beam on the upper layer of the first tile (p16..p30 are the first tile's upper beams), in the middle:
    // it lies on top, so a click on its top face between two holes is a click on it and nothing else.
    const target = await page.evaluate(() => {
        const parts = window.__bwSimLab.editor.model.parts.filter(p => p.part === '32278.dat');
        const upper = parts.filter(p => p.rotation[2] === 1);
        return upper[7].id;
    });
    // Where the beam's top face is on screen, as a person sees it (reading only; the click below is a real click).
    const at = await page.evaluate(id => {
        const v = window.__bwSimLab.editView;
        return v.toScreen(v.debugPoint(id, [0, -10, 10]));
    }, target);
    const box = await page.getByTestId('bw-sim-lab-editor-canvas').boundingBox();
    assert.ok(at[0] > box.x && at[0] < box.x + box.width && at[1] > box.y && at[1] < box.y + box.height, `the beam is on screen: ${at}`);
    await page.mouse.click(at[0], at[1]);
    await page.waitForFunction(id => window.__bwSimLab.editView.selection.length === 1 && window.__bwSimLab.editView.selection[0] === id, target, {timeout: 10000})
        .catch(async () => {
            throw new Error(`clicking beam ${target} selected ${JSON.stringify(await page.evaluate(() => window.__bwSimLab.editView.selection))}`);
        });
    results.picked = target;
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
