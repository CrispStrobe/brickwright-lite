// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Pen and paper (view/pen-layer.js, docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M15) for
// scripts/verify-sim-lab-browser.mjs `--part=ui`, on the SPIKE driving base:
//
//   1. in Build, the castor ball selected, the properties panel's "Draws on the floor" ticked;
//   2. in Simulate, both motors driven through the Robot Lab API: the ball draws its track on the
//      floor — drawing() returns a stroke centimetres long, along where the robot went;
//   3. Reset: the floor is clean again.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const lab = (page, fn, arg) => page.evaluate(fn, arg);
const strokeLength = s => s.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0);

export const penInteractions = async (page, {shotsDir}) => {
    try {
        return await checks(page, {shotsDir});
    } catch (error) {
        await page.screenshot({path: resolve(shotsDir, 'sim-lab-pen-failure.png'), fullPage: true}).catch(() => {});
        throw error;
    }
};

const checks = async (page, {shotsDir}) => {
    // 1. The castor ball becomes a pen.
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView,
        null, {timeout: 60000});
    await lab(page, () => window.__bwSimLab.editView.select(['ball']));
    const panel = page.getByTestId('bw-sim-lab-properties-panel');
    if (!(await panel.isVisible())) {
        const button = page.getByTestId('bw-sim-lab-properties');
        if (!(await button.isVisible())) await page.getByTestId('bw-sim-lab-more').click();
        await button.click();
    }
    await page.getByTestId('bw-sim-lab-prop-pen').check();
    await page.waitForFunction(() => window.__bwSimLab.editor.model.parts.find(p => p.id === 'ball').pen === true);

    // 2. Drive: the ball draws.
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session,
        null, {timeout: 60000});
    assert.deepEqual(await lab(page, () => window.__bwSimLab.api.drawing()), [], 'nothing drawn before it moves');
    const start = await lab(page, () => [window.__bwSimLab.api.partPosition('ball', 'x'), window.__bwSimLab.api.partPosition('ball', 'z')]);
    await lab(page, () => Promise.all(['A', 'B'].map(p => window.__bwSimLab.api.setMotorSpeed(p, p === 'A' ? -360 : 360))));
    await page.waitForFunction(() => window.__bwSimLab._pane.session.time > 1500, null, {timeout: 60000});
    await page.waitForFunction(() => window.__bwSimLab.api.drawing().some(s => s.length > 5), null, {timeout: 30000}).catch(async e => {
        const h = await lab(page, () => window.__bwSimLab._pane.view.penHeights?.());
        const now = await lab(page, () => ({at: [window.__bwSimLab.api.partPosition('ball', 'x'), window.__bwSimLab.api.partPosition('ball', 'z')],
            strokes: window.__bwSimLab.api.drawing().map(st => st.length), status: window.__bwSimLab.status, t: window.__bwSimLab._pane.session.time}));
        throw new Error(`no drawing: the pen tips are ${JSON.stringify(h)} m above the floor; the ball went from ${start} to ${JSON.stringify(now)} (${e.message})`);
    });
    const strokes = await lab(page, () => window.__bwSimLab.api.drawing());
    const longest = Math.max(...strokes.map(strokeLength));
    const end = await lab(page, () => [window.__bwSimLab.api.partPosition('ball', 'x'), window.__bwSimLab.api.partPosition('ball', 'z')]);
    const travelled = Math.hypot(end[0] - start[0], end[1] - start[1]);
    assert.ok(longest > 3 && longest > travelled * 0.5, `a stroke ${longest.toFixed(1)} cm long, the ball went ${travelled.toFixed(1)} cm`);
    // The stroke ends near where the ball is now.
    const last = strokes.flat().at(-1);
    assert.ok(Math.hypot(last[0] - end[0], last[1] - end[1]) < 2, `the line ends at the ball: ${last} vs ${end}`);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-pen.png')});

    // 3. Reset: a clean floor.
    await lab(page, () => window.__bwSimLab.api.reset());
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab.api.drawing().length === 0, null, {timeout: 60000});
    return {cm: Math.round(longest * 10) / 10};
};
