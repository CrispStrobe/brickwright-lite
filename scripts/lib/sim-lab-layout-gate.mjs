// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's layout at school-device window sizes, for
// scripts/verify-sim-lab-browser.mjs. The Robot Lab is its own editor tab; it
// lays itself out by ITS OWN width, which depends on whether the stage column is
// open beside it and how wide a learner dragged it: from the whole window (a wide
// layout, every tool on a toolbar of at most two rows), through a single toolbar
// row whose rarer tools go to a "More" menu, to compact (below 720 px: the parts
// palette as a drawer, notes folded to one line). At each case, in Simulate and in
// Build:
//
//   1. the 3D canvas is at least MIN_CANVAS_PX tall and at least half the pane's
//      height, at least MIN_CANVAS_SHARE_W of the pane's width, and wholly on
//      screen with nothing scrolled (not cut by the window or by any clipping
//      ancestor);
//   2. every primary control — Run, Reset, Build/Simulate, Drive ▲, Move/Turn,
//      Undo, the palette (or the button that opens it) — is on screen, enabled
//      and the topmost element at its centre (elementFromPoint), so a click there
//      reaches it;
//   3. the Robot Lab never scrolls sideways;
//   4. and it is used, with real clicks at those centres: the palette opens (a
//      drawer when compact), a part is armed and placed on the floor, Undo takes
//      it away; where the toolbar overflows, the "More" menu opens on screen and
//      its Top view works.
//
// Internal APIs are only READ (part counts, the floor point under a pixel). No
// fixed sleeps: every wait is for a condition.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

/** Window sizes: school Chromebooks and iPads (1024×768, 1280×800, 1366×768), then desktops. */
export const LAYOUT_SIZES = [[1024, 768], [1280, 800], [1366, 768], [1600, 1050], [1920, 1080]];
/** Below this pane width the Robot Lab is compact (sim-lab-pane.jsx COMPACT_BELOW_PX). */
export const COMPACT_BELOW_PX = 720;
/**
 * The cases: every size with the tab alone (the stage column hidden), two tablets and a laptop
 * with the stage column beside it, and one where the learner dragged that column wide so the
 * Lab is narrow (`labPx`: drag the stage divider until the Lab is about this wide).
 */
export const LAYOUT_CASES = [
    ...LAYOUT_SIZES.map(([w, h]) => ({w, h, stage: false})),
    {w: 1024, h: 768, stage: true}, {w: 1366, h: 768, stage: true}, {w: 1280, h: 800, stage: true, labPx: 470}
];
/** The 3D view's floor height (px); it must also be at least half the pane's height. */
export const MIN_CANVAS_PX = 300;
/** …and at least this share of the pane's width (Build: the palette must not squeeze it). */
export const MIN_CANVAS_SHARE_W = 0.6;

/** In the page: where an element is, whether all of it is visible, and whether it is on top at its centre. */
const probe = (page, selector) => page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return {missing: true};
    const r = el.getBoundingClientRect();
    // What is visible of it: the window, cut by every ancestor that clips (overflow other than visible).
    let clip = {left: 0, top: 0, right: innerWidth, bottom: innerHeight};
    for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const q = a.getBoundingClientRect();
        clip = {left: Math.max(clip.left, q.left), top: Math.max(clip.top, q.top), right: Math.min(clip.right, q.right), bottom: Math.min(clip.bottom, q.bottom)};
    }
    const inside = r.width > 0 && r.height > 0 && r.left >= clip.left - 0.5 && r.top >= clip.top - 0.5 &&
        r.right <= clip.right + 0.5 && r.bottom <= clip.bottom + 0.5;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const onTop = Boolean(hit && (hit === el || el.contains(hit)));
    return {rect: {x: r.left, y: r.top, width: r.width, height: r.height}, centre: [cx, cy], inside, onTop,
        hit: hit ? `${hit.tagName.toLowerCase()}${hit.dataset.testid ? `[${hit.dataset.testid}]` : ''}` : null,
        disabled: Boolean(el.disabled), clip};
}, selector);

const byId = id => `[data-testid="${id}"]`;

/** A control a child can press: on screen, enabled, not covered. */
const assertPressable = async (page, id, where) => {
    const p = await probe(page, byId(id));
    assert.ok(!p.missing, `${where}: ${id} is not there`);
    assert.ok(p.inside, `${where}: ${id} is not wholly on screen: ${JSON.stringify(p.rect)} within ${JSON.stringify(p.clip)}`);
    assert.ok(p.onTop, `${where}: ${id} is covered by ${p.hit}`);
    assert.ok(!p.disabled, `${where}: ${id} is disabled`);
    return p;
};

/** Click a control where a person sees it (its centre), after proving it can be pressed. */
const press = async (page, id, where) => {
    const p = await assertPressable(page, id, where);
    await page.mouse.click(p.centre[0], p.centre[1]);
};

