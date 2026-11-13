// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {axisRotations, screenRack, screenMountRedesign} from '../scripts/lib/spiral-rack-screen.mjs';
const reference = {connectors: [
 {id:'left',type:'pinhole',position:[-10,0,0],axis:[0,1,0]},
 {id:'right',type:'pinhole',position:[10,0,0],axis:[0,1,0]},
 {id:'t',type:'rack-teeth',position:[0,-5,0],axis:[1,0,0],length:20,data:{normal:[0,-1,0]}}
]};
test('rack screen checks both mounts, tooth orientation and full reference length', () => {
 assert.equal(axisRotations().length, 24);
 assert.ok(screenRack(reference, structuredClone(reference), ['left','right']).length > 0);
 const wrongSpacing = structuredClone(reference); wrongSpacing.connectors[1].position[0] = 11;
 assert.equal(screenRack(reference, wrongSpacing, ['left','right']).length, 0);
 const short = structuredClone(reference); short.connectors[2].length = 19;
 assert.equal(screenRack(reference, short, ['left','right']).length, 0);
 const flipped = structuredClone(reference); flipped.connectors[2].data.normal = [1,0,0];
 assert.equal(screenRack(reference, flipped, ['left','right']).length, 0);
 assert.throws(() => screenRack(reference, reference, ['missing']), /reference connector/);
});

test('screen allows a rigidly shifted catalog origin but rejects displaced tooth contact', () => {
 const shifted = structuredClone(reference);
 for (const c of shifted.connectors) c.position = c.position.map((v, i) => v + [40,7,-3][i]);
 assert.ok(screenRack(reference, shifted, ['left','right']).some(x =>
  x.translation.some(v => Math.abs(v) > 0)), 'catalog origin is not assumed to be the model origin');
 const invalid = structuredClone(reference);
 invalid.connectors[2].position[1] = -6;
 assert.equal(screenRack(reference, invalid, ['left','right']).length, 0, 'tooth contact must also coincide');
});


test('redesign distances retain tooth alignment and report missing connector types', () => {
 const moved = structuredClone(reference); moved.connectors[1].position[0] += 3;
 const options = screenMountRedesign(reference, moved, ['left','right']);
 assert.ok(options.length > 0);
 assert.ok(options.some(x => x.distances[0].nearestLdu === 0 && x.distances[1].nearestLdu === 3));
 const missing = structuredClone(reference); missing.connectors = missing.connectors.filter(c => c.type !== 'pinhole');
 assert.ok(screenMountRedesign(reference, missing, ['left']).every(x => x.distances[0].nearestLdu === null));
 const short = structuredClone(reference); short.connectors[2].length = 19;
 assert.equal(screenMountRedesign(reference, short, ['left']).length, 0);
});


test('redesign requires a distinct connector for every mount', () => {
 const oneHole = structuredClone(reference);
 oneHole.connectors = oneHole.connectors.filter(c => c.id !== 'right');
 const options = screenMountRedesign(reference, oneHole, ['left','right']);
 assert.ok(options.length > 0);
 assert.ok(options.every(x => x.distances.every(d => d.nearestLdu !== null)));
 assert.ok(options.every(x => x.bestDistinctAssignment === null));
 const shifted = structuredClone(reference);
 shifted.connectors[1].position[0] += 3;
 assert.ok(screenMountRedesign(reference, shifted, ['left','right']).some(x =>
  x.bestDistinctAssignment?.maxDistanceLdu === 3 &&
  new Set(x.bestDistinctAssignment.assignment.map(a => a.connectorId)).size === 2));
});


test('a longer rack may shift along the tooth line only while covering the reference span', () => {
 const longer = structuredClone(reference);
 longer.connectors[2].length = 30;
 longer.connectors[2].position[0] = 3;
 assert.ok(screenRack(reference, longer, ['left','right']).length > 0);
 longer.connectors[2].position[0] = 6;
 assert.equal(screenRack(reference, longer, ['left','right']).length, 0);
 longer.connectors[2].position[0] = -5;
 assert.ok(screenRack(reference, longer, ['left','right']).length > 0, 'the exact span boundary is included');
 longer.connectors[2].position[0] = -5.1;
 assert.equal(screenRack(reference, longer, ['left','right']).length, 0);
 longer.connectors[2].position = [3,-4,0];
 assert.equal(screenRack(reference, longer, ['left','right']).length, 0);
});

const identityOption = (ref, candidate, ids = ['left', 'right']) =>
 screenMountRedesign(ref, candidate, ids).find(x =>
  JSON.stringify(x.rotation) === JSON.stringify([[1,0,0],[0,1,0],[0,0,1]]));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);
const movable = (left, right, length = 30) => {
 const c = structuredClone(reference);
 c.connectors[0].position = left;
 c.connectors[1].position = right;
 c.connectors[2].length = length;
 return c;
};

test('redesign uses an interior axial shift for an exact distinct-mount fit', () => {
 const option = identityOption(reference, movable([-13,0,0], [7,0,0]));
 near(option.axialShiftLdu, 3);
 assert.deepEqual(option.allowedAxialShiftLdu, [-5,5]);
 assert.deepEqual(option.translation, [3,0,0]);
 near(option.bestDistinctAssignment.maxDistanceLdu, 0);
 assert.ok(option.distances.every(x => x.nearestLdu === 0));
});

test('redesign clamps axial travel to full-span coverage, including its endpoints', () => {
 const option = identityOption(reference, movable([-18,0,0], [2,0,0]));
 near(option.axialShiftLdu, 5);
 near(option.bestDistinctAssignment.maxDistanceLdu, 3);
 const equal = identityOption(reference, movable([-18,0,0], [2,0,0], 20));
 near(equal.axialShiftLdu, 0);
 near(equal.bestDistinctAssignment.maxDistanceLdu, 8);
});

