import {tool} from './sim-lab-toolbar-gate.mjs';
import {openManualControls} from './sim-lab-manual-controls.mjs';
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab on a school tablet, for scripts/verify-sim-lab-browser.mjs: a
// touch-enabled page (1024×768) driven by REAL touch input only — taps through
// Playwright's touchscreen and every press, drag, long press and two-finger
// pinch through CDP `Input.dispatchTouchEvent`, so the page sees pointer events
// with pointerType 'touch' exactly as from a finger. Internal APIs are used to
// READ results (poses, the selection, the camera, the motors) and to find where
// a part is on screen, the way a person sees where it is; never to perform the
// interaction. No fixed sleeps: a long press waits for its effect, driving
// waits on simulated time.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const posesOf = page => page.evaluate(() => Object.fromEntries(window.__bwSimLab.editor.model.parts.map(p => [p.id, {position: p.position, rotation: p.rotation}])));
const pose = async (page, id) => (await posesOf(page))[id];
const selectionOf = page => page.evaluate(() => window.__bwSimLab.editView.selection.slice().sort());
const countOf = page => page.evaluate(() => window.__bwSimLab.editor.model.parts.length);
const editCamera = page => page.evaluate(() => window.__bwSimLab.editView.camera);
const simCamera = page => page.evaluate(() => window.__bwSimLab._pane.view.camera);
/**
 * After an edit the pane recompiles the model (debounced) and may show or drop "Before you
 * press Run" above the view, which moves the view: after a part is added or removed, wait for
 * the compile that counted it and the frame after it before aiming at anything.
 */
const settled = async page => {
    await page.waitForFunction(() => {
        const lab = window.__bwSimLab;
        return lab.insight && lab.insight.parts === lab.editor.model.parts.length;
    }, null, {timeout: 10000});
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
};
/**
 * A tap's click comes after the touch events that Playwright's tap() waits for: Chrome makes it from the
 * tap gesture, as a later input event. On a slow runner, where software GL draws every frame on the page's
 * main thread, it can land after a read made right after tap() — Select all then looked like "1 of 16"
 * (#888, #1097). Wait for a tap's effect (at most 5 s) before asserting it; the assertion after this says
 * what is wrong if the effect never comes.
 */
const effect = async (page, fn, arg, {tapped = null} = {}) => {
    try {
        await page.waitForFunction(fn, arg, {timeout: 5000});
    } catch {
        // the caller's assertion reports it; first, what the tap did (CI keeps the log, not the screen)
        if (tapped) console.log(`touch gate: no effect 5 s after tapping ${tapped}: ${JSON.stringify(await tapReport(page, tapped))}`);
    }
};

/**
 * Keeps the page's last input events (pointer, touch, click, their cancels) with their target and what
 * document.elementFromPoint finds at their point, and counts the Build view's selectAll calls, so a tap
 * without its effect can be explained from the log (a miss on CI's Linux runner left no evidence).
 */
const recordInput = page => page.evaluate(() => {
    const log = window.__bwTapLog = [];
    const name = el => (el && el.closest ? el.closest('[data-testid]')?.dataset.testid || el.tagName : String(el));
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click', 'contextmenu']) {
        document.addEventListener(type, e => {
            const pt = e.changedTouches ? e.changedTouches[0] : e;
            const x = pt ? Math.round(pt.clientX) : null;
            const y = pt ? Math.round(pt.clientY) : null;
            log.push({t: Math.round(performance.now()), type, pointer: e.pointerType || '', x, y, target: name(e.target),
                atPoint: x === null ? null : name(document.elementFromPoint(x, y)), prevented: e.defaultPrevented});
            if (log.length > 40) log.shift();
        }, true);
    }
    window.__bwSelectAllCalls = 0;
});

