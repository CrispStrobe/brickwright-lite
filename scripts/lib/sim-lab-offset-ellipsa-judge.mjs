// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Measure real body-carried points in the chassis frame; never assign output poses.
import assert from 'node:assert/strict';
import { observeAddon } from './sim-lab-addon-judge.mjs';
const sub = (a, b) => a.map((v, i) => v - b[i]),
  dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0),
  norm = a => Math.hypot(...a),
  unit = a => a.map(v => v / norm(a)),
  deg = a => a * 180 / Math.PI,
  wrap = a => Math.atan2(Math.sin(a), Math.cos(a)),
  span = a => Math.max(...a) - Math.min(...a),
  max = a => Math.max(...a);
const unwrap = xs => {
  let previous = xs[0],
    total = previous;
  return xs.map(x => {
    total += wrap(x - previous);
    previous = x;
    return total;
  });
};
function directions(xs) {
  let forward = 0,
    reverse = 0;
  for (let i = 1; i < xs.length; i++) {
    const d = deg(xs[i] - xs[i - 1]);
    forward += Math.max(0, d);
    reverse += Math.max(0, -d);
  }
  return {
    forward,
    reverse
  };
}
function frame(r, id) {
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.unsupported, []);
  assert.deepEqual(r.mechanism.actuators.map(a => a.port), ['A']);
  assert.ok(r.track.length >= (id === 'ellipsa' ? 1000 : 700));
  for (const f of r.track) for (const p of Object.values(f.bodies)) assert.ok([...p.position, ...p.rotation].every(Number.isFinite));
  const o = observeAddon(r),
    basis = local => unit(sub(o.initial('hub', local), o.initial('hub'))),
    X = basis(id === 'ellipsa' ? [1, 0, 0] : [0, -1, 0]),
    Z = basis([0, 0, 1]),
    N = basis(id === 'ellipsa' ? [0, -1, 0] : [1, 0, 0]),
    datum = id === 'ellipsa' ? [340, -350, 0] : [120, -230, 40];
  const first = r.track[0].bodies[o.base.id].position;
  const drift = max(r.track.map(f => norm(sub(f.bodies[o.base.id].position, first)) * 1000)),
    tilt = max(r.track.map(f => o.tilt(f)));
  assert.ok(drift <= (id === 'ellipsa' ? 5 : 1) && tilt <= 2, JSON.stringify({
    drift,
    tilt
  }));
  const project = (f, p) => {
    const d = sub(p, o.point(f, 'hub', datum));
    return [dot(d, X) * 1000, dot(d, Z) * 1000];
  };
  return {
    o,
    X,
    Z,
    N,
    project,
    j: r.mechanism.joints.find(j => j.motor)
  };
}
export function judgeEllipsa(r) {
  const {
    o,
    project,
    j
  } = frame(r, 'ellipsa');
  assert.equal(r.mechanism.bodies.filter(b => b.motion === 'dynamic').length, 4);
  assert.equal(r.mechanism.joints.filter(j => j.type === 'slider').length, 2);
  const s = r.track.map(f => {
    const A = project(f, o.point(f, 'motor_A')),
      B = project(f, o.point(f, 'carriage_b_keyed')),
      barA = project(f, o.point(f, 'trammel_bar', [0, 0, -60])),
      barB = project(f, o.point(f, 'trammel_bar', [0, 0, 20])),
      Q = project(f, o.point(f, 'trammel_bar', [0, 0, 60])),
      d = sub(barB, barA);
    return {
      t: f.t,
      A,
      B,
      Q,
      theta: Math.atan2(d[1], -d[0]),
      encoder: f.joints[j.id].angle,
      gap: o.gap(f),
      axis: o.axisGap(f)
    };
  });
  const theta = unwrap(s.map(p => p.theta)),
    phase = unwrap(s.map(p => Math.atan2(p.Q[1] / 48, -p.Q[0] / 16)));
  const error = max(s.map(p => norm(sub(p.Q, [-16 * Math.cos(p.theta), 48 * Math.sin(p.theta)])))),
    slideError = max(s.map(p => Math.max(norm(sub(p.A, [32 * Math.cos(p.theta), 0])), norm(sub(p.B, [0, 32 * Math.sin(p.theta)]))))),
    ellipse = max(s.map(p => Math.abs(Math.hypot(p.Q[0] / 16, p.Q[1] / 48) - 1))),
    angleError = max(s.map(p => Math.abs(deg(wrap(p.theta - p.encoder))))),
    closure = max(s.map(p => p.gap)),
    axis = max(s.map(p => p.axis));
  assert.ok(error <= .5 && slideError <= .5 && ellipse <= .04, JSON.stringify({
    error,
    slideError,
    ellipse
  }));
  assert.ok(angleError <= .5 && closure <= .5 && axis <= 1, JSON.stringify({
    angleError,
    closure,
    axis
  }));
  const barTravel = directions(theta),
    outputTravel = directions(phase);
  for (const t of [barTravel, outputTravel]) assert.ok(t.forward >= 718 && t.reverse >= 718, 'two independent circuits each direction');
  const spans = [0, 1].map(k => span(s.map(p => p.Q[k]))),
    slides = [span(s.map(p => p.A[0])), span(s.map(p => p.B[1]))];
  assert.ok(spans[0] >= 31 && spans[1] >= 95 && slides.every(x => x >= 63), 'actual ellipse and both passive slider strokes');
  let velocityError = 0,
    velocitySamples = 0;
  const fast = [],
    slow = [];
  for (let i = 1; i < s.length; i++) {
    const dt = (s[i].t - s[i - 1].t) / 1000,
      da = theta[i] - theta[i - 1],
      speed = Math.abs(deg(da) / dt);
    if (speed < 5) continue;
    const actual = sub(s[i].Q, s[i - 1].Q),
      expected = sub([-16 * Math.cos(theta[i]), 48 * Math.sin(theta[i])], [-16 * Math.cos(theta[i - 1]), 48 * Math.sin(theta[i - 1])]);
    velocityError = Math.max(velocityError, norm(sub(actual, expected)) / dt);
    velocitySamples++;
    if (speed >= 9 && speed <= 11) {
      const c = Math.abs(Math.cos(theta[i]));
      if (c >= Math.cos(5 * Math.PI / 180)) fast.push(norm(actual) / Math.abs(da));
      if (c <= Math.sin(5 * Math.PI / 180)) slow.push(norm(actual) / Math.abs(da));
    }
  }
  assert.ok(velocitySamples >= 500 && velocityError <= 1, JSON.stringify({
    velocitySamples,
    velocityError
  }));
  assert.ok(fast.length >= 10 && slow.length >= 10);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length,
    ratio = mean(fast) / mean(slow);
  assert.ok(Math.abs(mean(fast) - 48) <= 1 && Math.abs(mean(slow) - 16) <= 1 && ratio >= 2.8 && ratio <= 3.2);
  const returnMm = norm(sub(s.at(-1).Q, s[0].Q));
  assert.ok(returnMm <= 1 && Math.abs(deg(s.at(-1).encoder)) <= 2);
  return {
    outputErrorMm: error,
    slideErrorMm: slideError,
    ellipseResidual: ellipse,
    angleErrorDegrees: angleError,
    hingeGapMm: closure,
    axisErrorDegrees: axis,
    spansMm: spans,
    sliderSpansMm: slides,
    barTravel,
    outputTravel,
    velocityErrorMmPerSecond: velocityError,
    speedRatio: ratio,
    returnMm
  };
}
export function judgeOffsetOrbit(r) {
  const {
    o,
    N,
    Z,
    project,
    j
  } = frame(r, 'offset-orbit');
  const s = r.track.map(f => ({
    t: f.t,
    C: project(f, o.point(f, 'centre_marker')),
    input: o.angle(f, 'input_guide_1', N, Z),
    output: o.angle(f, 'output_shaft_hub', N, Z),
    middle: o.angle(f, 'centre_marker', N, Z),
    encoder: f.joints[j.id].angle,
    gap: o.gap(f),
    axis: o.axisGap(f)
  }));
  const input = unwrap(s.map(p => p.input)),
    output = unwrap(s.map(p => p.output)),
    orbit = unwrap(s.map(p => Math.atan2(p.C[1], p.C[0] - 8)));
  const passiveAxisTilt = max(r.track.map(f => deg(Math.acos(Math.max(-1, Math.min(1, dot(o.vector(f, 'output_shaft_hub', N), N)))))));
  assert.ok(passiveAxisTilt <= 2, 'passive output axis remains parallel');
  const phaseError = max(s.map((p, i) => Math.abs(deg(output[i] - input[i])))),
    markerError = max(s.map(p => norm(sub(p.C, [16 * Math.sin(p.input) ** 2, 16 * Math.sin(p.input) * Math.cos(p.input)])))),
    radiusError = max(s.map(p => Math.abs(Math.hypot(p.C[0] - 8, p.C[1]) - 8))),
    spans = [0, 1].map(k => span(s.map(p => p.C[k]))),
    closure = max(s.map(p => p.gap)),
    axis = max(s.map(p => p.axis));
  assert.ok(phaseError <= 2 && markerError <= 1 && radiusError <= 1, JSON.stringify({
    phaseError,
    markerError,
    radiusError
  }));
  assert.ok(spans.every(x => x >= 14) && closure <= .8 && axis <= 2, JSON.stringify({
    spans,
    closure,
    axis
  }));
  const inputTravel = directions(input),
    outputTravel = directions(output),
    orbitTravel = directions(orbit);
  for (const t of [inputTravel, outputTravel]) assert.ok(t.forward >= 700 && t.reverse >= 700, 'actual shaft turns');
  assert.ok(orbitTravel.forward >= 1400 && orbitTravel.reverse >= 1400, 'twice-round middle orbit');
  const encoderError = max(s.map(p => Math.abs(deg(wrap(p.input + p.encoder)))));
  assert.ok(encoderError <= 1);
  const returnMm = norm(sub(s.at(-1).C, s[0].C));
  assert.ok(returnMm <= 1 && Math.abs(deg(s.at(-1).encoder)) <= 1.5);
  return {
    passiveAxisTiltDegrees: passiveAxisTilt,
    phaseErrorDegrees: phaseError,
    markerErrorMm: markerError,
    radiusErrorMm: radiusError,
    spansMm: spans,
    inputTravel,
    outputTravel,
    orbitTravel,
    hingeGapMm: closure,
    axisErrorDegrees: axis,
    returnMm
  };
}
export const judgeOffsetEllipsa = (id, r) => id === 'ellipsa' ? judgeEllipsa(r) : judgeOffsetOrbit(r);
