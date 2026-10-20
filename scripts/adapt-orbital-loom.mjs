#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Adapt the owner's supplied CC BY 4.0 prototype; never execute its accompanying controller.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseModel, serializeModel } from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import { catalogFrom, prepareModel } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { mat3MulVec3, vecSub } from '../overlay/scratch-gui/src/lib/bw-sim/mech/vec.js';
const source = process.argv[2];
const output = process.argv[3];
if (!source || !output) throw Error('Usage: adapt-orbital-loom.mjs supplied-bricks-only.mpd output.ldr');
const bytes = readFileSync(source);
if (createHash('sha256').update(bytes).digest('hex') !== 'd2e22ef40af389d6e1580b3ace65968e390fd6eadac0488aee318adddbb0f539') {
  throw Error('Source differs from the reviewed CC BY 4.0 prototype');
}
const catalog = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));
// The c01 LDraw assembly denotes the same SPIKE hub; use the app's existing device-aware catalogue entry.
const {
  model,
  refusals
} = parseModel(bytes.toString('utf8').replaceAll('45601c01.dat', '45601.dat'), {
  catalog
});
if (refusals.length) throw Error(JSON.stringify(refusals));
const renamed = new Map();
for (const p of model.parts) {
  let id;
  if (p.part === '45601.dat') id = 'hub';
  if (p.part === '54696p01.dat') {
    id = p.position[1] < -400 ? 'penMotor' : 'tableMotor';
    p.port = id === 'tableMotor' ? 'A' : 'B';
  }
  if (p.part === '18938.dat') id = 'platter';
  if (p.part === '18939.dat') id = 'bearing';
  if (p.part === '91405.dat') id = 'paperPlate';
  if (p.id.startsWith('07_pen_holder') && p.part === '40490.dat') id = 'penRail';
  if (p.id.startsWith('07_pen_holder') && p.part === '32316.dat') id = 'penCrank';
  if (id) {
    renamed.set(p.id, id);
    p.id = id;
  }
}
if (model.steps) model.steps = model.steps.map(s => s.map(id => renamed.get(id) || id));
// Opposing short pins originally shared eight bores. One 3L pin spans each three-layer stack.
const pairedPins = [['01_base.ldr#13_14', '01_base.ldr#13_20'], ['01_base.ldr#13_19', '01_base.ldr#13_21'], ['01_base.ldr#13_25', '01_base.ldr#13_31'], ['01_base.ldr#13_30', '01_base.ldr#13_32'], ['03_gantry.ldr#19_8', '03_gantry.ldr#19_12'], ['03_gantry.ldr#19_16', '03_gantry.ldr#19_20'], ['03_gantry.ldr#19_24', '03_gantry.ldr#19_28'], ['03_gantry.ldr#19_32', '03_gantry.ldr#19_36']];
const removed = new Set();
for (const [a, b] of pairedPins) {
  const p = model.parts.find(p => p.id === a);
  const q = model.parts.find(p => p.id === b);
  if (!p || !q) throw Error(`Missing mounting stack ${a}/${b}`);
  p.position = p.position.map((v, i) => (v + q.position[i]) / 2);
  p.part = '6558.dat';
  p.color = 1;
  removed.add(b);
}
model.parts = model.parts.filter(p => !removed.has(p.id));
if (model.steps) model.steps = model.steps.map(s => s.filter(id => !removed.has(id))).filter(s => s.length);
// The original 4L axle over-inserts the SPIKE rotor's blind bore; 3L retains both half bushes.
model.parts.find(p => p.id === '02_table_drive.ldr#16_26').part = '4519.dat';
// Frictionless 2L pins clear the frame's bore relief; four separated axes still locate the bearing rigidly.
for (const n of [36, 37, 38, 39]) {
  const p = model.parts.find(p => p.id === `01_base.ldr#13_${n}`);
  p.part = '3673.dat';
  p.color = 71;
}
const local = (id, point) => {
  const p = model.parts.find(p => p.id === id);
  if (!p) throw Error(id);
  const r = p.rotation;
  const transpose = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
  return mat3MulVec3(transpose, vecSub(point, p.position));
};
// Virtual ordinary supplies: positions match the supplied marker nib and paper plane.
model.drawings = [{
  surface: 'paperPlate',
  pen: 'penRail',
  tip: local('penRail', [120, -116.5, -40]),
  center: local('paperPlate', [0, -116.5, 0]),
  radiusLdu: 150
}];
// Replace the source's coarse subassembly stages with the app's connected pins-first manual.
delete model.steps;
model.attribution = {
  author: 'OpenAI; adapted by Brickwright contributors',
  license: 'Licensed under CC BY 4.0 : see ../licenses/orbital-loom.txt'
};
let text = serializeModel(model, {
  name: 'orbital-loom.ldr',
  title: 'ORBITAL LOOM — two-motor epicycle drawing machine'
});
text = text.replace('0 !LDRAW_ORG Unofficial_Model', '0 !LDRAW_ORG Unofficial_Model\r\n0 // Credit: ORBITAL LOOM, OpenAI, 2026.\r\n0 // Changes: canonical hub, explicit ports/IDs, shared mounting pins, clearance pins, shorter drive axle, live virtual paper/marker attachments.\r\n0 // No supplied preview ink is included; the simulator traces actual body motion.');
const p = prepareModel(text, catalog, {
  mat: 'plain'
});
const unexpected = p.issues.filter(i => i.code !== 'locked-hinges');
if (unexpected.length || p.model.parts.length !== 202 || p.mechanism.actuators.length !== 2) throw Error(JSON.stringify(p.issues));
if (!p.mechanism.gears.length) throw Error('Paper drive is not geared');
writeFileSync(output, text.replaceAll('\r\n', '\n'));
process.stdout.write(JSON.stringify({
  pieces: p.model.parts.length,
  gears: p.mechanism.gears,
  issues: p.issues
}) + '\n');
