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
    // Along x, AWAY from the beam just placed beside it (into it, the move would be refused).
    const away = [beamNow[0] - landed[0], beamNow[1] - landed[1]];
    const toward = [xArrow.at[0] - xArrow.centre[0], xArrow.at[1] - xArrow.centre[1]];
    const sign = toward[0] * away[0] + toward[1] * away[1] < 0 ? -1 : 1;
    const dir = toward.map(v => v * sign);
    const len = Math.hypot(...dir);
    const xPromised = await drag(page, xArrow.at, [xArrow.at[0] + dir[0] / len * 120, xArrow.at[1] + dir[1] / len * 120]);
    const p1 = await pose(page, beamId);
    const dx = p1.position[0] - p0.position[0];
    assert.ok(dx !== 0 && Number.isInteger(dx / grid), `the X arrow moved the beam by a grid multiple (${dx} LDU; status: ${xPromised} → ${await statusText(page)})`);
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
    await page.keyboard.press('f'); // both in view
    await page.keyboard.press('Escape');
    assert.deepEqual(await selectionOf(page), []);
    const s1 = await screenOf(page, beamId);
    const s2 = await screenOf(page, second);
    const pad = 70;
    await drag(page, [Math.min(s1[0], s2[0]) - pad, Math.min(s1[1], s2[1]) - pad], [Math.max(s1[0], s2[0]) + pad, Math.max(s1[1], s2[1]) + pad], {shift: true});
    const boxed = await selectionOf(page);
    assert.ok(boxed.includes(beamId) && boxed.includes(second), `Shift+drag box-selects: ${boxed}`);
    console.log(`PASS Build: Shift+drag box-selects (${boxed.length} parts)`);

    // Ctrl+G groups the selection; afterwards ONE click on a member selects the whole group;
    // Ctrl+Shift+G takes it apart and a click selects one part again.
    await page.keyboard.press('ControlOrMeta+g');
    const groups = await page.evaluate(() => window.__bwSimLab.editor.model.groups || []);
    assert.equal(groups.length, 1, `one group: ${JSON.stringify(groups)}`);
    // The box holds both beams (and the pin sitting in the beam's end hole, when it is in the box too).
    assert.deepEqual([...groups[0].parts].sort(), boxed.slice().sort());
    await page.keyboard.press('Escape');
    const member = await grabPoint(page, second, 'Technic beam 5');
    await page.mouse.click(member[0], member[1]);
    assert.deepEqual(await selectionOf(page), boxed.slice().sort(), 'a click on one member selects the group');
    await page.keyboard.press('ControlOrMeta+Shift+g');
    assert.equal((await page.evaluate(() => window.__bwSimLab.editor.model.groups || [])).length, 0, 'ungrouped');
    await page.keyboard.press('Escape');
    const again = await grabPoint(page, second, 'Technic beam 5');
    await page.mouse.click(again[0], again[1]);
    assert.deepEqual(await selectionOf(page), [second], 'after ungrouping a click selects one part');
    console.log('PASS Build: Ctrl+G groups (a click selects the whole group), Ctrl+Shift+G ungroups');
    await page.keyboard.press('Escape');

    await pinIntoHoleFromAbove(page, beamId, {shotsDir});
    const third = await beamOntoBeam(page, second, {shotsDir});
    await beamIntoHub(page, third, {shotsDir});
    await paletteInteractions(page, beamId, {shotsDir});
};

