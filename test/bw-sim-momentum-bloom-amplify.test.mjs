// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { solidOverlaps } from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import { buildSteps } from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import { adaptAddonProgram } from '../scripts/lib/physics-addon-program.mjs';
import { judgeNewAddon } from '../scripts/lib/sim-lab-momentum-bloom-amplify-judge.mjs';
import { runRobotLabProgram } from './helpers/robot-lab-direct-vm.mjs';
const C = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));
for (const [id, n, limit] of [['momentum-twins', 125, 65000], ['bloom-gate', 170, 40000], ['amplify', 155, 190000]]) for (const autoPorts of [undefined, false]) test(`${id} (${autoPorts === false ? 'strict' : 'ordinary'}): original geometry, connected manual, actual VM and frozen output controls`, async t => {
  const base = new URL('./fixtures/model-files/' + id + '-source/', import.meta.url),
    shipped = new URL('../overlay/scratch-gui/static/sim-lab/', import.meta.url),
    original = readFileSync(new URL(id + '.ldr', base), 'utf8'),
    modelText = readFileSync(new URL('models/' + id + '.ldr', shipped), 'utf8'),
    program = readFileSync(new URL('programs/' + id + '.bw', shipped), 'utf8');
  assert.equal(program, adaptAddonProgram(id, readFileSync(new URL(id + '.bw', base))));
  const p = prepareModel(modelText, C),
    raw = prepareModel(original, C);
  assert.deepEqual(p.model.parts, raw.model.parts);
  assert.deepEqual(p.issues, []);
  for (const part of p.model.parts) assert.deepEqual(solidOverlaps(p.model, C, part), [], part.id);
  const plan = buildSteps(p.model, C);
  assert.equal(plan.steps.flatMap(s => s.parts).length, n);
  assert.ok(plan.steps.every(s => !s.loose && s.parts.length <= 6));
  const r = await runRobotLabProgram(program, {
    modelText,
    timeLimitMs: limit,
    autoPorts
  });
  assert.equal(r.runModel.parts.length, n);
  assert.deepEqual(r.issues, []);
  assert.ok(r.finishedAt && r.finishedAt < limit);
  for (const f of r.track) for (const p of Object.values(f.bodies)) assert.ok([...p.position, ...p.rotation].every(Number.isFinite));
  t.diagnostic(JSON.stringify(judgeNewAddon(id, r)));
  const outputs = id === 'momentum-twins' ? ['yaw_top', 'A_weight_1', 'B_weight_1'] : id === 'bloom-gate' ? ['blade_ne', 'blade_se', 'blade_sw', 'blade_nw'] : ['output_bar'];
  for (const part of outputs) {
    const frozen = structuredClone(r),
      body = r.mechanism.bodies.find(b => b.parts.includes(part));
    for (const f of frozen.track) f.bodies[body.id] = structuredClone(frozen.track[0].bodies[body.id]);
    assert.throws(() => judgeNewAddon(id, frozen), 'frozen ' + part + ' must fail');
  }
  t.diagnostic(`${n} pieces, native completion ${r.finishedAt} ms`);
});
