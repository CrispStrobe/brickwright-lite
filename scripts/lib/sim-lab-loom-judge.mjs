// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';
import { lduToWorld, dirToWorld } from '../../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import { mat3MulVec3 } from '../../overlay/scratch-gui/src/lib/bw-sim/mech/vec.js';
export const LOOM_PRESETS = [{
  id: 'orbital-loom',
  key: 'orbital-loom.ldr',
  p: 5,
  q: 1
}, {
  id: 'orbital-loom-sevenfold',
  key: 'orbital-loom-sevenfold',
  p: 7,
  q: 2
}, {
  id: 'orbital-loom-elevenfold',
  key: 'orbital-loom-elevenfold',
  p: 11,
  q: 4
}, {
  id: 'orbital-loom-eightfold',
  key: 'orbital-loom-eightfold',
  p: 8,
  q: 3
}];
const mul = ([x, y, z, w], [a, b, c, d]) => [w * a + x * d + y * c - z * b, w * b - x * c + y * d + z * a, w * c + x * b - y * a + z * d, w * d - x * a - y * b - z * c];
const conj = ([x, y, z, w]) => [-x, -y, -z, w];
const rot = (q, v) => mul(mul(q, [...v, 0]), conj(q)).slice(0, 3);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const carry = (pose, b, point) => add(pose.position, rot(mul(pose.rotation, conj(b.rotation)), sub(point, b.position)));
const rot2 = (a, [x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const body = (m, id) => m.bodies.find(b => b.parts.includes(id));
const localPoint = (part, v) => lduToWorld(add(part.position, mat3MulVec3(part.rotation, v)));

/** A paper-relative point obtained from the physical paper and pen-carrier poses. */
export const loomTrace = r => {
  const {
    model,
    mechanism: m,
    track
  } = r;
  const d = model.drawings[0];
  const paper = model.parts.find(p => p.id === d.surface),
    pen = model.parts.find(p => p.id === d.pen);
  const pb = body(m, paper.id),
    nb = body(m, pen.id);
  const center = localPoint(paper, d.center),
    tip = localPoint(pen, d.tip);
  const ux = dirToWorld(mat3MulVec3(paper.rotation, [1, 0, 0]));
  const uz = dirToWorld(mat3MulVec3(paper.rotation, [0, 0, -1]));
  const normal = cross(ux, uz);
  const project = v => [dot(v, ux), dot(v, uz)];
  const bj = m.joints.find(j => j.motor?.port === 'B');
  const pj = m.joints.find(j => j.type === 'hinge' && !j.motor && (j.body1 === pb.id || j.body2 === pb.id));
  const offset = project(sub(bj.point, center)),
    crank = project(sub(tip, bj.point));
  const points = [];
  let worst = 0,
    maxGap = 0,
    phase = 0,
    paperTurns = 0,
    penTurns = 0;
  for (const f of track) {
    const qp = mul(f.bodies[pb.id].rotation, conj(pb.rotation));
    const relative = sub(carry(f.bodies[nb.id], nb, tip), carry(f.bodies[pb.id], pb, center));
    const point = [dot(relative, rot(qp, ux)), dot(relative, rot(qp, uz))];
    maxGap = Math.max(maxGap, Math.abs(dot(relative, rot(qp, normal))));
    const alpha = f.joints[pj.id].angle * dot(pj.axis, normal) * (pj.body2 === pb.id ? 1 : -1);
    const beta = f.joints[bj.id].angle * dot(bj.axis, normal);
    paperTurns = alpha / (2 * Math.PI);
    penTurns = beta / (2 * Math.PI);
    const expected = rot2(-alpha, add(offset, rot2(beta, crank)));
    worst = Math.max(worst, Math.hypot(...sub(point, expected)));
    points.push(point);
    const preset = LOOM_PRESETS.find(p => p.id === (r.preset || 'orbital-loom'));
    phase = Math.max(phase, Math.abs(beta - preset.p / preset.q * alpha));
  }
  return {
    points,
    worst,
    maxGap,
    phase,
    paperTurns,
    penTurns,
    paperJoint: pj.id,
    offsetMm: Math.hypot(...offset) * 1000,
    crankMm: Math.hypot(...crank) * 1000
  };
};
export const judgeLoomRun = (id, r) => {
  const preset = LOOM_PRESETS.find(p => p.id === id);
  assert.ok(preset, id);
  assert.deepEqual(r.unsupported, []);
  // Multiple smooth pins at separated axes deliberately make rigid bearing/platter mounts.
  const allowed = new Set(['bearing', ...[36, 37, 38, 39].map(n => `01_base.ldr#13_${n}`), ...[10, 11, 12, 13, 16, 17, 18, 19].map(n => `06_platter.ldr#27_${n}`)]);
  assert.equal(r.issues.length, 2);
  for (const i of r.issues) {
    assert.equal(i.code, 'locked-hinges');
    assert.ok(i.parts.every(p => allowed.has(p)));
  }
  assert.equal(r.model.parts.length, 202);
  assert.ok(r.track.length > 500);
  for (const f of r.track) {
    for (const pose of Object.values(f.bodies)) {
      assert.ok([...pose.position, ...pose.rotation].every(Number.isFinite));
      assert.ok(Math.hypot(...sub(pose.position, f.bodies[r.hubId].position)) < .5, 'assembly remains connected');
    }
    const [x,, z] = f.bodies[r.hubId].rotation;
    assert.ok(1 - 2 * (x * x + z * z) > .995, 'gantry stays upright');
  }
  const m = r.mechanism,
    end = r.track.at(-1);
  assert.ok(Object.values(end.busy).every(b => !b), 'both encoder commands finish');
  const motor = port => m.actuators.find(a => a.port === port).joint;
  const a = end.joints[motor('A')].angle,
    b = end.joints[motor('B')].angle;
  assert.ok(Math.abs(a / (2 * Math.PI) + 3 * preset.q) < .005, 'A completes three turns per paper turn');
  assert.ok(Math.abs(b / (2 * Math.PI) + preset.p) < .005, 'B completes the requested crank turns');
  const trace = loomTrace({
    ...r,
    preset: id
  });
  assert.ok(Math.abs(trace.paperTurns - preset.q) < .005, 'paper actually rotates');
  assert.ok(trace.worst < .0006, `epicycle geometry residual ${trace.worst}`);
  assert.ok(trace.maxGap < .0006, 'nib stays on the paper plane');
  assert.ok(Math.abs(trace.offsetMm - 32) < .001 && Math.abs(trace.crankMm - Math.sqrt(512)) < .001, 'supplied 32 mm offset and sqrt(512) mm crank');
  const radii = trace.points.map(p => Math.hypot(...p));
  assert.ok(Math.max(...radii) < .055 && Math.max(...radii) > .054, 'outer trace radius');
  assert.ok(Math.min(...radii) < .010 && Math.min(...radii) > .009, 'inner trace radius');
  const closure = Math.hypot(...sub(trace.points.at(-1), trace.points[0]));
  assert.ok(closure < .0008, `closed trace ${closure}`);
  assert.ok(trace.phase < .2, `servo phase error remains bounded: ${trace.phase}`);
  return {
    paperTurns: trace.paperTurns,
    penTurns: trace.penTurns,
    closureMm: closure * 1000,
    geometryErrorMm: trace.worst * 1000,
    maximumNibGapMm: trace.maxGap * 1000,
    phaseErrorDeg: trace.phase * 180 / Math.PI,
    radiusMm: [Math.min(...radii) * 1000, Math.max(...radii) * 1000]
  };
};