const statusText = page => page.getByTestId('bw-sim-lab-build-status').textContent();
const partsCount = page => page.evaluate(() => window.__bwSimLab.editor.model.parts.length);
const lastPartId = page => page.evaluate(() => window.__bwSimLab.editor.model.parts.at(-1).id);
/** Selects a part with a click on it and frames it (F), as a person zooms in to work on it. */
const focusOn = async (page, id, name) => {
    await page.getByTestId('bw-sim-lab-view-home').click();
    const at = await grabPoint(page, id, name);
    await page.mouse.click(at[0], at[1]);
    assert.deepEqual(await selectionOf(page), [id]);
    await page.keyboard.press('f');
};
/** Picks a part from the palette and clicks where `at` says (a screen point), after checking the status there. */
const placeFromPalette = async (page, part, at, expect) => {
    const before = await partsCount(page);
    await page.getByTestId(`bw-sim-lab-part-${part}`).click();
    const spot = await at();
    await page.mouse.move(spot[0] - 20, spot[1] - 10);
    await page.mouse.move(spot[0], spot[1], {steps: 5});
    const said = await statusText(page);
    assert.match(said, expect, `before the click the status said: ${said}`);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, before);
    return lastPartId(page);
};
/** Like grabPoint, for any part: the first of `locals` (part frame) where the pointer is on the part, not on the gizmo. */
const grabOn = async (page, id, name, locals) => {
    for (const local of locals) {
        const at = await screenOf(page, id, local);
        await page.mouse.move(at[0], at[1]);
        if ((await statusText(page)).startsWith(`${name}:`)) return at;
    }
    throw new Error(`no free spot on ${id} to press`);
};
/** A point in a part's frame (LDU) in the model frame. */
const modelPoint = (p, local) => [0, 1, 2].map(i => p.rotation[i * 3] * local[0] + p.rotation[i * 3 + 1] * local[1] + p.rotation[i * 3 + 2] * local[2] + p.position[i]);
/** Strongly red pixels of a screenshot region (PNG decoded in the page). */
const redPixels = (page, png, clip) => page.evaluate(async ([b64, c]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = c.width;
    cv.height = c.height;
    const g = cv.getContext('2d');
    g.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) n++;
    return n;
}, [png.toString('base64'), clip]);

/**
 * A pin dragged over a beam's hole from above snaps in from the TOP: the pointer
 * aims at the beam's top face around the hole (not at the floor seen through
 * it), so the magnet prefers that side.
 */
const pinIntoHoleFromAbove = async (page, beamId, {shotsDir}) => {
    await focusOn(page, beamId, 'Technic beam 7');
    const box = await page.getByTestId('bw-sim-lab-editor-canvas').boundingBox();
    // A pin from the palette on open floor beside the beam.
    const pin = await placeFromPalette(page, '2780.dat', async () => {
        const b = await screenOf(page, beamId);
        return [Math.min(box.x + box.width - 40, b[0] + 60), Math.min(box.y + box.height - 40, b[1] + 150)];
    }, /On the floor/);
    const beam = await pose(page, beamId);
    const grab = await grabOn(page, pin, 'Technic pin with friction', [[0, -7, 0], [8, -7, 0], [-8, -7, 0], [14, -7, 0], [-14, -7, 0]]);
    // Onto the middle of hole 4 (h3, the beam's centre hole), where a person sees the hole: the
    // pointer looks through the hole at the floor, but the hole counts as the beam's top face.
    const hole = await screenOf(page, beamId, [0, -10, 0]);
    const promised = await drag(page, grab, hole, {steps: 16});
    assert.match(promised, /Snaps to Technic beam 7 hole 4/, 'the magnet offered the hole pointed at');
    const p = await pose(page, pin);
    // In the beam's frame: on a hole's axis, the pin's centre ABOVE the beam's mid-plane (LDraw -y up).
    const d = p.position.map((v, i) => v - beam.position[i]);
    const local = [0, 1, 2].map(c => beam.rotation[c] * d[0] + beam.rotation[3 + c] * d[1] + beam.rotation[6 + c] * d[2]);
    assert.ok(Math.abs(local[0]) < 1e-6 && Math.abs(local[2] % 20) < 1e-6, `in a hole: ${local}`);
    assert.ok(local[1] < 0, `snapped from the top side: the pin's centre is ${-local[1]} LDU above the beam's mid-plane`);
    assert.match(await statusText(page), /Snapped to Technic beam 7/);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-build-pin-from-above.png'), fullPage: true});
    console.log(`PASS Build: a pin dragged over a beam hole from above snaps in from the top (${-local[1]} LDU above the mid-plane)`);
    await page.keyboard.press('Escape');
};

