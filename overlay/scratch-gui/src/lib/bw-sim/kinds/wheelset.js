// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Connector kind 'wheel-axle': the axle of a wheelset built into a part (a train motor's bogie:
// LDraw 2894c01, 501bc01). It joins nothing: the wheels and their axle are inside the part, so
// the connector only names what turns with the part's internal hinge (PartMeta v2 internalJoints
// movingConnectors) — the driven wheelset (actuatedBy 'device') or a free one (actuatedBy 'none',
// contracts.js partFreeJoints), whose wheel colliders meet the floor and roll it along.
//
// Added, not edited into kinds/pin-axle.js (kinds/index.js: kinds are added, never edited).

export const WHEEL_AXLE = {
    kind: 'wheel-axle',
    pairs: [],
    validate: c => (typeof c.length === 'number' && c.length > 0 ? [] : ['a wheel-axle needs its length (LDU)'])
};
