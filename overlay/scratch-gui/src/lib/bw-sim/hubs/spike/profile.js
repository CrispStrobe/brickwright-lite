// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// SPIKE Prime (45601) as a HubProfile (hubs/hub-profile.js;
// docs/ROBOT-LAB-ARCHITECTURE.md §2.1, §5.1). Pure data: the six LPF2 ports
// the Scratch extension, the pseudocode and the SPIKE 3 Python conversion
// address, the IMU inside the hub, and the drive level: since owner decision
// D5 the hub's motor controller (trajectory generator + encoder feedback,
// spike-motor-controller.js) outputs a PWM duty into each motor's DC model,
// so the ports take `pwm` drives (the ideal `servo` is a test fixture).

const port = id => Object.freeze({
    id,
    label: Object.freeze({en: `Port ${id}`, de: `Port ${id}`}),
    kind: 'lpf2',
    accepts: Object.freeze(['motor', 'sensor-lpf2']),
    // The battery's nominal voltage (LEGO's SPIKE Prime technical specifications: 2100 mAh / 7.3 V
    // Li-ion; the motors' published figures are at 7.2 V). Charge level and sag under load are not
    // modelled: the DC model scales the duty by 7.2/7.2.
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
    drive: 'pwm',
    // The routes that reach this hub in the Robot Lab today (§3.1, §3.5).
    routes: Object.freeze(['spikeprime-extension', 'spike-pseudocode', 'spike3-python'])
});