const tapReport = (page, testid) => page.evaluate(id => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    const r = el && el.getBoundingClientRect();
    const view = window.__bwSimLab && window.__bwSimLab.editView;
    return {
        now: Math.round(performance.now()),
        button: el ? {box: [r.x, r.y, r.width, r.height].map(Math.round), disabled: el.disabled,
            atCentre: (document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-testid]') || {}).dataset?.testid || null} : 'missing',
        selectAllCalls: window.__bwSelectAllCalls,
        selection: view ? view.selection.length : null,
        parts: window.__bwSimLab?.editor?.model.parts.length ?? null,
        status: document.querySelector('[data-testid="bw-sim-lab-build-status"]')?.textContent || null,
        events: (window.__bwTapLog || []).slice(-24)
    };
}, testid);

/** Counts calls into the Build view's selectAll (the view is made anew each time Build opens). */
const countSelectAll = page => page.evaluate(() => {
    const view = window.__bwSimLab.editView;
    if (!view || view.__bwCounted) return;
    const inner = view.selectAll;
    view.selectAll = (...args) => { window.__bwSelectAllCalls++; return inner(...args); };
    view.__bwCounted = true;
});

/** Where a point on a part (LDU, part frame), or the gizmo's centre, is on screen right now. */
const screenOf = (page, id, local) => page.evaluate(([i, l]) => {
    const v = window.__bwSimLab.editView;
    const w = v.debugPoint(i, l || undefined);
    return w && v.toScreen(w);
}, [id, local || null]);
/** A point on a beam's top face between two holes (where a finger presses, not into a hole). */
const ON_BEAM = [0, -10, 10];
const sameParts = (a, b, except = []) => Object.keys(a).filter(id => !except.includes(id))
    .every(id => b[id] && JSON.stringify(a[id]) === JSON.stringify(b[id]));
const angleBetween = (a, b) => {
    const u = a.position.map((v, i) => v - a.target[i]);
    const w = b.position.map((v, i) => v - b.target[i]);
    const dot = u.reduce((s, v, i) => s + v * w[i], 0) / (Math.hypot(...u) * Math.hypot(...w));
    return Math.acos(Math.max(-1, Math.min(1, dot)));
};

/** Fingers through CDP: every call is one real touch event; points are [x, y] (client px), ids by position. */
const touchInput = async page => {
    const cdp = await page.context().newCDPSession(page);
    const points = list => list.map(([x, y], id) => ({x, y, id, radiusX: 4, radiusY: 4, force: 1}));
    const api = {
        start: list => cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: points(list)}),
        move: list => cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: points(list)}),
        end: () => cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}),
        /**
         * One finger pressed, moved in small steps, lifted. A finger moves on at once; this
         * harness takes far longer per event than a finger (software WebGL, every event awaited),
         * so the press and the first moves go out together, as a finger's would arrive.
         */
        drag: async (from, to, {steps = 8} = {}) => {
            const step = i => [[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]];
            await Promise.all([api.start([from]), api.move(step(1)), api.move(step(2))]);
            for (let i = 3; i <= steps; i++) await api.move(step(i));
            await api.end();
        },
        /** Two fingers either side of `centre` along x, from `d0` apart to `d1` apart. */
        pinch: async (centre, d0, d1, {steps = 12} = {}) => {
            const at = d => [[centre[0] - d / 2, centre[1]], [centre[0] + d / 2, centre[1]]];
            await api.start(at(d0)); // both fingers land together
            for (let i = 1; i <= steps; i++) await api.move(at(d0 + (d1 - d0) * i / steps));
            await api.end();
        }
    };
    return api;
};

/**
 * Screen points over open floor: on the canvas (with a margin) and at least
 * `clear` px from every part's origin on screen, the most open first.
 */
const openFloor = (page, clear) => page.evaluate(([min]) => {
    const v = window.__bwSimLab.editView;
    const rect = v.canvas.getBoundingClientRect();
    const parts = window.__bwSimLab.editor.model.parts.map(p => v.toScreen(v.debugPoint(p.id)));
    const spots = [];
    for (let fx = 0.1; fx <= 0.9; fx += 0.05) {
        for (let fy = 0.2; fy <= 0.9; fy += 0.05) {
            const x = rect.left + fx * rect.width, y = rect.top + fy * rect.height;
            if (!v.floorPointAt(x, y)) continue;
            const gap = Math.min(...parts.map(p => Math.hypot(p[0] - x, p[1] - y)));
            if (gap >= min) spots.push({at: [x, y], gap});
        }
    }
    return spots.sort((a, b) => b.gap - a.gap).map(s => s.at);
}, [clear]);

