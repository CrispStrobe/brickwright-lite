// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Simulate's speed, Readings, sensor rays and replay, for scripts/verify-sim-lab-browser.mjs
// (--part=ui), on the Wall stopper (two drive motors and a distance sensor). The controls
// are used through clicks; the API only drives the motors (no hub program is loaded) and
// the internals are only read.
//
//   1. Speed ½×: simulated time runs at about half the rate of 1× on the same machine, and back at 1×;
//   2. Readings lists motors A and B and the distance sensor; their values change as the
//      robot drives, and each row draws its line;
//   3. Show sensor rays draws the distance sensor's ray, ending as far away as it measures;
//   4. paused after a drive, the replay slider goes back: the view shows an earlier pose
//      and says how far back; Run goes on from now and the slider leaves.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readFile, stat, writeFile} from 'node:fs/promises';
import {tool} from './sim-lab-toolbar-gate.mjs';
import {measurementPlotInteractions} from './sim-lab-measurement-plots-gate.mjs';

const lab = (page, fn, arg) => page.evaluate(fn, arg);
const simTime = page => lab(page, () => window.__bwSimLab._pane.session.time);
const wait = ms => new Promise(r => setTimeout(r, ms));

export const simulateUxInteractions = async (page, {shotsDir}) => {
    try {
        return await checks(page, {shotsDir});
    } catch (error) {
        await page.screenshot({path: resolve(shotsDir, 'sim-lab-simulate-ux-failure.png'), fullPage: true}).catch(() => {});
        throw error;
    }
};

