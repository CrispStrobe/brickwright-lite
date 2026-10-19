// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The LEGO MINDSTORMS RCX (LDraw 76454c02, the RCX 2.0; BrickLink 884) as a
// HubProfile (hubs/hub-profile.js; docs/ROBOT-LAB-ARCHITECTURE.md §5.1,
// docs/ROBOT-LAB-RCX.md). Pure data: the three outputs A–C and three inputs
// 1–3 programs address, as LEGO's "RCX 2.0 Firmware Command Overview"
// (2000-07-04) describes the virtual machine ("3 input ports, 3 output port,
// 1 sound unit, 1 LCD display unit"). Sound and display are not devices with
// physics: the VM records them as events (hubs/rcx/rcx-virtual-hub.js).
//
// Drive: the firmware drives a motor with eight power levels, an 8 ms on/float
// pattern per level (hubs/rcx/rcx-virtual-hub.js RCX_DUTY says where that is
// from), so the outputs take `pwm` drives. Clock: the physics step is 5 ms;
// the VM runs exactly up to the end of each step (routes/rcx-vm/rcx-vm.js
// advance), so its own instruction timing is kept, not rounded to the step.

import {HUB_SUPPLY_VOLTS} from '../../devices/catalog.js';

const label = (en, de) => Object.freeze({en, de});

const output = id => Object.freeze({
    id,
    label: label(`Output ${id}`, `Ausgang ${id}`),
    kind: 'rcx-output',
    accepts: Object.freeze(['motor', 'lamp']),
    // 6 AA cells (devices/catalog.js HUB_SUPPLY_VOLTS.rcx: the sag under load is not modelled).
    supplyVolts: HUB_SUPPLY_VOLTS.rcx.volts,
    pwmLevels: 8,
    identifies: 'none'
});

const input = id => Object.freeze({
    id,
    label: label(`Input ${id}`, `Eingang ${id}`),
    kind: 'rcx-input',
    accepts: Object.freeze(['sensor-passive', 'sensor-active']),
    // An active sensor (light, rotation) is powered from the same supply between readings.
    supplyVolts: HUB_SUPPLY_VOLTS.rcx.volts,
    identifies: 'none'
});

/** @type {import('../hub-profile.js').HubProfile} */
export const RCX_PROFILE = Object.freeze({
    id: 'rcx',
    name: label('MINDSTORMS RCX', 'MINDSTORMS-RCX'),
    parts: Object.freeze(['76454c02.dat']),
    ports: Object.freeze([...['A', 'B', 'C'].map(output), ...['1', '2', '3'].map(input)]),
    internalDevices: Object.freeze([]),
    clock: Object.freeze({controllerStepMs: 5}),
    drive: 'pwm',
    // NQC (blocks → NQC, the NQC tab) → nqc-wasm → .rcx → the bytecode VM (routes/rcx-vm/).
    routes: Object.freeze(['rcx-bytecode'])
});

/** The output ports (A–C) and input ports (1–3), in the VM's order. */
export const RCX_OUTPUTS = Object.freeze(['A', 'B', 'C']);
export const RCX_INPUTS = Object.freeze(['1', '2', '3']);
