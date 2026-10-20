// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {judgeMechanicsRun} from './sim-lab-mechanics-judge.mjs';

export const mechanicsInteractions = async (page, {openSimLab, shotsDir, timeout}) => {
    mkdirSync(shotsDir, {recursive: true});
    await openSimLab(page, {program: null});
    const results = {};
    for (const id of ['crank-rocker', 'parallel-lift', 'screw-crane', 'pivot-rover']) {
        await page.getByTestId('bw-sim-lab-examples').click();
        const gallery = page.getByTestId('bw-sim-examples');
        await gallery.getByRole('searchbox').fill(id);
        assert.equal(await gallery.getByTestId('bw-sim-example-card').count(), 1);
        await gallery.getByRole('button', {name: /^Open model \+ program:/}).click();
        await gallery.waitFor({state: 'hidden'});
        await page.waitForFunction(file => window.__bwSimLab.status === 'ready' &&
            window.__bwSimLab._pane.state.modelFile === file && window.__bwSimLab._pane.session?.worker,
        `${id}.ldr`, {timeout: 60000});
        await page.getByTestId('bw-sim-lab-3d-canvas').waitFor();
        await page.screenshot({path: resolve(shotsDir, `${id}.png`)});
        await page.evaluate(() => {
            const pane = window.__bwSimLab._pane;
            const s = pane.session;
            const m = s.mechanism;
            const record = window.__bwMechanics = {start: s.time, mechanism: m, hubId: s.bridge.hubBody,
                issues: pane.state.issues, unsupported: [], track: []};
            s.onAdvance(() => {
                const bodies = {};
                for (const b of m.bodies.filter(b => b.motion === 'dynamic')) bodies[b.id] = s.core.bodyPose(b.id);
                const joints = {};
                for (const j of m.joints.filter(j => j.type === 'hinge' || j.type === 'slider')) joints[j.id] = s.core.jointState(j.id);
                const busy = {};
                for (const a of m.actuators) busy[a.port] = pane.hub.motors.busy(a.port);
                record.track.push({t: s.time, bodies, joints, busy});
            });
        });
        await page.getByTestId('bw-sim-lab-run').click();
        await page.waitForFunction(() => window.__bwSimLab._pane.session.time - window.__bwMechanics.start >= 18000,
            null, {timeout});
        const r = await page.evaluate(() => window.__bwMechanics);
        results[id] = judgeMechanicsRun(id, r);
        const mixer = page.getByTestId('bw-sim-lab-mixer-toggle');
        if (await mixer.getAttribute('aria-expanded') !== 'true') await mixer.click();
        assert.deepEqual(await page.getByTestId('bw-sim-lab-mixer-slider').evaluateAll(es => es.map(e => e.dataset.port).sort()),
            r.mechanism.actuators.map(a => a.port).sort());
        for (const slider of await page.getByTestId('bw-sim-lab-mixer-slider').all()) assert.ok(await slider.isEnabled());
        await page.screenshot({path: resolve(shotsDir, `${id}-finished.png`)});
        await mixer.click();
        console.log(`PASS motorised mechanics ${id}: ${JSON.stringify(results[id])}`);
    }
    writeFileSync(resolve(shotsDir, 'measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
    return results;
};