const checks = async (page, {shotsDir}) => {
    const out = {};
    await page.waitForFunction(() => window.__bwSimLab && window.__bwSimLab.api && window.__bwSimLab.status === 'ready', null, {timeout: 60000});
    const loaded = await lab(page, () => window.__bwSimLab.api.loadModel('wall-stopper'));
    assert.ok(loaded.ok !== false, `load: ${JSON.stringify(loaded)}`);
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session, null, {timeout: 60000});
    const drive = speed => lab(page, s => Promise.all(['A', 'B'].map(p => window.__bwSimLab.api.setMotorSpeed(p, p === 'A' ? -s : s))), speed);

    // 1. Speed ½×: measured against 1× on the same machine (a busy runner may not reach real time at 1×).
    const rateFor = async ms => {
        const s0 = await simTime(page);
        const w0 = Date.now();
        await wait(ms);
        return ((await simTime(page)) - s0) / (Date.now() - w0);
    };
    await tool(page, 'run');
    await page.waitForFunction(() => window.__bwSimLab.status === 'running');
    await wait(500);
    const full = await rateFor(2500);
    await page.getByTestId('bw-sim-lab-speed').selectOption('0.5');
    assert.equal(await lab(page, () => window.__bwSimLab._pane.timeScale), 0.5);
    await wait(300);
    const half = await rateFor(2500);
    assert.ok(half / full > 0.35 && half / full < 0.65, `½× ran at ${half.toFixed(2)}, 1× at ${full.toFixed(2)} of wall time`);
    out.halfRate = half / full;
    await page.getByTestId('bw-sim-lab-speed').selectOption('1');
    assert.equal(await lab(page, () => window.__bwSimLab._pane.timeScale), 1);

    // 2. Readings.
    await tool(page, 'readings');
    const panel = page.getByTestId('bw-sim-lab-readings-panel');
    await panel.waitFor();
    const before = await lab(page, () => window.__bwSimLab.api.motorAngle('A'));
    await drive(360);
    await wait(1500);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="bw-sim-lab-readings-panel"] path').length >= 2, null, {timeout: 10000});
    const keys = await panel.locator('li').evaluateAll(lis => lis.map(li => li.dataset.testid));
    assert.ok(keys.includes('bw-sim-lab-reading-motor-A') && keys.includes('bw-sim-lab-reading-motor-B'), `motor rows: ${keys}`);
    assert.ok(keys.some(k => /reading-sensor-/.test(k)), `a sensor row: ${keys}`);
    const nowA = await page.getByTestId('bw-sim-lab-reading-motor-A-now').textContent();
    assert.match(nowA, /°/);
    const after = await lab(page, () => window.__bwSimLab.api.motorAngle('A'));
    assert.ok(Math.abs(after - before) > 30, `motor A turned (${before} → ${after})`);
    out.readings = keys.length;

    // 3. Sensor rays: the distance sensor's ray is as long as it measures (nothing seen: its 2 m range).
    await tool(page, 'show-sensors');
    await page.waitForFunction(() => window.__bwSimLab._pane.view.sensorRays().length > 0, null, {timeout: 5000});
    const ray = await lab(page, () => {
        const pn = window.__bwSimLab._pane;
        const sensor = pn.api.sensors().find(x => x.kind === 'distance');
        const all = pn.view.sensorRays();
        return {all, cm: pn.api.sensorValue(sensor.port ?? sensor.id)};
    });
    const lengths = ray.all.map(r => Math.hypot(...r.to.map((v, i) => v - r.from[i])));
    const want = (ray.cm > 0 ? ray.cm : 200) / 100;
    assert.ok(lengths.some(l => Math.abs(l - want) < 0.03 * want + 0.005), `a ray ${want} m long (the distance sensor's): ${lengths.map(l => l.toFixed(3))}`);
    // and it starts at the sensor (its part's origin, the API's partPosition in cm), not elsewhere in the room
    const at = await lab(page, () => {
        const pn = window.__bwSimLab._pane;
        const sensor = pn.api.sensors().find(x => x.kind === 'distance');
        return ['x', 'y', 'z'].map(a => pn.api.partPosition(sensor.part, a) / 100);
    });
    assert.ok(ray.all.some(r => Math.hypot(...r.from.map((v, i) => v - at[i])) < 0.05),
        `the distance ray starts at its sensor: ${JSON.stringify(ray.all.map(r => r.from))} vs ${at}`);
    out.rayCm = ray.cm;
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-simulate-ux.png')});

    // 4. Replay.
    await drive(0);
    await tool(page, 'pause');
    await page.waitForFunction(() => window.__bwSimLab.status === 'paused', null, {timeout: 10000});
    const slider = page.getByTestId('bw-sim-lab-replay-slider');
    await slider.waitFor();
    await slider.fill('0');
    await page.waitForFunction(() => window.__bwSimLab._pane.state.replayAt === 0);
    // the body that moved most between the replayed frame and now (the ground does not move)
    const moved = await lab(page, () => {
        const pn = window.__bwSimLab._pane;
        const now = pn.session.snapshot().bodies;
        const then = pn.replay.frames[0].snapshot.bodies;
        let most = 0;
        for (let o = 0; o + 2 < Math.min(now.length, then.length); o += 7) most = Math.max(most, Math.hypot(now[o] - then[o], now[o + 1] - then[o + 1], now[o + 2] - then[o + 2]));
        return most;
    });
    assert.ok(moved > 0.01, `the replayed pose is an earlier one (${moved.toFixed(3)} m from now)`);
    assert.match(await page.getByTestId('bw-sim-lab-replay-time').textContent(), /^−\d+\.\d s$/);
    out.replayBackM = moved;
    await tool(page, 'run');
    await page.waitForFunction(() => window.__bwSimLab.status === 'running' && window.__bwSimLab._pane.state.replayAt === null, null, {timeout: 10000});
    assert.equal(await page.getByTestId('bw-sim-lab-replay').count(), 0, 'the slider leaves while running');
    await tool(page, 'pause');
    await measurementInteractions(page, {shotsDir});
    return out;
};


