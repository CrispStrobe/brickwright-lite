// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab build editor's Studio/LeoCAD tools, for scripts/verify-sim-lab-browser.mjs
// (`--part=editor`), driven by real mouse clicks, drags and key presses. Internal APIs
// READ results (poses, colours, the selection) and say where a part is on screen; the
// only thing they DO is put the test parts on open floor before the checks start.
//
//   1. colour: a part selected, a swatch in the properties panel paints it — the model's
//      colour and the PIXELS on screen turn red; Ctrl+Z takes it back; the eyedropper
//      (K, then a click on the red part) paints another part the same red;
//   2. hide / isolate / show all: H hides the part (its pixels are gone, a click there
//      selects nothing), hidden parts stay hidden through Simulate and back, I keeps only
//      the selection, Shift+H shows everything again;
//   3. mirror: a bent liftarm mirrored left ↔ right lands on its exact mirror image (its
//      holes are the old holes reflected), with a proper rotation; a straight beam,
//      its own mirror image, is not changed and the status says so;
//   4. align: two beams lined up on their centres front–back with the panel's buttons;
//   5. measure: M, then clicks on the end holes of a beam 7: 120 LDU = 6 studs = 48 mm,
//      on the label in the view and in the status;
//   6. edit inside a group: Ctrl+G, a double click opens the group, a click selects one
//      member, R turns only it, Esc leaves with the whole group selected;
//   7. copy and paste between models through the system clipboard as LDraw text, and
//      LDraw text as BrickLink Studio writes it pastes in;
//   8. the shortcut sheet opens with ? and with its button, and Esc closes it.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const model = page => page.evaluate(() => window.__bwSimLab.editor.model);
const partOf = (page, id) => page.evaluate(i => window.__bwSimLab.editor.model.parts.find(p => p.id === i) || null, id);
const selectionOf = page => page.evaluate(() => window.__bwSimLab.editView.selection.slice().sort());
const statusText = page => page.getByTestId('bw-sim-lab-build-status').textContent();
/** Where a point of a part (LDU, its own frame) is on screen right now. */
const screenOf = (page, id, local = [0, 0, 0]) => page.evaluate(([i, local]) => {
    // `local` is [across, height, along] of the part as it lies: its y is taken along the world
    // vertical (LDraw -y up), whatever the part's turn — a beam the palette stands on edge
    // (canonical-frame.js defaultRotation) has its top where a flat one has it.
    const part = window.__bwSimLab.editor.model.parts.find(p => p.id === i);
    const R = part ? part.rotation : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const up = [R[3], R[4], R[5]]; // the part-frame direction of world LDraw +y
    const vert = Math.abs(up[1]) > 0.99 ? 1 : Math.abs(up[0]) > 0.99 ? 0 : 2;
    const l = local ? local.slice() : [0, 0, 0];
    if (local && vert !== 1) { const h = l[1]; l[1] = l[vert]; l[vert] = h * Math.sign(up[vert]); }
    else if (local) l[1] = local[1] * Math.sign(up[1]);
    const v = window.__bwSimLab.editView;
    const w = v.debugPoint(i, l);
    return w && v.toScreen(w);
}, [id, local]);
/** A point on a beam's top face between two holes. */
const ON_BEAM = [0, -10, 10];

/**
 * Red pixels (LDraw Red #B40000, lit) in a square of the page around a screen point. The
 * pointer is moved off the parts first: a hovered or selected part glows, which shifts its hue.
 */
const redPixels = async (page, at, half = 26) => {
    const box = await page.getByTestId('bw-sim-lab-editor-canvas').boundingBox();
    await page.mouse.move(box.x + 4, box.y + 4);
    // Two frames drawn since the pointer left (the hover highlight is gone), not a fixed sleep.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const png = await page.screenshot({clip: {x: at[0] - half, y: at[1] - half, width: 2 * half, height: 2 * half}});
    return page.evaluate(async b64 => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 100 && d[i + 1] < 70 && d[i + 2] < 70) n++;
        return n;
    }, png.toString('base64'));
};

