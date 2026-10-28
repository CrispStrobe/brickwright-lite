// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Turntable (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M9): the two halves of a Technic
// turntable (the 60-tooth 18938 top / 18939 bottom) turn on each other about their
// common axis.
//
// Connector kinds 'turntable-ring' (the top half) and 'turntable-race' (the bottom
// half): LDraw draws the halves assembled on one origin, so each half's connector is
// that origin on the turntable's axis (scripts/derive-part-meta.mjs deriveTurntable).
// A ring and a race whose centres meet (0.5 LDU) on parallel axes (1°) are a 'hinge'
// edge: mech/joints.js makes the revolute joint, and the joint's bodies never collide
// (contracts.js noCollidePairs), as any jointed pair.
//
// The teeth are on the top half: its PartMeta `gear` is a spur gear of 60 teeth on the
// axis (module 1, like every Technic gear), so a pinion meshes with it through the
// ordinary gear rules (kinds/spur.js, mech/gears.js) — nothing turntable-specific. The
// common-frame rule applies as it is: the pinion's axle turns in the frame the bottom
// half is fixed to (the chassis), and the top half turns in that same frame through the
// turntable hinge, so both gears turn in one frame and the mesh couples them with
// ratio −z_pinion/z_turntable (signed by the geometry). A pinion carried by the TOP
// half's structure instead turns in the other frame: 'gear-frames-differ', as for any
// gear whose axle turns in a different part.
//
// The halves nest into each other (rings and clips interleave): their colliders, boxes
// and a cylinder around each half, overlap where the meshes do not. The coupling module
// below emits no coupling; its `placedMesh` is the editor's rule that a seated turntable's
// two halves may share that volume (editor/overlap.js solidOverlaps, as meshing gears do;
// test/bw-sim-models-solid.test.mjs checks the real meshes do not interpenetrate).

import {COS_1_DEG, vecDot, vecDist} from '../mech/vec.js';
import {placedTooth} from './tooth-parts.js';

const TOL = 0.5 + 1e-9;

/** A ring seated in a race: centres within 0.5 LDU, axes parallel (either sense) within 1°. */
export const turntableSeats = (ring, race) => vecDist(ring.position, race.position) <= TOL &&
    Math.abs(vecDot(ring.axis, race.axis)) >= COS_1_DEG - 1e-12;

const validate = c => (typeof c.length === 'number' && c.length > 0 ? [] : ['a turntable connector needs its height (LDU)']);

export const TURNTABLE_RING = {kind: 'turntable-ring', validate};

/** The pair rule lives on the race (the kind a registry tries as the "shaft" side, kinds/slide.js). */
export const TURNTABLE_RACE = {
    kind: 'turntable-race',
    validate,
    pairs: [{with: 'turntable-ring', edge: () => 'hinge', match: (race, ring) => turntableSeats(ring, race)}]
};

/** No coupling of its own: the seated halves' shared volume for the editor's overlap rule. */
export const TURNTABLE_NEST = {
    id: 'turntable',
    kind: 'turntable',
    detect: () => ({couplings: []}),
    placedMesh (a, metaA, b, metaB) {
        for (const [p, mp, q, mq] of [[a, metaA, b, metaB], [b, metaB, a, metaA]]) {
            const rings = placedTooth(p, mp, 'turntable-ring');
            if (!rings.length) continue;
            const races = placedTooth(q, mq, 'turntable-race');
            if (rings.some(r => races.some(s => turntableSeats(r.c, s.c)))) return true;
        }
        return false;
    }
};
