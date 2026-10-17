// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Connector kind 'slide-bore' (docs/ROBOT-LAB-ARCHITECTURE.md §5.3, M13): a
// smooth round bore an axle passes through and SLIDES in — the eyes of the
// smooth toggle joint 48496, made for an axle to run free in them. An axle
// through a slide-bore is a 'slider' edge (mech/joints.js turns the edges
// between two bodies into one slider joint, with its travel measured from the
// axle and what else sits on it); a pin in a slide-bore seats as it does in a
// pinhole (friction pin: rigid, frictionless pin: hinge).
//
// What the slider leaves out: a bore on an axle also TURNS about it (a
// cylindrical pair). The slider locks that turn. That is exact for a part on
// two parallel guide axles (the usual carriage); for a part on one axle the
// turn is locked here although nothing in the build would stop it — the same
// kind of simplification v1 makes the other way round (an axle in a pinhole
// is a hinge, its sliding locked). A cylindrical joint (Jolt SixDOF) is §5.3's.
//
// The pair rules live on THIS kind (the registry tries both connectors as the
// "shaft" side, mech/graph.js): kinds are added, never edited, so the v1
// pin and axle modules stay as they were moved (kinds/pin-axle.js). The graph
// edge then has a = the axle or pin (the "hole" side of the rule), b = the bore.

import {shaftEngagement} from './pin-axle.js';

const axleInBore = {
    with: 'axle',
    edge: () => 'slider',
    // The axle is the shaft that runs through the bore: the v1 seat test with the roles as they are.
    match: (bore, axle) => shaftEngagement(axle, bore) !== null
};

const pinInBore = {
    with: 'pin',
    // As pin + pinhole (kinds/pin-axle.js edgeKind): a friction pin holds, a frictionless one turns.
    edge: (bore, pin) => (pin.friction === false ? 'hinge' : 'rigid'),
    match: (bore, pin) => shaftEngagement(pin, bore) !== null
};

export const SLIDE_BORE = {
    kind: 'slide-bore',
    pairs: [axleInBore, pinInBore],
    validate: c => (typeof c.length === 'number' && c.length > 0 ? [] : ['a slide-bore needs its length (LDU)'])
};
