// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';
const DEG = 180 / Math.PI;
const sub = (a, b) => a.map((x, i) => x - b[i]);
const sum = (a, b) => a.map((x, i) => x + b[i]);
const mul = ([x, y, z, w], [a, b, c, d]) => [w * a + x * d + y * c - z * b, w * b - x * c + y * d + z * a, w * c + x * b - y * a + z * d, w * d - x * a - y * b - z * c];
const conj = ([x, y, z, w]) => [-x, -y, -z, w];
const rotate = (q, v) => mul(mul(q, [...v, 0]), conj(q)).slice(0, 3);
const turn = (axis, a, v) => rotate([...axis.map(x => x * Math.sin(a / 2)), Math.cos(a / 2)], v);
const body = (m, p) => {
  const b = m.bodies.find(b => b.parts.includes(p));
  assert.ok(b, p);
  return b;
};
const local = (pose, v) => rotate(conj(pose.rotation), sub(v, pose.position));
const carry = (pose, initial, v) => sum(pose.position, rotate(mul(pose.rotation, conj(initial.rotation)), sub(v, initial.position)));
const span = xs => Math.max(...xs) - Math.min(...xs);

/** Equations use the specified link lengths, tooth counts and pitch radius, not fitted tracks. */
export const judgeExpandedRun = (id, r) => {
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.unsupported, []);
  const {
    mechanism: m,
    track,
    hubId
  } = r;
  assert.ok(track.length > 100, 'substantial run');
  const base = m.bodies.find(b => b.id === hubId);
  for (const f of track) {
    for (const p of Object.values(f.bodies)) {
      assert.ok([...p.position, ...p.rotation].every(Number.isFinite), 'finite pose');
      assert.ok(Math.hypot(...sub(p.position, f.bodies[hubId].position)) < 0.5, 'connected assembly');
    }
    const [x,, z] = f.bodies[hubId].rotation;
    assert.ok(1 - 2 * (x * x + z * z) > .97, 'upright base');
  }
  const end = track.at(-1);
  assert.ok(Object.values(end.busy).every(b => !b), 'program commands finish');
  for (const a of m.actuators) assert.ok(Math.abs(end.joints[a.joint].angle) * DEG < 1, `${a.port} returns home`);
  if (id === 'ratio-workbench') {
    const results = {};
    for (const [lane, port, expected, inputTurns] of [[0, 'A', 1, 1], [1, 'B', 1 / 15, 5], [2, 'C', -1 / 243, 10]]) {
      const input = m.actuators.find(a => a.port === port).joint;
      const out = body(m, `lane${lane}_gOut`);
      const output = m.joints.find(j => j.type === 'hinge' && (j.body1 === out.id || j.body2 === out.id));
      assert.ok(output, 'output bearing');
      const first = track[0];
      const high = track.reduce((a, b) => b.joints[input].angle > a.joints[input].angle ? b : a);
      const di = high.joints[input].angle - first.joints[input].angle;
      const dout = high.joints[output.id].angle - first.joints[output.id].angle;
      assert.ok(Math.abs(di / (2 * Math.PI) - inputTurns) < .02, `${port} completes specified turns`);
      assert.ok(Math.abs(dout / di / expected - 1) < .008, `${port} ratio ${dout / di}, expected ${expected}`);
      // Check the whole changing trajectory in both directions, not only one endpoint.
      const worst = Math.max(...track.map(f => Math.abs(f.joints[output.id].angle - first.joints[output.id].angle - expected * (f.joints[input].angle - first.joints[input].angle))));
      assert.ok(worst * DEG < .8, `${port} tracks its tooth-count ratio forward and backward`);
      results[port] = {
        inputTurns: di / (2 * Math.PI),
        outputTurns: dout / (2 * Math.PI),
        ratio: dout / di,
        worstDeg: worst * DEG
      };
    }
    return results;
  }
  if (id === 'rack-shuttle') {
    const j = m.joints.find(j => j.type === 'slider');
    const a = m.actuators.find(a => a.port === 'A').joint;
    const first = track[0];
    const angles = track.map(f => f.joints[a].angle - first.joints[a].angle);
    const travel = track.map(f => f.joints[j.id].position - first.joints[j.id].position);
    const high = angles.indexOf(Math.max(...angles));
    assert.ok(Math.abs(angles[high] / (2 * Math.PI) - 2) < .02, 'two input turns');
    // 8 teeth × module 1 mm / 2 = 4 mm pitch radius; clockwise raises the original rack.
    const worst = Math.max(...travel.map((x, i) => Math.abs(x + angles[i] * .004)));
    assert.ok(worst < .0003, `rack pitch law residual ${worst}`);
    assert.ok(Math.abs(span(travel) - .004 * 4 * Math.PI) < .0004, '50.27 mm physical stroke');
    assert.ok(Math.abs(travel.at(-1)) < .0003, 'table returns home');
    // Body displacement independently checks that the slider reading represents real motion.
    const moving = body(m, 'rack').id;
    const starts = local(first.bodies[hubId], first.bodies[moving].position);
    const ends = local(track[high].bodies[hubId], track[high].bodies[moving].position);
    assert.ok(Math.abs(Math.hypot(...sub(ends, starts)) - .004 * 4 * Math.PI) < .0005, 'rack body physically translates');
    return {
      strokeMm: span(travel) * 1000,
      pitchResidualMm: worst * 1000
    };
  }
  assert.equal(id, 'positioning-arm');
  const shoulder = m.joints.find(j => j.motor?.port === 'A');
  const elbow = m.joints.find(j => j.motor?.port === 'B');
  const forearm = body(m, 'forearm');
  const shoulder0 = local(base, shoulder.point);
  const r1 = rotate(conj(base.rotation), sub(elbow.point, shoulder.point));
  const axis = rotate(conj(base.rotation), shoulder.axis);
  const axial = r1.reduce((s, x, i) => s + x * axis[i], 0);
  const planar = r1.map((x, i) => x - axis[i] * axial);
  assert.ok(Math.abs(Math.hypot(...planar) - .08) < 1e-8, '80 mm shoulder-elbow in the motion plane');
  const r2 = planar.map(x => x * .8);
  const tip0 = sum(elbow.point, rotate(base.rotation, r2));
  let worst = 0;
  const tips = [];
  for (const f of track) {
    const a = f.joints[shoulder.id].angle,
      b = f.joints[elbow.id].angle;
    const expected = sum(sum(shoulder0, turn(axis, a, r1)), turn(axis, a + b, r2));
    const tip = local(f.bodies[hubId], carry(f.bodies[forearm.id], forearm, tip0));
    worst = Math.max(worst, Math.hypot(...sub(tip, expected)));
    tips.push(tip);
  }
  assert.ok(worst < .0005, `two-link forward kinematics residual ${worst}`);
  const as = track.map(f => f.joints[shoulder.id].angle * DEG),
    bs = track.map(f => f.joints[elbow.id].angle * DEG);
  assert.ok(Math.min(...as) < -44 && Math.max(...as) > 44, 'shoulder visits both sides');
  assert.ok(Math.min(...bs) < -59 && Math.max(...bs) > 59, 'elbow visits both sides');
  assert.ok(Math.max(...tips.map(p => Math.hypot(...sub(p, tips[0])))) > .1, 'tip explores more than 100 mm');
  assert.ok(Math.hypot(...sub(tips.at(-1), tips[0])) < .0007, 'tip returns home');
  const secondShoulder = 2 * Math.atan2(64 * Math.sin(Math.PI / 3), 80 + 64 * Math.cos(Math.PI / 3)) * DEG;
  const settledTip = (a, b) => {
    const i = track.findLastIndex((f, i) => !f.busy.A && !f.busy.B && Math.abs(as[i] - a) < .3 && Math.abs(bs[i] - b) < .3);
    assert.ok(i >= 0, `settled elbow branch A=${a}, B=${b}`);
    return tips[i];
  };
  const branchError = Math.hypot(...sub(settledTip(0, 60), settledTip(Math.round(secondShoulder), -60)));
  assert.ok(branchError < .002, `opposite elbow branches reach the same point: ${branchError}`);

  return {
    worstTipErrorMm: worst * 1000,
    elbowBranchErrorMm: branchError * 1000,
    shoulderDeg: [Math.min(...as), Math.max(...as)],
    elbowDeg: [Math.min(...bs), Math.max(...bs)]
  };
};
