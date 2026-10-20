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
import {tool} from './sim-lab-toolbar-gate.mjs';

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
    return out;
};