/** A beam from the palette clicked onto another beam's top, aimed right into one of its holes: it rests ON that beam. */
const beamOntoBeam = async (page, lowerId, {shotsDir}) => {
    await focusOn(page, lowerId, 'Technic beam 5');
    const lower = await pose(page, lowerId);
    const id = await placeFromPalette(page, '32316.dat', () => screenOf(page, lowerId, [0, -10, 0]), /On top of Technic beam 5/);
    const p = await pose(page, id);
    // Both lie flat (turned only about the vertical): a beam 5's collider spans y ± 10 about its origin.
    assert.equal(p.position[1] + 10, lower.position[1] - 10, `its bottom (${p.position[1] + 10}) is the lower beam's top (${lower.position[1] - 10})`);
    assert.ok(Number.isInteger(p.position[0] / 10) && Number.isInteger(p.position[2] / 10), `x/z on the grid: ${p.position}`);
    const centre = modelPoint(p, [0, 0, 0]);
    assert.ok(Math.hypot(centre[0] - lower.position[0], centre[2] - lower.position[2]) <= 20, 'placed over the hole the pointer was on');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-build-beam-on-beam.png'), fullPage: true});
    console.log(`PASS Build: a beam placed on another beam's top (aimed into a hole) rests on it, bottom y ${p.position[1] + 10} = top y ${lower.position[1] - 10}`);
    return id;
};

/**
 * A beam slid onto the hub's top, then pushed down into it with the Y arrow: it
 * turns red, the status names the hub, and on release the move is refused and
 * the beam is back where the push started.
 */
const beamIntoHub = async (page, beamId, {shotsDir}) => {
    const canvas = page.getByTestId('bw-sim-lab-editor-canvas');
    await page.getByTestId('bw-sim-lab-view-home').click();
    // Nothing selected (no gizmo in the way): press on the beam and drag it, which also selects it.
    await canvas.focus();
    await page.keyboard.press('Escape');
    const grab = await grabPoint(page, beamId, 'Technic beam 5');
    const hub = await page.evaluate(() => window.__bwSimLab.editor.model.parts.find(p => p.part === '45601.dat').id);
    const onHub = await drag(page, grab, await screenOf(page, hub, [0, -80, 0]), {steps: 16});
    assert.deepEqual(await selectionOf(page), [beamId]);
    assert.match(onHub, /On top of SPIKE Prime hub/, 'slid onto the hub');
    await page.keyboard.press('f');
    const start = await pose(page, beamId);
    const arrow = await findHandle(page, 'Y');
    const box = await canvas.boundingBox();
    const at = await screenOf(page, beamId);
    const clip = {x: Math.max(box.x, at[0] - 160), y: Math.max(box.y, at[1] - 120), width: 320, height: 240};
    const redBefore = await redPixels(page, await page.screenshot(), clip);
    // Push down along the Y arrow, as a person does, until the status line says it would go in.
    await page.mouse.down();
    let said = '';
    for (let i = 1; i <= 60 && !/Would go into/.test(said); i++) {
        await page.mouse.move(arrow.at[0], arrow.at[1] + 3 * i);
        said = await statusText(page);
    }
    assert.match(said, /Would go into SPIKE Prime hub/, 'the status names the hub');
    assert.equal(await page.evaluate(() => window.__bwSimLab.editView.blockedInto), hub);
    const shot = await page.screenshot({path: resolve(shotsDir, 'sim-lab-build-blocked.png')});
    const redDuring = await redPixels(page, shot, clip);
    assert.ok(redDuring > redBefore + 150, `the beam turns red: ${redBefore} → ${redDuring} red pixels`);
    await page.mouse.up();
    assert.deepEqual(await pose(page, beamId), start, 'refused: the beam is back where it started');
    assert.match(await statusText(page), /Not moved: it would go into SPIKE Prime hub/);
    assert.equal(await page.getByTestId('bw-sim-lab-build-status').getAttribute('data-kind'), 'refused');
    console.log(`PASS Build: pushing a beam into the hub turns it red (${redBefore} → ${redDuring} px), names the hub, and is refused on release`);
    await page.keyboard.press('Escape');
};


