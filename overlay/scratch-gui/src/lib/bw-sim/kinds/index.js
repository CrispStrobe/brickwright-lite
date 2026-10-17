// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The built-in mechanism kinds (registry/kinds.js; docs/ROBOT-LAB-ARCHITECTURE.md
// §6.2): the v1 behaviour as the first modules. The compiler takes `kinds`
// (default: these), so a new connector or coupling kind is a module passed in
// with `withKinds(BUILTIN_KINDS, {...})` — never an edit to mech/.
//
//   connectors  pin-axle.js: pin, axle, stud, ball and their holes
//   couplings   spur.js, bevel.js: tooth meshes that make a 'gear' coupling
//               (mech/gears.js applies the shared frame rules);
//               rackAndPinion is a contract kind the core accepts (R3 builds it)
//               but no detector emits yet (R4)
//   joints      hinge, slider, ball — what the physics core builds today

import {ConnectorKindRegistry, CouplingKindRegistry, JointKindRegistry} from '../registry/kinds.js';
import {PIN_AXLE_KINDS} from './pin-axle.js';
import {SPUR} from './spur.js';
import {BEVEL} from './bevel.js';

export const JOINT_KINDS = [
    {type: 'hinge', dof: 1},
    {type: 'slider', dof: 1},
    {type: 'ball', dof: 0}
];

/** @type {{connectors: ConnectorKindRegistry, couplings: CouplingKindRegistry, joints: JointKindRegistry}} */
export const BUILTIN_KINDS = Object.freeze({
    connectors: new ConnectorKindRegistry(PIN_AXLE_KINDS),
    couplings: new CouplingKindRegistry([SPUR, BEVEL]),
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
