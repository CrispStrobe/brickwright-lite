// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import { adaptAddonProgram } from '../scripts/lib/physics-addon-program.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { solidOverlaps } from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import { buildSteps } from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import { runRobotLabProgram } from './helpers/robot-lab-direct-vm.mjs';
import { judgeAddon } from '../scripts/lib/sim-lab-addon-judge.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8'),
  base = 'overlay/scratch-gui/static/sim-lab/',
  C = catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
for (const [id, n, hinges, sliders, output, minTime] of [['pantograph-doubler', 83, 7, 0, 'arm_BE', 35000], ['scale-studio', 101, 8, 0, 'arm_BP', 26000], ['ripple-relay', 191, 3, 0, 'output_axle', 60000], ['crossglide', 216, 2, 2, 'output_axle', 58000]]) {
  const text = read(base + 'models/' + id + '.ldr'),
    program = read(base + 'programs/' + id + '.bw');
  test(`${id}: original placements, physical topology, clean editor overlaps and connected manual`, () => {
    assert.equal(program, adaptAddonProgram(id, Buffer.from(read('test/fixtures/model-files/' + id + '-source/' + id + '.bw'))));
    const p = prepareModel(text, C),
      original = prepareModel(read('test/fixtures/model-files/' + id + '-source/' + id + '.ldr'), C);
    assert.deepEqual(p.issues, []);
    assert.equal(JSON.stringify(p.model.parts), JSON.stringify(original.model.parts));
    assert.equal(p.model.parts.length, n);
    assert.deepEqual(p.mechanism.actuators.map(a => a.port), ['A']);
    assert.equal(p.mechanism.joints.filter(j => j.type === 'hinge').length, hinges);
    assert.equal(p.mechanism.joints.filter(j => j.type === 'slider').length, sliders);
    if (id === 'ripple-relay') assert.equal(p.mechanism.couplings.filter(c => c.kind === 'universalJoint').length, 2);
    for (const a of p.model.parts) assert.deepEqual(solidOverlaps(p.model, C, a), [], a.id);
    const plan = buildSteps(p.model, C);
    assert.equal(plan.steps.flatMap(s => s.parts).length, n);
    assert.ok(plan.steps.every(s => !s.loose && s.parts.length <= 6));
  });
  for (const autoPorts of [undefined, false]) test(`${id} (${autoPorts === false ? 'strict' : 'ordinary'}): actual VM, measured output and frozen-output negative`, async t => {
    const r = await runRobotLabProgram(program, {
      modelText: text,
      timeLimitMs: 85000,
      autoPorts
    });
    assert.ok(r.finishedAt > minTime && r.finishedAt < 85000, 'finite program completes');
    t.diagnostic(JSON.stringify(judgeAddon(id, r)));
    const frozen = structuredClone(r),
      b = r.mechanism.bodies.find(b => b.parts.includes(output));
    for (const f of frozen.track) f.bodies[b.id] = structuredClone(frozen.track[0].bodies[b.id]);
    assert.throws(() => judgeAddon(id, frozen), 'a stationary passive output cannot pass');
  });
}
test('program adaptation rejects changed raw bytes and preserves the Scale Studio datum guard', () => {
  const source = read('test/fixtures/model-files/scale-studio-source/scale-studio.bw');
  assert.throws(() => adaptAddonProgram('scale-studio', Buffer.from(source + '\n')));
  const adapted = adaptAddonProgram('scale-studio', Buffer.from(source));
  assert.doesNotMatch(adapted, /^  lab reset$/m);
  assert.match(adapted, /if \(abs of \(lab motor A angle\)\) > 1 then:/);
});
