// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab Build mode as a learner uses it, for scripts/verify-sim-lab-browser.mjs:
// real mouse moves, drags and key presses only. Internal APIs are used to READ
// results (poses, the selection) and to find where a part is on screen, the
// way a person sees where it is; never to perform the interaction.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

/** A part's pose and the editor's selection (reading results only). */
const pose = (page, id) => page.evaluate(i => {
    const p = window.__bwSimLab.editor.model.parts.find(x => x.id === i);
    return p && {position: p.position, rotation: p.rotation};
}, id);
const selectionOf = page => page.evaluate(() => window.__bwSimLab.editView.selection.slice().sort());
/** Where a part's origin, or the gizmo's centre, is on screen right now. */
const screenOf = (page, id, local) => page.evaluate(([i, l]) => {
    const v = window.__bwSimLab.editView;
    const w = v.debugPoint(i, l || undefined);
    return w && v.toScreen(w);
}, [id, local || null]);
/** A point on a beam's top face between two holes (where a finger would press, not into a hole). */
const ON_BEAM = [0, -10, 10];
const exactRotation = r => r.every(v => v === 0 || v === 1 || v === -1) &&
    Math.abs(r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]) - 1) < 1e-12;

/**
 * Like a person aiming at a part partly covered by the gizmo: move along the
 * part's top face until the status line says the pointer is on the part (not
 * on a gizmo handle), and press there.
 */
const grabPoint = async (page, id, name) => {
    for (const z of [10, 30, 50, -30, -50, -10]) {
        const at = await screenOf(page, id, [0, -10, z]);
        await page.mouse.move(at[0], at[1]);
        const text = await page.getByTestId('bw-sim-lab-build-status').textContent();
        if (text.startsWith(`${name}:`)) return at;
    }
    throw new Error(`no free spot on ${id} to press`);
};

/** A human drag: press, move in small steps, release. */
const drag = async (page, from, to, {steps = 12, shift = false} = {}) => {
    await page.mouse.move(from[0], from[1]);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
    // What the status line promised just before letting go.
    const promised = await page.getByTestId('bw-sim-lab-build-status').textContent();
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
    return promised;
};

/**
 * Finds a gizmo handle the way a person does: move the pointer over the gizmo
 * until that handle lights up. Searches rings around the gizmo's centre.
 */
