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
    if (got.type !== want.type || !axisSame(apply(rotation, got.axis), want.axis)) return false;
    const offset = sub(add(apply(rotation, got.position), translation), want.position);
    if (want.type !== 'rack-teeth') return same(offset, [0, 0, 0]);
    if (!got.data?.normal || !same(apply(rotation, got.data.normal), want.data.normal) ||
        !Number.isFinite(got.length) || !Number.isFinite(want.length) || got.length < want.length) return false;
    // Rack centres can differ along the tooth axis if the longer candidate
    // still covers the complete reference span. Lateral displacement cannot.
    const axisLength = dot(want.axis, want.axis);
    if (axisLength < EPS) throw new Error('reference tooth axis must be nonzero');
    const along = dot(offset, want.axis) / Math.sqrt(axisLength);
    const perpendicular = sub(offset, want.axis.map(x => x * along / Math.sqrt(axisLength)));
    return same(perpendicular, [0, 0, 0]) && Math.abs(along) <= (got.length - want.length) / 2 + EPS;
   }));
   if (compatible) matches.push({rotation, translation});
  }
 }
 return matches;
}

/**
 * Minimize the largest distinct-mount displacement while preserving tooth
 * contact and covering the reference span. Only translation along the aligned
 * tooth axis varies. This metadata screen does not prove a buildable mount.
 */
export function screenMountRedesign(reference, candidate, attachmentIds) {
 const teeth = reference.connectors.filter(c => c.type === 'rack-teeth');
 if (teeth.length !== 1 || !teeth[0].data?.normal) throw new Error('reference needs one oriented tooth connector');
 const mounts = attachmentIds.map(id => {
  const hits = reference.connectors.filter(c => c.id === id);
  if (hits.length !== 1) throw new Error('missing or duplicate reference connector: ' + id);
  return hits[0];
 });
 const target = teeth[0], results = [];
 const axisLength = Math.hypot(...target.axis);
 if (!Number.isFinite(axisLength) || axisLength < EPS) throw new Error('reference tooth axis must be nonzero and finite');
 if (!Number.isFinite(target.length) || target.length < 0) throw new Error('reference tooth length must be finite and nonnegative');
 const axis = target.axis.map(x => x / axisLength);
 for (const rotation of axisRotations()) for (const rack of candidate.connectors.filter(c => c.type === 'rack-teeth')) {
  if (!axisSame(apply(rotation, rack.axis), target.axis) || !rack.data?.normal ||
      !same(apply(rotation, rack.data.normal), target.data.normal) ||
      !Number.isFinite(rack.length) || rack.length < target.length) continue;
  const centreTranslation = sub(target.position, apply(rotation, rack.position));
  const halfSlack = (rack.length - target.length) / 2;
  const clamp = shift => Math.max(-halfSlack, Math.min(halfSlack, shift));
  const choices = mounts.map(want => candidate.connectors
   .map((c, index) => ({c, index}))
   .filter(({c}) => c.type === want.type && axisSame(apply(rotation, c.axis), want.axis))
   .map(({c, index}) => {
    const offset = sub(add(apply(rotation, c.position), centreTranslation), want.position);
    return {index, connectorId: c.id, offset, along: dot(offset, axis), squared: dot(offset, offset)};
   }));
  const distanceSquared = (choice, shift) => {
   const offset = add(choice.offset, axis.map(x => x * shift));
   return dot(offset, offset);
  };
  let best = null;
  const visit = (i, used, assignment) => {
   if (i === choices.length) {
    // Each squared distance has the same shift^2 term. Their maximum is a
    // convex, piecewise quadratic function. A minimum on this closed interval
    // is at an endpoint, a quadratic vertex, or a pairwise intersection.
    // Enumerate these points exactly rather than sample a translation grid.
    const shifts = [0, -halfSlack, halfSlack, ...assignment.map(x => clamp(-x.along))];
    for (let a = 0; a < assignment.length; a++) for (let b = a + 1; b < assignment.length; b++) {
     const left = assignment[a], right = assignment[b];
     const denominator = 2 * (left.along - right.along);
     if (denominator !== 0) {
      const shift = (right.squared - left.squared) / denominator;
      if (Number.isFinite(shift) && shift >= -halfSlack && shift <= halfSlack) shifts.push(shift);
     }
    }
    for (const shift of shifts) {
     const maxSquared = Math.max(0, ...assignment.map(x => distanceSquared(x, shift)));
     if (best && (maxSquared > best.maxSquared ||
         (maxSquared === best.maxSquared && Math.abs(shift) >= Math.abs(best.axialShiftLdu)))) continue;
     best = {maxSquared, axialShiftLdu: shift,
      maxDistanceLdu: Math.sqrt(maxSquared),
      assignment: assignment.map((x, j) => ({mountId: mounts[j].id, connectorId: x.connectorId,
       connectorIndex: x.index, distanceLdu: Math.sqrt(distanceSquared(x, shift))}))};
    }
    return;
   }
   for (const choice of choices[i]) {
    // The independently best position for this edge is a lower bound on any
    // complete assignment using it, so this pruning cannot remove an optimum.
    if (used.has(choice.index) || (best && distanceSquared(choice, clamp(-choice.along)) > best.maxSquared)) continue;
    used.add(choice.index);
    assignment.push(choice);
    visit(i + 1, used, assignment);
    assignment.pop();
    used.delete(choice.index);
   }
  };
  visit(0, new Set(), []);
  // Without a complete assignment, retain centre alignment for the independent
  // nearest distances. Those distances cannot substitute for a joint solution.
  const axialShiftLdu = best?.axialShiftLdu ?? 0;
  const translation = add(centreTranslation, axis.map(x => x * axialShiftLdu));
  const distances = choices.map((edges, i) => ({id: mounts[i].id,
   nearestLdu: edges.length ? Math.sqrt(Math.min(...edges.map(x => distanceSquared(x, axialShiftLdu)))) : null}));
  const bestDistinctAssignment = best ? {maxDistanceLdu: best.maxDistanceLdu, assignment: best.assignment} : null;
  results.push({rotation, translation, axialShiftLdu, allowedAxialShiftLdu: [-halfSlack, halfSlack],
   distances, bestDistinctAssignment});
 }
 return results;
}
