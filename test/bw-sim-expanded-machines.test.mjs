// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODELS, catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { buildSteps } from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import { solidOverlaps } from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import { loadJolt, createPhysicsCore } from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import { runOnSimLab } from './helpers/sim-lab-vm.mjs';
import { judgeExpandedRun } from '../scripts/lib/sim-lab-expanded-judge.mjs';
const GUI = new URL('../overlay/scratch-gui/', import.meta.url);
const C = catalogFrom(JSON.parse(readFileSync(new URL('src/lib/bw-sim/part-meta/parts.json', GUI))));
const text = id => readFileSync(new URL(`static/sim-lab/models/${id}.ldr`, GUI), 'utf8');
const program = id => readFileSync(new URL(`static/sim-lab/programs/${id}.bw`, GUI), 'utf8');
for (const [id, pieces, ports] of [['positioning-arm', 29, ['A', 'B']], ['ratio-workbench', 66, ['A', 'B', 'C']], ['rack-shuttle', 27, ['A']]]) {
  test(`${id}: connected parts, clear colliders, complete build steps and registered program`, () => {
    const {
      model,
      mechanism,
      issues
    } = prepareModel(text(id), C, {
      mat: 'plain'
    });
    assert.deepEqual(issues, []);
    assert.equal(model.parts.length, pieces);
    assert.deepEqual(mechanism.actuators.map(a => a.port).sort(), ports);
    assert.ok(MODELS.some(m => m.file === `${id}.ldr` && m.example === `${id}.bw`));
    for (const p of model.parts) assert.deepEqual(solidOverlaps(model, C, p), [], p.id);
    const plan = buildSteps(model, C);
    assert.ok(plan.steps.every(s => !s.loose));
    assert.deepEqual(plan.steps.flatMap(s => s.parts).sort(), model.parts.map(p => p.id).sort());
  });
  test(`${id}: all motors at 60% for two seconds remain finite, connected and upright`, async () => {
    const {
      mechanism: m
    } = prepareModel(text(id), C, {
      mat: 'plain'
    });
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
        const frame = core.bodyPose(hub);
        const [x,, z] = frame.rotation;
        assert.ok(1 - 2 * (x * x + z * z) > .97, 'upright');
        for (const b of m.bodies.filter(b => b.motion === 'dynamic')) {
          const p = core.bodyPose(b.id);
          assert.ok([...p.position, ...p.rotation].every(Number.isFinite));
          assert.ok(Math.hypot(...p.position.map((n, j) => n - frame.position[j])) < .5);
        }
      }
      for (const a of m.actuators) assert.ok(Math.abs(core.jointState(a.joint).angle) > .2, a.port);
      if (id === 'rack-shuttle') {
        const j = m.joints.find(j => j.type === 'slider'),
          p = core.jointState(j.id).position;
        assert.ok(p >= j.limits[0] - .0001 && p <= j.limits[1] + .0001, 'rack stops at its physical travel limit');
        assert.ok(Math.abs(core.jointState(m.actuators[0].joint).velocity) < .01, 'powered overrun stalls at the stop');
      }
    } finally {
      core.destroy();
    }
  });
  test(`${id}: actual VM program matches independent mechanism equations`, async t => {
    const r = await runOnSimLab(program(id), {
      modelText: text(id),
      mat: 'plain',
      timeLimitMs: 24000
    });
    const metrics = judgeExpandedRun(id, {
      ...r,
      unsupported: r.run.unsupported
    });
    t.diagnostic(JSON.stringify(metrics));
    // A frozen output must fail even when the motor encoders report the original motion.
    if (id === 'positioning-arm') {
      const moving = r.mechanism.bodies.find(b => b.parts.includes('forearm')).id;
      const track = r.track.map(f => ({
        ...f,
        bodies: {
          ...f.bodies,
          [moving]: r.track[0].bodies[moving]
        }
      }));
      assert.throws(() => judgeExpandedRun(id, {
        ...r,
        track,
        unsupported: r.run.unsupported
      }), /forward kinematics/);
    }
    if (id === 'rack-shuttle') {
      const moving = r.mechanism.bodies.find(b => b.parts.includes('rack')).id;
      const track = r.track.map(f => ({
        ...f,
        bodies: {
          ...f.bodies,
          [moving]: r.track[0].bodies[moving]
        }
      }));
      assert.throws(() => judgeExpandedRun(id, {
        ...r,
        track,
        unsupported: r.run.unsupported
      }), /physically translates/);
    }
  });
}
