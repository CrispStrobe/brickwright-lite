import {openManualControls} from './sim-lab-manual-controls.mjs';
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The motor mixer (components/tw-pseudocode/sim-lab-motor-mixer.jsx), for scripts/verify-sim-lab-browser.mjs
// `--part=ui`, with real clicks and keys only (internal APIs only READ):
//   1. the Forklift: "Motors ▸" unfolds one row per motor (its lift, C: no drive pad reaches it), a slider and a stop;
//   2. motor C's slider to 60 % lifts the forks (the hinge turns), its ■ stops it (the hinge holds still);
//   3. "Stop all" stops every motor; folding the mixer away is remembered after a reload.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const angleOf = (page, port) => page.evaluate(p => {
    const s = window.__bwSimLab._pane.session;
    const j = s.mechanism.joints.find(x => x.motor && x.motor.port === p);
    return s.core.jointState(j.id).angle * 180 / Math.PI;
}, port);
const advance = (page, ms) => page.evaluate(want => new Promise(done => {
    const s = window.__bwSimLab._pane.session;
    const t0 = s.time;
    const off = s.onAdvance(() => { if (s.time - t0 >= want) { off(); done(); } });
}), ms);

export const mixerInteractions = async (page, {shotsDir}) => {
    await page.getByTestId('bw-sim-lab-model').selectOption('forklift.ldr');
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.modelFile === 'forklift.ldr' &&
        window.__bwSimLab._pane.session, null, {timeout: 60000});
    // From the start pose: an earlier section may have left the Forklift loaded with its lift run up (the select
    // does not reload a model already chosen), and a pinion stalled at the top only slips on.
    const previous = await page.evaluateHandle(() => window.__bwSimLab._pane.session);
    await page.getByTestId('bw-sim-lab-reset').click();
    await page.waitForFunction(previous => window.__bwSimLab.status === 'ready' &&
        window.__bwSimLab._pane.session && window.__bwSimLab._pane.session !== previous,
    previous, {timeout: 60000});
    await previous.dispose();
    // 1. Unfold.
    await openManualControls(page, {override: true});
    const toggle = page.getByTestId('bw-sim-lab-mixer-toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    const sliders = page.getByTestId('bw-sim-lab-mixer-slider');
    await sliders.first().waitFor({timeout: 10000});
    const ports = await sliders.evaluateAll(els => els.map(el => el.dataset.port));
    const motorPorts = await page.evaluate(() => [...new Set(window.__bwSimLab._pane.session.mechanism.joints.filter(j => j.motor).map(j => j.motor.port))].sort());
    assert.deepEqual(ports.slice().sort(), motorPorts, `one slider per motor: ${ports}`);
    assert.ok(ports.includes('C'), 'the lift motor is in the mixer');
    // 2. Motor C (the lift, no drive pad reaches it) to 60 %.
    const c0 = await angleOf(page, 'C');
    const sliderC = page.locator('[data-testid="bw-sim-lab-mixer-slider"][data-port="C"]');
    // A click at 80 % of the slider's width (−100 … 100: about 60 %), in one go (key by key the forks reach the top meanwhile).
    const box = await sliderC.boundingBox();
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
    const set = Number(await sliderC.inputValue());
    assert.ok(set >= 45 && set <= 75, `the slider took the click: ${set} %`);
    await advance(page, 300); // half way up: the forks reach the top (~950°) after about 0.5 s
    const c1 = await angleOf(page, 'C');
    assert.ok(Math.abs(c1 - c0) > 60, `the lift motor turned from its slider: ${c0.toFixed(0)}° → ${c1.toFixed(0)}°`);
    await page.locator('[data-testid="bw-sim-lab-mixer-stop"][data-port="C"]').click();
    assert.equal(await sliderC.inputValue(), '0');
    // A position hold must first decelerate and recover its captured angle. Judge a bounded
    // physical settling interval, rather than assuming that every input speed settles in 200 ms.
    const settled = await page.evaluate(() => new Promise(done => {
        const s = window.__bwSimLab._pane.session;
        const joint = s.mechanism.actuators.find(a => a.port === 'C').joint;
        const start = s.time; let previous = start; let stable = 0;
        const off = s.onAdvance(() => {
            const elapsed = s.time - previous; previous = s.time;
            stable = Math.abs(s.core.jointState(joint).velocity) * 180 / Math.PI < 1 ? stable + elapsed : 0;
            if (stable >= 100 || s.time - start >= 1500) { off(); done({ok: stable >= 100, ms: s.time - start}); }
        });
    }));
    assert.ok(settled.ok, `■ settles under gravity within 1.5 simulated seconds: ${JSON.stringify(settled)}`);
    const c2 = await angleOf(page, 'C');
    await advance(page, 400);
    const c3 = await angleOf(page, 'C');
    assert.ok(Math.abs(c3 - c2) < 3, `■ stops it: ${c2.toFixed(1)}° → ${c3.toFixed(1)}°`);
    // Capture after the hold check: software-GPU readback must not keep the
    // commanded lift running into its upper stop before we press Stop.
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-mixer.png')});
    // 3. Stop all, and the fold is remembered.
    await sliderC.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    assert.equal(await sliderC.inputValue(), '-20');
    await page.getByTestId('bw-sim-lab-mixer-stop-all').click();
    assert.ok((await sliders.evaluateAll(els => els.map(el => el.value))).every(v => v === '0'), 'Stop all sets every slider to 0');
    await toggle.click();
    assert.equal(await sliders.count(), 0, 'folded away');
    assert.equal(await page.evaluate(() => localStorage.getItem('bw-sim-lab-mixer-open')), '0');
    return {ports, lifted: c1 - c0};
};
