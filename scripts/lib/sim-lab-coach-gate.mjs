// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's coach marks (sim-lab-coach.jsx, docs/ROBOT-LAB-UX.md §3.9) for
// scripts/verify-sim-lab-browser.mjs `--part=editor`, through clicks only. The page is opened with
// ?bwCoach=1: without it an automated browser gets no tips (they would cover what other gates click).
//
//   1. the first Build shows the card, tip 1 of N; Next steps through; the last button puts it away
//      (and the card is gone);
//   2. Simulate and back to Build: no card — it is remembered on this device;
//   3. the shortcut sheet's "Show the tips again" brings tip 1 back; Got it puts it away.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const card = page => page.getByTestId('bw-sim-lab-coach');
const step = async page => Number(await card(page).getAttribute('data-step'));

export const coachInteractions = async (page, {shotsDir}) => {
    try {
        return await checks(page, {shotsDir});
    } catch (error) {
        await page.screenshot({path: resolve(shotsDir, 'sim-lab-coach-failure.png'), fullPage: true}).catch(() => {});
        throw error;
    }
};

const checks = async (page, {shotsDir}) => {
    const buildReady = () => page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' &&
        window.__bwSimLab.editView, null, {timeout: 60000});
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await buildReady();
    // 1. Tip 1, then on to the last; its button puts the card away.
    await card(page).waitFor();
    assert.equal(await step(page), 0);
    const tips = await page.evaluate(() => window.__bwSimLab._pane.etext.coach.length);
    assert.match(await card(page).textContent(), new RegExp(`1 / ${tips}`));
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-coach.png')});
    for (let i = 1; i < tips; i++) {
        await page.getByTestId('bw-sim-lab-coach-next').click();
        await page.waitForFunction(n => document.querySelector('[data-testid="bw-sim-lab-coach"]')?.dataset.step === String(n), i);
    }
    assert.equal(await page.getByTestId('bw-sim-lab-coach-next').textContent(), 'Got it', 'the last tip\'s button puts the card away');
    await page.getByTestId('bw-sim-lab-coach-next').click();
    await card(page).waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => localStorage.getItem('bw-sim-lab-coach-done')), '1');
    // 2. Remembered: Build again shows none.
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready', null, {timeout: 60000});
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await buildReady();
    assert.equal(await card(page).count(), 0, 'no tips the second time');
    // 3. Again from the shortcut sheet; Got it on tip 1.
    await page.getByTestId('bw-sim-lab-editor-canvas').focus();
    await page.keyboard.press('?');
    await page.getByTestId('bw-sim-lab-coach-again').click();
    await card(page).waitFor();
    assert.equal(await step(page), 0);
    await page.getByTestId('bw-sim-lab-coach-done').click();
    await card(page).waitFor({state: 'detached'});
    return {tips};
};