const findHandle = async (page, axis) => {
    const centre = await screenOf(page, 'gizmo');
    assert.ok(centre, 'the gizmo is shown on the selection');
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
 * @param {import('playwright').Page} page a page with the Sim Lab open in Build mode
 * @param {string} beamId a Technic beam 7 lying alone on open floor
 * @param {{shotsDir: string}} options where screenshots go
 */
export const cadInteractions = async (page, beamId, {shotsDir}) => {
    const canvas = page.getByTestId('bw-sim-lab-editor-canvas');
    const grid = await page.evaluate(() => window.__bwSimLab.editView.grid);
    assert.equal(grid, 10, 'default grid is half a hole pitch');

    // Home shows the whole model; select the free beam with a click on it, then F frames it.
    await page.getByTestId('bw-sim-lab-view-home').click();
    const beamAt = await screenOf(page, beamId, ON_BEAM);
    const view = await canvas.boundingBox();
    assert.ok(beamAt[0] > view.x && beamAt[0] < view.x + view.width && beamAt[1] > view.y && beamAt[1] < view.y + view.height,
        'Home brings every part into view');
    await page.mouse.click(beamAt[0], beamAt[1]);
    assert.deepEqual(await selectionOf(page), [beamId], 'a click on a part selects it');
    assert.match(await page.getByTestId('bw-sim-lab-selection').textContent(), /Technic beam 7/);
    await page.keyboard.press('f');

    // Place a second beam from the palette with a click on open floor beside it: it lands under the pointer.
    const at = await screenOf(page, beamId);
    const box = await canvas.boundingBox();
    const spot = [Math.min(box.x + box.width - 40, at[0] + 40), Math.min(box.y + box.height - 40, at[1] + 140)];
    const before = await page.evaluate(() => window.__bwSimLab.editor.model.parts.length);
    await page.getByTestId('bw-sim-lab-part-32316.dat').click();
    await page.mouse.move(spot[0] - 30, spot[1] - 10);
    await page.mouse.move(spot[0], spot[1], {steps: 5});
    assert.match(await page.getByTestId('bw-sim-lab-build-status').textContent(), /On the floor/);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, before);
    const second = await page.evaluate(() => window.__bwSimLab.editor.model.parts.at(-1).id);
    const landed = await screenOf(page, second, [0, 10, 0]); // the middle of its underside, on the floor
    assert.ok(Math.hypot(landed[0] - spot[0], landed[1] - spot[1]) < 30,
        `a part placed on the floor lands under the pointer: clicked ${spot}, it is at ${landed}`);
    assert.deepEqual(await selectionOf(page), [second], 'the placed part is selected, the placing tool ends');
    assert.equal(await page.getByTestId('bw-sim-lab-part-32316.dat').getAttribute('aria-pressed'), 'false');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-build-placed.png'), fullPage: true});
    console.log('PASS Build: a click on the floor places a part under the pointer and selects it');

    // Gizmo X arrow: the beam moves along x by a whole number of grid steps.
    const beamNow = await screenOf(page, beamId, ON_BEAM);
    await page.mouse.click(beamNow[0], beamNow[1]);
    assert.deepEqual(await selectionOf(page), [beamId]);
    const p0 = await pose(page, beamId);
    const xArrow = await findHandle(page, 'X');
    const dir = [xArrow.at[0] - xArrow.centre[0], xArrow.at[1] - xArrow.centre[1]];
    const len = Math.hypot(...dir);
    await drag(page, xArrow.at, [xArrow.at[0] + dir[0] / len * 120, xArrow.at[1] + dir[1] / len * 120]);
    const p1 = await pose(page, beamId);
    const dx = p1.position[0] - p0.position[0];
    assert.ok(dx !== 0 && Number.isInteger(dx / grid), `the X arrow moved the beam by a grid multiple (${dx} LDU)`);
    assert.deepEqual([p1.position[1], p1.position[2]], [p0.position[1], p0.position[2]], 'only x changed');
    assert.deepEqual(p1.rotation, p0.rotation);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-build-gizmo.png'), fullPage: true});
    console.log(`PASS Build: dragging the gizmo's X arrow moves the part ${dx} LDU (grid ${grid})`);

    // R turns it a quarter turn about the vertical: an exact proper rotation, y axis kept.
    await page.keyboard.press('r');
    const p2 = await pose(page, beamId);
    assert.notDeepEqual(p2.rotation, p1.rotation, 'R turned the part');
    assert.ok(exactRotation(p2.rotation), `exact rotation ${p2.rotation}`);
    assert.deepEqual([p2.rotation[1], p2.rotation[4], p2.rotation[7]], [p1.rotation[1], p1.rotation[4], p1.rotation[7]], 'turned about the vertical');
    console.log('PASS Build: R turns the selection 90° (exact rotation matrix)');

    // The rotate ring (E): dragging along the vertical ring turns by quarter turns.
    await page.keyboard.press('e');
    assert.equal(await page.getByTestId('bw-sim-lab-mode-rotate').getAttribute('aria-pressed'), 'true');
    const ring = await findHandle(page, 'Y');
    const t = [ring.at[1] - ring.centre[1], -(ring.at[0] - ring.centre[0])];
    const tl = Math.hypot(...t);
    // Like a person: drag along the ring and let go once the status says it has turned.
    await page.mouse.move(...ring.at);
    await page.mouse.down();
    let turned = null;
    for (let i = 1; i <= 60 && !turned; i++) {
        await page.mouse.move(ring.at[0] + t[0] / tl * 4 * i, ring.at[1] + t[1] / tl * 4 * i);
        const m = /Turning (-?\d+)°/.exec(await page.getByTestId('bw-sim-lab-build-status').textContent());
        if (m && Number(m[1]) % 360 !== 0) turned = Number(m[1]);
    }
    await page.mouse.up();
    assert.ok(turned !== null && turned % 90 === 0, `the ring turns in quarter turns (${turned}°)`);
    const p3 = await pose(page, beamId);
    assert.notDeepEqual(p3.rotation, p2.rotation, 'the ring turned the part');
    assert.ok(exactRotation(p3.rotation), `ring rotation stays exact: ${p3.rotation}`);
    assert.deepEqual(p3.position, p2.position, 'a lone part turns about its own origin');
    await page.keyboard.press('w');
    console.log('PASS Build: the rotate ring turns the part in 90° steps');

    // Press on the selected part and drag: it slides on the floor, grid-snapped, staying on the floor.
    const onBeam = await grabPoint(page, beamId, 'Technic beam 7');
    const promised = await drag(page, onBeam, [onBeam[0] - 90, onBeam[1] + 30]);
    const p4 = await pose(page, beamId);
    const slid = [0, 2].map(i => p4.position[i] - p3.position[i]);
    assert.ok(slid.some(v => v !== 0) && slid.every(v => Number.isInteger(v / grid)), `slid on the grid: ${slid}`);
    assert.match(promised, /On the floor/, 'the status said where it would go');
    assert.equal(p4.position[1], p3.position[1], `it stays on the floor (${promised})`);
    console.log(`PASS Build: dragging a part slides it on the work plane (${slid} LDU)`);

    // Shift+click adds the second beam; the gizmo then moves both in ONE undo step.
    const b2 = await grabPoint(page, second, 'Technic beam 5');
    await page.keyboard.down('Shift');
    await page.mouse.click(b2[0], b2[1]);
    await page.keyboard.up('Shift');
    assert.deepEqual(await selectionOf(page), [beamId, second].sort(), 'Shift+click adds to the selection');
    assert.match(await page.getByTestId('bw-sim-lab-selection').textContent(), /2 parts/);
    const both0 = [await pose(page, beamId), await pose(page, second)];
    const arrow = await findHandle(page, 'X');
    const d2 = [arrow.at[0] - arrow.centre[0], arrow.at[1] - arrow.centre[1]];
    const l2 = Math.hypot(...d2);
    await drag(page, arrow.at, [arrow.at[0] + d2[0] / l2 * 100, arrow.at[1] + d2[1] / l2 * 100]);
    const both1 = [await pose(page, beamId), await pose(page, second)];
    const moved = both1.map((p, i) => p.position[0] - both0[i].position[0]);
    assert.ok(moved[0] !== 0 && moved[0] === moved[1], `both parts moved together: ${moved}`);
    await page.getByTestId('bw-sim-lab-undo').click();
    assert.deepEqual([await pose(page, beamId), await pose(page, second)], both0, 'ONE undo restores both parts');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-build-multi.png'), fullPage: true});
    console.log(`PASS Build: Shift+click selects two parts, the gizmo moves both (${moved[0]} LDU), one undo restores both`);

    // Esc clears; a Shift+drag box around both selects them again.
    await canvas.focus();
    await page.keyboard.press('Escape');
    assert.deepEqual(await selectionOf(page), []);
    const s1 = await screenOf(page, beamId);
    const s2 = await screenOf(page, second);
    const pad = 70;
    await drag(page, [Math.min(s1[0], s2[0]) - pad, Math.min(s1[1], s2[1]) - pad], [Math.max(s1[0], s2[0]) + pad, Math.max(s1[1], s2[1]) + pad], {shift: true});
    const boxed = await selectionOf(page);
    assert.ok(boxed.includes(beamId) && boxed.includes(second), `Shift+drag box-selects: ${boxed}`);
    console.log(`PASS Build: Shift+drag box-selects (${boxed.length} parts)`);
    await page.keyboard.press('Escape');
};

