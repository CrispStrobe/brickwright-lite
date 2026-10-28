// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Synthetic parts for tests. Geometry simple but dimensionally right
// (hole pitch 20 LDU, beam 20 LDU thick, gear pitch radius = pitchRadiusLdu).
// All parts valid per validatePartMeta.

import {pitchRadiusLdu} from '../../../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

export const makeCatalog = () => {
    const cat = new Map();

    // Beam with 5 pinholes along X, axis Z, length 20, pitch 20
    cat.set('test-beam5.dat', {
        part: 'test-beam5.dat',
        name: 'Test beam 5',
        category: 'beam',
        massGrams: 2.0,
        connectors: [
            {id: 'h0', type: 'pinhole', position: [-40, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 'h1', type: 'pinhole', position: [-20, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 'h2', type: 'pinhole', position: [0, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 'h3', type: 'pinhole', position: [20, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 'h4', type: 'pinhole', position: [40, 0, 0], axis: [0, 0, 1], length: 20},
        ],
        colliders: [{shape: 'box', halfExtents: [50, 10, 10]}],
    });

    // Beam with 3 holes for 3-hole tests, also collinear test beam with 2 holes along Z
    cat.set('test-beam-collinear.dat', {
        part: 'test-beam-collinear.dat',
        name: 'Test beam collinear 2 holes',
        category: 'beam',
        massGrams: 1.5,
        connectors: [
            {id: 'h0', type: 'pinhole', position: [0, 0, -10], axis: [0, 0, 1], length: 20},
            {id: 'h1', type: 'pinhole', position: [0, 0, 10], axis: [0, 0, 1], length: 20},
        ],
        colliders: [{shape: 'box', halfExtents: [20, 10, 10]}],
    });

    // Axle 4 (80 LDU length)
    cat.set('test-axle4.dat', {
        part: 'test-axle4.dat',
        name: 'Test axle 4',
        category: 'axle',
        massGrams: 0.5,
        connectors: [{id: 'ax0', type: 'axle', position: [0, 0, 0], axis: [0, 0, 1], length: 80}],
        colliders: [{shape: 'cylinder', radius: 2, halfHeight: 40}],
    });

    // Pin with friction (rigid)
    cat.set('test-pin.dat', {
        part: 'test-pin.dat',
        name: 'Test pin',
        category: 'pin',
        massGrams: 0.2,
        connectors: [{id: 'p0', type: 'pin', position: [0, 0, 0], axis: [0, 0, 1], length: 40}],
        colliders: [{shape: 'cylinder', radius: 2.5, halfHeight: 20}],
    });

    // Pin frictionless (hinge)
    cat.set('test-pin-free.dat', {
        part: 'test-pin-free.dat',
        name: 'Test pin free',
        category: 'pin',
        massGrams: 0.2,
        connectors: [{id: 'p0', type: 'pin', position: [0, 0, 0], axis: [0, 0, 1], length: 40, friction: false}],
        colliders: [{shape: 'cylinder', radius: 2.5, halfHeight: 20}],
    });

    // Gear 8T spur
    cat.set('test-gear8.dat', {
        part: 'test-gear8.dat',
        name: 'Test gear 8T',
        category: 'gear',
        massGrams: 0.4,
        connectors: [{id: 'c', type: 'axlehole', position: [0, 0, 0], axis: [0, 0, 1], length: 10}],
        colliders: [{shape: 'cylinder', radius: pitchRadiusLdu(8), halfHeight: 4}],
        gear: {type: 'spur', teeth: 8, axis: [0, 0, 1], center: [0, 0, 0]},
    });

    // Gear 24T spur
    cat.set('test-gear24.dat', {
        part: 'test-gear24.dat',
        name: 'Test gear 24T',
        category: 'gear',
        massGrams: 1.0,
        connectors: [{id: 'c', type: 'axlehole', position: [0, 0, 0], axis: [0, 0, 1], length: 10}],
        colliders: [{shape: 'cylinder', radius: pitchRadiusLdu(24), halfHeight: 4}],
        gear: {type: 'spur', teeth: 24, axis: [0, 0, 1], center: [0, 0, 0]},
    });

    // Motor with housing collider and output collider split
    cat.set('test-motor.dat', {
        part: 'test-motor.dat',
        name: 'Test motor',
        category: 'motor',
        massGrams: 10,
        connectors: [
            {id: 'out', type: 'axle', position: [0, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 'h0', type: 'pinhole', position: [10, 0, 0], axis: [0, 0, 1], length: 10},
        ],
        colliders: [
            {shape: 'box', halfExtents: [15, 10, 10]},
            {shape: 'cylinder', radius: 3, halfHeight: 5},
        ],
        motor: {output: ['out'], outputColliders: [1], maxTorqueNm: 0.18, maxSpeedDegPerSec: 600},
    });

    // Bevel 12T
    cat.set('test-bevel12.dat', {
        part: 'test-bevel12.dat',
        name: 'Test bevel 12T',
        category: 'gear',
        massGrams: 0.6,
        connectors: [{id: 'c', type: 'axlehole', position: [0, 0, 0], axis: [0, 0, 1], length: 10}],
        colliders: [{shape: 'cylinder', radius: pitchRadiusLdu(12), halfHeight: 4}],
        gear: {type: 'bevel', teeth: 12, axis: [0, 0, 1], center: [0, 0, 0]},
    });

    // Bevel 20T
    cat.set('test-bevel20.dat', {
        part: 'test-bevel20.dat',
        name: 'Test bevel 20T',
        category: 'gear',
        massGrams: 0.9,
        connectors: [{id: 'c', type: 'axlehole', position: [0, 0, 0], axis: [0, 0, 1], length: 10}],
        colliders: [{shape: 'cylinder', radius: pitchRadiusLdu(20), halfHeight: 4}],
        gear: {type: 'bevel', teeth: 20, axis: [0, 0, 1], center: [0, 0, 0]},
    });

    // Corner block: one pinhole along Z and one along X (offset), so two
    // perpendicular beams can be pinned into one rigid frame (bevel tests).
    cat.set('test-corner.dat', {
        part: 'test-corner.dat',
        name: 'Test corner block',
        category: 'connector',
        massGrams: 0.5,
        connectors: [
            {id: 'z', type: 'pinhole', position: [0, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 'x', type: 'pinhole', position: [5, 0, 25], axis: [1, 0, 0], length: 20},
        ],
        colliders: [{shape: 'box', halfExtents: [10, 10, 20], position: [0, 0, 12]}],
    });

    // 24T with a ROUND hole: it turns freely on an axle (gear-on-body1 sign test).
    cat.set('test-gear24-round.dat', {
        part: 'test-gear24-round.dat',
        name: 'Test gear 24T round hole',
        category: 'gear',
        massGrams: 1.0,
        connectors: [{id: 'c', type: 'pinhole', position: [0, 0, 0], axis: [0, 0, 1], length: 10}],
        colliders: [{shape: 'cylinder', radius: pitchRadiusLdu(24), halfHeight: 4}],
        gear: {type: 'spur', teeth: 24, axis: [0, 0, 1], center: [0, 0, 0]},
    });

    // Frame block with a fixed axle stub at x=0 and a pinhole at x=-40, both along Z.
    cat.set('test-stub-frame.dat', {
        part: 'test-stub-frame.dat',
        name: 'Test stub frame',
        category: 'beam',
        massGrams: 2.0,
        connectors: [
            {id: 'stub', type: 'axle', position: [0, 0, 0], axis: [0, 0, 1], length: 30},
            {id: 'h', type: 'pinhole', position: [-40, 0, 0], axis: [0, 0, 1], length: 20},
        ],
        colliders: [{shape: 'box', halfExtents: [30, 10, 10], position: [-20, 0, -15]}],
    });

    // Worm (for unsupported test) - not required but add
    cat.set('test-worm.dat', {
        part: 'test-worm.dat',
        name: 'Test worm',
        category: 'gear',
        massGrams: 0.5,
        connectors: [{id: 'c', type: 'axlehole', position: [0, 0, 0], axis: [0, 0, 1], length: 10}],
        colliders: [{shape: 'cylinder', radius: 5, halfHeight: 10}],
        gear: {type: 'worm', teeth: 1, axis: [0, 0, 1], center: [0, 0, 0]},
    });

    // Ballsocket beam (for ball joint test)
    cat.set('test-ballsocket-beam.dat', {
        part: 'test-ballsocket-beam.dat',
        name: 'Test ballsocket beam',
        category: 'beam',
        massGrams: 2.0,
        connectors: [{id: 's0', type: 'ballsocket', position: [0, 0, 0], axis: [0, 0, 1], length: 10}],
        colliders: [{shape: 'box', halfExtents: [10, 10, 10]}],
    });

    // Ball
    cat.set('test-ball.dat', {
        part: 'test-ball.dat',
        name: 'Test ball',
        category: 'other',
        massGrams: 0.8,
        connectors: [{id: 'b0', type: 'ball', position: [0, 0, 0], axis: [0, 0, 1]}],
        colliders: [{shape: 'sphere', radius: 8}],
    });

    return cat;
};
