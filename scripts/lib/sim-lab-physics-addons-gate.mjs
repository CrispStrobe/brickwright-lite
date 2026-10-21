// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mechanicsInteractions, manualMechanicsInteractions } from './sim-lab-mechanics-gate.mjs';
import { scalingSteeringLesson as addonLesson } from './sim-lab-scaling-steering-gate.mjs';
import { judgeNewAddon } from './sim-lab-momentum-bloom-amplify-judge.mjs';
import { judgeAddon } from './sim-lab-addon-judge.mjs';
import {judgeOffsetEllipsa} from './sim-lab-offset-ellipsa-judge.mjs';
export { addonLesson };
export async function physicsAddonInteractions(page, opts) {
  const {
      id
    } = opts,
    n = {
      'pantograph-doubler': 83,
      'scale-studio': 101,
      'ripple-relay': 191,
      crossglide: 216,
      'momentum-twins': 125,
      'bloom-gate': 170,
      amplify: 155,
      'offset-orbit': 141,
      ellipsa: 187
    }[id];
  await mechanicsInteractions(page, {
    ...opts,
    models: [id],
    simulatedMs: id === 'scale-studio' || id === 'bloom-gate' ? 40000 : id === 'amplify' || id === 'ellipsa' ? 170000 : 75000,
    speed: 4,
    judge: ['offset-orbit','ellipsa'].includes(id) ? judgeOffsetEllipsa : ['momentum-twins', 'bloom-gate', 'amplify'].includes(id) ? judgeNewAddon : judgeAddon
  });
  await manualMechanicsInteractions(page, {
    ...opts,
    models: [id],
    jogSign: () => id === 'bloom-gate' ? -1 : 1
  });
  await addonLesson(page, opts, 'en');
  await page.getByTestId('bw-sim-lab-instructions').click();
  const d = page.getByTestId('bw-sim-instructions');
  await page.waitForFunction(() => window.__bwSimLabInstructions?.status === 'ready', null, {
    timeout: 120000
  });
  const plan = await page.evaluate(() => window.__bwSimLabInstructions.plan);
  assert.equal(plan.steps.flatMap(s => s.parts).length, n);
  assert.ok(plan.steps.every(s => !s.loose && s.parts.length <= 6));
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__bwSimLabInstructions.stats?.step === 1);
  await page.keyboard.press('End');
  await page.waitForFunction(() => window.__bwSimLabInstructions.page === window.__bwSimLabInstructions.steps);
  assert.equal(await page.getByTestId('bw-sim-instructions-bom').getByTestId('bw-sim-instructions-part').evaluateAll(es => es.reduce((n, e) => n + Number(e.dataset.count), 0)), n);
  await d.screenshot({
    path: resolve(opts.shotsDir, id + '-bom.png')
  });
  await page.keyboard.press('Escape');
  console.log(`PASS ${id}: actual worker/output, manual controls, lesson, ${plan.steps.length} connected instruction pages and ${n}-piece BOM`);
}
