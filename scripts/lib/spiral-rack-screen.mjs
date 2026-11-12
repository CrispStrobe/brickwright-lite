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