/** Custom measurements use real controls; the simulation is only observed or driven through its public API. */
export const measurementInteractions = async (page, {shotsDir}) => {
    const originalModel = await page.getByTestId('bw-sim-lab-model').inputValue();
    const editedEvidence = {version: 1, originalModel};
    await tool(page, 'measurements');
    const panel = page.getByTestId('bw-sim-lab-measurements-panel');
    await panel.waitFor();
    const totalMass = panel.getByTestId('bw-sim-lab-measurement-preset-0');
    assert.match(await totalMass.textContent(), /Model mass/);
    const catalogueMass = await lab(page, () => {
        const pane = window.__bwSimLab._pane;
        return pane.session.model.parts.reduce((sum, part) => sum + pane.lib.CATALOG.get(part.part).massGrams, 0);
    });
    assert.ok(Math.abs(parseFloat(await totalMass.locator('output').textContent()) - catalogueMass) < 0.1,
        'model mass matches the catalogue total without world/scenery mass');
    await panel.getByTestId('bw-sim-lab-measurements-shown').check();
    await panel.getByTestId('bw-sim-lab-measurement-kind').selectOption('distance');
    await panel.getByTestId('bw-sim-lab-measurement-target-0').selectOption('hub');
    await panel.getByTestId('bw-sim-lab-measurement-target-1').selectOption('motorL');
    await panel.getByRole('textbox', {name: 'Name', exact: true}).fill('Axle span');
    await panel.getByTestId('bw-sim-lab-measurement-add').click();
    const span = panel.getByTestId('bw-sim-lab-measurement-custom-1');
    await span.waitFor();
    assert.match(await span.textContent(), /mm/);
    // Independent geometry through the existing public API, in centimetres -> millimetres.
    const expected = await lab(page, () => {
        const api = window.__bwSimLab.api;
        return Math.hypot(...['x','y','z'].map(a => api.partPosition('hub', a) - api.partPosition('motorL', a))) * 10;
    });
    assert.ok(Math.abs(parseFloat(await span.locator('output').textContent()) - expected) < 0.1, 'distance matches the independently observed live part origins');
    const beforeEdit = await lab(page, () => ({count: window.__bwSimLab._pane.measurements.length,
        definition: window.__bwSimLab._pane.measurements.find(d => d.id === 'custom-1')}));
    await span.getByTestId('bw-sim-measurement-plot-toggle-custom-1').check();
    await span.getByTestId('bw-sim-lab-measurement-edit-custom-1').click();
    const nameInput = panel.getByRole('textbox', {name: 'Name', exact: true});
    assert.equal(await nameInput.evaluate(el => el === el.ownerDocument.activeElement), true, 'Edit focuses the existing name control');
    const targetOptions = await panel.getByTestId('bw-sim-lab-measurement-target-1').locator('option').evaluateAll(options => options.map(option => option.value));
    const retarget = await lab(page, ids => {
        const pane = window.__bwSimLab._pane;
        const physical = new Set(pane.session.mechanism.bodies.flatMap(body => body.parts || []));
        return ids.find(id => id !== 'hub' && id !== 'motorL' && physical.has(id));
    }, targetOptions);
    assert.ok(retarget, 'the shipped robot offers another authored part');
    await nameInput.fill('Edited axle span');
    await panel.getByTestId('bw-sim-lab-measurement-target-1').selectOption(retarget);
    await panel.getByTestId('bw-sim-lab-measurement-save').click();
    const afterEdit = await lab(page, () => ({count: window.__bwSimLab._pane.measurements.length,
        definition: window.__bwSimLab._pane.measurements.find(d => d.id === 'custom-1')}));
    assert.equal(afterEdit.count, beforeEdit.count); assert.equal(afterEdit.definition.id, beforeEdit.definition.id);
    assert.equal(afterEdit.definition.label, 'Edited axle span'); assert.deepEqual(afterEdit.definition.targets, ['hub', retarget]);
    assert.equal(await span.getByTestId('bw-sim-measurement-plot-toggle-custom-1').isChecked(), true, 'editing retains the selected plot');
    assert.equal(await span.getByTestId('bw-sim-lab-measurement-edit-custom-1').evaluate(el => el === el.ownerDocument.activeElement), true,
        'Save returns focus to the stable row');
    const editedDistance = await lab(page, target => {
        const api = window.__bwSimLab.api;
        return Math.hypot(...['x', 'y', 'z'].map(axis => api.partPosition('hub', axis) - api.partPosition(target, axis))) * 10;
    }, retarget);
    assert.ok(Math.abs(parseFloat(await span.locator('output').textContent()) - editedDistance) < 0.1, 'the edited target has a fresh live reading');
    await span.getByTestId('bw-sim-lab-measurement-edit-custom-1').click();
    await nameInput.fill('Do not save');
    await panel.getByTestId('bw-sim-lab-measurement-target-1').selectOption('motorL');
    await panel.getByTestId('bw-sim-lab-measurement-cancel').click();
    const afterCancel = await lab(page, () => window.__bwSimLab._pane.measurements.find(d => d.id === 'custom-1'));
    assert.deepEqual(afterCancel, afterEdit.definition, 'Cancel leaves the saved definition unchanged');
    // Restore the original name so every existing visibility/Reset assertion below remains intact.
    await span.getByTestId('bw-sim-lab-measurement-edit-custom-1').click();
    await nameInput.fill('Axle span');
    await panel.getByTestId('bw-sim-lab-measurement-save').click();
    const jointBefore = await lab(page, () => {
        const pane = window.__bwSimLab._pane;
        return pane.measurements.find(d => d.kind === 'jointAngle' && pane.session.mechanism.joints.some(j => j.id === d.joint));
    });
    assert.ok(jointBefore, 'the shipped robot has a joint measurement to edit');
    const jointRow = panel.getByTestId(`bw-sim-lab-measurement-${jointBefore.id}`);
    await jointRow.getByTestId(`bw-sim-lab-measurement-edit-${jointBefore.id}`).click();
    const otherJoint = await panel.getByTestId('bw-sim-lab-measurement-joint').locator('option').evaluateAll((options, old) =>
        options.map(option => option.value).find(id => id && id !== old), jointBefore.joint);
    assert.ok(otherJoint, 'the shipped robot offers a second hinge');
    await panel.getByTestId('bw-sim-lab-measurement-joint').selectOption(otherJoint);
    await nameInput.fill('Edited hinge');
    await panel.getByTestId('bw-sim-lab-measurement-save').click();
    const jointAfter = await lab(page, id => {
        const pane = window.__bwSimLab._pane, mechanism = pane.session.mechanism;
        const definition = pane.measurements.find(d => d.id === id), joint = mechanism.joints.find(j => j.id === definition.joint);
        return {definition, identity: [joint.type, ...[joint.body1, joint.body2].map(body =>
            mechanism.bodies.find(b => b.id === body)?.parts?.slice().sort() || [body])]};
    }, jointBefore.id);
    assert.equal(jointAfter.definition.id, jointBefore.id); assert.equal(jointAfter.definition.joint, otherJoint);
    assert.equal(jointAfter.definition.binding, `sha256:${createHash('sha256').update(JSON.stringify(jointAfter.identity)).digest('hex')}`,
        'the actual selected hinge has an independently computed fresh member binding');
    editedEvidence.edit = {before: beforeEdit, after: afterEdit, afterCancel, expectedDistanceMm: editedDistance,
        observedDistanceMm: parseFloat(await span.locator('output').textContent()), jointBefore, jointAfter};
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-sim-lab-measurement-overlay"] [data-measurement-id="custom-1"] text')?.textContent.includes('mm'));
    await tool(page, 'show-ports');
    assert.ok(await page.locator('[data-testid="bw-sim-lab-measurement-overlay"] [data-measurement-id="custom-1"]').count(), 'measurements remain independent of cables/component labels');
    await tool(page, 'show-ports');
    await panel.getByTestId('bw-sim-lab-measurement-kind').selectOption('speed');
    await panel.getByTestId('bw-sim-lab-measurement-target-0').selectOption('hub');
    await panel.getByRole('textbox', {name: 'Name', exact: true}).fill('Chassis speed');
    await panel.getByTestId('bw-sim-lab-measurement-add').click();
    const speed = panel.getByTestId('bw-sim-lab-measurement-custom-2');
    await tool(page, 'run');
    await lab(page, () => Promise.all(['A','B'].map(p => window.__bwSimLab.api.setMotorSpeed(p, p === 'A' ? 180 : -180))));
    await page.waitForFunction(() => parseFloat(document.querySelector('[data-testid="bw-sim-lab-measurement-custom-2"] output')?.textContent) > 0.01 && window.__bwSimLab._pane.state.replayFrames >= 2, null, {timeout: 10000});
    const boxes = await page.locator('[data-testid="bw-sim-lab-measurement-overlay"] text').evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect(); return {x: r.x, y: r.y, right: r.right, bottom: r.bottom};
    }));
    for (let i = 0; i < boxes.length; i++) for (const b of boxes.slice(i + 1)) {
        const a = boxes[i];
        assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, 'live measurement labels remain legible without overlap');
    }
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-live-measurements.png')});
    await tool(page, 'pause');
    await page.waitForFunction(() => {
        const pane = window.__bwSimLab._pane;
        return pane.state.status === 'paused' && pane.measurementSampleTime === pane.session.time;
    });
    await page.getByTestId('bw-sim-lab-replay-slider').fill('0');
    await page.waitForFunction(() => window.__bwSimLab._pane.state.replayAt === 0 && document.querySelectorAll('[data-testid="bw-sim-lab-measurement-overlay"] g').length === 0);
    assert.match(await panel.textContent(), /hidden during pose replay/);
    assert.equal(await speed.locator('output').textContent(), '—');
    await tool(page, 'reset');
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready');
    assert.match(await span.locator('output').textContent(), /mm/);
    await speed.getByRole('button', {name: 'Remove: Chassis speed', exact: true}).click();
    assert.equal(await speed.count(), 0);
    await panel.getByRole('checkbox', {name: 'Show in model: Axle span', exact: true}).uncheck();
    await page.waitForFunction(() => !document.querySelector('[data-testid="bw-sim-lab-measurement-overlay"] [data-measurement-id="custom-1"]'));
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab._pane.state.mode === 'build' && window.__bwSimLab.status === 'ready');
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab._pane.state.mode === 'simulate' && window.__bwSimLab.status === 'ready');
    assert.match(await span.locator('output').textContent(), /mm/, 'custom definitions survive Build/Simulate');
    assert.equal(await panel.getByRole('checkbox', {name: 'Show in model: Axle span', exact: true}).isChecked(), false);
    // A different example has its own definitions; returning restores this model's custom choice.
    await page.getByTestId('bw-sim-lab-model').selectOption('forklift.ldr');
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.shipped === 'forklift.ldr');
    assert.equal(await span.count(), 0, 'custom readings do not leak into another model');
    await page.getByTestId('bw-sim-lab-model').selectOption(originalModel);
    await page.waitForFunction(key => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.shipped === key, originalModel);
    assert.match(await span.locator('output').textContent(), /mm/, 'returning to the model restores its custom reading');
    assert.equal(await panel.getByRole('checkbox', {name: 'Show in model: Axle span', exact: true}).isChecked(), false);
    const afterModelReturn = await lab(page, () => window.__bwSimLab._pane.measurements.find(d => d.id === 'custom-1'));
    assert.deepEqual(afterModelReturn.targets, ['hub', retarget]);
    editedEvidence.afterModelReturn = afterModelReturn;
    await panel.getByRole('button', {name: 'Close', exact: true}).click();
    await measurementPlotInteractions(page, {shotsDir});
    // Save/reopen through the existing real project controls, after the old plot journey finishes.
    const beforeProject = await lab(page, () => window.__bwSimLab.projectRecord);
    assert.ok(beforeProject?.measurements?.some(d => d.id === 'custom-1'));
    await page.getByText('File', {exact: true}).first().click();
    const download = page.waitForEvent('download', {timeout: 30000});
    await page.getByText('Save to your computer', {exact: true}).click();
    const savedPath = resolve(shotsDir, 'sim-lab-measurement-edit.sb3');
    await (await download).saveAs(savedPath);
    const savedInfo = await stat(savedPath);
    assert.ok(savedInfo.size > 0 && savedInfo.size <= 8 * 1024 * 1024, 'bounded generated project fixture');
    const savedBytes = await readFile(savedPath);
    const oldSession = await page.evaluateHandle(() => window.__bwSimLab._pane.session);
    try {
        await page.getByText('File', {exact: true}).first().click();
        await page.getByText('Load from your computer', {exact: true}).click();
        await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(savedPath);
        await page.waitForFunction(previous => window.__bwSimLab?.status === 'ready' &&
            window.__bwSimLab._pane.session && window.__bwSimLab._pane.session !== previous, oldSession, {timeout: 90000});
    } finally { await oldSession.dispose(); }
    const afterProject = await lab(page, () => window.__bwSimLab.projectRecord);
    assert.deepEqual(afterProject, beforeProject, 'the actual project save/open preserves the edited model and every definition');
    assert.deepEqual(afterProject.measurements.find(d => d.id === 'custom-1'), afterModelReturn);
    const digest = text => createHash('sha256').update(text).digest('hex');
    editedEvidence.project = {before: beforeProject.measurements, after: afterProject.measurements,
        modelBeforeSha256: digest(beforeProject.ldraw), modelAfterSha256: digest(afterProject.ldraw),
        sb3: {file: 'sim-lab-measurement-edit.sb3', bytes: savedBytes.length, sha256: digest(savedBytes)}};
    const report = JSON.stringify(editedEvidence, null, 2) + '\n';
    assert.ok(Buffer.byteLength(report) <= 65536, 'bounded edit observation report');
    await writeFile(resolve(shotsDir, 'sim-lab-measurement-edit.json'), report, {flag: 'wx'});
    console.log('PASS saved measurements: real Edit/Save/Cancel, stable IDs and plots, fresh target bindings and project reopen');
};
