// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { buildSteps } from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import { solidOverlaps } from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import { loadJolt, createPhysicsCore } from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import { buildSimScene } from '../overlay/scratch-gui/src/lib/bw-sim/view/sim-scene3d.js';
import { parseLDConfig } from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';
import {sampleDrawingSnapshot} from '../overlay/scratch-gui/src/lib/bw-sim/view/drawing-sampler.js';
import { createPenLayer } from '../overlay/scratch-gui/src/lib/bw-sim/view/pen-layer.js';
import { runOnSimLab } from './helpers/sim-lab-vm.mjs';
import { LOOM_PRESETS, judgeLoomRun, loomTrace } from '../scripts/lib/sim-lab-loom-judge.mjs';
const GUI = new URL('../overlay/scratch-gui/', import.meta.url);
const text = readFileSync(new URL('static/sim-lab/models/orbital-loom.ldr', GUI), 'utf8');
const C = catalogFrom(JSON.parse(readFileSync(new URL('src/lib/bw-sim/part-meta/parts.json', GUI))));
const prepared = () => prepareModel(text, C, {
  mat: 'plain'
});
const read = p => {
  const path = new URL('static/ldraw/' + (p.toLowerCase() === 'ldconfig.ldr' ? 'LDConfig.ldr' : p.toLowerCase()), GUI);
  return existsSync(path) ? readFileSync(path, 'latin1') : undefined;
};
test('loom: 202 connected LEGO pieces, supported 20:60 drive, complete instructions and owner attribution', () => {
  const {
    model,
    mechanism,
    issues
  } = prepared();
  const original = readFileSync(new URL('./fixtures/model-files/orbital-loom-source/orbital_loom_bricks_only.mpd', import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'), 'd2e22ef40af389d6e1580b3ace65968e390fd6eadac0488aee318adddbb0f539');
  assert.equal(model.parts.length, 202);
  assert.equal(model.decor?.length || 0, 0);
  assert.deepEqual(issues.map(i => i.code), ['locked-hinges', 'locked-hinges']);
  assert.equal(mechanism.actuators.length, 2);
  assert.equal(mechanism.gears.length, 1);
  for (const p of model.parts) assert.deepEqual(solidOverlaps(model, C, p), [], p.id);
  const plan = buildSteps(model, C);
  assert.ok(plan.steps.every(s => !s.loose), 'connected building order');
  assert.equal(plan.source, 'auto');
  assert.ok(plan.steps.every(s => s.parts.length <= 6), 'no overloaded pin callouts');
  const at = new Map(plan.steps.flatMap((s, i) => s.parts.map(id => [id, i])));
  for (const [pin, stud] of [[10, 16], [11, 17], [12, 18], [13, 19]]) {
    assert.ok(at.get(`06_platter.ldr#27_${pin}`) < at.get(`06_platter.ldr#27_${stud}`), 'insert the perpendicular connector before its half pin');
    assert.ok(at.get(`06_platter.ldr#27_${stud}`) < at.get('paperPlate'), 'insert the stud half pin before covering it with the plate');
  }

  assert.deepEqual(plan.steps.flatMap(s => s.parts).sort(), model.parts.map(p => p.id).sort());
  assert.match(text, /Author: CrispStrobe/);
  assert.match(text, /BSD-3-Clause/);
  assert.match(readFileSync(new URL('static/sim-lab/licenses/orbital-loom.txt', GUI), 'utf8'), /ORBITAL LOOM, CrispStrobe, 2026/);
  assert.equal(model.parts.find(p => p.id === '02_table_drive.ldr#16_26').part, '4519.dat', 'blind bore takes the shorter 3L axle');
});
test('loom: every motor at 60% for two seconds remains finite and upright', async () => {
  const {
    mechanism: m
  } = prepared();
  const core = createPhysicsCore(await loadJolt(), m, {
    stepHz: 200
  });
  const hub = m.bodies.find(b => b.parts.includes('hub')).id;
  try {
    for (let i = 0; i < 40; i++) core.step(.005);
    for (const a of m.actuators) core.setMotor(a.joint, {
      mode: 'velocity',
      radPerSec: .6 * a.maxSpeedRadPerSec
    });
    for (let i = 0; i < 400; i++) {
      core.step(.005);
      const base = core.bodyPose(hub);
      const [x,, z] = base.rotation;
      assert.ok(1 - 2 * (x * x + z * z) > .995);
      for (const b of m.bodies.filter(b => b.motion === 'dynamic')) {
        const pose = core.bodyPose(b.id);
        assert.ok([...pose.position, ...pose.rotation].every(Number.isFinite));
        assert.ok(Math.hypot(...pose.position.map((x, i) => x - base.position[i])) < .5);
      }
    }
    for (const a of m.actuators) assert.ok(Math.abs(core.jointState(a.joint).angle) > 1, a.port);
  } finally {
    core.destroy();
  }
});
for (const preset of LOOM_PRESETS) {
  test(`loom ${preset.p}/${preset.q}: actual VM drives a closed live drawing on rotating paper`, async t => {
    const source = readFileSync(new URL(`static/sim-lab/programs/${preset.id}.bw`, GUI), 'utf8');
    const r = await runOnSimLab(source, {
      modelText: text,
      mat: 'plain',
      timeLimitMs: 40000
    });
    const result = {
      ...r,
      model: prepared().runModel,
      unsupported: r.run.unsupported
    };
    t.diagnostic(JSON.stringify(judgeLoomRun(preset.id, result)));
    const built = buildSimScene({
      model: result.model,
      mechanism: r.mechanism,
      read,
      catalog: C,
      colors: parseLDConfig(read('LDConfig.ldr'))
    });
    const pens = createPenLayer({
      model: result.model,
      mechanism: r.mechanism,
      built
    });
    try {
      assert.ok(built.instanced, 'large models use invisible source proxies');
      assert.equal(pens.count, 1);
      for (const f of r.track) {
        const bodyIds = Object.keys(f.bodies);
        const bodies = new Float32Array(bodyIds.length * 7);
        bodyIds.forEach((id, i) => bodies.set([...f.bodies[id].position, ...f.bodies[id].rotation], i * 7));
        sampleDrawingSnapshot({built, pens, snapshot: {bodyIds, bodies}});
      }
      const strokes = pens.strokes();
      assert.equal(strokes.length, 1, 'continuous contact draws one stroke');
      const stroke = strokes[0];
      assert.ok(stroke.length > 500, 'live ink, not a preloaded preview');
      assert.ok(Math.hypot(...stroke.at(-1).map((x, i) => x - stroke[0][i])) < .001, 'rendered ink closes');
      const trace = loomTrace({
        ...result,
        preset: preset.id
      });
      assert.ok(Math.hypot(...stroke[0].map((x, i) => x - trace.points[0][i])) < .0001, 'renderer uses the simulated nib');
      const paper = built.scene.getObjectByName('paper:paperPlate');
      assert.ok(paper);
      for (let p = paper; p; p = p.parent) assert.ok(p.visible, 'paper is visible despite instanced part proxies');
      if (preset.p === 5) {
        const plate = r.mechanism.bodies.find(b => b.parts.includes('paperPlate')).id;
        const track = r.track.map(f => ({
          ...f,
          bodies: {
            ...f.bodies,
            [plate]: r.track[0].bodies[plate]
          }
        }));
        assert.throws(() => judgeLoomRun(preset.id, {
          ...result,
          track
        }), /epicycle geometry residual/, 'motor turns alone cannot stand in for a moving paper table');
      }
    } finally {
      pens.dispose();
      built.dispose();
    }
  });
}
