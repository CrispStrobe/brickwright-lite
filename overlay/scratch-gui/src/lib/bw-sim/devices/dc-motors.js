// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The DC-motor view of the device catalogue (devices/catalog.js holds the
// numbers and their sources): which DC model a motorised hinge's actuator
// drives. physics/actuators.js and the hub adapters read it.

import {deviceModels} from './catalog.js';

/** SPIKE medium / large angular motor DeviceModels (devices/catalog.js). */
export const SPIKE_MEDIUM_ANGULAR = deviceModels.get('spike-medium-angular');
export const SPIKE_LARGE_ANGULAR = deviceModels.get('spike-large-angular');

/** Whether a DeviceModel carries the DC model's numbers. */
export const hasDcModel = d => !!(d && d.motor && d.motor.noLoadRadPerSec > 0 && d.motor.stallTorqueNm > 0);

/**
 * The DC model an actuator drives: its catalogue device (CompiledMechanism v2 `actuators[].device`,
 * or the LPF2 id of a v1 `joint.motor`) when that carries DC numbers; else one built from the
 * actuator's own limits (torque limit as τs, top speed as ω0, no friction, no rotor), marked
 * estimated: those numbers were never a datasheet's.
 * @param {{device?: string|null, deviceId?: number, ids?: {lpf2?: number}, maxTorqueNm: number, maxSpeedRadPerSec: number}} actuator
 */
export const dcMotorFor = actuator => {
    const byId = actuator && typeof actuator.device === 'string' ? deviceModels.get(actuator.device) : null;
    if (hasDcModel(byId)) return byId;
    const lpf2 = actuator && (actuator.ids?.lpf2 ?? actuator.deviceId);
    for (const d of deviceModels.values()) if (hasDcModel(d) && lpf2 !== undefined && d.ids.lpf2 === lpf2) return d;
    return Object.freeze({
        id: 'actuator-limits',
        class: 'motor',
        parts: Object.freeze([]),
        ids: Object.freeze(lpf2 === undefined ? {} : {lpf2}),
        source: 'the actuator\'s own limits (maxTorqueNm as stall torque, maxSpeedRadPerSec as no-load speed)',
        estimated: true,
        motor: Object.freeze({
            nominalVolts: 7.2,
            noLoadRadPerSec: actuator.maxSpeedRadPerSec,
            stallTorqueNm: actuator.maxTorqueNm,
            frictionTorqueNm: 0,
            rotorInertiaKgM2: 0,
            servoMaxDegPerSec: actuator.maxSpeedRadPerSec * 180 / Math.PI
        })
    });
};
