// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// "Seeing the model" in the Robot Lab, for scripts/verify-sim-lab-browser.mjs:
// port badges, the issues list and "Show how it moves", with real clicks only.
// Internal APIs are used to READ results (the selection, the model's ports,
// what the overlay draws), never to perform the interaction.
//
//   1. Simulate: the driving base's two motors carry badges "A" and "B"; ticking
//      "Show how it moves" draws two red motor axes, the castor's ball joint and
//      the body tints, and red axis pixels appear in the 3D view;
//   2. Build: the same overlay over the editor (count and pixels); a click on
//      motorL's badge opens the port picker, "none" unplugs it: the badge shows
//      "?" and the issue "…is not plugged into the hub yet" appears; clicking the
//      issue selects the motor; clicking the "?" badge and then "A" plugs it back
//      and the issue goes;
//   3. Build → Simulate with both motors unplugged: "Before you press Run" says
//      no motor is plugged in, the badges show "?", and clicking the issue makes
//      the two motors pulse in the 3D view.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const overlay = (page, which) => page.evaluate(w => {
    const pane = window.__bwSimLab._pane;
    const view = w === 'build' ? pane.editView : pane.view;
    return view ? view.overlayStats() : null;
}, which);

/** Pixels of the motor-axis red (#dc2626) in a screenshot of the 3D view, decoded by the page. */
const redPixels = async (page, locator) => {
    // The Build view keeps one frame in flight (editor-view3d.js render): wait until it has drawn.
    await page.waitForFunction(() => !window.__bwSimLab.editView || !window.__bwSimLab.editView.drawing, null, {timeout: 30000, polling: 50});
    const png = await locator.screenshot();
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
        for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) n++;
        return n;
    }, png.toString('base64'));
};

const badge = (page, id) => page.getByTestId(`bw-sim-lab-port-label-${id}`);
const portOf = (page, id) => page.evaluate(i => window.__bwSimLab.editor.model.parts.find(p => p.id === i).port || null, id);

/** Waits until the pane's overlay toggle and the view agree that the overlay is on/off. */
const setMotion = async (page, which, on) => {
    const box = page.getByTestId('bw-sim-lab-show-motion');
    if ((await box.isChecked()) !== on) await box.click();
    await page.waitForFunction(([w, want]) => {
        const pane = window.__bwSimLab._pane;
        const view = w === 'build' ? pane.editView : pane.view;
        const s = view && view.overlayStats();
        return s && (want ? s.axes > 0 && s.tinted > 0 : s.axes === 0 && s.tinted === 0);
    }, [which, on], {timeout: 15000});
};

