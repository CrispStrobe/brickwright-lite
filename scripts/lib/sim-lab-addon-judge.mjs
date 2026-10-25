// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Carry real part-local points with the observed bodies; predictions are checks only.
import assert from 'node:assert/strict';
import { judgePhaseBridge } from './sim-lab-phase-bridge-judge.mjs';
const add = (a, b) => a.map((x, i) => x + b[i]),
  sub = (a, b) => a.map((x, i) => x - b[i]),
  scale = (a, s) => a.map(x => x * s),
  dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
  cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm = a => Math.hypot(...a);
const mul = ([x, y, z, w], [a, b, c, d]) => [w * a + x * d + y * c - z * b, w * b - x * c + y * d + z * a, w * c + x * b - y * a + z * d, w * d - x * a - y * b - z * c],
  conj = ([x, y, z, w]) => [-x, -y, -z, w],
  rot = (q, v) => mul(mul(q, [...v, 0]), conj(q)).slice(0, 3),
  wrap = x => Math.atan2(Math.sin(x), Math.cos(x)),
  deg = x => x * 180 / Math.PI,
  span = a => Math.max(...a) - Math.min(...a);
const unwrap = xs => {
  let prev = xs[0],
    total = prev;
  return xs.map(x => {
    total += wrap(x - prev);
    prev = x;
    return total;
  });
};
export function observeAddon(r, basePart = 'hub') {
  const m = r.mechanism,
    base = m.bodies.find(b => b.parts.includes(basePart)),
    parts = new Map(r.runModel.parts.map(p => [p.id, p])),
    bodies = new Map(m.bodies.map(b => [b.id, b]));
  assert.ok(base);
  const body = id => {
    const b = m.bodies.find(b => b.parts.includes(id));
    assert.ok(b, id);
    return b;
  };
  const initial = (id, local = [0, 0, 0]) => {
    const p = parts.get(id);
    assert.ok(p, id);
    return add(p.position, [0, 3, 6].map(i => dot(p.rotation.slice(i, i + 3), local))).map((x, i) => x * (i === 0 ? .0004 : -.0004));
  };
  const carry = (f, b, p) => add(f.bodies[b.id].position, rot(f.bodies[b.id].rotation, rot(conj(b.rotation), sub(p, b.position))));
  const frame = (f, p) => add(base.position, rot(base.rotation, rot(conj(f.bodies[base.id].rotation), sub(p, f.bodies[base.id].position))));
  const point = (f, id, local) => frame(f, carry(f, body(id), initial(id, local)));
  const vector = (f, id, ref) => {
    const b = body(id);
    return rot(base.rotation, rot(conj(f.bodies[base.id].rotation), rot(f.bodies[b.id].rotation, rot(conj(b.rotation), ref))));
  };
  const angle = (f, id, axis, ref) => {
    const b = body(id),
      actual = rot(base.rotation, rot(conj(f.bodies[base.id].rotation), rot(f.bodies[b.id].rotation, rot(conj(b.rotation), ref))));
    return Math.atan2(dot(axis, cross(ref, actual)), dot(ref, actual));
  };
  const gap = f => Math.max(...m.joints.filter(j => j.type === 'hinge').map(j => norm(sub(carry(f, bodies.get(j.body1), j.point), carry(f, bodies.get(j.body2), j.point))))) * 1000;
  const axisGap = f => Math.max(...m.joints.filter(j => j.type === 'hinge').map(j => {
    const axes = [j.body1, j.body2].map(id => rot(f.bodies[id].rotation, rot(conj(bodies.get(id).rotation), j.axis)));
    return deg(Math.acos(Math.min(1, Math.max(-1, dot(axes[0], axes[1])))));
  }));
  const tilt = f => deg(Math.acos(Math.min(1, Math.max(-1, dot(rot(mul(f.bodies[base.id].rotation, conj(base.rotation)), [0, 1, 0]), [0, 1, 0])))));
  return {
    m,
    base,
    body,
    initial,
    point,
    vector,
    angle,
    gap,
    axisGap,
    tilt
  };
}
function healthy(r) {
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.unsupported, []);
  assert.equal(r.mechanism.actuators.length, 1);
  assert.ok(r.track.length > 700);
  for (const f of r.track) for (const p of Object.values(f.bodies)) assert.ok([...p.position, ...p.rotation].every(Number.isFinite));
}
export function measurePantograph(id, r) {
  const o = observeAddon(r),
    doubler = id === 'pantograph-doubler',
    defs = doubler ? [['origin_plinth_20', [0, -20, 0]], ['input_crank', [0, 0, 40]], ['arm_BE', [0, 0, 120]]] : [['origin_pier_y-60', [0, 0, 0]], ['drive_crank', [0, 0, 40]], ['red_output_flag', [0, 0, 20]]],
    motor = o.m.joints.find(j => j.motor?.port === 'A');
  return r.track.map(f => {
    const [O, C, E] = defs.map(([part, p]) => o.point(f, part, p)),
      plane = p => sub(p, O).map((x, i) => i === 1 ? 0 : x);
    return {
      t: f.t,
      c: plane(C),
      e: plane(E),
      encoder: f.joints[motor.id].angle,
      gapMm: o.gap(f),
      axisMismatchDeg: o.axisGap(f),
      tiltDeg: o.tilt(f)
    };
  });
}
export function judgePantograph(id, r) {
  healthy(r);
  const s = measurePantograph(id, r),
    n = id === 'pantograph-doubler' ? 7 : 8;
  assert.equal(r.mechanism.joints.filter(j => j.type === 'hinge').length, n);
  const error = Math.max(...s.map(p => norm(sub(p.e, scale(p.c, 2))) * 1000)),
    gap = Math.max(...s.map(p => p.gapMm)),
    tilt = Math.max(...s.map(p => p.tiltDeg)),
    inputDiameter = Math.max(...[0, 2].map(k => span(s.map(p => p.c[k])) * 1000)),
    outputDiameter = Math.max(...[0, 2].map(k => span(s.map(p => p.e[k])) * 1000)),
    returnMm = norm(sub(s.at(-1).e, s[0].e)) * 1000;
  assert.ok(error < 1, 'measured 2:1 dilation throughout the whole run');
  const axisMismatch = Math.max(...s.map(p => p.axisMismatchDeg));
  assert.ok(gap < .5 && tilt < 2 && axisMismatch < 2, 'physical hinge axes, closure and freestanding frame');
  assert.ok(Math.abs(inputDiameter - 32) < 1 && Math.abs(outputDiameter - 64) < 1, 'both actual circular paths');
  assert.ok(returnMm < 1, 'output returns home');
  const peak = Math.max(...s.map(p => p.encoder));
  assert.ok(peak > 358 * Math.PI / 180 && Math.abs(s.at(-1).encoder) < 2 * Math.PI / 180, 'full forward turn and reverse home');
  return {
    scalingErrorMm: error,
    inputDiameterMm: inputDiameter,
    outputDiameterMm: outputDiameter,
    returnErrorMm: returnMm,
    hingeGapMm: gap,
    baseTiltDeg: tilt,
    axisMismatchDeg: Math.max(...s.map(p => p.axisMismatchDeg))
  };
}
export function measureCrossglide(r) {
  const o = observeAddon(r),
    j = o.m.joints.find(j => j.motor),
    axis = j.axis,
    ref = Math.abs(axis[1]) > .8 ? [1, 0, 0] : [0, 1, 0],
    parts = ['input_axle', 'intermediate_crossbar_0', 'output_axle'],
    angles = parts.map(p => unwrap(r.track.map(f => o.angle(f, p, axis, ref)))),
    origin = o.initial('input_axle'),
    out = o.initial('output_axle'),
    e = sub(out, origin).map((x, i) => i === 1 ? 0 : x),
    unit = scale(e, 1 / norm(e)),
    v = cross(axis, unit),
    offset = norm(e) / 2;
  return r.track.map((f, i) => {
    const p = sub(o.point(f, 'intermediate_crossbar_0'), origin),
      theta = angles[0][i];
    return {
      t: f.t,
      input: theta,
      middle: angles[1][i],
      output: angles[2][i],
      encoder: f.joints[j.id].angle,
      x: dot(p, unit),
      z: dot(p, v),
      expectedX: offset * (1 + Math.cos(2 * theta)),
      expectedZ: offset * Math.sin(2 * theta),
      gapMm: o.gap(f),
      axisMismatchDeg: o.axisGap(f),
      tiltDeg: o.tilt(f),
      slides: o.m.joints.filter(j => j.type === 'slider').map(j => f.joints[j.id].position)
    };
  });
}
export function judgeCrossglide(id, r) {
  healthy(r);
  assert.equal(r.mechanism.joints.filter(j => j.type === 'slider').length, 2);
  const s = measureCrossglide(r),
    angleError = Math.max(...s.flatMap(p => [Math.abs(deg(wrap(p.output - p.input))), Math.abs(deg(wrap(p.middle - p.input)))])),
    orbitError = Math.max(...s.map(p => Math.hypot(p.x - p.expectedX, p.z - p.expectedZ) * 1000)),
    gap = Math.max(...s.map(p => p.gapMm)),
    tilt = Math.max(...s.map(p => p.tiltDeg)),
    slides = [0, 1].map(k => span(s.map(p => p.slides[k])) * 1000),
    travel = span(s.map(p => p.input));
  assert.ok(angleError < .5, 'actual input, middle and output orientations agree');
  assert.ok(orbitError < .5, 'actual middle centre follows the twice-per-turn orbit');
  assert.ok(gap < .5 && tilt < 2 && Math.max(...s.map(p => p.axisMismatchDeg)) < 1, 'physical closure, parallel axes and stable frame');
  assert.ok(slides.every(x => x > 31 && x < 33), 'both actual 32 mm strokes');
  assert.ok(travel > 718 * Math.PI / 180, 'two full turns and return');
  assert.ok(Math.abs(deg(s.at(-1).output)) < 2, 'passive output returns home');
  return {
    angleErrorDeg: angleError,
    orbitErrorMm: orbitError,
    slideStrokesMm: slides,
    hingeGapMm: gap,
    baseTiltDeg: tilt,
    axisMismatchDeg: Math.max(...s.map(p => p.axisMismatchDeg))
  };
}
export const judgeAddon = (id, r) => id === 'ripple-relay' ? judgePhaseBridge(id, r) : id === 'crossglide' ? judgeCrossglide(id, r) : judgePantograph(id, r);
