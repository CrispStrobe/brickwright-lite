// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The LEGO MINDSTORMS EV3 brick (LDraw 95646, "Electric Mindstorms EV3"; set 45500) as a
// HubProfile (hubs/hub-profile.js; docs/ROBOT-LAB-EV3-NXT.md). Pure data: the four outputs A–D
// and four inputs 1–4 the direct commands address — outputs by bit field (A = 1, B = 2, C = 4,
// D = 8) or number 0–3, inputs by number 0–3 (EV3 Firmware Developer Kit §4.8, §4.9; the
// Communication Developer Kit §4.2.3: "Sensor connected to port 3 (1-4 / 0-3 internal)").
// The EV3 identifies what is plugged in (its device type list, FDK §5): `ev3-autoid`.
//
// Drive: the firmware decides a PWM duty per port (regulated speed, or a power), so the ports
// take `pwm` drives (hubs/mindstorms-output.js). Clock: the Lab's 5 ms step.

import {HUB_SUPPLY_VOLTS} from '../../devices/catalog.js';

const label = (en, de) => Object.freeze({en, de});

const output = id => Object.freeze({
    id,
    label: label(`Output ${id}`, `Ausgang ${id}`),
    kind: 'ev3-output',
    accepts: Object.freeze(['motor']),
    supplyVolts: HUB_SUPPLY_VOLTS.ev3.volts,
    identifies: 'ev3-autoid'
});

const input = id => Object.freeze({
    id,
    label: label(`Input ${id}`, `Eingang ${id}`),
    kind: 'ev3-input',
    accepts: Object.freeze(['sensor-digital', 'sensor-passive', 'sensor-active']),
    supplyVolts: HUB_SUPPLY_VOLTS.ev3.volts,
    identifies: 'ev3-autoid'
});

/** @type {import('../hub-profile.js').HubProfile} */
export const EV3_PROFILE = Object.freeze({
    id: 'ev3',
    name: label('MINDSTORMS EV3', 'MINDSTORMS EV3'),
    parts: Object.freeze(['95646.dat']),
    ports: Object.freeze([...['A', 'B', 'C', 'D'].map(output), ...['1', '2', '3', '4'].map(input)]),
    internalDevices: Object.freeze([]),
    clock: Object.freeze({controllerStepMs: 5}),
    drive: 'pwm',
    // The EV3 blocks (ev3comprehensive, the stock `ev3`) send direct commands over the Scratch Link
    // BT-classic registry (lib/virtual-hub/bt-classic-registry.js) to this brick.
    routes: Object.freeze(['ev3-direct'])
});

export const EV3_OUTPUTS = Object.freeze(['A', 'B', 'C', 'D']);
export const EV3_INPUTS = Object.freeze(['1', '2', '3', '4']);
