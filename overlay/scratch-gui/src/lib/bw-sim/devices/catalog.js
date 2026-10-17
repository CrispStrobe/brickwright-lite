// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Device models (docs/ROBOT-LAB-ARCHITECTURE.md §5.2): the electronic devices
// a part can BE — a motor, a sensor — as data, apart from the part's geometry.
// PartMeta v2 names its device by id (`device: 'spike-medium-angular'`,
// contracts.js), the compiler resolves the numbers from here into the
// CompiledMechanism's `actuators` and `devices`, and the hub reports `ids`.
//
// R2 held exactly what PartMeta v1 held (motor stall torque and speed limit,
// the LPF2 id, the SPIKE sensor kind). The SPIKE motors now also carry the
// DC-motor fields of §5.2 (owner decision D5; physics/actuators.js `pwm`),
// each number with its source in `sources` (D6, who measures, is open). The
// DC fields stay optional for other motors. A probe's geometry (where a sensor looks from) is the
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
 *             noLoadRadPerSec?: number, frictionTorqueNm?: number, rotorInertiaKgM2?: number,
 *             encoder?: {countsPerRev: number, absolute: boolean}}} [motor]
 *           nominalVolts, noLoadRadPerSec, frictionTorqueNm, rotorInertiaKgM2: the DC model (D5)
 *           stallTorqueNm: the torque limit the hinge motor gets (v1 motor.maxTorqueNm);
 *           servoMaxDegPerSec: the controller's top speed (v1 motor.maxSpeedDegPerSec)
 * @property {object} [sources]      per motor field: {source, estimated?, community?}
 * @property {{kind: 'distance'|'color'|'force', encoder: string}} [sensor]
 *           kind: what sensors.js measures today; encoder: the §5.2 encoder id it becomes
 */

// DC-MOTOR MODEL (owner decision D5).
//
// The model at the output shaft (gearbox included) is the linear
// torque–speed line of a permanent-magnet DC motor,
//
//     τ = τs · (u − ω/ω0),   u = duty · V_supply / V_nominal  (duty clamped to ±1)
//
// which is τ = k_t·i with i = (u·V − k_e·ω)/R written in the two quantities a
// datasheet gives: τs = k_t·V/R (stall torque) and ω0 = V/k_e (no-load speed).
// Fitting the line through LEGO's published no-load and stall points puts
// the gearbox's losses inside it while the motor is driven (the published
// no-load speed is where the motor's torque equals its own friction). Check
// against LEGO's third published point, maximum efficiency: the line gives
// 149 rpm at 3.5 N·cm (published 135 rpm ± 15 %) for the medium motor and
// 119 rpm at 8 N·cm (published 135 rpm ± 15 %) for the large one — both
// inside LEGO's own tolerance, on opposite sides, so a straight line is as
// good as the data supports.
//
// Rotor inertia: the motor's rotor turns N times faster than the output, so
// it appears at the output as N²·J_rotor — for these motors the largest
// inertia a motor drives unless its load is heavy. LEGO publishes neither N
// nor J_rotor; Pybricks' system identification does publish the reflected
// value (see PYBRICKS_MODEL below), so it is a community measurement.
//
// Not modelled (no published numbers; D6): current limiting in the hub, the
// battery's charge level and sag under load, the friction's speed
// dependence (Pybricks models a cut-off near zero speed), backlash.


/**
 * Pybricks (MIT), pybricks-micropython lib/pbio/src/motor/servo_settings.c, observer models
 * model_technic_m_angular / model_technic_l_angular (identified on real motors), read with the
 * scalings of lib/pbio/src/observer.c (PRESCALE_ACCELERATION 85, PRESCALE_SPEED 858,
 * PRESCALE_VOLTAGE 178956; rates in mdeg/s, torques in µN·m, voltages in mV):
 *   reflected inertia  J = 85e-6 / d_torque_d_acceleration · (180000/π)  kg·m²
 *   back-EMF slope     b = 858e-6 / d_torque_d_speed · (180000/π)        N·m·s/rad
 *   torque per volt    k = 178956e-6 / d_torque_d_voltage · 1000          N·m/V
 *   friction           torque_friction · 1e-6                             N·m
 */
const PYBRICKS_MODEL = 'Pybricks (community measurement): pybricks-micropython lib/pbio/src/motor/servo_settings.c ' +
    'observer model, scaled per lib/pbio/src/observer.c';
const MDEG_PER_RAD = 180000 / Math.PI;
const pybricks = ({accel, speed, voltage, friction}) => ({
    rotorInertiaKgM2: 85e-6 / accel * MDEG_PER_RAD,
    backEmfNmsPerRad: 858e-6 / speed * MDEG_PER_RAD,
    stallTorqueAt72Nm: 178956e-6 / voltage * 1000 * 7.2,
    frictionTorqueNm: friction * 1e-6
});
/** Medium: d_torque_d_acceleration 16163, d_torque_d_speed 5903, d_torque_d_voltage 8071, torque_friction 21413. */
export const PYBRICKS_MEDIUM = Object.freeze(pybricks({accel: 16163, speed: 5903, voltage: 8071, friction: 21413}));
/** Large: d_torque_d_acceleration 3997, d_torque_d_speed 1919, d_torque_d_voltage 2872, torque_friction 23239. */
export const PYBRICKS_LARGE = Object.freeze(pybricks({accel: 3997, speed: 1919, voltage: 2872, friction: 23239}));

const RPM = 2 * Math.PI / 60;

