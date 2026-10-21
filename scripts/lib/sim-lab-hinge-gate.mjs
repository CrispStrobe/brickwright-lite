// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The hinge tool (editor/snap.js hingeCandidates, docs/ROBOT-LAB-UX.md §4 P3) for
// scripts/verify-sim-lab-browser.mjs `--part=editor`, by keys and the properties panel's
// buttons. Internal APIs lay out the parts (set-up), select them as a click would, and READ
// the results (the model, editView.debug.hinge(), the status line).
//
// Fixture (LDU, holes along y): a Beam 7 at the origin with a free pin in its first hole and
// pin p1 in its last; a Beam 3 arm on p1; pin p2 in the arm's far hole carrying a second arm.
//
//   1. the arm selected, N shows its hinge: p1's line; the arm, p2 and the second arm turn;
//   2. ] turns all three 15° about that line in one undo step (the arm's hole stays on p1),
//      Ctrl+Z puts them all back;
//   3. N again: the other hinge (p2's line: the arm turns the beam); N once more: the first;
//   4. the properties panel's +15° turns the same three;
//   5. a beam beside the arm: the turn is refused (in the way), nothing moves; a loose beam
//      has no hinge, and says so;
//   6. Ctrl+drag on an axle standing in the beam's hole glides it up along the hole (one undo
//      step, still in the hole); Ctrl+drag on the beam itself says only pins and axles glide.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const UP = [0, -1, 0, 1, 0, 0, 0, 0, 1];
const lab = (page, fn, arg) => page.evaluate(fn, arg);
const statusKind = page => page.getByTestId('bw-sim-lab-build-status').getAttribute('data-kind');
const statusText = page => page.getByTestId('bw-sim-lab-build-status').textContent();
const poses = page => lab(page, () => Object.fromEntries(window.__bwSimLab.editor.model.parts.map(p => [p.id, {position: p.position, rotation: p.rotation}])));
const hinge = page => lab(page, () => window.__bwSimLab.editView.debug.hinge());
const select = (page, ids) => lab(page, s => window.__bwSimLab.editView.select(s), ids);
const sorted = ids => ids.slice().sort();
const same = (a, b) => a.position.every((v, i) => Math.abs(v - b.position[i]) < 1e-6) && a.rotation.every((v, i) => Math.abs(v - b.rotation[i]) < 1e-6);
const angleOf = (a, b) => {
    // the angle between two frames: acos((trace(Aᵀ B) - 1) / 2)
    let t = 0;
    for (let i = 0; i < 9; i++) t += a[i] * b[i];
    return Math.acos(Math.max(-1, Math.min(1, (t - 1) / 2))) * 180 / Math.PI;
};

/** Set-up: the model emptied, then `list` placed ([part, position, rotation]); returns their ids. */
const layOut = (page, list) => lab(page, l => {
    const ed = window.__bwSimLab.editor;
    if (ed.model.parts.length) ed.apply({type: 'batch', commands: ed.model.parts.map(p => ({type: 'delete', id: p.id}))});
    const ids = [];
    for (const [part, position, rotation] of l) {
        ed.apply({type: 'place', part, position, rotation, color: 71});
        ids.push(ed.model.parts.at(-1).id);
    }
    window.__bwSimLab.editView.select([]);
    return ids;
}, list);

const waitKind = (page, kind) => page.waitForFunction(k => document.querySelector('[data-testid="bw-sim-lab-build-status"]')?.dataset.kind === k, kind, {timeout: 10000});

export const hingeInteractions = async (page, {shotsDir}) => {
    try {
        return await checks(page, {shotsDir});
    } catch (error) {
        await page.screenshot({path: resolve(shotsDir, 'sim-lab-hinge-failure.png'), fullPage: true}).catch(() => {});
        throw error;
    }
};