test('redesign balances mount displacement instead of optimizing one mount alone', () => {
 const option = identityOption(reference, movable([-9,0,0], [13,0,0]));
 near(option.axialShiftLdu, -2);
 near(option.bestDistinctAssignment.maxDistanceLdu, 1);
 assert.ok(option.bestDistinctAssignment.assignment.every(x => x.distanceLdu === 1));
});

test('redesign solves asymmetric transverse offsets at a pairwise quadratic crossing', () => {
 const option = identityOption(reference, movable([-12,0,0], [12,0,3]));
 near(option.axialShiftLdu, -1.125);
 near(option.bestDistinctAssignment.maxDistanceLdu, 3.125);
 assert.deepEqual(option.translation.slice(1), [0,0]);
});

test('redesign searches distinct connector permutations at the same shared shift', () => {
 const candidate = movable([7,0,0], [-13,0,0]);
 const option = identityOption(reference, candidate);
 near(option.axialShiftLdu, 3);
 near(option.bestDistinctAssignment.maxDistanceLdu, 0);
 assert.deepEqual(option.bestDistinctAssignment.assignment.map(x => x.connectorIndex), [1,0]);
});

test('redesign cannot remove transverse displacement by sliding along teeth', () => {
 const option = identityOption(reference, movable([-13,0,4], [7,0,4]));
 near(option.axialShiftLdu, 3);
 near(option.bestDistinctAssignment.maxDistanceLdu, 4);
 assert.deepEqual(option.translation, [3,0,0]);
});

test('redesign reports shifts in reference-axis coordinates after a rigid origin change', () => {
 const turn = v => [-v[1], v[0], v[2]];
 const ref = structuredClone(reference);
 const candidate = movable([-13,0,0], [7,0,0]);
 for (const obj of [ref, candidate]) for (const c of obj.connectors) {
  c.position = turn(c.position); c.axis = turn(c.axis);
  if (c.data?.normal) c.data.normal = turn(c.data.normal);
 }
 for (const c of candidate.connectors) c.position = c.position.map((x,i) => x + [40,7,-3][i]);
 candidate.connectors[2].axis = candidate.connectors[2].axis.map(x => -x);
 const option = identityOption(ref, candidate);
 near(option.axialShiftLdu, 3);
 assert.deepEqual(option.translation, [-40,-4,3]);
 near(option.bestDistinctAssignment.maxDistanceLdu, 0);
});

test('redesign validates finite tooth lengths and keeps missing assignments explicit', () => {
 for (const length of [undefined, NaN, Infinity, -1, 19]) {
  const candidate = movable([-10,0,0], [10,0,0]);
  candidate.connectors[2].length = length;
  assert.equal(screenMountRedesign(reference, candidate, ['left','right']).length, 0);
 }
 const ref = structuredClone(reference); ref.connectors[2].axis = [0,0,0];
 assert.throws(() => screenMountRedesign(ref, reference, ['left']), /axis/);
 const badLength = structuredClone(reference); badLength.connectors[2].length = NaN;
 assert.throws(() => screenMountRedesign(badLength, reference, ['left']), /length/);
 const missing = movable([-13,0,0], [7,0,0]); missing.connectors.splice(1,1);
 const option = identityOption(reference, missing);
 assert.equal(option.bestDistinctAssignment, null);
 near(option.axialShiftLdu, 0);
 assert.ok(option.distances.every(x => x.nearestLdu !== null));
 const empty = identityOption(reference, reference, []);
 near(empty.bestDistinctAssignment.maxDistanceLdu, 0);
 near(empty.axialShiftLdu, 0);
});

test('analytic shared-shift result bounds an independent exhaustive assignment/grid oracle', () => {
 // Two reference mounts, three candidate holes, six injective assignments and
 // 81 equally spaced shifts. This oracle does not use the analytic optimizer.
 let seed = 0x5235;
 const random = () => {seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 2 ** 32;};
 for (let trial = 0; trial < 30; trial++) {
  const candidate = movable([-10,0,0], [10,0,0]);
  candidate.connectors.push({id:'third', type:'pinhole', position:[0,0,0], axis:[0,1,0]});
  const holes = candidate.connectors.filter(c => c.type === 'pinhole');
  for (const c of holes) c.position = [Math.round(random()*40)-20, Math.round(random()*6)-3, Math.round(random()*6)-3];
  let sampled = Infinity;
  for (let step = 0; step <= 80; step++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
   if (a === b) continue;
   const shift = -5 + step / 8;
   const distances = [a,b].map((index,i) => Math.hypot(
    holes[index].position[0] + shift - reference.connectors[i].position[0],
    holes[index].position[1], holes[index].position[2]));
   sampled = Math.min(sampled, Math.max(...distances));
  }
  const option = identityOption(reference, candidate);
  const actual = option.bestDistinctAssignment.maxDistanceLdu;
  assert.ok(actual <= sampled + 1e-9, `trial ${trial}: analytic ${actual}, grid ${sampled}`);
  assert.ok(sampled - actual <= 0.0625 + 1e-9, `trial ${trial}: unexpected grid gap`);
  assert.ok(Math.abs(option.axialShiftLdu) <= 5);
  assert.equal(new Set(option.bestDistinctAssignment.assignment.map(x => x.connectorIndex)).size, 2);
  for (const assignment of option.bestDistinctAssignment.assignment) {
   const want = reference.connectors.find(c => c.id === assignment.mountId);
   const got = holes.find(c => c === candidate.connectors[assignment.connectorIndex]);
   near(assignment.distanceLdu, Math.hypot(...got.position.map((x,i) => x + option.translation[i] - want.position[i])));
  }
 }
});
