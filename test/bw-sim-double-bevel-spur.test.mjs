// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogFrom } from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import { placedGearsMesh } from '../overlay/scratch-gui/src/lib/bw-sim/mech/gears.js';
import { validatePartMeta } from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
const C = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));
const pinion = {
  part: '32269.dat',
  position: [-100, -60, 0],
  rotation: [1, 0, 0, 0, 0, 1, 0, -1, 0]
};
const ring = {
  part: '18938.dat',
  position: [0, -70, 0],
  rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
};
test('declared double-bevel spur profile meshes the loom 20:60 parallel pair with overlapping tooth faces', () => {
  const a = C.get(pinion.part),
    b = C.get(ring.part);
  assert.ok(placedGearsMesh(pinion, a, ring, b));
  const legacy = structuredClone(a);
  delete legacy.gear.meshesAs;
  assert.equal(placedGearsMesh(pinion, legacy, ring, b), false, 'baseline rejects this supported tooth form');
  assert.equal(placedGearsMesh({
    ...pinion,
    position: [-110, -60, 0]
  }, a, ring, b), false, 'wrong centre distance');
  assert.equal(placedGearsMesh({
    ...ring,
    position: [0, -95, 0]
  }, b, pinion, a), false, 'separated tooth faces');
  assert.equal(placedGearsMesh({
    ...pinion,
    rotation: ring.rotation
  }, a, ring, b), false, 'perpendicular spur-ring is not a bevel pair');
});
test('gear profile declarations and widths are validated', () => {
  const a = structuredClone(C.get(pinion.part));
  assert.deepEqual(validatePartMeta(a), []);
  a.gear.meshesAs = ['spur'];
  assert.ok(validatePartMeta(a).some(x => x.includes('meshesAs')));
  a.gear.meshesAs = ['bevel', 'spur'];
  a.gear.faceWidthLdu = Infinity;
  assert.ok(validatePartMeta(a).some(x => x.includes('faceWidth')));
});