/** Clicks a build-bar action: on the bar, or in the compact "More…" menu. */
const action = async (page, id) => {
    const button = page.getByTestId(`bw-sim-lab-${id}`);
    if (!(await button.isVisible())) await page.getByTestId('bw-sim-lab-more').click();
    await button.click();
};
/** The properties panel: docked beside the view, or opened over it. */
const openProperties = async page => {
    if (!(await page.getByTestId('bw-sim-lab-properties-panel').isVisible())) await action(page, 'properties');
    await page.getByTestId('bw-sim-lab-properties-panel').waitFor();
};
/** Out of the way again when it opened over the view (it covers the parts behind it). */
const closeProperties = async page => {
    const drawer = page.getByTestId('bw-sim-lab-properties-drawer');
    if (await drawer.isVisible()) await drawer.getByRole('button', {name: 'Close'}).click();
};
/**
 * Like a person aiming at a part another may partly cover: move over spots along its top
 * until the status line names it (the pointer is on it), and click there.
 */
const clickPart = async (page, id, {shift = false, dbl = false} = {}) => {
    const name = await page.evaluate(i => {
        const pane = window.__bwSimLab._pane;
        return pane.partName(pane.editor.model.parts.find(p => p.id === i).part);
    }, id);
    const corner = await page.getByTestId('bw-sim-lab-editor-canvas').boundingBox();
    for (const local of [ON_BEAM, [0, -10, -10], [0, -10, 30], [0, -10, -30], [0, -10, 0], [10, -10, 10], [-10, -10, 10]]) {
        await page.mouse.move(corner.x + 4, corner.y + 4);
        const at = await screenOf(page, id, local);
        await page.mouse.move(at[0], at[1]);
        if (!(await statusText(page)).startsWith(`${name}:`)) continue;
        if (dbl) await page.mouse.dblclick(at[0], at[1]);
        else await click(page, at, {shift});
        return at;
    }
    throw new Error(`no spot on ${id} (${name}) to click`);
};
const click = async (page, at, {shift = false} = {}) => {
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(at[0], at[1]);
    if (shift) await page.keyboard.up('Shift');
};

/** A part's box (LDU) from its catalog colliders: an independent reading of where its faces are. */
const boxOf = async (page, id) => page.evaluate(i => {
    const p = window.__bwSimLab.editor.model.parts.find(x => x.id === i);
    const meta = window.__bwSimLab._pane.lib.CATALOG.get(p.part);
    const R = p.rotation;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const c of meta.colliders) {
        const he = c.halfExtents || [c.radius, c.halfHeight ?? c.radius, c.radius];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const l = [(c.position || [0, 0, 0])[0] + sx * he[0], (c.position || [0, 0, 0])[1] + sy * he[1], (c.position || [0, 0, 0])[2] + sz * he[2]];
            for (let k = 0; k < 3; k++) {
                const v = R[k * 3] * l[0] + R[k * 3 + 1] * l[1] + R[k * 3 + 2] * l[2] + p.position[k];
                lo[k] = Math.min(lo[k], v);
                hi[k] = Math.max(hi[k], v);
            }
        }
    }
    return {lo, hi};
}, id);

/**
 * @param {import('playwright').Page} page the Sim Lab open (Simulate), clipboard permissions granted
 * @param {{shotsDir: string}} options
 */
export const editorParityInteractions = async (page, {shotsDir}) => {
    try {
        await checks(page, {shotsDir});
    } catch (error) {
        // What the page looked like when a check failed, for the person reading the CI log.
        await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-failure.png'), fullPage: true}).catch(() => {});
        throw error;
    }
};

