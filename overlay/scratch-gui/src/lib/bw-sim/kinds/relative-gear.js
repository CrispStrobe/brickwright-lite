// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Coupling kind 'relativeGear' (gearbox lane): a tooth mesh whose two gears turn
// relative to a frame F that holds both axes but is not the frame both of their
// hinges turn in — a clutch gear free on its axle in a gearbox, the satellites of a
// differential in their turning casing. mech/gears.js finds and emits these with
// the other meshes (it owns the frame rules every mesh shares); this module is the
// kind's registration: its validation, the two bodies it ties (no-collide), and the
// statement of what the physics core builds.
//
//   {gear1, gear2, frame}   the two gear bodies and the frame F
//   axis1, axis2            the gear axes (world, unit, fixed in F)
//   ratio                   (ω₂ − ω_F)·axis2 = ratio · (ω₁ − ω_F)·axis1 (Willis)
//   anchor1, anchor2        tooth points on gear 1 and gear 2 (world, m, at t = 0),
//                           one pitch radius from each gear's axis
//   tangent                 the teeth's common direction of motion there (world, unit)
//   carrier                 true when F turns about a gear axis (a planet carrier)
//   joint1, joint2          the gears' own hinges (for views); parts the two gears
//
// Physics (physics/jolt-core.js): the same tooth contact as every mesh — a Jolt
// GearMeshConstraint (the Brickwright fork of Jolt) between the two gear bodies at the
// pitch point, with ratio and axes as above. In a planet carrier both gears' hinges turn
// in F, and they are handed to the mesh: F carries the tooth reaction and the coupling is
// exact however F moves. In a chain (a gear on an axle turning, coaxially, in F) the gear's
// own hinge turns in that axle, so no hinges are handed over and the frames count as at
// rest — exact while F does not turn, as the gear constraint it replaces was. (Until
// 2026-10-19 a carrier mesh was a SixDOF contact re-made every step: it lagged without
// Jolt's warm start and needed 240 solver iterations.)

/** The no-op detector: mech/gears.js emits these couplings. */
const detect = () => ({couplings: []});

const isVec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);

export const RELATIVE_GEAR = {
    id: 'relative-gear',
    kind: 'relativeGear',
    detect,
    validate (c, m) {
        const out = [];
        const bodies = new Set(m.bodies.map(b => b.id));
        for (const k of ['gear1', 'gear2', 'frame']) if (!bodies.has(c[k])) out.push(`${k}: unknown body '${c[k]}'`);
        if (c.gear1 === c.gear2) out.push('a gear cannot mesh with itself');
        for (const k of ['axis1', 'axis2', 'tangent']) if (!(isVec(c[k]) && Math.abs(Math.hypot(...c[k]) - 1) < 1e-6)) out.push(`${k}: a unit Vec3`);
        for (const k of ['anchor1', 'anchor2']) if (!isVec(c[k])) out.push(`${k}: a Vec3 (m)`);
        if (!(typeof c.ratio === 'number' && Number.isFinite(c.ratio) && c.ratio !== 0)) out.push('ratio: a non-zero number');
        if (typeof c.carrier !== 'boolean') out.push('carrier: a boolean');
        return out;
    },
    bodies: c => [c.gear1, c.gear2]
};
