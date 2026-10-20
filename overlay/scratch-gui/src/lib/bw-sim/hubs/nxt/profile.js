// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The LEGO MINDSTORMS NXT brick (LDraw 53788, "Electric Mindstorms NXT (Complete)"; set 8527/9797)
// as a HubProfile (hubs/hub-profile.js; docs/ROBOT-LAB-EV3-NXT.md). Pure data: three outputs A–C
// (direct commands number them 0–2, 0xFF = all) and four inputs 1–4 (0–3) — LEGO MINDSTORMS NXT
// Bluetooth Developer Kit, Appendix 2 (SETOUTPUTSTATE "Output port: Range: 0-2; 0xFF is special
// value 'All'", SETINPUTMODE "Input port: Range: 0-3"). The NXT does not identify its devices:
// a program says what is plugged in (SETINPUTMODE), so `identifies: 'none'`.

import {HUB_SUPPLY_VOLTS} from '../../devices/catalog.js';

const label = (en, de) => Object.freeze({en, de});

const output = id => Object.freeze({
    id,
    label: label(`Output ${id}`, `Ausgang ${id}`),
    kind: 'nxt-output',
    accepts: Object.freeze(['motor']),
    supplyVolts: HUB_SUPPLY_VOLTS.nxt.volts,
    identifies: 'none'
});

const input = id => Object.freeze({
    id,
    label: label(`Input ${id}`, `Eingang ${id}`),
    kind: 'nxt-input',
    accepts: Object.freeze(['sensor-passive', 'sensor-active', 'sensor-digital']),
    supplyVolts: HUB_SUPPLY_VOLTS.nxt.volts,
    identifies: 'none'
});

/** @type {import('../hub-profile.js').HubProfile} */
export const NXT_PROFILE = Object.freeze({
    id: 'nxt',
    name: label('MINDSTORMS NXT', 'MINDSTORMS NXT'),
    parts: Object.freeze(['53788.dat']),
    ports: Object.freeze([...['A', 'B', 'C'].map(output), ...['1', '2', '3', '4'].map(input)]),
    internalDevices: Object.freeze([]),
    clock: Object.freeze({controllerStepMs: 5}),
    drive: 'pwm',
    // The legonxt blocks' live route: direct-command telegrams over the Scratch Link BT-classic
    // registry to this brick. (Its compiled route — NXC on a hosted compiler → .rxe — is L2.)
    routes: Object.freeze(['nxt-direct'])
});

export const NXT_OUTPUTS = Object.freeze(['A', 'B', 'C']);
export const NXT_INPUTS = Object.freeze(['1', '2', '3', '4']);