const checks = async (page, {shotsDir}) => {
    const out = {};
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
    const [b7, p0, p1, arm, p2, c] = await layOut(page, [
        ['32524.dat', [0, 0, 0], I], ['2780.dat', [0, -10, -60], UP], ['2780.dat', [0, -10, 60], UP],
        ['32523.dat', [0, -20, 80], I], ['2780.dat', [0, -30, 100], UP], ['32523.dat', [0, -40, 120], I]]);
    await lab(page, () => window.__bwSimLab.editView.frameModel());
    const canvas = page.getByTestId('bw-sim-lab-editor-canvas');
    await canvas.focus();

    // 1. N shows the arm's hinge.
    await select(page, [arm]);
    assert.equal(await hinge(page), null, 'no hinge before one is asked for');
    await page.keyboard.press('n');
    await waitKind(page, 'hingeShown');
    const first = await hinge(page);
    assert.deepEqual(sorted(first.moving), sorted([arm, p2, c]), `the arm carries p2 and the second arm: ${JSON.stringify(first)}`);
    assert.deepEqual(first.fixed, [p1]);
    assert.ok(first.shown, 'its line is drawn');
    assert.ok(Math.abs(Math.abs(first.axis[1]) - 1) < 1e-9 && Math.abs(first.point[2] - 60) < 1e-6, `p1's line: ${JSON.stringify(first)}`);
    assert.equal(first.index, 0, 'the first N shows the first hinge (the fewest moving parts)');
    assert.match(await statusText(page), /Hinge 1 of 2: 3 parts turn/);

    // 2. ] turns all three, one undo step.
    const before = await poses(page);
    await page.keyboard.press(']');
    await waitKind(page, 'hinged');
    const after = await poses(page);
    for (const id of [b7, p0, p1]) assert.ok(same(before[id], after[id]), `${id} stays`);
    for (const id of [arm, p2, c]) assert.ok(Math.abs(angleOf(before[id].rotation, after[id].rotation) - 15) < 1e-6, `${id} turned 15°`);
    // The arm's first hole (z -20 in the part) is still on p1's line.
    const hole0 = p => [0, 1, 2].map(r => p.rotation[r * 3 + 2] * -20 + p.position[r]);
    const h = hole0(after[arm]);
    assert.ok(Math.hypot(h[0], h[2] - 60) < 1e-6, `the arm's hole stays on p1: ${h}`);
    assert.match(await statusText(page), /3 parts turned 15°/);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-hinge.png')});
    await page.keyboard.press('Control+z');
    await page.waitForFunction(([id, x]) => Math.abs(window.__bwSimLab.editor.model.parts.find(p => p.id === id).position[0] - x) < 1e-6,
        [c, before[c].position[0]]);
    const undone = await poses(page);
    for (const id of [arm, p2, c]) assert.ok(same(before[id], undone[id]), `Ctrl+Z puts ${id} back in one step`);

    // 3. N steps to the other hinge (p2's line: there the arm turns the beam), and N again comes round.
    await page.keyboard.press('n');
    await page.waitForFunction(() => window.__bwSimLab.editView.debug.hinge()?.index === 1);
    const second = await hinge(page);
    assert.deepEqual(sorted(second.moving), sorted([arm, b7, p0, p1]), `on p2's line the arm turns the beam: ${JSON.stringify(second)}`);
    assert.deepEqual(second.fixed, [p2]);
    await page.keyboard.press('n');
    await page.waitForFunction(() => window.__bwSimLab.editView.debug.hinge()?.index === 0);
    assert.deepEqual((await hinge(page)).fixed, [p1]);

    // 4. The properties panel's +15°.
    const panel = page.getByTestId('bw-sim-lab-properties-panel');
    if (!(await panel.isVisible())) {
        const button = page.getByTestId('bw-sim-lab-properties');
        if (!(await button.isVisible())) await page.getByTestId('bw-sim-lab-more').click();
        await button.click();
    }
    await panel.waitFor();
    const before4 = await poses(page);
    await page.getByTestId('bw-sim-lab-prop-hinge-plus').click();
    await waitKind(page, 'hinged');
    const after4 = await poses(page);
    for (const id of [arm, p2, c]) assert.ok(Math.abs(angleOf(before4[id].rotation, after4[id].rotation) - 15) < 1e-6, `+15° turned ${id}`);
    assert.ok(same(before4[b7], after4[b7]));
    const drawer = page.getByTestId('bw-sim-lab-properties-drawer');
    if (await drawer.isVisible()) await drawer.getByRole('button', {name: 'Close'}).click();

    // 5. Something in the way: refused, nothing moves. A loose beam: no hinge.
    const [, , , arm5] = await layOut(page, [
        ['32524.dat', [0, 0, 0], I], ['2780.dat', [0, -10, -60], UP], ['2780.dat', [0, -10, 60], UP],
        ['32523.dat', [0, -20, 80], I], ['32524.dat', [20, -20, 100], I], ['32524.dat', [-20, -20, 100], I]]);
    await select(page, [arm5]);
    await canvas.focus(); // the panel's button had the focus
    const before5 = await poses(page);
    await page.keyboard.press(']');
    await waitKind(page, 'refused');
    assert.match(await statusText(page), /^Not turned: it would go into/);
    assert.deepEqual(await poses(page), before5, 'a blocked turn moves nothing');
    const [loose] = await layOut(page, [['32524.dat', [0, 0, 0], I]]);
    await select(page, [loose]);
    await page.keyboard.press('n');
    await page.waitForFunction(() => /No hinge here/.test(document.querySelector('[data-testid="bw-sim-lab-build-status"]')?.textContent || ''), null, {timeout: 10000});
    assert.equal(await statusKind(page), 'refused');
    assert.equal(await hinge(page), null);
    out.hinges = first.of;

    // 6. Ctrl-glide: an axle 3 standing in the beam's middle hole.
    const [b6, ax6] = await layOut(page, [['32524.dat', [0, 0, 0], I], ['4519.dat', [0, -20, 0], UP]]);
    await lab(page, () => window.__bwSimLab.editView.frameModel());
    const screenAt = ldu => lab(page, p => window.__bwSimLab.editView.toScreen([p[0] * 0.0004, -p[1] * 0.0004, -p[2] * 0.0004]), ldu);
    const grip = await screenAt([0, -40, 0]); // on the axle, above the beam
    // Along the axle as the screen shows it: towards where a point 20 LDU higher up it is drawn.
    const up = await screenAt([0, -60, 0]);
    const n = Math.hypot(up[0] - grip[0], up[1] - grip[1]);
    const to = [grip[0] + (up[0] - grip[0]) / n * 25, grip[1] + (up[1] - grip[1]) / n * 25];
    const y0 = (await poses(page))[ax6].position[1];
    await page.mouse.move(grip[0], grip[1]);
    await page.keyboard.down('Control');
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], {steps: 10});
    await page.mouse.up();
    await page.keyboard.up('Control');
    const y1 = (await poses(page))[ax6].position[1];
    assert.ok(y1 < y0 - 3, `the axle glided up its hole: y ${y0} → ${y1} (status "${await statusText(page)}", from ${grip} to ${to}, glide ${JSON.stringify(await lab(page, () => window.__bwSimLab.editView.debug.glide()))})`);
    const paired = await lab(page, ([id]) => window.__bwSimLab._pane.lib.pairedParts(window.__bwSimLab.editor.model, window.__bwSimLab._pane.lib.CATALOG, id), [ax6]);
    assert.deepEqual(paired, [b6], 'still in the beam\'s hole');
    out.glideLdu = Math.round((y0 - y1) * 10) / 10;
    await canvas.focus();
    await page.keyboard.press('Control+z');
    await page.waitForFunction(([id, y]) => window.__bwSimLab.editor.model.parts.find(p => p.id === id).position[1] === y, [ax6, y0]);
    // The beam is no pin or axle: Ctrl+drag on it says what glides.
    const onBeam = await screenAt([0, -10, 40]);
    await page.mouse.move(onBeam[0], onBeam[1]);
    await page.keyboard.down('Control');
    await page.mouse.down();
    await page.mouse.move(onBeam[0] + 30, onBeam[1], {steps: 6});
    await page.mouse.up();
    await page.keyboard.up('Control');
    assert.match(await statusText(page), /Ctrl\+drag slides a pin or an axle/);
    return out;
};