export const insightInteractions = async (page, {shotsDir}) => {
    // ---- 1. Simulate -------------------------------------------------------------------
    const canvas = page.getByTestId('bw-sim-lab-3d-canvas');
    await canvas.waitFor({timeout: 30000});
    await page.waitForFunction(() => window.__bwSimLab._pane.view?.overlayStats().ports === 2, null, {timeout: 15000});
    assert.equal(await badge(page, 'motorL').textContent(), 'A');
    assert.equal(await badge(page, 'motorR').textContent(), 'B');
    assert.ok(await page.getByTestId('bw-sim-lab-show-ports').isChecked(), '"Show ports" is on in Simulate');
    // A cable from each plugged-in motor to the hub.
    await page.waitForFunction(() => window.__bwSimLab._pane.view.overlayStats().cables.length === 2, null, {timeout: 5000});
    assert.deepEqual((await overlay(page, 'simulate')).cables.slice().sort(), ['motorL', 'motorR'], 'a cable from each motor to the hub');
    assert.equal(await page.getByTestId('bw-sim-lab-show-motion').isChecked(), false, '"Show how it moves" starts off');
    // "Show ports" off hides the badges, on brings them back.
    await page.getByTestId('bw-sim-lab-show-ports').click();
    await page.waitForFunction(() => window.__bwSimLab._pane.view.overlayStats().ports === 0, null, {timeout: 5000});
    assert.equal(await badge(page, 'motorL').isVisible(), false, 'no badge while "Show ports" is off');
    assert.deepEqual((await overlay(page, 'simulate')).cables, [], 'and no cable');
    await page.getByTestId('bw-sim-lab-show-ports').click();
    await page.waitForFunction(() => window.__bwSimLab._pane.view.overlayStats().ports === 2, null, {timeout: 5000});
    const simBefore = await redPixels(page, canvas);
    await setMotion(page, 'simulate', true);
    const sim = await overlay(page, 'simulate');
    assert.equal(sim.motorAxes, 2, `two motor axes: ${JSON.stringify(sim)}`);
    assert.equal(sim.axes, 2, 'the driving base has no other hinge');
    assert.equal(sim.balls, 1, 'the castor ball joint');
    assert.ok(sim.tinted >= 4, `parts tinted by body: ${JSON.stringify(sim)}`);
    const simAfter = await redPixels(page, canvas);
    assert.ok(simAfter > simBefore + 30, `the motor axes are drawn (red pixels ${simBefore} → ${simAfter})`);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-insight-simulate.png'), fullPage: true});
    // Off again: the overlay and the tints go away.
    await setMotion(page, 'simulate', false);
    console.log(`PASS Simulate: port badges A/B; "Show how it moves" draws ${sim.motorAxes} motor axes, 1 ball joint, ` +
        `${sim.tinted} tinted meshes (${simAfter - simBefore} red axis pixels)`);

    // ---- 2. Build --------------------------------------------------------------------
    await page.getByTestId('bw-sim-lab-mode-build').click();
    const editor = page.getByTestId('bw-sim-lab-editor-canvas');
    await editor.waitFor({timeout: 60000});
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView?.overlayStats().ports === 2 &&
        window.__bwSimLab.editView.overlayStats().cables.length === 2,
        null, {timeout: 60000});
    assert.equal(await badge(page, 'motorL').textContent(), 'A');
    const buildBefore = await redPixels(page, editor);
    await setMotion(page, 'build', true);
    const built = await overlay(page, 'build');
    assert.equal(built.motorAxes, 2, `Build: two motor axes: ${JSON.stringify(built)}`);
    assert.equal(built.balls, 1);
    assert.ok(built.tinted >= 10, `Build: every part tinted by its body: ${JSON.stringify(built)}`);
    const buildAfter = await redPixels(page, editor);
    assert.ok(buildAfter > buildBefore + 30, `Build: the motor axes are drawn (red pixels ${buildBefore} → ${buildAfter})`);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-insight-build.png'), fullPage: true});
    console.log(`PASS Build: "Show how it moves" draws ${built.motorAxes} motor axes over the editor, ${built.tinted} parts tinted ` +
        `(${buildAfter - buildBefore} red axis pixels)`);

    // Unplug motorL through its badge: the picker opens next to it, "none" takes the port away.
    await badge(page, 'motorL').click();
    const picker = page.getByTestId('bw-sim-lab-port-picker');
    await picker.waitFor({timeout: 5000});
    assert.deepEqual(await page.evaluate(() => window.__bwSimLab.editView.selection), ['motorL'], 'the badge selects its motor');
    await page.getByTestId('bw-sim-lab-port-pick-none').click();
    await page.waitForFunction(() => !window.__bwSimLab.editor.model.parts.find(p => p.id === 'motorL').port, null, {timeout: 5000});
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-sim-lab-port-label-motorL"]')?.textContent === '?',
        null, {timeout: 5000});
    const issue = page.getByTestId('bw-sim-lab-issue-motor-without-port');
    await issue.waitFor({timeout: 5000});
    assert.match(await issue.textContent(), /is not plugged into the hub yet/);
    assert.equal(await issue.getAttribute('data-parts'), 'motorL');
    // Clear the selection (Esc on the canvas), then the issue selects the motor again.
    await editor.click({position: {x: 5, y: 5}});
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__bwSimLab.editView.selection.length === 0, null, {timeout: 5000});
    await issue.click();
    await page.waitForFunction(() => window.__bwSimLab.editView.selection.join() === 'motorL', null, {timeout: 5000});
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-insight-issue.png'), fullPage: true});
    console.log('PASS Build: unplugging motorL from its badge shows "?" and the issue; clicking the issue selects the motor');

    // The "?" badge opens the picker; "A" plugs it back in and the issue goes.
    await badge(page, 'motorL').click();
    await picker.waitFor({timeout: 5000});
    await page.getByTestId('bw-sim-lab-port-pick-A').click();
    assert.equal(await portOf(page, 'motorL'), 'A');
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-sim-lab-port-label-motorL"]')?.textContent === 'A',
        null, {timeout: 5000});
    await issue.waitFor({state: 'detached', timeout: 5000});
    assert.equal(await picker.count(), 0, 'the picker closes once a port is chosen');
    console.log('PASS Build: the "?" badge opens the port picker, choosing A plugs the motor in and clears the issue');

    // ---- 3. Both motors unplugged, then Simulate: warned before Run, the issue pulses them.
    for (const id of ['motorL', 'motorR']) {
        await badge(page, id).click();
        await picker.waitFor({timeout: 5000});
        await page.getByTestId('bw-sim-lab-port-pick-none').click();
        await page.waitForFunction(i => !window.__bwSimLab.editor.model.parts.find(p => p.id === i).port, id, {timeout: 5000});
    }
    const blockers = page.getByTestId('bw-sim-lab-blockers');
    await blockers.waitFor({timeout: 5000});
    assert.match(await blockers.textContent(), /Before you press Run:.*No motor is plugged into the hub/);
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' &&
        window.__bwSimLab._pane.view?.overlayStats().ports === 2, null, {timeout: 60000});
    await blockers.waitFor({timeout: 5000});
    assert.match(await blockers.textContent(), /No motor is plugged into the hub/);
    assert.equal(await badge(page, 'motorL').textContent(), '?');
    assert.equal(await badge(page, 'motorR').textContent(), '?');
    const noMotor = blockers.getByTestId('bw-sim-lab-issue-no-motor');
    assert.equal(await noMotor.getAttribute('data-parts'), 'motorL motorR');
    await noMotor.click();
    // Both motors pulse: each one's housing and its turning drive hub.
    await page.waitForFunction(() => window.__bwSimLab._pane.view.overlayStats().pulsing === 4, null, {timeout: 5000});
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-insight-blockers.png'), fullPage: true});
    // The pulse ends by itself.
    await page.waitForFunction(() => window.__bwSimLab._pane.view.overlayStats().pulsing === 0, null, {timeout: 10000});
    console.log('PASS Simulate: with no motor plugged in, "Before you press Run" says so; clicking it pulses both motors');
};
