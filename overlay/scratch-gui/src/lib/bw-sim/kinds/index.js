// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The built-in mechanism kinds (registry/kinds.js; docs/ROBOT-LAB-ARCHITECTURE.md
// §6.2): the v1 behaviour as the first modules. The compiler takes `kinds`
// (default: these), so a new connector or coupling kind is a module passed in
// with `withKinds(BUILTIN_KINDS, {...})` — never an edit to mech/.
//
//   connectors  pin-axle.js: pin, axle, stud, ball and their holes;
//               slide.js: 'slide-bore' (an axle slides through it: slider edge);
//               stud.js: 'tube' (a stud in an underside tube's bore: rigid clutch);
//               turntable.js: 'turntable-ring' + 'turntable-race' (the halves of a
//               turntable: hinge); screw.js: a linear actuator's 'screw-spindle' in
//               its 'screw-bearing' (hinge), 'la-rod' in 'la-bore' (slider), 'screw-nut'
//               worm.js 'worm' and rack.js 'rack-teeth': tooth connectors that
//               make couplings, not edges (R4)
//   couplings   spur.js, bevel.js: tooth meshes that make a 'gear' coupling
//               (mech/gears.js applies the shared frame rules);
//               worm.js: a worm and a spur wheel → 'worm' (self-locking);
//               rack.js: a rack and a spur pinion → 'rackAndPinion' (R4), both
//               free detectors run after the meshes, in this order;
//               relative-gear.js: 'relativeGear', a mesh relative to a frame that is not
//               both hinges' (mech/gears.js emits it);
//               transmission.js (gearbox lane): 'dogClutch' (a driving ring takes a
//               clutch gear) and 'shiftFork' (a changeover catch pushes the ring);
//               screw.js: a linear actuator's spindle and the nut of its piston →
//               'screw' (self-locking, with a slip clutch). turntable.js adds a module
//               that emits no coupling: a seated turntable's nesting halves (placedMesh);
//               chain.js: chain links round two or more spur gears → 'chain' (same sense)
//   gearbox     transmission.js: spline, spline-bore (slider), clutch, clutch-teeth,
//               fork, fork-groove; slip-clutch.js: clutch-axlehole (a slipping hinge);
//               gear-seat.js: gear-seat (a satellite in its cradle: hinge), snap (rigid)
//               chain.js 'chain-link': a chain link's pivots, a connector that makes a coupling
//   sensors     rotation-sensor.js: 'sensor-axlehole' (the RCX rotation sensor's turning
//               insert: an axle in it is a hinge the sensor reads)
//   joints      hinge, slider, ball — what the physics core builds today

import {ConnectorKindRegistry, CouplingKindRegistry, JointKindRegistry} from '../registry/kinds.js';
import {PIN_AXLE_KINDS} from './pin-axle.js';
import {SPUR} from './spur.js';
import {BEVEL} from './bevel.js';
import {SLIDE_BORE} from './slide.js';
import {WORM, WORM_THREAD} from './worm.js';
import {RACK, RACK_TEETH} from './rack.js';
import {TUBE} from './stud.js';
import {TURNTABLE_RING, TURNTABLE_RACE, TURNTABLE_NEST} from './turntable.js';
import {SCREW, SCREW_CONNECTORS} from './screw.js';
import {SPLINE, SPLINE_BORE, CLUTCH, CLUTCH_TEETH, FORK, FORK_GROOVE, DOG_CLUTCH, SHIFT_FORK} from './transmission.js';
import {CLUTCH_AXLEHOLE} from './slip-clutch.js';
import {GEAR_SEAT, SNAP} from './gear-seat.js';
import {RELATIVE_GEAR} from './relative-gear.js';
import {SENSOR_AXLEHOLE} from './rotation-sensor.js';
import {CHAIN, CHAIN_LINK} from './chain.js';

export const JOINT_KINDS = [
    {type: 'hinge', dof: 1},
    {type: 'slider', dof: 1},
    {type: 'ball', dof: 0}
];

/** @type {{connectors: ConnectorKindRegistry, couplings: CouplingKindRegistry, joints: JointKindRegistry}} */
export const BUILTIN_KINDS = Object.freeze({
    connectors: new ConnectorKindRegistry([...PIN_AXLE_KINDS, SLIDE_BORE, WORM_THREAD, RACK_TEETH, TUBE,
        SPLINE, SPLINE_BORE, CLUTCH, CLUTCH_TEETH, FORK, FORK_GROOVE, CLUTCH_AXLEHOLE, GEAR_SEAT, SNAP,
        TURNTABLE_RING, TURNTABLE_RACE, ...SCREW_CONNECTORS, SENSOR_AXLEHOLE, CHAIN_LINK]),
    couplings: new CouplingKindRegistry([SPUR, BEVEL, WORM, RACK, DOG_CLUTCH, SHIFT_FORK, RELATIVE_GEAR, SCREW, TURNTABLE_NEST, CHAIN]),
    joints: new JointKindRegistry(JOINT_KINDS)
});

/**
 * A kinds bundle with modules added to `base` (which stays as it is).
 * @param {typeof BUILTIN_KINDS} base
 * @param {{connectors?: object[], couplings?: object[], joints?: object[]}} add
 */
export const withKinds = (base, {connectors = [], couplings = [], joints = []} = {}) => Object.freeze({
    connectors: base.connectors.with(...connectors),
    couplings: base.couplings.with(...couplings),
    joints: base.joints.with(...joints)
});
