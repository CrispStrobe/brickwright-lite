// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mechanicsInteractions, manualMechanicsInteractions } from './sim-lab-mechanics-gate.mjs';
import { scalingSteeringLesson as addonLesson } from './sim-lab-scaling-steering-gate.mjs';
import { judgeNewAddon } from './sim-lab-momentum-bloom-amplify-judge.mjs';
import { judgeAddon } from './sim-lab-addon-judge.mjs';
import {judgeOffsetEllipsa} from './sim-lab-offset-ellipsa-judge.mjs';
import {judgeEchoLingerCrossline} from './sim-lab-echo-linger-crossline-judge.mjs';
import {judgeCounterturnSnapgate} from './sim-lab-counterturn-snapgate-judge.mjs';
import {integralRoundtrip} from './sim-lab-integral-gate.mjs';
import {judgeIntegral} from './sim-lab-integral-judge.mjs';
import {judgeBit} from './sim-lab-bit-keeper-judge.mjs';
import {judgeCircleSplitter} from './sim-lab-circle-splitter-judge.mjs';
export { addonLesson };
export async function physicsAddonInteractions(page, opts) {
  const {
      id
    } = opts,
    n = {
      integral: 155, counterturn: 120, snapgate: 205, 'bit-keeper': 133, 'echo-bridge': 108, linger: 158, crossline: 147,
      'pantograph-doubler': 83,
      'scale-studio': 101,
      'ripple-relay': 191,
      crossglide: 216,
      'momentum-twins': 125,
      'bloom-gate': 170,
      amplify: 155,
      'offset-orbit': 191,
      'circle-splitter': 136,
      ellipsa: 187
    }[id];
  await mechanicsInteractions(page, {
    ...opts,
    models: [id],
    observeProgram: ['circle-splitter','integral','counterturn','snapgate','bit-keeper'].includes(id),
    simulatedMs: id === 'circle-splitter' ? 100000 : id === 'offset-orbit' ? 30000 : id === 'integral' ? 45000 : id === 'counterturn' ? 30000 : id === 'snapgate' ? 45000 : id === 'bit-keeper' ? 65000 : id === 'linger' ? 155000 : id === 'echo-bridge' ? 30000 : id === 'crossline' ? 30000 : id === 'scale-studio' || id === 'bloom-gate' ? 40000 : id === 'amplify' || id === 'ellipsa' ? 170000 : 75000,
    speed: 4,
    judge: id === 'circle-splitter' ? judgeCircleSplitter : id === 'integral' ? judgeIntegral : ['counterturn','snapgate'].includes(id) ? judgeCounterturnSnapgate : id === 'bit-keeper' ? judgeBit : ['echo-bridge','linger','crossline'].includes(id) ? judgeEchoLingerCrossline : ['offset-orbit','ellipsa'].includes(id) ? judgeOffsetEllipsa : ['momentum-twins', 'bloom-gate', 'amplify'].includes(id) ? judgeNewAddon : judgeAddon
  });
  const manual = await manualMechanicsInteractions(page, {
    ...opts,
    models: [id],
    jogMs: id === 'bit-keeper' ? 100 : 250,
    jogSign: () => id === 'bloom-gate' ? -1 : 1
  });
  if (id === 'bit-keeper') assert.ok(Math.abs(manual[id].A) <= 10, 'manual jog stays within the ±10-degree input operating range');
  await addonLesson(page, opts, 'en');
  await page.getByTestId('bw-sim-lab-instructions').click();
  const d = page.getByTestId('bw-sim-instructions');
  await page.waitForFunction(() => window.__bwSimLabInstructions?.status === 'ready', null, {
    timeout: 120000
  });
  const plan = await page.evaluate(() => window.__bwSimLabInstructions.plan);
  const bandCount = {'bit-keeper': 1, 'echo-bridge': 2}[id] || 0;
  assert.equal(plan.steps.flatMap(s => s.parts).length, n);
  assert.equal(plan.steps.flatMap(s => s.belts || []).length, bandCount);
  if (['offset-orbit', 'circle-splitter'].includes(id)) {
    // These two deliveries ship their own assembly groups, so their instruction
    // pages are as coarse as the model says; every piece is still placed once.
    assert.equal(new Set(plan.steps.flatMap(s => s.parts)).size, n);
    assert.ok(plan.steps.every(s => !s.loose && s.parts.length > 0));
  } else assert.ok(plan.steps.every(s => !s.loose && s.parts.length <= 6));
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__bwSimLabInstructions.stats?.step === 1);
  await page.keyboard.press('End');
  await page.waitForFunction(() => window.__bwSimLabInstructions.page === window.__bwSimLabInstructions.steps);
  assert.equal(await page.getByTestId('bw-sim-instructions-bom').getByTestId('bw-sim-instructions-part').evaluateAll(es => es.reduce((n, e) => n + Number(e.dataset.count), 0)), n + bandCount);
  await d.screenshot({
    path: resolve(opts.shotsDir, id + '-bom.png')
  });
  await page.keyboard.press('Escape');
  if (id === 'integral') await integralRoundtrip(page, opts);
  console.log(`PASS ${id}: actual worker/output, manual controls, lesson, ${plan.steps.length} connected instruction pages and ${n + bandCount}-piece BOM`);
}