// ---- the palette (Tinkercad's shape panel): pictures, search, drag into the view ----

const tileOf = (page, part) => page.getByTestId(`bw-sim-lab-part-${part}`);
/** Pixels of a palette tile's picture that are not background (transparent), and how many colours they use. */
const thumbPixels = (page, part) => page.evaluate(async id => {
    const img = document.querySelector(`[data-testid="${id}"] img[data-testid="bw-sim-lab-thumb"]`);
    if (!img) return null;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let drawn = 0;
    const colours = new Set();
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 32) continue;
        drawn++;
        colours.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
    }
    return {drawn, total: cv.width * cv.height, colours: colours.size};
}, `bw-sim-lab-part-${part}`);
/** The parts the palette shows right now (tiles laid out on screen), in order. */
const shownParts = page => page.evaluate(() => [...document.querySelectorAll('[data-testid="bw-sim-lab-palette"] [data-testid^="bw-sim-lab-part-"]')]
    .filter(el => el.getClientRects().length > 0).map(el => el.dataset.part));
const catalogPart = (page, part) => page.evaluate(p => {
    const m = window.__bwSimLab._pane.lib.CATALOG.get(p);
    return m && {category: m.category, name: m.name, nameDe: m.nameDe};
}, part);

/** Press on a palette tile and move, in small steps, to a point in the view (the button stays down). */
const pressAndDragTo = async (page, part, to, steps = 14) => {
    const tile = tileOf(page, part);
    await tile.scrollIntoViewIfNeeded();
    const b = await tile.boundingBox();
    const from = [b.x + b.width / 2, b.y + b.height / 2];
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
};
/** While dragging: move over the view's lower part until the status says the part would lie on open floor. */
const findOpenFloor = async page => {
    const box = await page.getByTestId('bw-sim-lab-editor-canvas').boundingBox();
    for (const [fx, fy] of [[0.2, 0.85], [0.8, 0.85], [0.5, 0.9], [0.15, 0.6], [0.85, 0.6], [0.35, 0.92], [0.65, 0.92]]) {
        const at = [box.x + box.width * fx, box.y + box.height * fy];
        await page.mouse.move(at[0], at[1], {steps: 6});
        if (/^On the floor/.test(await statusText(page))) return at;
    }
    throw new Error(`no open floor found while dragging: ${await statusText(page)}`);
};

/**
 * The palette as a child uses it: pictures drawn from the real parts (lazily: a
 * closed category's are drawn when it is opened), the search box, dragging a
 * part from the palette onto the floor and onto a beam hole, Esc during a drag,
 * and the "Recently used" row.
 */
