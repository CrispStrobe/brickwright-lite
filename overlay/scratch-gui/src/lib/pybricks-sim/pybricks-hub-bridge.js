// SPDX-License-Identifier: BSD-3-Clause
// Keeps the Pybricks simulator and lite's virtual SPIKE hub
// (lib/virtual-hub/spike-hub-state.js) telling the same story.
//
// One hub, two programming routes: Scratch blocks reach the virtual hub
// through the SPIKE extension's protocol emulators; Python reaches the
// Pybricks simulator. The virtual hub's port setup is the source of truth for
// WHAT is plugged in and what the sensors see (it is what the Virtual SPIKE
// Prime panel edits), so it flows INTO the simulator. What the program DOES
// (light matrix, motor positions) flows back OUT, so the virtual hub's
// dashboard shows the Python run too.
//
// Units, stated once: distance in mm both sides; force in the panel is
// 0-100 % of the sensor's 10 N range; display pixels are 0-100 brightness;
// motor speed is written back as percent of 1000 deg/s.

import {PORTS} from './pybricks-hub-host.js';

const KIND = {motor: 'motor-m', distance: 'distance', color: 'color', force: 'force'};

// LEGO colour index (the SPIKE colour sensor's COLOR mode) to a surface RGB.
const LEGO_COLOR_RGB = {
    0: [10, 10, 10], 1: [200, 60, 170], 2: [120, 50, 200], 3: [20, 40, 220], 4: [40, 180, 230],
    5: [30, 200, 60], 6: [60, 200, 60], 7: [240, 220, 30], 8: [240, 140, 20], 9: [230, 20, 20], 10: [240, 240, 240]
};

/** Applies the virtual hub's ports, sensor values and IMU to the simulator. */
export const applyHubStateToSim = (host, data) => {
    if (!data) return;
    PORTS.forEach((port, i) => {
        const sensor = data.sensors?.[i];
        const kind = sensor ? KIND[sensor.kind] || 'none' : 'none';
        if (host.device(port) !== kind) host.setDevice(port, kind);
        if (!sensor) return;
        if (sensor.kind === 'distance') host.setDistance(port, Number(sensor.distance ?? -1));
        if (sensor.kind === 'force') host.setForce(port, Math.max(0, Math.min(100, Number(sensor.force) || 0)) / 10);
        if (sensor.kind === 'color') {
            const hasRgb = ['red', 'green', 'blue'].some(k => Number(sensor[k]) > 0);
            const [r, g, b] = hasRgb ? [sensor.red, sensor.green, sensor.blue].map(Number) :
                (LEGO_COLOR_RGB[Number(sensor.color)] || [0, 0, 0]);
            host.setColor(port, {r, g, b, ambient: Number(sensor.ambient) || undefined});
        }
    });
    if (data.imu) host.setOrientation({pitch: Number(data.imu.pitch) || 0, roll: Number(data.imu.roll) || 0, yaw: Number(data.imu.yaw) || 0});
    if (data.buttons) host.setButtons(data.buttons);
};

/** Writes the simulator's light matrix and motor positions into the virtual hub. */
export const mirrorSimToHubState = (host, hubState) => {
    if (!hubState?.data) return;
    const data = hubState.data;
    data.display = host.pixels();
    PORTS.forEach((port, i) => {
        if (!host.device(port).startsWith('motor')) return;
        const motor = data.motors[i];
        motor.position = Math.round(host.motorAngle(port));
        motor.speed = Math.max(-100, Math.min(100, Math.round(host.motorSpeed(port) / 10)));
    });
    hubState.changed();
};
