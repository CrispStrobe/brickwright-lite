#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Original assemblies from our own reference modules, inspired by revision 6 mechanics ideas.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseModel, serializeModel } from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import { catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { solidOverlaps } from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const root = new URL('../', import.meta.url);
const C = catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root))));
const read = p => parseModel(readFileSync(new URL(p, root), 'utf8'), {
  catalog: C
}).model;
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const UP = [0, 1, 0, 1, 0, 0, 0, 0, -1];
const X = [0, 0, 1, 0, 1, 0, -1, 0, 0];
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
const save = (m, id, title) => {
  const text = serializeModel(m, {
    name: `${id}.ldr`,
    title
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
  writeFileSync(new URL(`overlay/scratch-gui/static/sim-lab/models/${id}.ldr`, root), text);
  process.stdout.write(`${id}: ${m.parts.length} parts, ${p.mechanism.actuators.length} motors, connected and clear\n`);
};
// A horizontal serial arm. Shoulder-elbow = 200 LDU, elbow-tip = 160 LDU.
{
  const m = read('overlay/scratch-gui/static/sim-lab/models/crank-rocker.ldr');
  m.parts = m.parts.filter(p => ['motor', 'frame', 'framePin1', 'framePin2', 'crank', 'crankPin1', 'crankPin2', 'hub', 'hubPin-60', 'hubPin60'].includes(p.id));
  Object.assign(m.parts.find(p => p.id === 'crank'), {
    part: '32278.dat',
    position: [100, -60, 0],
    color: 4
  });
  add(m, 'elbowMotor', '54696p01.dat', [200, -100, 0], I, 71, 'B');
  for (const x of [180, 220]) add(m, `elbowMount${x}`, '2780.dat', [x, -70, 0], UP, 0);
  add(m, 'forearm', '32525.dat', [280, -160, 0], X, 1);
  for (const x of [180, 220]) add(m, `forearmPin${x}`, '2780.dat', [x, -150, 0], UP, 0);
  add(m, 'tip', '6558.dat', [360, -170, 0], UP, 14);
  // A pinned spread base carries the elbow motor through the full shoulder sweep.
  for (const x of [-60, 60]) {
    add(m, `armFoot${x}`, '32278.dat', [x, 140, 60], I, 72);
    for (const z of [0, 200]) add(m, `armFootPin${x}_${z}`, '2780.dat', [x, 130, z], UP, 0);
  }
  for (const z of [-60, 180]) {
    add(m, `armCrossFoot${z}`, '32278.dat', [0, 160, z], X, 72);
    for (const x of [-60, 60]) add(m, `armCrossPin${x}_${z}`, '2780.dat', [x, 150, z], UP, 0);
  }
  save(m, 'positioning-arm', 'Two-joint positioning arm — joint angles and reachable workspace');
}
// Three independent transmissions on one pinned bed: idlers, 1:15 compound, 1:243 compound.
{
  const m = {
    version: 1,
    parts: []
  };
  const fixtures = ['machines/gears-idler-24-24-24.ldr', 'machines/gears-compound-8-24-8-40.ldr', 'machines-2/gear-train-243.ldr'];
  for (let k = 0; k < 3; k++) {
    const source = read(`test/fixtures/bw-sim/${fixtures[k]}`);
    for (const p of source.parts) {
      const copy = structuredClone(p);
      copy.id = `lane${k}_${p.id}`;
      copy.position[2] += (k - 1) * 200;
      if (copy.port) copy.port = 'ABC'[k];
      // Common frame length gives two separated connections to the cross-bed.
      if (p.id === 'frame') Object.assign(copy, {
        part: '32278.dat',
        position: [100, 40, (k - 1) * 200]
      });
      m.parts.push(copy);
    }
  }
  for (const x of [-40, 220]) {
    for (const side of [-1, 1]) {
      add(m, `bed${x}_${side}`, '32278.dat', [x, 60, side * 160], I, 25);
      add(m, `bedOuterPin${x}_${side}`, '2780.dat', [x, 50, side * 200], UP, 0);
      for (const z of [40, 80]) add(m, `splicePin${x}_${side}_${z}`, '2780.dat', [x, 70, side * z], UP, 0);
    }
    add(m, `bedSplice${x}`, '32525.dat', [x, 80, 0], I, 25);
    add(m, `bedSpacer${x}`, '32523.dat', [x, 60, 0], X, 25);
    add(m, `bedCentrePin${x}`, '6558.dat', [x, 60, 0], UP, 0);
  }
  add(m, 'hub', '45601.dat', [60, 170, 0], X, 71);
  for (const z of [-60, 60]) add(m, `hubPin${z}`, '2780.dat', [-40, 90, z], UP, 0);
  save(m, 'ratio-workbench', 'Three-drive ratio workbench — idlers versus compound gearing');
}
// Horizontal rack shuttle from the original rack/guide reference module. No sensor or automatic-door claim.
{
  const m = read('overlay/scratch-gui/static/sim-lab/models/forklift.ldr');
  m.parts = m.parts.filter(p => !['forkLeft', 'forkRight', 'forkPin'].includes(p.id));
  m.parts.find(p => p.id === 'lift').port = 'A';
  // Rotate the whole rig around X: old vertical travel becomes horizontal table travel.
  const R = [1, 0, 0, 0, 0, -1, 0, 1, 0];
  const mv = (a, v) => [0, 1, 2].map(i => a[i * 3] * v[0] + a[i * 3 + 1] * v[1] + a[i * 3 + 2] * v[2]);
  const mm = (a, b) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => [0, 1, 2].reduce((s, k) => s + a[i * 3 + k] * b[k * 3 + j], 0)));
  for (const p of m.parts) {
    p.position = mv(R, p.position);
    p.rotation = mm(R, p.rotation);
  }
  add(m, 'tableBase', '32278.dat', [0, 120, -30], X, 72);
  for (const x of [-40, 40]) {
    add(m, `tableFoot${x}`, '32278.dat', [x, 140, -130], I, 72);
    add(m, `tableFootPin${x}`, '6558.dat', [x, 120, -30], UP, 0);
  }
  save(m, 'rack-shuttle', 'Rack shuttle table — rotary input and linear travel');
}