const paletteInteractions = async (page, beamId, {shotsDir}) => {
    const canvas = page.getByTestId('bw-sim-lab-editor-canvas');
    await canvas.focus();
    await page.keyboard.press('Escape');
    await page.getByTestId('bw-sim-lab-view-home').click();

    // Pictures: an open category's tile shows its part, drawn (not blank) and shaded (many colours).
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-sim-lab-part-32524.dat"] img[data-testid="bw-sim-lab-thumb"]'),
        null, {timeout: 30000});
    const beamPic = await thumbPixels(page, '32524.dat');
    assert.ok(beamPic.drawn > beamPic.total * 0.05 && beamPic.colours > 12,
        `the beam 7 tile shows a drawn part: ${JSON.stringify(beamPic)}`);
    // Lazily: the gears' category is closed, so no gear picture is drawn until it is opened.
    assert.equal(await page.locator('[data-testid="bw-sim-lab-part-3647.dat"] img').count(), 0, 'a closed category draws nothing');
    await page.getByTestId('bw-sim-lab-category-gear').locator('summary').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-sim-lab-part-3647.dat"] img[data-testid="bw-sim-lab-thumb"]'),
        null, {timeout: 30000});
    const gearPic = await thumbPixels(page, '3647.dat');
    assert.ok(gearPic.drawn > gearPic.total * 0.05 && gearPic.colours > 12, `the gear tile shows a drawn part: ${JSON.stringify(gearPic)}`);
    const [beamUrl, gearUrl] = await page.evaluate(() => ['32524.dat', '3647.dat'].map(p =>
        document.querySelector(`[data-testid="bw-sim-lab-part-${p}"] img`).src));
    assert.notEqual(beamUrl, gearUrl, 'each part has its own picture');
    const title = await tileOf(page, '32524.dat').getAttribute('title');
    assert.match(title, /Technic beam 7 · part 32524/, 'the tooltip names the part and its number');
    await page.getByTestId('bw-sim-lab-palette').screenshot({path: resolve(shotsDir, 'sim-lab-palette.png')});
    console.log(`PASS Palette: tiles show pictures of the real parts (beam 7: ${beamPic.drawn}/${beamPic.total} px drawn, ` +
        `${beamPic.colours} colours), a closed category's are drawn when it opens`);

    // Search: by German word, by English name with a size, by part number; clearing brings the categories back.
    const search = page.getByTestId('bw-sim-lab-search');
    const allShown = (await shownParts(page)).length;
    await search.fill('zahnrad');
    const gears = await shownParts(page);
    assert.ok(gears.length >= 6 && gears.length < allShown, `zahnrad narrows the list: ${gears.length} of ${allShown}`);
    for (const p of gears) assert.equal((await catalogPart(page, p)).category, 'gear', `${p} is a gear`);
    await search.fill('beam 7');
    const beam7 = await shownParts(page);
    assert.equal(beam7[0], '32524.dat', `beam 7 first: ${beam7}`);
    assert.ok(!beam7.includes('32278.dat'), 'beam 15 is not beam 7');
    await search.fill('3647');
    assert.deepEqual(await shownParts(page), ['3647.dat'], 'a part number finds that part');
    await search.fill('xylophone');
    await page.getByTestId('bw-sim-lab-search-none').waitFor();
    await page.getByTestId('bw-sim-lab-search-clear').click();
    assert.equal((await shownParts(page)).length, allShown, 'clearing the search shows every category again');
    assert.equal(await page.getByTestId('bw-sim-lab-category-gear').evaluate(el => el.open), true, 'a category opened before the search stays open');
    console.log(`PASS Palette: search narrows the list (zahnrad → ${gears.length} gears, "beam 7" → 32524 first, 3647 → 1 part)`);

    // Drag a beam 5 from the palette onto open floor: the ghost follows, letting go places it there.
    const grid = await page.evaluate(() => window.__bwSimLab.editView.grid);
    let before = await partsCount(page);
    const box = await canvas.boundingBox();
    await pressAndDragTo(page, '32316.dat', [box.x + box.width * 0.5, box.y + box.height * 0.5]);
    assert.equal(await page.evaluate(() => window.__bwSimLab.editView.draggingFromPalette), true, 'the press became a drag');
    const spot = await findOpenFloor(page);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-palette-drag.png'), fullPage: true});
    const aimed = await page.evaluate(([x, y]) => window.__bwSimLab.editView.floorPointAt(x, y), spot);
    await page.mouse.up();
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, before, {timeout: 10000});
    const dropped = await lastPartId(page);
    const dp = await page.evaluate(id => window.__bwSimLab.editor.model.parts.find(p => p.id === id), dropped);
    assert.equal(dp.part, '32316.dat', 'the dragged part was placed');
    const off = Math.hypot(dp.position[0] - aimed[0], dp.position[2] - aimed[2]);
    assert.ok(off <= grid, `it lies where it was let go: ${off.toFixed(1)} LDU from the pointer's floor point ${aimed} (grid ${grid})`);
    assert.deepEqual(await selectionOf(page), [dropped], 'the dropped part is selected');
    assert.match(await statusText(page), /Placed Technic beam 5/);
    assert.equal(await tileOf(page, '32316.dat').getAttribute('aria-pressed'), 'false', 'a drag does not leave the tool armed');
    const recent = await page.evaluate(() => [...document.querySelectorAll('[data-testid="bw-sim-lab-recent"] [data-part]')].map(el => el.dataset.part));
    assert.equal(recent[0], '32316.dat', `Recently used starts with the part just placed: ${recent}`);
    assert.equal(new Set(recent).size, recent.length, 'each part once');
    console.log(`PASS Palette: dragging a beam from the palette onto the floor places it where let go (${off.toFixed(1)} LDU off), Recently used: ${recent.length}`);

    // Drag a pin from the palette onto a beam hole: the magnet snaps it in.
    await focusOn(page, beamId, 'Technic beam 7');
    const beam = await pose(page, beamId);
    before = await partsCount(page);
    await pressAndDragTo(page, '2780.dat', await screenOf(page, beamId, [0, -10, -40]), 16);
    const promised = await statusText(page);
    assert.match(promised, /Snaps to Technic beam 7 hole \d/, 'over the hole the magnet offers it');
    await page.mouse.up();
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 1, before, {timeout: 10000});
    const pin = await lastPartId(page);
    const pp = await pose(page, pin);
    const d = pp.position.map((v, i) => v - beam.position[i]);
    const local = [0, 1, 2].map(c => beam.rotation[c] * d[0] + beam.rotation[3 + c] * d[1] + beam.rotation[6 + c] * d[2]);
    assert.ok(Math.abs(local[0]) < 1e-6 && Math.abs(local[2] + 40) < 1e-6, `in the hole pointed at (z -40 in the beam's frame): ${local}`);
    assert.match(await statusText(page), /Snapped to Technic beam 7/);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-palette-drag-pin.png'), fullPage: true});
    console.log(`PASS Palette: a pin dragged from the palette onto a beam hole snaps in (${promised})`);

    // Esc during a drag: nothing is placed, even when the button is let go over the view.
    await page.getByTestId('bw-sim-lab-view-home').click();
    before = await partsCount(page);
    await pressAndDragTo(page, '32316.dat', [box.x + box.width * 0.5, box.y + box.height * 0.5]);
    await findOpenFloor(page);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__bwSimLab.editView.draggingFromPalette), false, 'Esc ends the drag');
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.8, {steps: 4});
    await page.mouse.up();
    assert.equal(await partsCount(page), before, 'Esc during a drag places nothing');
    assert.equal(await tileOf(page, '32316.dat').getAttribute('aria-pressed'), 'false');
    // And a click-armed tool still places with a click.
    const spot2 = [box.x + box.width * 0.5, box.y + box.height * 0.5];
    await tileOf(page, '32316.dat').click();
    assert.equal(await tileOf(page, '32316.dat').getAttribute('aria-pressed'), 'true', 'a click arms the tool');
    await page.mouse.move(spot2[0], spot2[1], {steps: 4});
    await page.keyboard.press('Escape');
    assert.equal(await tileOf(page, '32316.dat').getAttribute('aria-pressed'), 'false', 'Esc disarms it');
    console.log('PASS Palette: Esc during a drag cancels it (no part added); click-to-arm still arms, Esc disarms');
};
