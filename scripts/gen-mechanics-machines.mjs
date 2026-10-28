#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Original motorised machines built from our own reference modules and physical part geometry.
// Inspiration: four_bar_crank_rocker, parallelogram_platform, screw_linear_actuator,
// counterweighted_crane and steering_models in the owner's mechanics idea catalogue.
// No third-party CAD is copied. Refuse disconnected or overlapping generated models.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseModel, serializeModel } from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import { catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { solidOverlaps } from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const root = new URL('../', import.meta.url);
const C = catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root))));
const read = p => parseModel(readFileSync(new URL(p, root), 'utf8'), {
  catalog: C
}).model;
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1],
  UP = [0, 1, 0, 1, 0, 0, 0, 0, -1];
const add = (m, id, part, position, rotation = I, color = 72, port) => m.parts.push({
  id,
  part,
  position,
  rotation,
  color,
  ...(port ? {
    port
  } : {})
});
const save = (m, id) => {
  const text = serializeModel(m, {
    name: id + '.ldr',
    title: id + ' — Brickwright motorised mechanics'
  });
  const p = prepareModel(text, C, {
    mat: 'plain'
  });
  const overlaps = p.model.parts.flatMap(x => solidOverlaps(p.model, C, x).map(o => [x.id, o.part]));
  if (p.issues.length || overlaps.length) throw new Error(JSON.stringify({
    id,
    issues: p.issues,
    overlaps
  }));
  writeFileSync(new URL('overlay/scratch-gui/static/sim-lab/models/' + id + '.ldr', root), text);
  process.stdout.write(`${id}: ${m.parts.length} parts, ${p.mechanism.actuators.length} motors, connected and clear\n`);
};
const hub = m => {
  add(m, 'hub', '45601.dat', [0, 130, 100], I, 71);
  for (const x of [-60, 60]) add(m, 'hubPin' + x, '2780.dat', [x, 50, 0], UP, 0);
};
const four = read('test/fixtures/bw-sim/machines/four-bar-crank-rocker.ldr');
hub(four);
save(four, 'crank-rocker');
// Equal 80 LDU side links and 100 LDU ground/coupler pivots keep the tray level.
const para = structuredClone(four);
const theta = -Math.PI / 2,
  cs = Math.cos(theta),
  sn = Math.sin(theta);
const R = [sn, 0, cs, 0, 1, 0, -cs, 0, sn];
for (const p of para.parts) {
  if (p.id === 'crank') {
    p.part = '40490.dat';
    p.rotation = R;
  }
  if (p.id === 'crankPin1' || p.id === 'crankPin2') {
    const s = p.id.endsWith('1') ? 1 : -1;
    p.position = [s * 20 * cs, -50, s * 20 * sn];
  }
  if (p.id === 'pinB') p.position = [80 * cs, -70, 80 * sn];
  if (p.id === 'coupler') {
    p.position = [80 * cs + 60, -80, 80 * sn];
    p.rotation = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  }
  if (p.id === 'pinC') p.position = [100 + 80 * cs, -90, 80 * sn];
  if (p.id === 'rocker') {
    p.part = '40490.dat';
    p.position = [100, -100, 0];
    p.rotation = R;
  }
}
// Braced physical stops prevent crossing the parallelogram's flat change points.
for (const side of [-1, 1]) {
  add(para, 'travelStop' + side, '32524.dat', [side * 60, 0, -20], [0, 1, 0, 0, 0, 1, 1, 0, 0]);
  add(para, 'stopSpacer' + side, '32523.dat', [side * 40, 0, -20], [0, 1, 0, 0, 0, 1, 1, 0, 0]);
  for (const y of [-20, 20]) add(para, 'stopPin' + side + '_' + y, '6558.dat', [side * 40, y, -20], I, 0);
}
const T = [1, 0, 0, 0, 0, 1, 0, -1, 0];
const mv = (a, v) => [0, 1, 2].map(i => a[i * 3] * v[0] + a[i * 3 + 1] * v[1] + a[i * 3 + 2] * v[2]);
const mm = (a, b) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => [0, 1, 2].reduce((s, k) => s + a[i * 3 + k] * b[k * 3 + j], 0)));
for (const p of para.parts) {
  p.position = mv(T, p.position);
  p.rotation = mm(T, p.rotation);
}
save(para, 'parallel-lift');
// A two-axis screw crane, reusing the proven slew and boom modules, on wide outriggers.
const ex = read('overlay/scratch-gui/static/sim-lab/models/excavator.ldr');
const from = ex.parts.findIndex(p => p.id === 'ttBottom'),
  until = ex.parts.findIndex(p => p.id === 'stick');
const crane = {
  version: 1,
  parts: [ex.parts[0], ...ex.parts.slice(from, until)].filter(p => !['castor', 'castorPin', 'ball'].includes(p.id))
};
const motor = crane.parts.find(p => p.id === 'boomMotor');
motor.port = 'A';
for (const z of [-120, 120]) {
  add(crane, 'outrigger' + z, '32278.dat', [0, -10, z], [0, 0, 1, 1, 0, 0, 0, 1, 0], 25);
  for (const x of [-40, 40]) {
    // The existing 3L slewPinLo joins hub, rear outrigger and motor at this bore.
    // Reuse it: a second pin would occupy the same hole.
    if (z === 120 && x === 40) continue;
    add(crane, 'basePin' + z + '_' + x, '2780.dat', [x, -10, z > 0 ? z - 10 : z + 10], [0, 0, -1, 0, 1, 0, 1, 0, 0], 0);
  }
}
save(crane, 'screw-crane');

// Wagon-style pivot steering; free half-shafts allow independent front wheel speeds.
{
  const m = read('overlay/scratch-gui/static/sim-lab/models/driving-base.ldr');
  m.parts = m.parts.filter(p => !['castor', 'ball'].includes(p.id));
  const Z = [0, 0, -1, 0, 1, 0, 1, 0, 0],
    X = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  const put = (id, ...args) => add(m, id, ...args);
  put('steerMotor', '54696p01.dat', [0, -10, -280], [-1, 0, 0, 0, -1, 0, 0, 0, 1], 71, 'C');
  for (const x of [-20, 20]) {
    put('steerMount' + x, '2780.dat', [x, -10, -130], Z, 0);
    put('bogiePin' + x, '2780.dat', [x, 40, -280], UP, 0);
  }
  put('bogieBeam', '32525.dat', [0, 50, -280], X, 25);
  // Offset brackets provide round horizontal bearings: each front wheel has its own free half-shaft.
  for (const side of [-1, 1]) {
    const s = side < 0 ? 'L' : 'R';
    put('bogieSpacer' + s, '32523.dat', [side * 100, 30, -280], I, 25);
    put('bogieSpacerPin' + s, '2780.dat', [side * 100, 40, -280], UP, 0);
    put('bogieDropPin' + s, '43093.dat', [side * 100, 20, -260], [0, -1, 0, -1, 0, 0, 0, 0, -1], 0);
    put('bogieDrop' + s, '42003.dat', [side * 100, 10, -240], [0, 0, 1, 1, 0, 0, 0, 1, 0], 72);
    put('bogieAxle' + s, '4519.dat', [side * 120, 10, -240], I, 4);
    put('wheelFront' + s, '39367p01.dat', [side * 140, 10, -240], X, 15);
  }
  save(m, 'pivot-rover');
}
