// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOOM_PRESETS, judgeLoomRun } from './sim-lab-loom-judge.mjs';
export const loomInteractions = async (page, {
  openSimLab,
  shotsDir,
  timeout
}) => {
  mkdirSync(shotsDir, {
    recursive: true
  });
  await openSimLab(page, {
    program: null
  });
  const results = {};
  for (const preset of LOOM_PRESETS) {
    await page.getByTestId('bw-sim-lab-examples').click();
    const gallery = page.getByTestId('bw-sim-examples');
    await gallery.getByRole('searchbox').fill('orbital-loom');
    const card = gallery.locator(`[data-model="${preset.key}"]`);
    await card.getByRole('button', {
      name: /^Open model \+ program:/
    }).click();
    await gallery.waitFor({
      state: 'hidden'
    });
    await page.waitForFunction(key => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.modelFile === key && window.__bwSimLab._pane.session?.worker, preset.key, {
      timeout: 60000
    });
    await page.evaluate(() => {
      const pane = window.__bwSimLab._pane,
        s = pane.session,
        m = s.mechanism;
      const rec = window.__bwLoom = {
        model: s.runModel,
        mechanism: m,
        hubId: s.bridge.hubBody,
        issues: pane.state.issues,
        unsupported: [],
        start: s.time,
        track: []
      };
      s.onAdvance(() => {
        const bodies = {},
          joints = {},
          busy = {};
        for (const b of m.bodies.filter(b => b.motion === 'dynamic')) bodies[b.id] = s.core.bodyPose(b.id);
        for (const j of m.joints.filter(j => j.type === 'hinge')) joints[j.id] = s.core.jointState(j.id);
        for (const a of m.actuators) busy[a.port] = pane.hub.motors.busy(a.port);
        rec.track.push({
          t: s.time,
          bodies,
          joints,
          busy
        });
      });
    });
    await page.getByTestId('bw-sim-lab-run').click();
    await page.waitForFunction(() => window.__bwSimLab._pane.session.time - window.__bwLoom.start >= 40000, null, {
      timeout
    });
    const rec = await page.evaluate(() => window.__bwLoom);
    results[preset.id] = judgeLoomRun(preset.id, rec);
    const ink = await page.evaluate(() => window.__bwSimLab._pane.view.penStrokes());
    writeFileSync(resolve(shotsDir, `${preset.id}-ink.json`), JSON.stringify(ink));
    await page.screenshot({path: resolve(shotsDir, `${preset.id}-finished.png`)});
    assert.equal(ink.length, 1);
    assert.ok(ink[0].length > 400, `actual browser shows live ink: ${ink[0].length} sampled points`);
    assert.ok(Math.hypot(...ink[0].at(-1).map((x, i) => x - ink[0][0][i])) < .001, 'paper-relative browser ink closes');
    const framing = await page.evaluate(() => window.__bwSimLab._pane.view.framingStats());
    assert.ok(framing.corners.every(p => p.every(Number.isFinite) && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1 && Math.abs(p[2]) <= 1), 'whole gantry is framed');
    await page.screenshot({
      path: resolve(shotsDir, `${preset.id}-finished.png`)
    });
    console.log(`PASS orbital loom ${preset.id}: ${JSON.stringify({
      ...results[preset.id],
      inkPoints: ink[0].length
    })}`);
  }
  await page.getByTestId('bw-sim-lab-instructions').click();
  const dialog = page.getByTestId('bw-sim-instructions');
  await dialog.waitFor();
  await page.waitForFunction(() => window.__bwSimLabInstructions?.status === 'ready' &&
      window.__bwSimLabInstructions.stats?.step === 0, null, {timeout: 30000});
  const steps = await page.evaluate(() => window.__bwSimLabInstructions.steps);
  assert.ok(steps > 30 && steps < 202, 'a detailed connected manual replaces the coarse source stages');
  await dialog.screenshot({path: resolve(shotsDir, 'loom-instructions-first.png')});
  for (let n = 1; n <= steps; n++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(want => {
      const i = window.__bwSimLabInstructions;
      return i.page === want && (want >= i.steps || i.stats?.step === want);
    }, n, {timeout: 15000});
  }
  const bom = page.getByTestId('bw-sim-instructions-bom'); await bom.waitFor();
  const pieces = await bom.getByTestId('bw-sim-instructions-part').evaluateAll(es => es.reduce((n, e) => n + Number(e.dataset.count), 0));
  assert.equal(pieces, 202);
  await dialog.screenshot({path: resolve(shotsDir, 'loom-instructions-bom.png')});
  await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
  console.log(`PASS orbital loom instructions: ${steps} connected pages and ${pieces}-piece bill of materials`);
  writeFileSync(resolve(shotsDir, 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
  return results;
};
