// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Output observations carry real part points; predictions never supply poses.
import assert from 'node:assert/strict';
import { observeAddon } from './sim-lab-addon-judge.mjs';
const sub = (a, b) => a.map((x, i) => x - b[i]),
  norm = v => Math.hypot(...v),
  deg = x => x * 180 / Math.PI,
  wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
const unwrap = xs => {
  let last = xs[0],
    total = last;
  return xs.map(x => {
    total += wrap(x - last);
    last = x;
    return total;
  });
};
const span = xs => Math.max(...xs) - Math.min(...xs);
function healthy(r, ports) {
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.unsupported, []);
  assert.deepEqual(r.mechanism.actuators.map(a => a.port).sort(), ports);
  assert.ok(r.track.length > 500);
  for (const f of r.track) for (const p of Object.values(f.bodies)) assert.ok([...p.position, ...p.rotation].every(Number.isFinite));
}
export function judgeAmplify(r) {
  healthy(r, ['A']);
  const o = observeAddon(r),
    j = o.m.joints.find(j => j.motor),
    R = r.runModel.parts.find(p => p.id === 'origin_keyed').rotation,
    X = [R[0], -R[3], -R[6]],
    Z = [R[2], -R[5], -R[8]],
    project = v => [v.reduce((s, x, i) => s + x * X[i], 0), v.reduce((s, x, i) => s + x * Z[i], 0)],
    s = r.track.map(f => {
      const O = o.point(f, 'origin_keyed'),
        D = sub(o.point(f, 'input_bar', [0, 0, 60]), O),
        Q = sub(o.point(f, 'output_bar', [0, 0, 120]), O);
      return {
        t: f.t,
        d: project(D),
        q: project(Q),
        a: project(sub(o.point(f,'root_bar'),O)),
        b: project(sub(o.point(f,'root_bar',[0,0,120]),O)),
        c: project(sub(o.point(f,'output_bar'),O)),
        layers: [D[1],Q[1]],
        predicted: [.048+.016*Math.sin(f.joints[j.id].angle),.032+.016*Math.cos(f.joints[j.id].angle)],
        encoder: f.joints[j.id].angle,
        gap: o.gap(f),
        axis: o.axisGap(f),
        tilt: o.tilt(f)
      };
    });
  const angles = unwrap(s.map(p => Math.atan2(p.d[1] - .032, p.d[0] - .048))),
    scaling = Math.max(...s.map(p => norm(sub(p.q, p.d.map(x => 2 * x))) * 1000)),
    radius = Math.max(...s.map(p => Math.abs(Math.hypot(p.d[0] - .048, p.d[1] - .032) - .016) * 1000));
  let positive = 0,
    negative = 0,
    velocityError = 0,
    velocitySamples = 0, inputVelocityError=0, outputVelocityError=0;
  for (let i = 1; i < s.length; i++) {
    const delta = angles[i] - angles[i - 1],
      dt = (s[i].t - s[i - 1].t) / 1000;
    positive += Math.max(0, delta);
    negative += Math.max(0, -delta);
    if (Math.abs(deg(delta) / dt) >= 5) {
      const v = sub(sub(s[i].q, s[i - 1].q), sub(s[i].d, s[i - 1].d).map(x => 2 * x));
      velocityError = Math.max(velocityError, norm(v) * 1000 / dt);
      const predicted=sub(s[i].predicted,s[i-1].predicted);
      inputVelocityError=Math.max(inputVelocityError,norm(sub(sub(s[i].d,s[i-1].d),predicted))*1000/dt);
      outputVelocityError=Math.max(outputVelocityError,norm(sub(sub(s[i].q,s[i-1].q),predicted.map(x=>2*x)))*1000/dt);
      velocitySamples++;
    }
  }
  const gap = Math.max(...s.map(p => p.gap)),
    axis = Math.max(...s.map(p => p.axis)),
    returnMm = norm(sub(s.at(-1).q, s[0].q)) * 1000;
  const inputPredictionError=Math.max(...s.map(p=>norm(sub(p.d,p.predicted))*1000));
  const outputPredictionError=Math.max(...s.map(p=>norm(sub(p.q,p.predicted.map(x=>2*x)))*1000));
  const branch=Math.min(...s.map(p=>{const u=p.a,v=sub(p.d,p.a);return deg(Math.asin(Math.max(-1,Math.min(1,(u[0]*v[1]-u[1]*v[0])/(norm(u)*norm(v))))));}));
  const members=Math.max(...s.flatMap(p=>[[p.a,[0,0],48],[p.b,p.a,48],[p.c,p.b,48],[p.q,p.c,48],[p.d,p.a,48],[p.c,p.d,48]].map(([a,b,n])=>Math.abs(norm(sub(a,b))*1000-n))));
  const layerError=Math.max(...s.flatMap(p=>p.layers.map((v,i)=>Math.abs(v-s[0].layers[i])*1000)));
  assert.ok(inputPredictionError<=.5&&outputPredictionError<=.5,'actual paths follow the commanded input phase');
  assert.ok(branch>=45&&members<=.5&&layerError<=.5,'open branch, member lengths and fixed axial layers');
  assert.ok(inputVelocityError<=.5&&outputVelocityError<=1,'actual point velocities follow predicted finite move chords');
  assert.ok(scaling <= .5 && radius <= .3, 'actual 2:1 point geometry and 16 mm input circle');
  assert.ok(positive > 718 * Math.PI / 180 && negative > 718 * Math.PI / 180, 'two actual turns in each direction');
  assert.ok(velocitySamples >= 500 && velocityError <= .5, 'actual finite-move velocity doubles');
  assert.ok(gap <= .5 && axis <= 1 && Math.max(...s.map(p => p.tilt)) <= 2, 'hinge closure, parallel axes and freestanding base');
  assert.ok(returnMm <= 1, 'output returns to saved point');
  return {
    inputPredictionErrorMm:inputPredictionError,outputPredictionErrorMm:outputPredictionError,minimumBranchMarginDeg:branch,memberLengthErrorMm:members,axialLayerErrorMm:layerError,inputVelocityErrorMmPerSecond:inputVelocityError,outputVelocityErrorMmPerSecond:outputVelocityError,
    scalingErrorMm: scaling,
    inputRadiusErrorMm: radius,
    velocityScalingErrorMmPerSecond: velocityError,
    velocitySamples,
    forwardDeg: deg(positive),
    reverseDeg: deg(negative),
    hingeGapMm: gap,
    axisMismatchDeg: axis,
    returnErrorMm: returnMm
  };
}
export function judgeMomentumTwins(r) {
  healthy(r, ['A', 'B']);
  const o = observeAddon(r, 'yaw_bottom'),
    a = o.m.joints.find(j => j.motor?.port === 'A'),
    b = o.m.joints.find(j => j.motor?.port === 'B'),
    yaw = unwrap(r.track.map(f => o.angle(f, 'yaw_top', [0, 1, 0], [1, 0, 0]))),
    base = r.track[0].bodies[o.base.id],
    wheels = ['A_weight_1', 'B_weight_1'].map(id => unwrap(r.track.map((f, i) => wrap(o.angle(f, id, [0, 1, 0], [1, 0, 0]) - yaw[i])))),
    s = r.track.map((f, i) => ({
      t: f.t,
      a: deg(f.joints[a.id].angle),
      b: deg(f.joints[b.id].angle),
      yaw: deg(yaw[i]),
      wa: deg(wheels[0][i]),
      wb: deg(wheels[1][i]),
      f
    }));
  const ends = [],
    stages = [];
  let cursor = 0;
  for (const [ta, tb] of [[720, 720], [0, 0], [720, -720], [0, 0]]) {
    let start = cursor;
    while (start < s.length && Math.abs(s[start].a - ta) < 3 && Math.abs(s[start].b - tb) < 3) start++;
    let end = start;
    while (end < s.length && (Math.abs(s[end].a - ta) >= 1.5 || Math.abs(s[end].b - tb) >= 1.5)) end++;
    assert.ok(end < s.length, 'both physical motor targets reached');
    stages.push(s.slice(cursor, end + 1));
    ends.push(s[end]);
    cursor = end + 1;
  }
  const same = stages.slice(0, 2).map(stage => stage.at(-1).yaw - stage[0].yaw),
    opposite = stages.slice(2).map(stage => Math.max(...stage.map(p => Math.abs(p.yaw - stage[0].yaw))));
  assert.ok(same[0] * same[1] < 0 && same.every(v => Math.abs(v) > 20), 'same-spin torque turns the passive platform in opposite directions');
  assert.ok(opposite.every(v => v <= 3 && v / Math.max(...same.map(Math.abs)) <= .15), 'opposite rotor momenta cancel in both stages');
  for (let k = 0; k < 4; k++) {
    const stage = stages[k],
      travelA = stage.at(-1).wa - stage[0].wa,
      travelB = stage.at(-1).wb - stage[0].wb;
    assert.ok(Math.abs(travelA) > 700 && Math.abs(travelB) > 700, 'both wheels genuinely turn in every stage');
    let moving = 0,
      overlap = 0;
    for (let i = 1; i < stage.length; i++) {
      const da = Math.abs(stage[i].wa - stage[i - 1].wa) > .1,
        db = Math.abs(stage[i].wb - stage[i - 1].wb) > .1;
      if (da || db) moving++;
      if (da && db) overlap++;
    }
    assert.ok(moving >= 180 && overlap / moving >= .9, 'two motors move concurrently');
  }
  const drift = Math.max(...r.track.map(f => norm(sub(f.bodies[o.base.id].position, base.position)) * 1000));
  assert.ok(drift <= 1 && Math.max(...r.track.map(f => o.tilt(f))) <= 2, 'lower support remains stable');
  assert.ok(Math.abs(s.at(-1).a) < 3 && Math.abs(s.at(-1).b) < 3, 'rotors return home');
  return {
    sameSpinYawDeg: same,
    oppositePeakYawDeg: opposite,
    supportDriftMm: drift
  };
}
const area = p => Math.abs(p.reduce((a, v, i) => a + v[0] * p[(i + 1) % p.length][1] - v[1] * p[(i + 1) % p.length][0], 0)) / 2;
const signed = p => p.reduce((a, v, i) => a + v[0] * p[(i + 1) % p.length][1] - v[1] * p[(i + 1) % p.length][0], 0);
const side = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function clip(p, a, b, sign) {
  const q = [];
  for (let i = 0; i < p.length; i++) {
    const u = p[i],
      v = p[(i + 1) % p.length],
      d = sign * side(a, b, u),
      e = sign * side(a, b, v);
    if (d >= 0) q.push(u);
    if (d >= 0 !== e >= 0) {
      const t = d / (d - e);
      q.push(u.map((x, k) => x + t * (v[k] - x)));
    }
  }
  return q;
}
function subtractPolygon(p, cutter) {
  let inside = p;
  const outside = [];
  for (let i = 0; i < cutter.length && inside.length >= 3; i++) {
    const a = cutter[i],
      b = cutter[(i + 1) % cutter.length],
      q = clip(inside, a, b, -1);
    if (q.length >= 3 && area(q) > 1e-10) outside.push(q);
    inside = clip(inside, a, b, 1);
  }
  return outside;
}
function edgeDistance(a, b) {
  const v = sub(b, a),
    t = Math.max(0, Math.min(1, -(a[0] * v[0] + a[1] * v[1]) / (v[0] ** 2 + v[1] ** 2)));
  return Math.hypot(a[0] + t * v[0], a[1] + t * v[1]);
}
export function measureBloomGate(r) {
  const o = observeAddon(r),
    j = o.m.joints.find(j => j.motor),
    ids = ['blade_ne', 'blade_se', 'blade_sw', 'blade_nw'],
    corners = [[-60, 0, -60], [60, 0, -60], [60, 0, 60], [-60, 0, 60]],
    window = Array.from({
      length: 512
    }, (_, i) => [18.8 * Math.cos(i * 2 * Math.PI / 512), 18.8 * Math.sin(i * 2 * Math.PI / 512)]);
  let initialCorners;
  return r.track.map(f => {
    const centre = o.point(f, 'hub', [0, -150, 240]),
      plates = ids.map(id => {
        const p = corners.map(c => {
          const v = sub(o.point(f, id, c), centre);
          return [v[0] * 1000, v[2] * 1000];
        });
        return signed(p) < 0 ? p.reverse() : p;
      });
    const actualCorners=ids.flatMap(id=>corners.map(c=>sub(o.point(f,id,c),centre).map(x=>x*1000)));
    if(!initialCorners)initialCorners=actualCorners;
    let clear = [window];
    for (const plate of plates) clear = clear.flatMap(p => subtractPolygon(p, plate));
    const blocked = plates.some(p => p.every((a, i) => side(a, p[(i + 1) % p.length], [0, 0]) >= 0)),
      width = blocked ? 0 : 2 * Math.min(...plates.flatMap(p => p.map((a, i) => edgeDistance(a, p[(i + 1) % p.length]))));
    const angle = -f.joints[j.id].angle,
      ideal = 64 * (Math.cos(angle) + Math.sin(angle) - 1);
    return {
      t: f.t,
      angle,
      area: clear.reduce((s, p) => s + area(p), 0),
      width,
      idealWidth: Math.max(0, ideal),
      idealArea: Math.max(0, ideal) ** 2,
      phases: ids.map(id => o.angle(f, id, [0, 1, 0], [1, 0, 0])),
      cornerReturn:Math.max(...actualCorners.map((v,i)=>norm(sub(v,initialCorners[i])))),
      axialError:Math.max(...actualCorners.map((v,i)=>Math.abs(v[1]-initialCorners[i][1]))),
      gap: o.gap(f)
    };
  });
}
export function judgeBloomGate(r) {
  healthy(r, ['A']);
  const s = measureBloomGate(r),
    areaError = Math.max(...s.map(p => Math.abs(p.area - p.idealArea))),
    widthError = Math.max(...s.map(p => Math.abs(p.width - p.idealWidth))),
    peakArea = Math.max(...s.map(p => p.area)),
    peakWidth = Math.max(...s.map(p => p.width));
  const phaseError=Math.max(...s.flatMap(p=>p.phases.map(a=>Math.abs(deg(wrap(a-p.angle))))));
  const phaseSpread=Math.max(...s.map(p=>span(p.phases.map(deg))));
  assert.ok(phaseError<=1&&phaseSpread<=1,'all four actual blades retain their common phase');
  assert.ok(Math.max(...s.map(p=>p.axialError))<=1&&s.at(-1).cornerReturn<=1,'plate layers and actual corners return');
  assert.ok(areaError <= 5 && widthError <= 1, 'real finite plate polygons follow the nonlinear aperture curve');
  assert.ok(peakArea > 690 && peakWidth > 24, 'blades open a useful clear aperture');
  assert.ok(s.at(-1).area <= 1 && s.at(-1).width < 2, 'closed projected aperture after return');
  assert.ok(Math.max(...s.map(p => p.gap)) < .5, 'physical gear shaft hinge closure');
  return {
    bladePhaseErrorDeg:phaseError,bladePhaseSpreadDeg:phaseSpread,cornerReturnErrorMm:s.at(-1).cornerReturn,
    areaErrorMm2: areaError,
    widthErrorMm: widthError,
    peakAreaMm2: peakArea,
    peakClearWidthMm: peakWidth,
    finalAreaMm2: s.at(-1).area,
    finalClearWidthMm: s.at(-1).width
  };
}
export const judgeNewAddon = (id, r) => id === 'momentum-twins' ? judgeMomentumTwins(r) : id === 'bloom-gate' ? judgeBloomGate(r) : judgeAmplify(r);