/** Nothing scrolled, nothing wider than the pane, and the 3D canvas big enough and wholly visible. */
const assertView = async (page, canvasId, where) => {
    const geometry = await page.evaluate(() => {
        const lab = document.querySelector('[data-testid="bw-sim-lab"]');
        const r = lab.getBoundingClientRect();
        let scrolled = (document.scrollingElement?.scrollTop || 0) + (document.scrollingElement?.scrollLeft || 0);
        for (let a = lab; a; a = a.parentElement) scrolled += a.scrollTop + a.scrollLeft;
        return {pane: {width: r.width, height: r.height}, layout: lab.dataset.layout, scrolled,
            sideways: [lab, lab.parentElement].map(e => e.scrollWidth - e.clientWidth)};
    });
    const canvas = await probe(page, byId(canvasId));
    assert.ok(!canvas.missing, `${where}: no ${canvasId}`);
    const {height, width} = canvas.rect;
    const need = Math.max(MIN_CANVAS_PX, geometry.pane.height / 2);
    assert.equal(geometry.scrolled, 0, `${where}: the page or the pane is scrolled`);
    assert.ok(geometry.sideways.every(d => d <= 1), `${where}: the pane scrolls sideways by ${geometry.sideways} px`);
    assert.ok(canvas.inside, `${where}: the 3D view is not wholly visible: ${JSON.stringify(canvas.rect)} within ${JSON.stringify(canvas.clip)}`);
    assert.ok(height >= need, `${where}: the 3D view is ${Math.round(height)} px tall, needs ${Math.round(need)} (pane ${Math.round(geometry.pane.height)} px)`);
    assert.ok(width >= geometry.pane.width * MIN_CANVAS_SHARE_W,
        `${where}: the 3D view is ${Math.round(width)} px wide in a ${Math.round(geometry.pane.width)} px pane`);
    return {canvas: [Math.round(width), Math.round(height)], pane: [Math.round(geometry.pane.width), Math.round(geometry.pane.height)], layout: geometry.layout};
};

const partCount = page => page.evaluate(() => window.__bwSimLab.editor.model.parts.length);

/** A pixel of open floor on the Build canvas, away from every part, or null. */
const openFloorPoint = page => page.evaluate(() => {
    const v = window.__bwSimLab.editView;
    const rect = v.canvas.getBoundingClientRect();
    const parts = window.__bwSimLab.editor.model.parts.map(p => v.toScreen(v.debugPoint(p.id)));
    let best = null;
    for (let fx = 0.15; fx <= 0.85; fx += 0.05) {
        for (let fy = 0.25; fy <= 0.85; fy += 0.05) {
            const x = rect.left + fx * rect.width, y = rect.top + fy * rect.height;
            if (!v.floorPointAt(x, y)) continue;
            const gap = Math.min(...parts.map(p => Math.hypot(p[0] - x, p[1] - y)));
            if (!best || gap > best.gap) best = {at: [x, y], gap};
        }
    }
    return best && best.gap >= 60 ? best.at : null;
});

/**
 * @param {import('playwright').Browser} browser
 * @param {{open: (page: import('playwright').Page, options: object) => Promise<object>, shotsDir: string, errors: string[]}} options
 *   `open` opens the Robot Lab tab in Simulate (the verify script's openSimLab; `stage` keeps the stage column open)
 * @returns {Promise<object[]>} one row of measurements per size
 */
/** Drags the stage column's divider until the Robot Lab is about `px` wide (a learner widening the stage). */
const narrowTo = async (page, px) => {
    const divider = page.locator('[role="separator"][aria-orientation="vertical"]:not([data-testid])').first();
    const box = await divider.boundingBox();
    const lab = await page.getByTestId('bw-sim-lab').boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    const to = lab.x + px;
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + (to - box.x - box.width / 2) * i / 10, y);
    await page.mouse.up();
    await page.waitForFunction(w => Math.abs(document.querySelector('[data-testid="bw-sim-lab"]').getBoundingClientRect().width - w) < 80, px, {timeout: 10000});
};

