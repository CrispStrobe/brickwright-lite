// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Static connector screen only; this does not establish tooth pitch or buildability.
const EPS = 1e-7;
const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < EPS);
const neg = v => v.map(x => -x);
const axisSame = (a, b) => same(a, b) || same(a, neg(b));
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const apply = (basis, v) => [0, 1, 2].map(i => basis.reduce((s, col, j) => s + col[i] * v[j], 0));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

// All 24 axis-aligned proper rotations, without reflections or arbitrary angles.
export const axisRotations = () => {
 const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]], result = [];
 for (const x of dirs) for (const y of dirs) if (dot(x, y) === 0) result.push([x, y, cross(x, y)]);
 return result;
};

/** Find transformations preserving named attachment coordinates and tooth contact geometry. */
export function screenRack(reference, candidate, attachmentIds) {
 const requirements = attachmentIds.map(id => {
  const hits = reference.connectors.filter(c => c.id === id);
  if (hits.length !== 1) throw new Error('missing or duplicate reference connector: ' + id);
  return hits[0];
 });
 const teeth = reference.connectors.filter(c => c.type === 'rack-teeth');
 if (teeth.length !== 1 || !teeth[0].data?.normal) throw new Error('reference needs one oriented tooth connector');
 const target = [...requirements, teeth[0]], matches = [];
 for (const rotation of axisRotations()) {
  // Any valid solution aligns the first specified attachment to one candidate connector.
  for (const first of candidate.connectors.filter(c => c.type === target[0].type)) {
   const translation = sub(target[0].position, apply(rotation, first.position));
   const compatible = target.every(want => candidate.connectors.some(got => {
    if (got.type !== want.type || !same(add(apply(rotation, got.position), translation), want.position) ||
        !axisSame(apply(rotation, got.axis), want.axis)) return false;
    if (want.type !== 'rack-teeth') return true;
    return got.data?.normal && same(apply(rotation, got.data.normal), want.data.normal) && got.length >= want.length;
   }));
   if (compatible) matches.push({rotation, translation});
  }
 }
 return matches;
}

/** Screen unchanged tooth engagement while measuring how far each mount must move. */
export function screenMountRedesign(reference, candidate, attachmentIds) {
 const teeth = reference.connectors.filter(c => c.type === 'rack-teeth');
 if (teeth.length !== 1 || !teeth[0].data?.normal) throw new Error('reference needs one oriented tooth connector');
 const mounts = attachmentIds.map(id => {
  const hits = reference.connectors.filter(c => c.id === id);
  if (hits.length !== 1) throw new Error('missing or duplicate reference connector: ' + id);
  return hits[0];
 });
 const target = teeth[0], results = [];
 for (const rotation of axisRotations()) for (const rack of candidate.connectors.filter(c => c.type === 'rack-teeth')) {
  if (!axisSame(apply(rotation, rack.axis), target.axis) || !rack.data?.normal ||
      !same(apply(rotation, rack.data.normal), target.data.normal) || rack.length < target.length) continue;
  const translation = sub(target.position, apply(rotation, rack.position));
  const distances = mounts.map(want => {
   const choices = candidate.connectors.filter(c => c.type === want.type && axisSame(apply(rotation, c.axis), want.axis))
    .map(c => Math.hypot(...sub(add(apply(rotation, c.position), translation), want.position)));
   return {id: want.id, nearestLdu: choices.length ? Math.min(...choices) : null};
  });
  // Find one-to-one assignments, rather than counting the same candidate
  // connector for multiple mounts. Minimize the largest mount displacement;
  // this still does not establish clearance or a physically buildable mount.
  const choices = mounts.map(want => candidate.connectors
   .map((c, index) => ({c, index}))
   .filter(({c}) => c.type === want.type && axisSame(apply(rotation, c.axis), want.axis))
   .map(({c, index}) => ({index, connectorId: c.id,
    distanceLdu: Math.hypot(...sub(add(apply(rotation, c.position), translation), want.position))})));
  let best = null;
  const visit = (i, used, assignment) => {
   if (i === choices.length) {
    const maxDistanceLdu = Math.max(0, ...assignment.map(x => x.distanceLdu));
    if (!best || maxDistanceLdu < best.maxDistanceLdu) best = {maxDistanceLdu, assignment: [...assignment]};
    return;
   }
   for (const choice of choices[i]) {
    if (used.has(choice.index) || (best && choice.distanceLdu >= best.maxDistanceLdu)) continue;
    used.add(choice.index);
    assignment.push({mountId: mounts[i].id, connectorId: choice.connectorId, distanceLdu: choice.distanceLdu});
    visit(i + 1, used, assignment);
    assignment.pop();
    used.delete(choice.index);
   }
  };
  visit(0, new Set(), []);
  results.push({rotation, translation, distances, bestDistinctAssignment: best});
 }
 return results;
}