/**
 * @param {import('playwright').Page} page a touch-enabled page (`hasTouch`) with the Robot Lab open in Simulate
 * @param {{shotsDir: string}} options where screenshots go
 */
export const touchInteractions = async (page, {shotsDir}) => {
    const finger = await touchInput(page);
    await recordInput(page);
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);

    // ---- Beside the stage column, not the whole width: the compact layout under a finger ----
    assert.equal(await page.getByTestId('bw-sim-lab').getAttribute('data-layout'), 'compact', 'beside the stage column the Robot Lab tab is compact');
    const hubOf = () => page.evaluate(() => {
        const pane = window.__bwSimLab._pane;
        const s = pane.session;
        const i = s.snapshot().bodyIds.indexOf(s.bridge.hubBody);
        return {z: s.snapshot().bodies[i * 7 + 2], speeds: pane.hub.data.motors.slice(0, 2).map(m => m.speed), time: s.time};
    });
    await openManualControls(page);
    const up = await page.getByTestId('bw-sim-lab-drive-forward').boundingBox();
    const h0 = await hubOf();
    await finger.start([[up.x + up.width / 2, up.y + up.height / 2]]);
    await page.waitForFunction(t => window.__bwSimLab._pane.session.time > t + 1000, h0.time, {timeout: 60000});
    assert.ok((await hubOf()).speeds.every(v => v !== 0), 'compact: holding ▲ with a finger runs both drive motors');
    await finger.end();
    await page.waitForFunction(() => window.__bwSimLab._pane.hub.data.motors.slice(0, 2).every(m => m.speed === 0), null, {timeout: 10000});
    const h1 = await hubOf();
    assert.ok(h1.z < h0.z - 0.02, `compact: the finger drove the robot forward (${h0.z.toFixed(3)} → ${h1.z.toFixed(3)} m)`);
    console.log(`PASS touch, not full screen: holding ▲ in the compact pane drives ${((h0.z - h1.z) * 100).toFixed(1)} cm; lifting stops it`);

    // ---- Build -------------------------------------------------------------------------
    await page.getByTestId('bw-sim-lab-mode-build').tap();
    await page.getByTestId('bw-sim-lab-editor-canvas').waitFor({timeout: 60000});
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab.editor, null, {timeout: 60000});
    // Compact Build: the palette is a drawer; a tapped tile closes it, a tap on the floor places the part.
    await page.getByTestId('bw-sim-lab-parts-toggle').tap();
    const drawerTile = page.getByTestId('bw-sim-lab-part-32524.dat');
    await drawerTile.waitFor({timeout: 5000});
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-touch-narrow-drawer.png')});
    await drawerTile.tap();
    await page.getByTestId('bw-sim-lab-palette').waitFor({state: 'hidden', timeout: 5000});
    const narrowSpot = (await openFloor(page, 80))[0];
    assert.ok(narrowSpot, 'compact: open floor in the Build view');
    const n0 = await countOf(page);
    await page.touchscreen.tap(narrowSpot[0], narrowSpot[1]);
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, n0, {timeout: 10000});
    await tool(page, 'undo', {tap: true});
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n, n0, {timeout: 10000});
    await settled(page);
    console.log('PASS touch, not full screen: the parts drawer, a tapped tile and a tap on the floor place a part; Undo takes it away');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-touch-narrow.png')});
    // On a tablet the Robot Lab tab takes the whole width: the button that hides the stage column.
    await page.locator('[data-right-pane-toggle]').tap();
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-sim-lab"]')?.dataset.layout === 'wide', null, {timeout: 10000});
    await page.getByTestId('bw-sim-lab-editor-canvas').waitFor({timeout: 60000});
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab.editor, null, {timeout: 60000});
    // Actions which do not fit live in the same real More drawer used
    // by the editor gate. Opening it keeps those touch targets reachable.
    if (!(await page.getByTestId('bw-sim-lab-turn-back').isVisible())) await page.getByTestId('bw-sim-lab-more').tap();
    if (coarse) {
        // Every build-bar button is a finger-sized target.
        for (const id of ['mode-move', 'turn', 'turn-back', 'tip', 'duplicate', 'delete', 'copy', 'paste', 'select-all', 'cancel', 'undo', 'redo', 'view-fit']) {
            const b = await page.getByTestId(`bw-sim-lab-${id}`).boundingBox();
            assert.ok(b.height >= 40 && b.width >= 40, `${id} is ${b.width}×${b.height} px under a finger`);
        }
    }
    // Every keyboard-only action has a button.
    for (const id of ['copy', 'paste', 'select-all', 'cancel', 'turn-back', 'view-fit']) await page.getByTestId(`bw-sim-lab-${id}`).waitFor();
    const moreMenu = page.getByTestId('bw-sim-lab-more');
    if (await moreMenu.getAttribute('aria-expanded') === 'true') await moreMenu.tap();
    const grid = await page.evaluate(() => window.__bwSimLab.editView.grid);

    // Tap a palette tile (it arms), then tap open floor: the part lands under the finger and is selected.
    await page.getByTestId('bw-sim-lab-view-home').tap();
    const spots = await openFloor(page, 150);
    assert.ok(spots.length >= 2, 'open floor in view');
    const start = await countOf(page);
    const tile = page.getByTestId('bw-sim-lab-part-32524.dat');
    await tile.scrollIntoViewIfNeeded();
    await tile.tap();
    await effect(page, part => document.querySelector(`[data-testid="bw-sim-lab-part-${part}"]`)?.getAttribute('aria-pressed') === 'true',
        await tile.getAttribute('data-part'));
    assert.equal(await tile.getAttribute('aria-pressed'), 'true', 'a tap on a tile arms it');
    const spot = spots[0];
    const aimed = await page.evaluate(([x, y]) => window.__bwSimLab.editView.floorPointAt(x, y), spot);
    await page.touchscreen.tap(spot[0], spot[1]);
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, start, {timeout: 10000});
    const beam = await page.evaluate(() => window.__bwSimLab.editor.model.parts.at(-1));
    assert.ok(Math.abs(beam.position[0] - aimed[0]) <= 2 * grid && Math.abs(beam.position[2] - aimed[2]) <= 2 * grid,
        `a tapped part lands under the finger: aimed ${aimed}, placed ${beam.position}`);
    assert.deepEqual(await selectionOf(page), [beam.id], 'the placed part is selected');
    assert.equal(await tile.getAttribute('aria-pressed'), 'false', 'the placing tool ends');
    console.log(`PASS touch (pointer ${coarse ? 'coarse' : 'fine'}): tap a palette tile, tap the floor: the part is placed under the finger`);
    await settled(page);

    // A tap on open floor clears the selection; a one-finger drag on the (unselected) part selects and moves it.
    const empty = spots.find(s => Math.hypot(s[0] - spot[0], s[1] - spot[1]) > 160) || spots.at(-1);
    await page.touchscreen.tap(empty[0], empty[1]);
    await page.waitForFunction(() => window.__bwSimLab.editView.selection.length === 0, null, {timeout: 5000});
    const before = await posesOf(page);
    const from = await screenOf(page, beam.id, ON_BEAM);
    await finger.drag(from, [from[0] + 90, from[1] + 10]);
    const after = await posesOf(page);
    const moved = after[beam.id].position.map((v, i) => v - before[beam.id].position[i]);
    assert.ok(moved[0] !== 0 || moved[2] !== 0, `a finger drag moved the part: ${moved}`);
    assert.ok(moved[0] % grid === 0 && moved[2] % grid === 0 && moved[1] === 0, `by whole grid steps on the floor: ${moved}`);
    assert.ok(sameParts(before, after, [beam.id]), 'no other part moved');
    assert.deepEqual(await selectionOf(page), [beam.id], 'the dragged part is selected');
    console.log(`PASS touch: one finger on a part drags it on the floor by (${moved[0]}, ${moved[2]}) LDU (grid ${grid})`);

    // Drag a tile out of the palette with a finger onto open floor: a second beam.
    const spots2 = await openFloor(page, 150);
    const drop = spots2.find(s => Math.hypot(...[0, 1].map(i => s[i] - (from[i] + (i ? 10 : 90)))) > 170) || spots2[0];
    const tb = await tile.boundingBox();
    const t0 = [tb.x + tb.width / 2, tb.y + tb.height / 2];
    const n2 = await countOf(page);
    const dropAim = await page.evaluate(([x, y]) => window.__bwSimLab.editView.floorPointAt(x, y), drop);
    // Sideways first (the palette scrolls up and down under a finger), then on to the drop point.
    await finger.start([t0]);
    for (let i = 1; i <= 4; i++) await finger.move([[t0[0] + 8 * i, t0[1]]]);
    for (let i = 1; i <= 16; i++) await finger.move([[t0[0] + 32 + (drop[0] - t0[0] - 32) * i / 16, t0[1] + (drop[1] - t0[1]) * i / 16]]);
    await finger.end();
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, n2, {timeout: 10000});
    const beam2 = await page.evaluate(() => window.__bwSimLab.editor.model.parts.at(-1));
    await settled(page);
    assert.ok(Math.abs(beam2.position[0] - dropAim[0]) <= 2 * grid && Math.abs(beam2.position[2] - dropAim[2]) <= 2 * grid,
        `a part dragged from the palette lands under the finger: aimed ${dropAim}, placed ${beam2.position}`);
    assert.equal(await tile.getAttribute('aria-pressed'), 'false', 'a finger drag does not leave the tool armed');
    console.log('PASS touch: a finger drags a part out of the palette onto the floor');

    // Long press on a part adds it to the selection (the finger's Shift+click); again removes it.
    const b1 = await screenOf(page, beam.id, ON_BEAM);
    await page.touchscreen.tap(b1[0], b1[1]);
    await page.waitForFunction(id => window.__bwSimLab.editView.selection.join() === id, beam.id, {timeout: 5000});
    const held = await posesOf(page);
    const b2 = await screenOf(page, beam2.id, ON_BEAM);
    await finger.start([b2]);
    await page.waitForFunction(() => window.__bwSimLab.editView.selection.length === 2, null, {timeout: 5000});
    await finger.end();
    assert.deepEqual(await selectionOf(page), [beam.id, beam2.id].sort(), 'a long press adds the part to the selection');
    assert.ok(sameParts(held, await posesOf(page)), 'a long press moves nothing');
    await finger.start([b1]);
    await page.waitForFunction(id => window.__bwSimLab.editView.selection.join() === id, beam2.id, {timeout: 5000});
    await finger.end();
    console.log('PASS touch: a long press on a part adds it to the selection, another removes it');

    // Long press on open floor, then drag: a box selects both beams.
    await tool(page, 'cancel', {tap: true});
    await effect(page, () => window.__bwSimLab.editView.selection.length === 0);
    assert.deepEqual(await selectionOf(page), [], 'Cancel (Esc) clears the selection');
    const c1 = await screenOf(page, beam.id), c2 = await screenOf(page, beam2.id);
    const corner = [Math.min(c1[0], c2[0]) - 60, Math.min(c1[1], c2[1]) - 60];
    const far = [Math.max(c1[0], c2[0]) + 60, Math.max(c1[1], c2[1]) + 60];
    await finger.start([corner]);
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-sim-lab-build-status"]').dataset.kind === 'boxing', null, {timeout: 5000});
    for (let i = 1; i <= 10; i++) await finger.move([[corner[0] + (far[0] - corner[0]) * i / 10, corner[1] + (far[1] - corner[1]) * i / 10]]);
    assert.equal(await page.getByTestId('bw-sim-lab-box-select').isVisible(), true, 'the box is drawn under the finger');
    await finger.end();
    const boxed = await selectionOf(page);
    assert.ok(boxed.includes(beam.id) && boxed.includes(beam2.id), `the box selects both beams: ${boxed}`);
    console.log(`PASS touch: long press on open floor and drag box-selects (${boxed.length} parts)`);

    // The gizmo's X arrow by finger: drag diagonally between the X and Z arrows' screen directions;
    // the arrow keeps the move on x (a part drag would follow the finger in z too).
    await tool(page, 'cancel', {tap: true});
    await page.touchscreen.tap(b1[0], b1[1]);
    await page.waitForFunction(id => window.__bwSimLab.editView.selection.join() === id, beam.id, {timeout: 5000});
    const g = await page.evaluate(() => {
        const v = window.__bwSimLab.editView;
        const c = v.debugPoint('gizmo');
        return {centre: v.toScreen(c), x: v.toScreen([c[0] + 0.01, c[1], c[2]]), z: v.toScreen([c[0], c[1], c[2] + 0.01])};
    });
    const unit = p => { const d = [p[0] - g.centre[0], p[1] - g.centre[1]]; const l = Math.hypot(...d); return d.map(v => v / l); };
    const ux = unit(g.x), uz = unit(g.z);
    // Where the X arrow is drawn: along x's screen direction, beyond the centre a finger leaves to the part
    // (found by looking, as a person does: the pointer over it lights it up).
    let onArrow = null;
    for (let r = 34; r <= 140 && !onArrow; r += 4) {
        const p = [g.centre[0] + ux[0] * r, g.centre[1] + ux[1] * r];
        await page.mouse.move(p[0], p[1]);
        if (await page.evaluate(() => window.__bwSimLab.editView.gizmoAxis) === 'X') onArrow = p;
    }
    assert.ok(onArrow, 'the X arrow is on screen along x');
    const sideways = [ux[0] + uz[0], ux[1] + uz[1]];
    const gizmo0 = await posesOf(page);
    await finger.drag(onArrow, [onArrow[0] + sideways[0] * 70, onArrow[1] + sideways[1] * 70]);
    const gizmo1 = await posesOf(page);
    const along = gizmo1[beam.id].position.map((v, i) => v - gizmo0[beam.id].position[i]);
    assert.ok(along[0] !== 0 && along[0] % grid === 0 && along[1] === 0 && along[2] === 0,
        `the X arrow, dragged by a finger, moves the part along x only: ${along}`);
    console.log(`PASS touch: a finger drags the gizmo's X arrow (x ${along[0]} LDU, nothing in y or z)`);

    // The keyboard's actions on the build bar: Select all, Copy, Paste, Turn ↺, Undo.
    await countSelectAll(page);
    await tool(page, 'select-all', {tap: true});
    await effect(page, () => window.__bwSimLab.editView.selection.length === window.__bwSimLab.editor.model.parts.length, undefined,
        {tapped: 'bw-sim-lab-select-all'});
    assert.equal((await selectionOf(page)).length, await countOf(page), 'Select all selects every part');
    await tool(page, 'cancel', {tap: true});
    await effect(page, () => window.__bwSimLab.editView.selection.length === 0);
    assert.deepEqual(await selectionOf(page), []);
    const b1now = await screenOf(page, beam.id, ON_BEAM);
    await page.touchscreen.tap(b1now[0], b1now[1]);
    await page.waitForFunction(id => window.__bwSimLab.editView.selection.join() === id, beam.id, {timeout: 5000});
    await tool(page, 'copy', {tap: true});
    const n3 = await countOf(page);
    await tool(page, 'paste', {tap: true});
    // Paste may read the system clipboard first (asynchronous): wait for it, then check.
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length >= n + 1, n3, {timeout: 5000});
    assert.equal(await countOf(page), n3 + 1, 'Paste adds the copied part');
    await tool(page, 'undo', {tap: true});
    await effect(page, n => window.__bwSimLab.editor.model.parts.length === n, n3);
    assert.equal(await countOf(page), n3, 'Undo takes the copy away');
    await settled(page);
    if ((await selectionOf(page)).length) {
        await tool(page, 'cancel', {tap: true});
        await effect(page, () => window.__bwSimLab.editView.selection.length === 0);
    }
    const b1turn = await screenOf(page, beam.id, ON_BEAM);
    await page.touchscreen.tap(b1turn[0], b1turn[1]);
    await page.waitForFunction(id => window.__bwSimLab.editView.selection.join() === id, beam.id, {timeout: 5000});
    const r0 = (await pose(page, beam.id)).rotation;
    await tool(page, 'turn-back', {tap: true});
    await effect(page, ([id, r]) => JSON.stringify(window.__bwSimLab.editor.model.parts.find(p => p.id === id).rotation) !== JSON.stringify(r), [beam.id, r0]);
    const r1 = (await pose(page, beam.id)).rotation;
    assert.notDeepEqual(r1, r0, `Turn ↺ turns the selection (${await page.getByTestId('bw-sim-lab-build-status').textContent()})`);
    // A quarter turn the other way from the ↻ turn: ↻ then ↺ is where it started.
    await page.getByTestId('bw-sim-lab-turn').tap();
    await effect(page, ([id, r]) => JSON.stringify(window.__bwSimLab.editor.model.parts.find(p => p.id === id).rotation) === JSON.stringify(r), [beam.id, r0]);
    assert.deepEqual((await pose(page, beam.id)).rotation, r0, 'Turn ↻ after Turn ↺ is back where it started');
    await tool(page, 'undo', {tap: true});
    await effect(page, ([id, r]) => JSON.stringify(window.__bwSimLab.editor.model.parts.find(p => p.id === id).rotation) === JSON.stringify(r), [beam.id, r1]);
    assert.deepEqual((await pose(page, beam.id)).rotation, r1, 'Undo takes back the last turn');
    console.log('PASS touch: Select all, Copy, Paste, Turn ↺ and Undo work from the build bar');

    // One finger on open floor orbits the camera; no part moves.
    const orbit0 = await editCamera(page);
    const parts0 = await posesOf(page);
    const sel0 = await selectionOf(page);
    const open = (await openFloor(page, 120))[0];
    await finger.drag(open, [open[0] + 140, open[1] + 30]);
    const orbit1 = await editCamera(page);
    const turned = angleBetween(orbit0, orbit1);
    assert.ok(turned > 0.3, `one finger on open floor orbits the camera (${turned.toFixed(2)} rad)`);
    assert.ok(Math.abs(orbit1.distance - orbit0.distance) < orbit0.distance * 0.01, 'orbiting keeps the distance');
    assert.ok(sameParts(parts0, await posesOf(page)), 'orbiting moves no part');
    assert.deepEqual(await selectionOf(page), sel0, 'orbiting keeps the selection');
    // Two fingers spread: closer in.
    const centre = (await openFloor(page, 100))[0] || open;
    await finger.pinch(centre, 60, 220);
    const pinched = await editCamera(page);
    assert.ok(pinched.distance < orbit1.distance * 0.7, `pinching out zooms in: ${orbit1.distance.toFixed(3)} → ${pinched.distance.toFixed(3)} m`);
    assert.ok(sameParts(parts0, await posesOf(page)), 'pinching moves no part');
    console.log(`PASS touch: one finger orbits (${turned.toFixed(2)} rad), two fingers pinch-zoom ` +
        `(${orbit1.distance.toFixed(3)} → ${pinched.distance.toFixed(3)} m); no part moves`);
    await page.getByTestId('bw-sim-lab-view-home').tap();
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-touch-build.png')});

    // ---- Simulate ------------------------------------------------------------------------
    await page.getByTestId('bw-sim-lab-mode-simulate').tap();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' &&
        window.__bwSimLab._pane.session?.bridge, null, {timeout: 60000});
    const reading = () => page.evaluate(() => {
        const pane = window.__bwSimLab._pane;
        const s = pane.session;
        const i = s.snapshot().bodyIds.indexOf(s.bridge.hubBody);
        const b = s.snapshot().bodies;
        const m = pane.hub.data.motors;
        return {pos: [b[i * 7], b[i * 7 + 1], b[i * 7 + 2]], speeds: [m[0].speed, m[1].speed], time: s.time};
    });
    await openManualControls(page);
    const fwd = await page.getByTestId('bw-sim-lab-drive-forward').boundingBox();
    const press = [fwd.x + fwd.width / 2, fwd.y + fwd.height / 2];
    const d0 = await reading();
    await finger.start([press]);
    await page.waitForFunction(t => window.__bwSimLab._pane.session.time > t + 1000, d0.time, {timeout: 60000});
    const holding = await reading();
    assert.ok(holding.speeds.every(v => v !== 0), `holding ▲ with a finger runs both drive motors: ${holding.speeds}`);
    // The finger slides off the arrow (still down): it keeps driving, nothing sticks or stops early.
    await finger.move([[press[0], press[1] - 120]]);
    await page.waitForFunction(t => window.__bwSimLab._pane.session.time > t + 500, holding.time, {timeout: 60000});
    assert.ok((await reading()).speeds.every(v => v !== 0), 'sliding off the arrow keeps driving until the finger lifts');
    await finger.end();
    await page.waitForFunction(() => window.__bwSimLab._pane.hub.data.motors.slice(0, 2).every(m => m.speed === 0), null, {timeout: 10000});
    const stopped = await reading();
    assert.ok(stopped.pos[2] < d0.pos[2] - 0.03, `the finger drove the robot forward: ${JSON.stringify({d0: d0.pos, stopped: stopped.pos})}`);
    await page.waitForFunction(t => window.__bwSimLab._pane.session.time > t + 500, stopped.time, {timeout: 60000});
    assert.ok((await reading()).speeds.every(v => v === 0), 'lifting the finger leaves no motor running');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-touch-simulate.png')});
    console.log(`PASS touch: holding ▲ with a finger drives ${((d0.pos[2] - stopped.pos[2]) * 100).toFixed(1)} cm; lifting it stops both motors`);

    // Orbit and pinch on the Simulate view (three's OrbitControls under real fingers).
    const simCanvas = await page.getByTestId('bw-sim-lab-3d-canvas').boundingBox();
    const mid = [simCanvas.x + simCanvas.width / 2, simCanvas.y + simCanvas.height / 2];
    const s0 = await simCamera(page);
    await finger.drag([mid[0] - 80, mid[1]], [mid[0] + 80, mid[1] + 20]);
    const s1 = await simCamera(page);
    const simTurn = angleBetween(s0, s1);
    assert.ok(simTurn > 0.3, `one finger orbits the Simulate view (${simTurn.toFixed(2)} rad)`);
    await finger.pinch(mid, 80, 160);
    const s2 = await simCamera(page);
    assert.ok(s2.distance < s1.distance * 0.8, `pinching out zooms the Simulate view in: ${s1.distance.toFixed(3)} → ${s2.distance.toFixed(3)} m`);
    // Two fingers moving together slide the view (the target moves with the camera).
    await finger.start([[mid[0] - 50, mid[1]], [mid[0] + 50, mid[1]]]);
    for (let i = 1; i <= 8; i++) await finger.move([[mid[0] - 50 + 10 * i, mid[1] + 4 * i], [mid[0] + 50 + 10 * i, mid[1] + 4 * i]]);
    await finger.end();
    const s3 = await simCamera(page);
    const slid = Math.hypot(...s3.target.map((v, i) => v - s2.target[i]));
    assert.ok(slid > 0.005, `two fingers moving together pan the Simulate view (target moved ${slid.toFixed(4)} m)`);
    console.log(`PASS touch: one finger orbits the Simulate view (${simTurn.toFixed(2)} rad), two fingers zoom ` +
        `(${s1.distance.toFixed(3)} → ${s2.distance.toFixed(3)} m) and pan (${(slid * 100).toFixed(1)} cm)`);
};
