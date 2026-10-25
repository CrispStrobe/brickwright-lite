// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Original per-collider inertia calculation, without prototype fixture or clamp.
import assert from 'node:assert/strict';
const dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0);
const sub = (a, b) => a.map((n, i) => n - b[i]);
const norm = a => a.map(n => n / Math.hypot(...a));
const world = a => [a[0] * .0004, -a[1] * .0004, -a[2] * .0004];
function rotate(q, v) {
  const [x, y, z, w] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + y * t[2] - z * t[1],
    v[1] + w * t[1] + z * t[0] - x * t[2],
    v[2] + w * t[2] + x * t[1] - y * t[0]];
}

/** Independent rigid-body inertia from the original per-collider masses.
 * This reads the preparation result; it does not query a desired output or
 * change the Jolt mass/inertia. The reference point is the real hinge line.
 */
export function inertiaAboutAxis(body, point, axis) {
  const a = norm(axis);
  const rows = body.colliders.map(c => {
    assert.ok(c.massKg > 0, 'Each real collider must carry its own source part mass.');
    const m = c.massKg, q = c.rotation || [0, 0, 0, 1];
    const center = (c.position || [0, 0, 0]).map((v, i) => v + body.position[i]);
    let central;
    if (c.shape === 'box') {
      const h = c.halfExtents;
      const principal = [m * (h[1] ** 2 + h[2] ** 2) / 3,
        m * (h[0] ** 2 + h[2] ** 2) / 3, m * (h[0] ** 2 + h[1] ** 2) / 3];
      central = principal.reduce((s, I, i) => s + I * dot(a,
        rotate(q, [+(i === 0), +(i === 1), +(i === 2)])) ** 2, 0);
    } else if (c.shape === 'cylinder') {
      const parallel = m * c.radius ** 2 / 2;
      const perpendicular = m * (3 * c.radius ** 2 + 4 * c.halfHeight ** 2) / 12;
      const alignment = dot(a, rotate(q, [0, 1, 0])) ** 2;
      central = alignment * parallel + (1 - alignment) * perpendicular;
    } else {
      assert.equal(c.shape, 'sphere');
      central = .4 * m * c.radius ** 2;
    }
    const d = sub(center, point);
    const parallelAxis = m * (dot(d, d) - dot(d, a) ** 2);
    return {part: c.part, massKg: m, centerWorldM: center,
      centralInertiaKgM2: central, parallelAxisInertiaKgM2: parallelAxis,
      inertiaKgM2: central + parallelAxis};
  });
  const massKg = rows.reduce((s, r) => s + r.massKg, 0);
  assert.ok(Math.abs(massKg - body.massKg) < 1e-10);
  return {method: 'Sum of original primitive collider central moments and parallel-axis moments about the actual retained hinge.',
    bodyId: body.id, massKg, hingePointWorldM: point, hingeAxisWorld: a,
    inertiaKgM2: rows.reduce((s, r) => s + r.inertiaKgM2, 0), rows};
}