export const layoutInteractions = async (browser, {open, shotsDir, errors}) => {
    const rows = [];
    for (const {w, h, stage, labPx} of LAYOUT_CASES) {
        const at = `${w}×${h}${stage ? (labPx ? ` + stage, Lab ${labPx} px` : ' + stage') : ''}`;
        const tag = `${w}x${h}${stage ? (labPx ? '-narrow' : '-stage') : ''}`;
        const page = await browser.newPage({viewport: {width: w, height: h}, serviceWorkers: 'block'});
        page.on('pageerror', error => errors.push(error.message));
        await open(page, {program: null, stage});
        await page.getByTestId('bw-sim-lab-3d-canvas').waitFor({timeout: 30000});
        if (labPx) await narrowTo(page, labPx);
        // The pane has measured itself (its ResizeObserver) before anything is judged.
        await page.waitForFunction(() => document.querySelector('[data-testid="bw-sim-lab"]')?.dataset.layout, null, {timeout: 10000});
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

        // ---- Simulate ----
        const sim = await assertView(page, 'bw-sim-lab-3d-canvas', `${at} Simulate`);
        for (const id of ['bw-sim-lab-run', 'bw-sim-lab-reset', 'bw-sim-lab-mode-build', 'bw-sim-lab-drive-forward', 'bw-sim-lab-help']) {
            await assertPressable(page, id, `${at} Simulate`);
        }
        await page.screenshot({path: resolve(shotsDir, `sim-lab-layout-${tag}-simulate.png`)});

        // ---- Build ----
        await press(page, 'bw-sim-lab-mode-build', `${at} Simulate`);
        await page.getByTestId('bw-sim-lab-editor-canvas').waitFor({timeout: 60000});
        await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab.editor, null, {timeout: 60000});
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        const build = await assertView(page, 'bw-sim-lab-editor-canvas', `${at} Build`);
        for (const id of ['bw-sim-lab-mode-simulate', 'bw-sim-lab-mode-move', 'bw-sim-lab-mode-rotate', 'bw-sim-lab-parts-toggle']) {
            await assertPressable(page, id, `${at} Build`);
        }
        const compact = build.layout === 'compact';
        assert.equal(compact, build.pane[0] < COMPACT_BELOW_PX, `${at}: the layout follows the pane's width (${build.pane[0]} px: ${build.layout})`);
        // The palette: a panel beside the view when wide; a drawer opened by its button when compact.
        if (compact) {
            assert.equal(await page.getByTestId('bw-sim-lab-palette').isVisible(), false, `${at}: compact, the palette starts closed`);
            await press(page, 'bw-sim-lab-parts-toggle', `${at} Build`);
            await page.getByTestId('bw-sim-lab-palette').waitFor({timeout: 5000});
        } else {
            assert.equal(await page.getByTestId('bw-sim-lab-palette').isVisible(), true, `${at}: wide, the parts panel is open beside the view`);
        }
        const tile = 'bw-sim-lab-part-32524.dat';
        await page.getByTestId(tile).scrollIntoViewIfNeeded();
        await press(page, tile, `${at} Build palette`);
        assert.equal(await page.getByTestId(tile).getAttribute('aria-pressed'), 'true', `${at}: a click on a tile arms it`);
        if (compact) {
            await page.getByTestId('bw-sim-lab-palette').waitFor({state: 'hidden', timeout: 5000});
            await assertView(page, 'bw-sim-lab-editor-canvas', `${at} Build, part armed`);
        }
        const spot = await openFloorPoint(page);
        assert.ok(spot, `${at}: open floor in the Build view`);
        const before = await partCount(page);
        await page.mouse.click(spot[0], spot[1]);
        await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, before, {timeout: 10000});
        await press(page, 'bw-sim-lab-undo', `${at} Build`);
        await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n, before, {timeout: 10000});
        // The toolbar never scrolls: what does not fit is one tap away, in a menu that opens on screen.
        const toolbar = await page.evaluate(() => {
            const bar = document.querySelector('[data-testid="bw-sim-lab-toolbar"]');
            return {sideways: bar.scrollWidth - bar.clientWidth, height: bar.getBoundingClientRect().height};
        });
        assert.ok(toolbar.sideways <= 1, `${at}: the toolbar is ${toolbar.sideways} px too wide`);
        const more = await page.getByTestId('bw-sim-lab-more').count();
        if (build.pane[0] < 1000) assert.equal(more, 1, `${at}: a ${build.pane[0]} px toolbar keeps one row and offers More`);
        if (more) {
            await press(page, 'bw-sim-lab-more', `${at} Build`);
            await page.getByTestId('bw-sim-lab-more-menu').waitFor({timeout: 5000});
            const menu = await probe(page, byId('bw-sim-lab-more-menu'));
            assert.ok(menu.inside, `${at}: the More menu is cut off: ${JSON.stringify(menu.rect)}`);
            const cam = await page.evaluate(() => window.__bwSimLab.editView.camera.position);
            await press(page, 'bw-sim-lab-view-top', `${at} More menu`);
            await page.getByTestId('bw-sim-lab-more-menu').waitFor({state: 'detached', timeout: 5000});
            assert.notDeepEqual(await page.evaluate(() => window.__bwSimLab.editView.camera.position), cam, `${at}: Top in the menu turns the view`);
        }
        await page.screenshot({path: resolve(shotsDir, `sim-lab-layout-${tag}-build.png`)});
        rows.push({size: at, mode: 'Simulate', ...sim}, {size: at, mode: 'Build', ...build, more: Boolean(more), toolbarPx: Math.round(toolbar.height)});
        await page.close();
    }
    return rows;
};