/** LEGO Education's motor fact sheets (the SPIKE Prime technical specifications). */
const LEGO_MEDIUM_SHEET = 'LEGO Education, "Technic Medium Angular Motor" technical specification ' +
    '(techspecs_technicmediumangularmotor.pdf, linked from education.lego.com/en-us/product-resources/' +
    'spike-prime/downloads/technical-specifications; mirrored at static.rapidonline.com/pdf/70-6713_2.pdf): ' +
    'no load 185 RPM ± 15 %, 110 mA; stall 18 Ncm, 800 mA; "All performance data is based on a 7.2V power supply."';
const LEGO_LARGE_SHEET = 'LEGO Education SPIKE Prime technical specifications, "Motor Angular Grande (45602)" ' +
    '(Spanish edition, robotix.es/documentos/Especificaciones Tecnicas_SPIKE Prime (3).pdf; English sheet ' +
    'le_spike-prime_tech-fact-sheet_45602_1hy19.pdf on education.lego.com): no load 175 RPM ± 15 %, 135 mA; ' +
    'stall 25 Ncm, 1400 mA';
const LEGO_ENCODER = 'same sheets: rotation sensor 360 counts per revolution, accuracy ≤ ±3° (sensor + gear play), 100 Hz';
const SPIKE_PYTHON_SPEEDS = 'SPIKE 3 Python API (motor.run velocity ranges: medium ±1110, large ±1050 °/s), ' +
    'as already used by spike-sim/independent-backend.js MAX_DEG_PER_S';

/**
 * Gearbox friction at the output (applied while the H-bridge is off: coast): Pybricks'
 * torque_friction (PYBRICKS_MODEL). Cross-check from LEGO's own sheet: a DC motor at no
 * load draws the current whose torque balances its losses, so τf ≲ τs·I0/(Is − I0) —
 * 0.029 N·m (medium), 0.027 N·m (large), the same size (that bound also counts the
 * speed-dependent losses at full speed, so it is the larger).
 */
const currentBound = (stallTorqueNm, noLoadA, stallA) => stallTorqueNm * noLoadA / (stallA - noLoadA);

/**
 * A SPIKE angular motor's DeviceModel: R2's numbers (stallTorqueNm: the hinge's torque limit and
 * the DC model's τs; servoMaxDegPerSec: the controller's top speed) plus the DC model's (§5.2),
 * each with its source.
 */
const spikeMotor = ({id, parts, lpf2, v1StallNm, sheet, noLoadRpm, stallNcm, noLoadA, stallA, pyb, servoMaxDegPerSec}) => ({
    id, class: 'motor', parts, ids: {lpf2}, source: `${sheet}; ${PYBRICKS_MODEL}; ${V1_SOURCE}`,
    motor: {
        stallTorqueNm: v1StallNm,
        servoMaxDegPerSec,
        nominalVolts: 7.2,
        noLoadRadPerSec: noLoadRpm * RPM,
        encoder: {countsPerRev: 360, absolute: true},
        frictionTorqueNm: pyb.frictionTorqueNm,
        rotorInertiaKgM2: pyb.rotorInertiaKgM2
    },
    sources: {
        stallTorqueNm: v1StallNm === stallNcm / 100
            ? {source: sheet}
            : {source: `${V1_SOURCE}: ${v1StallNm} N·m, kept (PartMeta v2 migration pins it). The LEGO sheet says ` +
                `${stallNcm / 100} N·m, Pybricks' identified model ${pyb.stallTorqueAt72Nm.toFixed(2)} N·m at 7.2 V: the ` +
                'sources disagree (owner decision D6)', estimated: true},
        servoMaxDegPerSec: {source: SPIKE_PYTHON_SPEEDS},
        nominalVolts: {source: LEGO_MEDIUM_SHEET + ' (the 7.2 V test supply is stated on the medium motor\'s sheet; ' +
            'the large motor\'s sheet is assumed to use the same supply)', estimated: id !== 'spike-medium-angular'},
        noLoadRadPerSec: {source: sheet},
        encoder: {source: LEGO_ENCODER},
        frictionTorqueNm: {source: `${PYBRICKS_MODEL} (torque_friction); cross-check from the LEGO sheet's currents ` +
            `τs·I0/(Is − I0) = ${currentBound(stallNcm / 100, noLoadA, stallA).toFixed(4)} N·m`, community: true},
        rotorInertiaKgM2: {source: `${PYBRICKS_MODEL} (d_torque_d_acceleration); LEGO publishes neither the gear ` +
            'ratio nor the rotor inertia', community: true},
        crossCheck: {source: `${PYBRICKS_MODEL}: stall torque at 7.2 V ${pyb.stallTorqueAt72Nm.toFixed(3)} N·m, no-load ` +
            `speed ${(pyb.stallTorqueAt72Nm / pyb.backEmfNmsPerRad / RPM).toFixed(0)} rpm (LEGO: ${stallNcm / 100} N·m, ${noLoadRpm} rpm)`}
    }
});

/** @type {DeviceModel[]} */
export const DEVICE_MODELS = Object.freeze([
    // SPIKE medium angular motor (45603).
    spikeMotor({id: 'spike-medium-angular', parts: ['54696p01.dat'], lpf2: 48, v1StallNm: 0.18, sheet: LEGO_MEDIUM_SHEET,
        noLoadRpm: 185, stallNcm: 18, noLoadA: 0.110, stallA: 0.800, pyb: PYBRICKS_MEDIUM, servoMaxDegPerSec: 1110}),
    // SPIKE large angular motor (45602).
    spikeMotor({id: 'spike-large-angular', parts: ['54675.dat'], lpf2: 49, v1StallNm: 0.38, sheet: LEGO_LARGE_SHEET,
        noLoadRpm: 175, stallNcm: 25, noLoadA: 0.135, stallA: 1.400, pyb: PYBRICKS_LARGE, servoMaxDegPerSec: 1050}),
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
        for (const k of ['nominalVolts', 'noLoadRadPerSec', 'frictionTorqueNm', 'rotorInertiaKgM2']) {
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