const checks = async (page, {shotsDir}) => {
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
    const canvas = page.getByTestId('bw-sim-lab-editor-canvas');

    // Set-up only: a beam 7, a beam 5 and a bent liftarm on open floor beside the robot, each
    // the beams given a quarter turn from their palette pose (a beam stands on edge along x
    // there, canonical-frame.js defaultRotation): side by side along z, far enough apart that
    // the upright beams do not cover each other on screen. The liftarm keeps its palette pose,
    // its bend in the x-y plane, so mirroring across x is not its own symmetry (step 3).
    const setup = await page.evaluate(() => {
        const v = window.__bwSimLab.editView;
        const parts = window.__bwSimLab.editor.model.parts;
        const xs = parts.map(p => v.debugPoint(p.id)[0]);
        const x0 = Math.max(...xs) + 0.09;
        const zs = parts.map(p => v.debugPoint(p.id)[2]);
        const z0 = (Math.min(...zs) + Math.max(...zs)) / 2;
        const out = {};
        for (const [name, part, dx, dz, turns] of [['a', '32524.dat', 0, 0, 1], ['b', '32316.dat', 0.05, 0.09, 1], ['l', '32348.dat', 0.12, -0.02, 0]]) {
            v.placeAt(part, [x0 + dx, 0, z0 + dz], turns);
            out[name] = window.__bwSimLab.editor.model.parts.at(-1).id;
        }
        v.select([]);
        return out;
    });
    const {a, b, l} = setup;
    assert.ok(a && b && l && new Set([a, b, l]).size === 3, `three parts placed: ${JSON.stringify(setup)}`);
    await page.evaluate(() => window.__bwSimLab.editView.view('home')); // framing only, not under test

    // 1. Colour: select beam A with a click, paint it red from the panel.
    // Close up on the beam (F frames the selection), so its pixels are many; measured unselected.
    await clickPart(page, a);
    assert.deepEqual(await selectionOf(page), [a], 'a click selects the beam');
    await page.keyboard.press('f');
    await page.keyboard.press('Escape');
    const redBefore = await redPixels(page, await screenOf(page, a, ON_BEAM), 40);
    await clickPart(page, a);
    assert.deepEqual(await selectionOf(page), [a]);
    await openProperties(page);
    assert.match(await page.getByTestId('bw-sim-lab-prop-name').textContent(), /Technic beam 7/);
    assert.match(await page.getByTestId('bw-sim-lab-prop-name').textContent(), /Part 32524/);
    await page.getByTestId('bw-sim-lab-colour-4').click();
    assert.equal((await partOf(page, a)).color, 4, 'the swatch painted the selected part');
    assert.match(await statusText(page), /Painted 1 Red/);
    assert.equal(await page.getByTestId('bw-sim-lab-colour-4').getAttribute('aria-pressed'), 'true', 'the swatch shows the part\'s colour');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-properties.png'), fullPage: true});
    await closeProperties(page);
    // Unselected (a selected part glows blue), as it was before.
    await canvas.focus();
    await page.keyboard.press('Escape');
    const redAfter = await redPixels(page, await screenOf(page, a, ON_BEAM), 40);
    assert.ok(redBefore < 10 && redAfter > 600, `the beam turned red on screen: ${redBefore} → ${redAfter} red pixels`);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-colour.png'), fullPage: true});
    await page.keyboard.press('ControlOrMeta+z');
    assert.equal((await partOf(page, a)).color, 71, 'Ctrl+Z takes the colour back');
    assert.ok(await redPixels(page, await screenOf(page, a, ON_BEAM), 40) < 10, 'and the red is gone from the screen');
    await page.keyboard.press('ControlOrMeta+y');
    assert.equal((await partOf(page, a)).color, 4);
    await page.evaluate(() => window.__bwSimLab.editView.view('home')); // framing only, not under test
    // Eyedropper: select beam B, K, click the red beam: B is painted red.
    await clickPart(page, b);
    assert.deepEqual(await selectionOf(page), [b]);
    await page.keyboard.press('k');
    assert.match(await statusText(page), /Eyedropper/);
    await click(page, await screenOf(page, a, ON_BEAM));
    assert.equal((await partOf(page, b)).color, 4, 'the eyedropper took beam A\'s red onto beam B');
    assert.deepEqual(await selectionOf(page), [b], 'picking a colour does not change the selection');
    assert.equal(await page.evaluate(() => window.__bwSimLab.editView.placeColor), 4, 'new parts get the picked colour');
    console.log(`PASS editor: a swatch paints the selection (${redBefore} → ${redAfter} red pixels), Ctrl+Z / Ctrl+Y, the eyedropper copies a part's colour`);

    // 2. Hide / isolate / show all.
    await clickPart(page, a);
    const aSpot = await screenOf(page, a, ON_BEAM);
    await page.keyboard.press('h');
    assert.deepEqual(await page.evaluate(() => window.__bwSimLab.editView.hidden), [a]);
    assert.match(await page.getByTestId('bw-sim-lab-hidden-count').textContent(), /1 hidden/);
    assert.ok(await redPixels(page, aSpot) < 10, 'the hidden beam is not drawn');
    await click(page, aSpot);
    assert.ok(!(await selectionOf(page)).includes(a), 'a hidden part cannot be clicked');
    // Hidden stays hidden through Simulate and back (view state for the session, not the model).
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready');
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
    assert.deepEqual(await page.evaluate(() => window.__bwSimLab.editView.hidden), [a], 'still hidden after Simulate and back');
    await canvas.focus();
    await page.keyboard.press('Shift+H');
    assert.deepEqual(await page.evaluate(() => window.__bwSimLab.editView.hidden), []);
    assert.ok(await redPixels(page, await screenOf(page, a, ON_BEAM)) > 60, 'Show all draws it again');
    await clickPart(page, a);
    await page.keyboard.press('i');
    const all = (await model(page)).parts.map(p => p.id);
    assert.deepEqual((await page.evaluate(() => window.__bwSimLab.editView.hidden)).sort(), all.filter(id => id !== a).sort(), 'I hides all but the selection');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-isolate.png'), fullPage: true});
    await page.getByTestId('bw-sim-lab-hidden-count').click();
    assert.deepEqual(await page.evaluate(() => window.__bwSimLab.editView.hidden), [], 'the hidden chip shows all');
    console.log('PASS editor: H hides (not drawn, not clickable, kept through Simulate), I isolates, Show all brings everything back');

    // 3. Mirror the bent liftarm left ↔ right: its holes land on the mirror images of the old ones.
    await page.evaluate(() => window.__bwSimLab.editView.view('home')); // framing only, not under test
    const lAt = await screenOf(page, l, [0, -10, 0]);
    await click(page, lAt);
    if (!(await selectionOf(page)).includes(l)) await click(page, await screenOf(page, l, [0, -10, 20]));
    assert.deepEqual(await selectionOf(page), [l], 'the liftarm is selected');
    const holes = id => page.evaluate(i => {
        const p = window.__bwSimLab.editor.model.parts.find(x => x.id === i);
        const meta = window.__bwSimLab._pane.lib.CATALOG.get(p.part);
        return meta.connectors.map(c => [0, 1, 2].map(k => p.rotation[k * 3] * c.position[0] + p.rotation[k * 3 + 1] * c.position[1] + p.rotation[k * 3 + 2] * c.position[2] + p.position[k]));
    }, id);
    const before = await holes(l);
    const l0 = await partOf(page, l);
    await action(page, 'mirror-x');
    const l1 = await partOf(page, l);
    const after = await holes(l);
    const det = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    assert.ok(Math.abs(det(l1.rotation) - 1) < 1e-9, `a proper rotation after mirroring: det ${det(l1.rotation)}`);
    assert.notDeepEqual(l1.rotation, l0.rotation, 'the liftarm turned into its mirror image');
    const mean = pts => pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const c = (mean(before) + mean(after)) / 2;
    const key = p => p.map(v => Math.round(v * 100) / 100).map(v => (v === 0 ? 0 : v)).join(',');
    assert.deepEqual(after.map(key).sort(), before.map(p => [2 * c - p[0], p[1], p[2]]).map(key).sort(),
        `the holes are mirrored across x = ${c}`);
    assert.match(await statusText(page), /Mirrored 1/);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-mirror.png'), fullPage: true});
    await clickPart(page, b);
    const bPose = await partOf(page, b);
    await action(page, 'mirror-x');
    assert.deepEqual(await partOf(page, b), bPose, 'a straight beam is its own mirror image');
    assert.match(await statusText(page), /own mirror image/);
    console.log(`PASS editor: Mirror ↔ puts a bent liftarm's holes on their mirror images across x = ${c} (det +1); a straight beam is left alone`);

    // 4. Align: beams A and B lined up on their centres front–back.
    await clickPart(page, a);
    await clickPart(page, b, {shift: true});
    assert.deepEqual(await selectionOf(page), [a, b].sort());
    await openProperties(page);
    const [boxA0, boxB0] = [await boxOf(page, a), await boxOf(page, b)];
    const centreZ = box => (box.lo[2] + box.hi[2]) / 2;
    assert.notEqual(centreZ(boxA0), centreZ(boxB0), 'not lined up yet');
    await page.getByTestId('bw-sim-lab-align-axis').selectOption('z');
    await page.getByTestId('bw-sim-lab-align-centre').click();
    const [boxA1, boxB1] = [await boxOf(page, a), await boxOf(page, b)];
    assert.equal(centreZ(boxA1), centreZ(boxB1), `centres lined up front–back: ${centreZ(boxA1)} / ${centreZ(boxB1)}`);
    assert.deepEqual([boxA1.lo[0], boxB1.lo[0]], [boxA0.lo[0], boxB0.lo[0]], 'left–right untouched');
    assert.match(await statusText(page), /Lined up/);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-align.png'), fullPage: true});
    await closeProperties(page);
    console.log(`PASS editor: Line up → Centres puts both beams' centres at z ${centreZ(boxA1)} LDU`);

    // 5. Measure between the end holes of beam A (seven holes: 6 × 20 LDU apart).
    await canvas.focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('m');
    assert.match(await statusText(page), /Measuring/);
    await click(page, await screenOf(page, a, [0, -10, -60]));
    assert.match(await statusText(page), /second point/);
    await click(page, await screenOf(page, a, [0, -10, 60]));
    const m = await page.evaluate(() => window.__bwSimLab.editView.measurement);
    assert.ok(m, 'a measurement was taken');
    assert.deepEqual([m.ldu, m.studs, m.mm], [120, 6, 48], `end holes of a beam 7: ${JSON.stringify(m)}`);
    const label = page.getByTestId('bw-sim-lab-measure-label');
    assert.ok(await label.isVisible(), 'the tape shows its label in the view');
    assert.equal(await label.textContent(), '120 LDU · 6 studs · 48 mm');
    assert.match(await statusText(page), /120 LDU = 6 studs = 48 mm/);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-measure.png'), fullPage: true});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__bwSimLab.editView.pick), null, 'Esc puts the tape away');
    assert.ok(!(await label.isVisible()));
    console.log('PASS editor: M measures between two holes of a beam 7: 120 LDU = 6 studs = 48 mm');

    // 6. Edit inside a group.
    await clickPart(page, a);
    await clickPart(page, b, {shift: true});
    await page.keyboard.press('ControlOrMeta+g');
    await page.keyboard.press('Escape');
    await clickPart(page, a);
    assert.deepEqual(await selectionOf(page), [a, b].sort(), 'a click on a member selects the group');
    await clickPart(page, a, {dbl: true});
    assert.ok(await page.evaluate(() => window.__bwSimLab.editView.editingGroup), 'a double click opens the group');
    assert.deepEqual(await selectionOf(page), [a], 'inside, only the clicked member is selected');
    assert.ok(await page.getByTestId('bw-sim-lab-group-edit-chip').isVisible());
    await clickPart(page, b);
    assert.deepEqual(await selectionOf(page), [b], 'a click selects one member, not the group');
    const aBefore = await partOf(page, a);
    const bBefore = await partOf(page, b);
    await page.keyboard.press('r');
    assert.notDeepEqual((await partOf(page, b)).rotation, bBefore.rotation, 'R turned the member');
    assert.deepEqual(await partOf(page, a), aBefore, 'and not the rest of its group');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-group-edit.png'), fullPage: true});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__bwSimLab.editView.editingGroup), null, 'Esc leaves the group');
    assert.deepEqual(await selectionOf(page), [a, b].sort(), 'with the whole group selected');
    console.log('PASS editor: a double click edits inside a group (one member selected and turned alone), Esc leaves it');

    // 7. Copy the group as LDraw text; paste it into another model; paste Studio's LDraw text.
    await page.keyboard.press('ControlOrMeta+c');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.split(/\r?\n/).filter(x => x.startsWith('1 '));
    assert.equal(lines.length, 2, `two LDraw part lines on the clipboard:\n${text}`);
    assert.ok(lines.every(x => /^1 4 /.test(x)), 'in red');
    // A type-1 line is exactly 15 fields: colour, x y z, nine matrix entries, then the part file.
    const fields = lines.map(x => x.trim().split(/\s+/));
    assert.ok(fields.every(f => f.length === 15), `whole LDraw type-1 lines: ${lines.join(' | ')}`);
    assert.deepEqual(fields.map(f => f[14]).sort(), ['32316.dat', '32524.dat']);
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready');
    const models = await page.getByTestId('bw-sim-lab-model').locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
    await page.getByTestId('bw-sim-lab-model').selectOption(models[1]);
    await page.waitForFunction(m => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.shipped === m, models[1]);
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
    const n0 = (await model(page)).parts.length;
    await canvas.focus();
    await page.keyboard.press('ControlOrMeta+v');
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 2, n0, {timeout: 10000});
    const pasted = (await model(page)).parts.slice(n0);
    assert.deepEqual(pasted.map(p => [p.part, p.color]).sort(), [['32316.dat', 4], ['32524.dat', 4]], 'the copied parts, in red, in the other model');
    const studio = '0 Untitled Model\r\n0 Name: untitled.ldr\r\n1 14 600 -10 0 1 0 0 0 1 0 0 0 1 32523.dat\r\n';
    await page.evaluate(t => navigator.clipboard.writeText(t), studio);
    await page.keyboard.press('ControlOrMeta+v');
    await page.waitForFunction(n => window.__bwSimLab.editor.model.parts.length === n + 3, n0, {timeout: 10000});
    const fromStudio = (await model(page)).parts.at(-1);
    assert.deepEqual([fromStudio.part, fromStudio.color, fromStudio.position], ['32523.dat', 14, [600, -10, 0]], 'Studio\'s LDraw line pasted where it was');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-paste.png'), fullPage: true});
    console.log('PASS editor: Ctrl+C puts LDraw text on the clipboard, Ctrl+V pastes it into another model, and pastes Studio\'s LDraw text');

    // 8. The shortcut sheet: ? and its button; Esc closes it.
    await canvas.focus();
    await page.keyboard.press('?');
    const sheet = page.getByTestId('bw-sim-lab-shortcut-sheet');
    await sheet.waitFor();
    assert.match(await sheet.textContent(), /Ctrl\+C \/ Ctrl\+V/);
    assert.match(await sheet.textContent(), /Double click/);
    assert.match(await sheet.textContent(), /Long press/);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-editor-shortcuts.png'), fullPage: true});
    await page.keyboard.press('Escape');
    await sheet.waitFor({state: 'detached'});
    await action(page, 'shortcuts');
    await sheet.waitFor();
    await page.getByTestId('bw-sim-lab-shortcuts-close').click();
    await sheet.waitFor({state: 'detached'});
    console.log('PASS editor: ? and the Shortcuts button open the sheet of mouse, keyboard and touch controls; Esc closes it');
};
