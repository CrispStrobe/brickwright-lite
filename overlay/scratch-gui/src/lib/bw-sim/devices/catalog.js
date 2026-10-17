// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Device models (docs/ROBOT-LAB-ARCHITECTURE.md §5.2): the electronic devices
// a part can BE — a motor, a sensor — as data, apart from the part's geometry.
// PartMeta v2 names its device by id (`device: 'spike-medium-angular'`,
// contracts.js), the compiler resolves the numbers from here into the
// CompiledMechanism's `actuators` and `devices`, and the hub reports `ids`.
//
// R2 holds exactly what PartMeta v1 held (motor stall torque and speed limit,
// the LPF2 id, the SPIKE sensor kind) and nothing invented: the DC-motor
// fields of §5.2 (nominalVolts, noLoadRadPerSec, frictionTorqueNm) arrive with
// the slice that measures or sources them (owner decision D6), which is why
// they are optional here. A probe's geometry (where a sensor looks from) is the
// PART's, so it stays in PartMeta (`probe`), not in the device.
//
// This module imports nothing: contracts.js, the compiler and the hubs may all
// read it.

/** Device classes (hubs/hub-profile.js PortSpec.accepts uses the same words). */
export const DEVICE_MODEL_CLASSES = Object.freeze(['motor', 'servo-motor', 'linear-actuator', 'lamp', 'sensor-passive',
    'sensor-active', 'sensor-digital', 'sensor-lpf2', 'pneumatic-valve-actuator']);

/** The v1 sensor kinds sensors.js measures (contracts.js SENSOR_KINDS), until the probe/encoder split. */
const SENSOR_MEASURES = Object.freeze(['distance', 'color', 'force']);

const V1_SOURCE = 'part-meta/parts.json v1 (LEGO published stall torque 18 / 38 Ncm; speed limits of SPIKE 3 as in docs/SPIKE-ARENA.md)';

/**
 * @typedef {object} DeviceModel
 * @property {string} id
 * @property {string} class            one of DEVICE_MODEL_CLASSES
 * @property {string[]} parts          LDraw files that are this device
 * @property {{lpf2?: number}} ids     what the hub reports for it
 * @property {string} source           where the numbers come from (required, §0 / D6)
 * @property {{stallTorqueNm: number, servoMaxDegPerSec: number, nominalVolts?: number,
 *             noLoadRadPerSec?: number, frictionTorqueNm?: number,
 *             encoder?: {countsPerRev: number, absolute: boolean}}} [motor]
 *           stallTorqueNm: the torque limit the hinge motor gets (v1 motor.maxTorqueNm);
 *           servoMaxDegPerSec: the controller's top speed (v1 motor.maxSpeedDegPerSec)
 * @property {{kind: 'distance'|'color'|'force', encoder: string}} [sensor]
 *           kind: what sensors.js measures today; encoder: the §5.2 encoder id it becomes
 */

/** @type {DeviceModel[]} */
export const DEVICE_MODELS = Object.freeze([
    {id: 'spike-medium-angular', class: 'motor', parts: ['54696p01.dat'], ids: {lpf2: 48}, source: V1_SOURCE,
        motor: {stallTorqueNm: 0.18, servoMaxDegPerSec: 1110}},
    {id: 'spike-large-angular', class: 'motor', parts: ['54675.dat'], ids: {lpf2: 49}, source: V1_SOURCE,
        motor: {stallTorqueNm: 0.38, servoMaxDegPerSec: 1050}},
    {id: 'spike-color', class: 'sensor-lpf2', parts: ['37308.dat'], ids: {lpf2: 61}, source: V1_SOURCE,
        sensor: {kind: 'color', encoder: 'spike-color'}},
    {id: 'spike-distance', class: 'sensor-lpf2', parts: ['37316.dat'], ids: {lpf2: 62}, source: V1_SOURCE,
        sensor: {kind: 'distance', encoder: 'spike-distance'}},
    {id: 'spike-force', class: 'sensor-lpf2', parts: ['37312.dat'], ids: {lpf2: 63}, source: V1_SOURCE,
        sensor: {kind: 'force', encoder: 'spike-force'}}
].map(d => Object.freeze(d)));

/** id → DeviceModel */
export const deviceModels = new Map(DEVICE_MODELS.map(d => [d.id, d]));

/** The catalogue device a v1 sensor kind is (the SPIKE sensors were the only ones). */
export const SPIKE_SENSOR_DEVICE = Object.freeze({color: 'spike-color', distance: 'spike-distance', force: 'spike-force'});

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {DeviceModel} d
 * @returns {string[]} problems; empty when valid
 */
export const validateDeviceModel = d => {
    if (!d || typeof d !== 'object') return ['device: not an object'];
    const out = [];
    const w = `device ${typeof d.id === 'string' && d.id ? d.id : '(no id)'}`;
    if (typeof d.id !== 'string' || !d.id) out.push(`${w}.id: missing`);
    if (!DEVICE_MODEL_CLASSES.includes(d.class)) out.push(`${w}.class: '${d.class}' is not one of ${DEVICE_MODEL_CLASSES.join('|')}`);
    if (!Array.isArray(d.parts)) out.push(`${w}.parts: a list of LDraw files`);
    if (!d.ids || typeof d.ids !== 'object') out.push(`${w}.ids: an object ({} when the hub reports nothing)`);
    else if (d.ids.lpf2 !== undefined && !Number.isInteger(d.ids.lpf2)) out.push(`${w}.ids.lpf2: an integer`);
    if (typeof d.source !== 'string' || !d.source) out.push(`${w}.source: say where the numbers come from`);
    if (d.motor !== undefined) {
        if (!(isNum(d.motor?.stallTorqueNm) && d.motor.stallTorqueNm > 0)) out.push(`${w}.motor.stallTorqueNm: need a positive number`);
        if (!(isNum(d.motor?.servoMaxDegPerSec) && d.motor.servoMaxDegPerSec > 0)) out.push(`${w}.motor.servoMaxDegPerSec: need a positive number`);
        for (const k of ['nominalVolts', 'noLoadRadPerSec', 'frictionTorqueNm']) {
            if (d.motor?.[k] !== undefined && !(isNum(d.motor[k]) && d.motor[k] >= 0)) out.push(`${w}.motor.${k}: need a number >= 0`);
        }
    }
    if (d.sensor !== undefined) {
        if (!SENSOR_MEASURES.includes(d.sensor?.kind)) out.push(`${w}.sensor.kind: '${d.sensor?.kind}' is not one of ${SENSOR_MEASURES.join('|')}`);
        if (typeof d.sensor?.encoder !== 'string' || !d.sensor.encoder) out.push(`${w}.sensor.encoder: missing`);
    }
    if ((d.motor === undefined) === (d.sensor === undefined)) out.push(`${w}: a device is a motor or a sensor (exactly one of motor, sensor)`);
    return out;
};
