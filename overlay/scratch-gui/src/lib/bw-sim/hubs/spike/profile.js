// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// SPIKE Prime (45601) as a HubProfile (hubs/hub-profile.js;
// docs/ROBOT-LAB-ARCHITECTURE.md §2.1, §5.1). Pure data: the six LPF2 ports
// the Scratch extension, the pseudocode and the SPIKE 3 Python conversion
// address, the IMU inside the hub, and the drive level of today's route —
// the JS motor controller (spike-sim/independent-backend.js) decides shaft
// speeds, so the ports take `servo` drives. Owner decision D5 moves SPIKE
// to `pwm` into a DC-motor model in its own slice after R3; that changes
// `drive` here and the adapter's readDrives(), nothing in the bridge.

const port = id => Object.freeze({
    id,
    label: Object.freeze({en: `Port ${id}`, de: `Port ${id}`}),
    kind: 'lpf2',
    accepts: Object.freeze(['motor', 'sensor-lpf2']),
    // ~ the 7.2 V nominal Li-ion pack (§2.1: 7.2–8.3 V); unused by the servo drive.
    supplyVolts: 7.2,
    identifies: 'lpf2-id'
});

/** @type {import('../hub-profile.js').HubProfile} */
export const SPIKE_PRIME_PROFILE = Object.freeze({
    id: 'spike-prime',
    name: Object.freeze({en: 'SPIKE Prime hub', de: 'SPIKE-Prime-Hub'}),
    parts: Object.freeze(['45601.dat']),
    ports: Object.freeze(['A', 'B', 'C', 'D', 'E', 'F'].map(port)),
    internalDevices: Object.freeze([Object.freeze({device: 'spike-imu', port: 'imu', body: 'hub'})]),
    clock: Object.freeze({controllerStepMs: 5}),
    drive: 'servo',
    // The routes that reach this hub in the Robot Lab today (§3.1, §3.5).
    routes: Object.freeze(['spikeprime-extension', 'spike-pseudocode', 'spike3-python'])
});
