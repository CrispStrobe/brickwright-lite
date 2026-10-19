// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Connector kind 'sensor-axlehole': the axle hole of the RCX rotation sensor
// (LDraw 72632; LEGO 2977). The hole is in a turning insert (LDraw 2978, the
// "Rotation Element") that the sensor's housing lets spin freely — the sensor
// counts its turns (devices/rcx-sensors.js, 16 per revolution). So an axle in
// it makes a HINGE edge between the axle and the sensor (an axle in an
// ordinary axle hole is rigid), and sensors.js reads that hinge's angle as
// the sensor's measurement (rotationJoint). The insert itself (a few tenths of
// a gram) is not a body of its own: it turns with the axle, which is all the
// sensor sees.
//
// Added, not edited into kinds/pin-axle.js (kinds/index.js: kinds are added,
// never edited).

import {shaftEngagement} from './pin-axle.js';

const axleInSensor = {
    with: 'axle',
    edge: () => 'hinge',
    // The axle is the shaft in the insert's hole: the v1 seat rule with the roles as they are.
    match: (hole, axle) => shaftEngagement(axle, hole) !== null
};

export const SENSOR_AXLEHOLE = {
    kind: 'sensor-axlehole',
    pairs: [axleInSensor],
    validate: c => (typeof c.length === 'number' && c.length > 0 ? [] : ['a sensor-axlehole needs its length (LDU)'])
};
