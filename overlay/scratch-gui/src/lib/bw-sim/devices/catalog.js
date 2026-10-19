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
// the LPF2 id, the SPIKE sensor kind). Every motor now carries the DC-motor
// model of §5.2 (owner decision D5; physics/actuators.js `pwm`) fitted to
// Philo's published measurements (owner decision D6), each number with its
// source in `sources`; besides the two SPIKE motors (the only ones with parts
// today) the catalogue holds the other motors he measured, ready for their
// hubs. A probe's geometry (where a sensor looks from) is the PART's, so it
// stays in PartMeta (`probe`), not in the device.
//
// This module imports nothing: contracts.js, the compiler and the hubs may all
// read it.

/** Device classes (hubs/hub-profile.js PortSpec.accepts uses the same words). */
export const DEVICE_MODEL_CLASSES = Object.freeze(['motor', 'servo-motor', 'linear-actuator', 'lamp', 'sensor-passive',
    'sensor-active', 'sensor-digital', 'sensor-lpf2', 'pneumatic-valve-actuator']);

/**
 * What sensors.js measures for a device (contracts.js SENSOR_KINDS): the v1 kinds and
 * 'rotation' (the RCX rotation sensor: the turn of the axle through its hole, read from the
 * hinge the compiler made there — sensors.js rotationJoint).
 */
const SENSOR_MEASURES = Object.freeze(['distance', 'color', 'force', 'rotation', 'tilt', 'proximity', 'gyro']);

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
 *             resistanceOhm?: number, torqueConstantNmPerA?: number, backEmfVsPerRad?: number,
 *             noLoadCurrentA?: number, encoder?: {countsPerRev: number, absolute: boolean}}} [motor]
 *           the DC model (D5, D6): R, k_t, k_e, i0 (fitDcModel) give the line at any voltage
 *           (dcLineAt); stallTorqueNm and noLoadRadPerSec are that line at nominalVolts (the
 *           supply of the hub family the motor belongs to, HUB_SUPPLY_VOLTS), stallTorqueNm also
 *           the torque limit the hinge motor gets (v1 motor.maxTorqueNm); frictionTorqueNm = k_t·i0;
 *           servoMaxDegPerSec: the controller's top speed (v1 motor.maxSpeedDegPerSec)
 * @property {{part?: string, set?: string}} [numbers]  LEGO part / set numbers (not reported by a hub)
 * @property {object} [sources]      per motor field: {source, estimated?, community?}
 * @property {{philo: object}} [measured]   the measurements the DC model is fitted to
 * @property {{lego?: object, pybricks?: object}} [reference]  other sources kept as cross-checks
 * @property {{maxTorqueNm: number, maxSpeedDegPerSec: number}} [v1]  the numbers PartMeta v1 held
 * @property {{kind: 'distance'|'color'|'force', encoder: string}} [sensor]
 *           kind: what sensors.js measures today; encoder: the §5.2 encoder id it becomes
 */

// DC-MOTOR MODEL (owner decisions D5, D6).
//
// A permanent-magnet DC motor and its gearbox, seen at the output shaft:
//
//     i = (u − k_e·ω) / R      the winding's resistance R against the back-EMF k_e·ω,
//                              u the voltage the H-bridge puts across it (duty · supply)
//     τ = k_t · (i − i0)       k_t·i0 = τf: the losses that make the no-load current i0
//
// so at a supply V the torque–speed line is τ = τs(V)·(1 − ω/ω0(V)), with
//
//     τs(V) = k_t·(V/R − i0)   stall torque        ω0(V) = (V − R·i0) / k_e   no-load speed
//
// and a slope τs/ω0 = k_t·k_e/R that does not depend on V (physics/actuators.js applies it
// as the back-EMF damping). At the output k_t < k_e: the gearbox's efficiency, k_t = η·k_e.
//
// The numbers (owner decision D6): Philo's measurements (PHILO_*), fitted per motor by
// fitDcModel from his 9 V no-load and stall points:
//
//     R   = 9 V / I_stall                     a stalled motor is its winding alone
//     k_t = τ_stall / (I_stall − i0)          the stall torque is what is left after τf
//     k_e = (9 V − R·i0) / ω_noLoad           at no load the winding carries i0
//     τf  = k_t · i0                          gearbox friction (coast)
//
// His load-point tables (one torque, 4.5–12 V) are the check: test/bw-sim-motor-catalogue
// .test.mjs computes the residuals (for the SPIKE motors, ≥ 6 V: speed within −4…+12 %,
// current +9…+25 %; he calls his stall torques "very imprecise"). LEGO's own fact sheets (at
// 7.2 V) and Pybricks' identified models are kept alongside as cross-checks (`reference`).
// Rotor inertia: Philo does not measure it; Pybricks' reflected value where it has a model
// for the motor, else none (the hinge gets no rotor inertia).
//
// Not modelled (no published numbers): current limiting in the hub, the battery's charge level
// and sag under load (a hub profile's supplyVolts is one number), the friction's speed
// dependence (Pybricks models a cut-off near zero speed), backlash, the PTC fuses of the
// 71427/43362/NXT/PF XL/PUP motors (they cap a sustained stall; Philo's starred stall points
// are extrapolated past them).

/** Philo's page, the snapshot read, and the tag each value is cited with. */
export const PHILO_URL = 'https://philohome.com/motors/motorcomp.htm';
export const PHILO_SNAPSHOT = 'https://web.archive.org/web/20260918072225/https://philohome.com/motors/motorcomp.htm';
export const PHILO_TAG = 'philohome-motorcomp@2026-09-18';
const PHILO = `${PHILO_TAG} (Philippe "Philo" Hurbain, "LEGO 9V Technic Motors compared characteristics", ` +
    `${PHILO_URL}; read from the Internet Archive snapshot ${PHILO_SNAPSHOT}, the page returns 403 to tools)`;
const PHILO_9V = `${PHILO}, tables "No-load characteristics" and "Stalled characteristics", 9 V supply`;
const PHILO_LOAD = `${PHILO}, "Loaded characteristics" table`;

/**
 * Pybricks (MIT), pybricks-micropython lib/pbio/src/motor/servo_settings.c (commit 4277938, 2026-02-19),
 * observer models identified on real motors, read with the scalings of lib/pbio/src/observer.c
 * (PRESCALE_ACCELERATION 85, PRESCALE_SPEED 858, PRESCALE_VOLTAGE 178956; rates in mdeg/s, torques
 * in µN·m, voltages in mV):
 *   reflected inertia  J = 85e-6 / d_torque_d_acceleration · (180000/π)  kg·m²
 *   back-EMF slope     b = 858e-6 / d_torque_d_speed · (180000/π)        N·m·s/rad
 *   torque per volt    k = 178956e-6 / d_torque_d_voltage · 1000          N·m/V
 *   friction           torque_friction · 1e-6                             N·m
 */
const PYBRICKS_MODEL = 'pybricks (community measurement): pybricks-micropython lib/pbio/src/motor/servo_settings.c ' +
    '(commit 4277938) observer model, scaled per lib/pbio/src/observer.c';
const PYBRICKS_IDS = 'pybricks: pybricks-micropython lib/lego/lego/lump.h and lib/lego/lego/device.h (LEGO device type ids)';
const MDEG_PER_RAD = 180000 / Math.PI;
const pybricks = (model, {accel, speed, voltage, friction}) => Object.freeze({
    model,
    rotorInertiaKgM2: 85e-6 / accel * MDEG_PER_RAD,
    backEmfNmsPerRad: 858e-6 / speed * MDEG_PER_RAD,
    torquePerVolt: 178956e-6 / voltage * 1000,
    frictionTorqueNm: friction * 1e-6
});
/** The observer models (d_torque_d_acceleration, d_torque_d_speed, d_torque_d_voltage, torque_friction). */
export const PYBRICKS_MEDIUM = pybricks('model_technic_m_angular', {accel: 16163, speed: 5903, voltage: 8071, friction: 21413});
export const PYBRICKS_LARGE = pybricks('model_technic_l_angular', {accel: 3997, speed: 1919, voltage: 2872, friction: 23239});
const PYBRICKS_INTERACTIVE = pybricks('model_interactive', {accel: 20588, speed: 10599, voltage: 11923, friction: 11227});
const PYBRICKS_TECHNIC_L = pybricks('model_technic_l', {accel: 10751, speed: 6837, voltage: 6110, friction: 26430});
const PYBRICKS_TECHNIC_XL = pybricks('model_technic_xl', {accel: 11578, speed: 7713, voltage: 6908, friction: 12893});
const PYBRICKS_MOVEHUB = pybricks('model_movehub', {accel: 15357, speed: 10851, voltage: 8438, friction: 24835});
const PYBRICKS_EV3_L = pybricks('model_ev3_l', {accel: 1965, speed: 2083, voltage: 3587, friction: 16476});
const PYBRICKS_EV3_M = pybricks('model_ev3_m', {accel: 9355, speed: 7365, voltage: 7806, friction: 24593});
const PYBRICKS_NXT = pybricks('model_nxt', {accel: 1587, speed: 1634, voltage: 2896, friction: 20449});

const RPM = 2 * Math.PI / 60;

/** LEGO Education's motor fact sheets (the SPIKE Prime technical specifications). */
const LEGO_MEDIUM_SHEET = 'lego-sheet: LEGO Education, "Technic Medium Angular Motor" technical specification ' +
    '(techspecs_technicmediumangularmotor.pdf, linked from education.lego.com/en-us/product-resources/' +
    'spike-prime/downloads/technical-specifications; mirrored at static.rapidonline.com/pdf/70-6713_2.pdf): ' +
    'no load 185 RPM ± 15 %, 110 mA; stall 18 Ncm, 800 mA; maximum efficiency 3.5 Ncm, 135 RPM, 280 mA; ' +
    '"All performance data is based on a 7.2V power supply."';
const LEGO_LARGE_SHEET = 'lego-sheet: LEGO Education SPIKE Prime technical specifications, "Motor Angular Grande (45602)" ' +
    '(Spanish edition, robotix.es/documentos/Especificaciones Tecnicas_SPIKE Prime (3).pdf; English sheet ' +
    'le_spike-prime_tech-fact-sheet_45602_1hy19.pdf on education.lego.com): no load 175 RPM ± 15 %, 135 mA; ' +
    'stall 25 Ncm, 1400 mA; maximum efficiency 8 Ncm, 135 RPM, 430 mA (also quoted on Philo\'s page)';
const LEGO_ENCODER = 'lego-sheet: same sheets: rotation sensor 360 counts per revolution, accuracy ≤ ±3° (sensor + gear play), 100 Hz';
const SPIKE_PYTHON_SPEEDS = 'lego-api: SPIKE 3 Python API (motor.run velocity ranges: medium ±1110, large ±1050 °/s), ' +
    'as already used by spike-sim/independent-backend.js MAX_DEG_PER_S';

/**
 * What a hub's motor ports supply (a HubProfile port's supplyVolts; physics/actuators.js evaluates
 * each motor's line there). One number per hub: charge level and sag are not modelled.
 */
export const HUB_SUPPLY_VOLTS = Object.freeze({
    'spike-prime': Object.freeze({volts: 7.2, source: 'LEGO Education SPIKE Prime technical specifications: ' +
        'rechargeable Li-ion battery 7.3 V, 2100 mAh (two cells: 8.3–8.4 V full, about 7.2–7.6 V over most of the ' +
        'discharge); LEGO\'s motor sheets state their figures at 7.2 V. The motor sees the battery less the ' +
        'H-bridge\'s drop under load, so the low end of 7.2–8.3 V: a program that works here also works on a ' +
        'fresh battery, which gives the motors 17–18 % more stall torque and speed (8.3 V)', estimated: true}),
    rcx: Object.freeze({volts: 9, source: '6 AA alkaline cells (6 × 1.5 V). Philo (same page, "Protections") ' +
        'measured the RCX output dropping under load before its 500 mA current limit (a stalled 71427 gets ' +
        'about 7 V), and 7.2 V on 6 NiMH cells — not modelled', estimated: true}),
    nxt: Object.freeze({volts: 9, source: '6 AA alkaline cells; the NXT rechargeable pack is 7.4 V', estimated: true}),
    ev3: Object.freeze({volts: 9, source: '6 AA alkaline cells; the EV3 rechargeable pack is 7.4 V', estimated: true}),
    'power-functions': Object.freeze({volts: 9, source: 'PF AA battery box (6 × 1.5 V); the PF Li-ion box is 7.4 V',
        estimated: true}),
    'powered-up': Object.freeze({volts: 9, source: 'Powered Up hub 88009, Technic hub 88012 and Boost Move hub 88006: ' +
        '6 AAA/AA cells (6 × 1.5 V)', estimated: true}),
    wedo2: Object.freeze({volts: 3, source: 'WeDo 2.0 Smart Hub 45301: 2 AA cells (2 × 1.5 V) or its rechargeable battery; ' +
        'the motor port is taken to see the cells\' voltage (no boost converter modelled)', estimated: true})
});

/**
 * Philo's measurements of one motor, as data: the 9 V no-load point (rpm, A), the 9 V stall point
 * (N·cm, A; `extrapolated`: his footnote — a fast PTC fuse kept him from measuring it directly) and
 * his load points [V, N·cm, rpm, A].
 * @typedef {{column: string, noLoadRpm: number, noLoadA: number, stallNcm: number, stallA: number,
 *            extrapolated?: boolean, note?: string, loadPoints: number[][]}} PhiloMotor
 */

/**
 * The DC model through Philo's 9 V no-load and stall points (the method at the top of this section).
 * @param {PhiloMotor} p
 * @returns {{resistanceOhm: number, torqueConstantNmPerA: number, backEmfVsPerRad: number, noLoadCurrentA: number}}
 */
export const fitDcModel = p => {
    const V = 9;
    const resistanceOhm = V / p.stallA;
    const torqueConstantNmPerA = p.stallNcm / 100 / (p.stallA - p.noLoadA);
    const backEmfVsPerRad = (V - resistanceOhm * p.noLoadA) / (p.noLoadRpm * RPM);
    return {resistanceOhm, torqueConstantNmPerA, backEmfVsPerRad, noLoadCurrentA: p.noLoadA};
};

/**
 * A motor's torque–speed line at a supply voltage. With the electrical parameters (R, k_t, k_e, i0)
 * it is the fitted model's; without (an inline device that has only τs and ω0 at its nominal
 * voltage) both scale with V/V_nominal, as D5 did.
 * @param {object} motor a DeviceModel's `motor`
 * @param {number} [volts] default: motor.nominalVolts
 * @returns {{stallTorqueNm: number, noLoadRadPerSec: number, dampingNmsPerRad: number}}
 *          dampingNmsPerRad = τs/ω0, the back-EMF slope (independent of V for the fitted model)
 */
export const dcLineAt = (motor, volts) => {
    const V = Number(volts) > 0 ? Number(volts) : motor.nominalVolts;
    const {resistanceOhm: R, torqueConstantNmPerA: kt, backEmfVsPerRad: ke, noLoadCurrentA: i0} = motor;
    if (R > 0 && kt > 0 && ke > 0 && i0 >= 0) {
        // Below R·i0 the motor cannot overcome its own friction: no torque, no speed.
        return {stallTorqueNm: Math.max(0, kt * (V / R - i0)), noLoadRadPerSec: Math.max(0, (V - R * i0) / ke),
            dampingNmsPerRad: kt * ke / R};
    }
    const s = V / motor.nominalVolts;
    return {stallTorqueNm: motor.stallTorqueNm * s, noLoadRadPerSec: motor.noLoadRadPerSec * s,
        dampingNmsPerRad: motor.stallTorqueNm / motor.noLoadRadPerSec};
};

const fmt = (x, d = 4) => Number(x.toPrecision(d));

/**
 * A motor DeviceModel from Philo's measurements: the fitted DC model, its line at the nominal
 * voltage (stallTorqueNm, noLoadRadPerSec: what the hinge, the compiler and the SPIKE controller
 * read), the gearbox friction, Pybricks' rotor inertia when it has the motor, and a source per field.
 */
const philoMotor = ({id, name, parts = [], ids = {}, idsSource, numbers = null, numbersSource, philo, supply, servoMaxDegPerSec, servoSource,
    pyb = null, encoder = null, encoderSource, lego = null, v1 = null}) => {
    const dc = fitDcModel(philo);
    const nominalVolts = HUB_SUPPLY_VOLTS[supply].volts;
    const line = dcLineAt({...dc, nominalVolts}, nominalVolts);
    const frictionTorqueNm = dc.torqueConstantNmPerA * dc.noLoadCurrentA;
    const col = `column "${philo.column}"`;
    const fit = `derived (${PHILO_TAG}, fitDcModel)`;
    const starred = philo.extrapolated ? ' (his footnote: extrapolated, a fast PTC fuse prevented a direct stall measurement)' : '';
    const servo = servoMaxDegPerSec ?? line.noLoadRadPerSec * 180 / Math.PI;
    const motor = {
        stallTorqueNm: line.stallTorqueNm,
        servoMaxDegPerSec: servo,
        nominalVolts,
        noLoadRadPerSec: line.noLoadRadPerSec,
        ...dc,
        frictionTorqueNm
    };
    if (pyb) motor.rotorInertiaKgM2 = pyb.rotorInertiaKgM2;
    if (encoder) motor.encoder = encoder;
    const pybCheck = pyb ? `; ${PYBRICKS_MODEL} ${pyb.model}: stall torque at ${nominalVolts} V ` +
        `${fmt(pyb.torquePerVolt * nominalVolts, 3)} N·m, no-load speed ${fmt(pyb.torquePerVolt * nominalVolts / pyb.backEmfNmsPerRad / RPM, 3)} rpm, ` +
        `friction ${fmt(pyb.frictionTorqueNm, 3)} N·m` : '';
    const sources = {
        resistanceOhm: {source: `${PHILO_9V}, ${col}: R = 9 V / stall current ${philo.stallA} A${starred}`},
        torqueConstantNmPerA: {source: `${PHILO_9V}, ${col}: k_t = stall torque ${philo.stallNcm} N·cm / ` +
            `(stall current ${philo.stallA} A − no-load current ${philo.noLoadA} A)${starred}`},
        backEmfVsPerRad: {source: `${PHILO_9V}, ${col}: k_e = (9 V − R·${philo.noLoadA} A) / ${philo.noLoadRpm} rpm` +
            (philo.note ? ` (${philo.note})` : '')},
        noLoadCurrentA: {source: `${PHILO_9V}, ${col}: ${philo.noLoadA * 1000} mA`},
        nominalVolts: {source: `the ${supply} supply (HUB_SUPPLY_VOLTS): ${HUB_SUPPLY_VOLTS[supply].source}`,
            estimated: true},
        stallTorqueNm: {source: `${fit}: τs = k_t·(V/R − i0) at ${nominalVolts} V = ${fmt(line.stallTorqueNm * 100, 3)} N·cm ` +
            `(Philo at 9 V: ${philo.stallNcm} N·cm)`},
        noLoadRadPerSec: {source: `${fit}: ω0 = (V − R·i0)/k_e at ${nominalVolts} V = ${fmt(line.noLoadRadPerSec / RPM, 3)} rpm ` +
            `(Philo at 9 V: ${philo.noLoadRpm} rpm)`},
        frictionTorqueNm: {source: `${fit}: τf = k_t·i0 = ${fmt(frictionTorqueNm, 3)} N·m${pybCheck}`},
        servoMaxDegPerSec: servoSource
            ? {source: servoSource}
            : {source: `${fit}: the no-load speed at ${nominalVolts} V (no firmware speed limit modelled)`},
        loadPoints: {source: `${PHILO_LOAD} "${philo.column}" (the check; residuals in test/bw-sim-motor-catalogue.test.mjs)`}
    };
    if (pyb) sources.rotorInertiaKgM2 = {source: `${PYBRICKS_MODEL} ${pyb.model} (d_torque_d_acceleration); Philo does not measure it`,
        community: true};
    if (encoder) sources.encoder = {source: encoderSource};
    if (Object.keys(ids).length) sources.ids = {source: idsSource};
    if (numbers) sources.numbers = {source: numbersSource};
    if (lego) sources.crossCheck = {source: `${lego.sheet}${pybCheck}`};
    else if (pyb) sources.crossCheck = {source: pybCheck.slice(2)};
    const device = {
        id, class: 'motor', name, parts, ids, ...(numbers ? {numbers} : {}),
        source: `${PHILO} (fitted DC model)${lego ? `; ${lego.sheet}` : ''}${pyb ? `; ${PYBRICKS_MODEL}` : ''}`,
        motor, sources,
        measured: {philo: Object.freeze({...philo, loadPoints: Object.freeze(philo.loadPoints.map(p => Object.freeze(p)))})}
    };
    if (lego) device.reference = {lego: Object.freeze({...lego})};
    if (pyb) (device.reference ||= {}).pybricks = pyb;
    // The numbers PartMeta v1 held for this part (R2): the v1→v2 migration still recognises them
    // as this device (contracts.js motorDevice), though D6 replaced them.
    if (v1) device.v1 = Object.freeze({...v1});
    return device;
};

const SPIKE_ENCODER = Object.freeze({countsPerRev: 360, absolute: true});
const RELATIVE_1DEG = Object.freeze({countsPerRev: 360, absolute: false});
const PHILO_ENCODER = `${PHILO}, roster: "rotation encoder with 1° resolution"`;
const PYBRICKS_ENCODED = `${PYBRICKS_MODEL}: an encoded motor (servo settings and observer model)`;
const SET_NUMBER = 'lego-catalogue: the LEGO set/element number (not on Philo\'s page)';
const PHILO_PARTREF = `${PHILO}, roster (Partsref/Peeron/LEGO numbers)`;

/** Every motor Philo measured that a hub here may drive, fitted (the SPIKE pair first). */
const MOTORS = [
    // SPIKE medium angular motor (45603).
    philoMotor({id: 'spike-medium-angular', name: 'SPIKE medium angular motor (45603)', parts: ['54696p01.dat'],
        ids: {lpf2: 48}, idsSource: PYBRICKS_IDS, supply: 'spike-prime',
        philo: {column: 'Spike M', noLoadRpm: 228, noLoadA: 0.100, stallNcm: 13.5, stallA: 0.85,
            loadPoints: [[4.5, 4.48, 24, 0.29], [6, 4.48, 63, 0.28], [7.5, 4.48, 105, 0.29], [9, 4.48, 138, 0.30],
                [10.5, 4.48, 180, 0.31], [12, 4.48, 213, 0.32]]},
        servoMaxDegPerSec: 1110, servoSource: SPIKE_PYTHON_SPEEDS, pyb: PYBRICKS_MEDIUM,
        encoder: SPIKE_ENCODER, encoderSource: LEGO_ENCODER,
        lego: {sheet: LEGO_MEDIUM_SHEET, volts: 7.2, noLoadRpm: 185, noLoadA: 0.110, stallNcm: 18, stallA: 0.800,
            loadPoint: [7.2, 3.5, 135, 0.28], speedTolerance: 0.15},
        v1: {maxTorqueNm: 0.18, maxSpeedDegPerSec: 1110}}),
    // SPIKE large angular motor (45602).
    philoMotor({id: 'spike-large-angular', name: 'SPIKE large angular motor (45602)', parts: ['54675.dat'],
        ids: {lpf2: 49}, idsSource: PYBRICKS_IDS, supply: 'spike-prime',
        philo: {column: 'Spike L', noLoadRpm: 213, noLoadA: 0.110, stallNcm: 33.5, stallA: 1.8,
            loadPoints: [[4.5, 8.47, 48, 0.41], [6, 8.47, 84, 0.43], [7.5, 8.47, 126, 0.43], [9, 8.47, 156, 0.44],
                [10.5, 8.47, 198, 0.46], [12, 8.47, 234, 0.46]]},
        servoMaxDegPerSec: 1050, servoSource: SPIKE_PYTHON_SPEEDS, pyb: PYBRICKS_LARGE,
        encoder: SPIKE_ENCODER, encoderSource: LEGO_ENCODER,
        lego: {sheet: LEGO_LARGE_SHEET, volts: 7.2, noLoadRpm: 175, noLoadA: 0.135, stallNcm: 25, stallA: 1.400,
            loadPoint: [7.2, 8, 135, 0.43], speedTolerance: 0.15},
        v1: {maxTorqueNm: 0.38, maxSpeedDegPerSec: 1050}}),
    // RCX-era 9 V motors (passive: no id; the hub reports nothing).
    philoMotor({id: 'technic-motor-2838', name: 'Electric Technic Motor 9V (2838c01)', numbers: {part: '2838c01'},
        numbersSource: PHILO_PARTREF, supply: 'rcx',
        philo: {column: '2838', noLoadRpm: 4100, noLoadA: 0.035, stallNcm: 0.85, stallA: 0.70,
            note: 'ungeared; his load points were taken through a 1:5 reduction and corrected',
            loadPoints: [[6, 0.45, 580, 0.32], [7, 0.45, 1000, 0.32], [9, 0.45, 2000, 0.32], [12, 0.45, 3300, 0.33]]}}),
    philoMotor({id: 'technic-minimotor-71427', name: 'Electric Technic Mini-Motor 9V (71427c01)', parts: ['71427.dat'],
        numbers: {part: '71427c01'},
        numbersSource: PHILO_PARTREF, supply: 'rcx',
        philo: {column: '71427', noLoadRpm: 360, noLoadA: 0.0035, stallNcm: 6, stallA: 0.36,
            loadPoints: [[4.5, 2.25, 57, 0.12], [7, 2.25, 160, 0.12], [9, 2.25, 250, 0.12], [12, 2.25, 375, 0.12]]}}),
    philoMotor({id: 'technic-minimotor-43362', name: 'Electric Technic Mini-Motor 9V (43362)', numbers: {part: '43362'},
        numbersSource: PHILO_PARTREF, supply: 'rcx',
        philo: {column: '43362', noLoadRpm: 340, noLoadA: 0.009, stallNcm: 5.5, stallA: 0.34,
            loadPoints: [[4.5, 2.25, 50, 0.12], [7, 2.25, 140, 0.12], [9, 2.25, 219, 0.12], [12, 2.25, 333, 0.12]]}}),
    philoMotor({id: 'technic-motor-47154', name: 'Electric Technic Motor 9V Geared (47154)', numbers: {part: '47154'},
        numbersSource: PHILO_PARTREF, supply: 'rcx',
        philo: {column: '47154', noLoadRpm: 460, noLoadA: 0.031, stallNcm: 6, stallA: 0.58,
            loadPoints: [[4.5, 2.25, 90, 0.19], [7, 2.25, 210, 0.19], [9, 2.25, 315, 0.19], [12, 2.25, 468, 0.19]]}}),
    philoMotor({id: 'rc-buggy-motor-5292', name: 'Electric RC Race Buggy Motor (5292)', numbers: {part: '5292'},
        numbersSource: PHILO_PARTREF, supply: 'rcx',
        philo: {column: '5292', noLoadRpm: 1240, noLoadA: 0.160, stallNcm: 14, stallA: 3.2,
            note: 'the outermost output: his no-load cell reads "1700 rpm / 1240 rpm", the inner hole is geared up 23/17 ' +
                '(1240 · 23/17 ≈ 1680) and only the outermost output is load-tested',
            loadPoints: [[4.5, 5.7, 150, 1.36], [6, 5.7, 380, 1.38], [7.5, 5.7, 580, 1.37], [9, 5.7, 780, 1.40], [10.5, 5.7, 1030, 1.46]]}}),
    // MINDSTORMS NXT / EV3.
    philoMotor({id: 'nxt-motor', name: 'MINDSTORMS NXT motor (53787, set 9842)', parts: ['53787.dat'], numbers: {part: '53787', set: '9842'},
        numbersSource: SET_NUMBER, supply: 'nxt',
        philo: {column: 'NXT', noLoadRpm: 170, noLoadA: 0.060, stallNcm: 50, stallA: 2.0,
            loadPoints: [[4.5, 16.7, 33, 0.6], [7, 16.7, 82, 0.55], [9, 16.7, 117, 0.55], [12, 16.7, 177, 0.58]]},
        pyb: PYBRICKS_NXT, encoder: RELATIVE_1DEG, encoderSource: PHILO_ENCODER}),
    philoMotor({id: 'ev3-large-motor', name: 'MINDSTORMS EV3 Large motor (45502)', parts: ['95658.dat'], numbers: {set: '45502'},
        numbersSource: SET_NUMBER, supply: 'ev3',
        philo: {column: 'EV3 Large', noLoadRpm: 175, noLoadA: 0.060, stallNcm: 43, stallA: 1.8,
            loadPoints: [[4.5, 17.3, 24, 0.69], [6, 17.3, 51, 0.69], [7.5, 17.3, 78, 0.69], [9, 17.3, 105, 0.69],
                [10.5, 17.3, 132, 0.69], [12, 17.3, 153, 0.69]]},
        pyb: PYBRICKS_EV3_L, encoder: RELATIVE_1DEG, encoderSource: PYBRICKS_ENCODED}),
    philoMotor({id: 'ev3-medium-motor', name: 'MINDSTORMS EV3 Medium motor (45503)', parts: ['99455.dat'], numbers: {set: '45503'},
        numbersSource: SET_NUMBER, supply: 'ev3',
        philo: {column: 'EV3 Medium', noLoadRpm: 260, noLoadA: 0.080, stallNcm: 15, stallA: 0.78,
            loadPoints: [[4.5, 6.64, 24, 0.35], [6, 6.64, 72, 0.35], [7.5, 6.64, 120, 0.35], [9, 6.64, 165, 0.37],
                [10.5, 6.64, 207, 0.37], [12, 6.64, 249, 0.37]]},
        pyb: PYBRICKS_EV3_M, encoder: RELATIVE_1DEG, encoderSource: PYBRICKS_ENCODED}),
    // Power Functions (passive).
    philoMotor({id: 'pf-medium-motor', name: 'Power Functions Medium motor (8883)', numbers: {set: '8883'},
        numbersSource: SET_NUMBER, supply: 'power-functions',
        philo: {column: 'PF Medium', noLoadRpm: 405, noLoadA: 0.065, stallNcm: 11, stallA: 0.85,
            loadPoints: [[4.5, 3.63, 73, 0.28], [7, 3.63, 185, 0.29], [9, 3.63, 275, 0.31], [12, 3.63, 405, 0.32]]}}),
    philoMotor({id: 'pf-large-motor', name: 'Power Functions Large motor (88003)', numbers: {set: '88003'},
        numbersSource: SET_NUMBER, supply: 'power-functions',
        philo: {column: 'PF Large', noLoadRpm: 390, noLoadA: 0.120, stallNcm: 18, stallA: 1.3,
            loadPoints: [[4.5, 6.48, 67, 0.46], [6, 6.48, 138, 0.47], [7.5, 6.48, 203, 0.48], [9, 6.48, 272, 0.49],
                [10.5, 6.48, 338, 0.49], [12, 6.48, 405, 0.50]]}}),
    philoMotor({id: 'pf-xl-motor', name: 'Power Functions XL motor (8882)', numbers: {set: '8882'},
        numbersSource: SET_NUMBER, supply: 'power-functions',
        philo: {column: 'PF XL', noLoadRpm: 220, noLoadA: 0.080, stallNcm: 40, stallA: 1.8,
            loadPoints: [[4.5, 14.5, 43, 0.52], [7, 14.5, 100, 0.54], [9, 14.5, 146, 0.55], [12, 14.5, 214, 0.56]]}}),
    philoMotor({id: 'pf-train-motor', name: 'Power Functions Train motor (88002)', numbers: {set: '88002'},
        numbersSource: SET_NUMBER, supply: 'power-functions',
        philo: {column: 'PF Train', noLoadRpm: 1900, noLoadA: 0.090, stallNcm: 3.6, stallA: 1.3, extrapolated: true,
            loadPoints: [[3, 0.85, 135, 0.35], [4.5, 0.85, 468, 0.36], [6, 0.85, 792, 0.37], [7.5, 0.85, 1107, 0.38],
                [9, 0.85, 1458, 0.38], [10.5, 0.85, 1782, 0.39], [12, 0.85, 2124, 0.40]]}}),
    // Powered Up (LPF2: the hub reads the id).
    philoMotor({id: 'pup-medium-motor', name: 'Powered Up Medium motor (45303)', parts: ['21980.dat'], ids: {lpf2: 1}, numbers: {set: '45303'},
        idsSource: `${PYBRICKS_IDS} (LEGO_DEVICE_TYPE_ID_LPF2_MMOTOR = 1, "45303 Powered Up Medium Motor")`, numbersSource: PYBRICKS_IDS, supply: 'powered-up',
        philo: {column: 'PUP medium', noLoadRpm: 380, noLoadA: 0.060, stallNcm: 11, stallA: 0.8, extrapolated: true,
            loadPoints: [[4.5, 4.08, 66, 0.29], [6, 4.08, 135, 0.29], [7.5, 4.08, 201, 0.30], [9, 4.08, 270, 0.30],
                [10.5, 4.08, 327, 0.30], [12, 4.08, 396, 0.31]]}}),
    philoMotor({id: 'pup-train-motor', name: 'Powered Up Train motor (88011)', ids: {lpf2: 2}, numbers: {set: '88011'},
        idsSource: `${PYBRICKS_IDS} (LEGO_DEVICE_TYPE_ID_LPF2_TRAIN = 2)`, numbersSource: SET_NUMBER, supply: 'powered-up',
        philo: {column: 'PUP Train', noLoadRpm: 1760, noLoadA: 0.100, stallNcm: 2.9, stallA: 1.1, extrapolated: true,
            loadPoints: [[4.5, 0.88, 237, 0.36], [6, 0.88, 540, 0.38], [7.5, 0.88, 855, 0.40], [9, 0.88, 1242, 0.41],
                [10.5, 0.88, 1539, 0.43], [12, 0.88, 1872, 0.44]]}}),
    philoMotor({id: 'boost-interactive-motor', name: 'BOOST interactive (external) motor (88008)', parts: ['26913.dat'], ids: {lpf2: 38}, numbers: {set: '88008'},
        idsSource: `${PYBRICKS_IDS} (LUMP_TYPE_ID_INTERACTIVE_MOTOR = 38)`, numbersSource: SET_NUMBER, supply: 'powered-up',
        philo: {column: 'Boost Ext.', noLoadRpm: 255, noLoadA: 0.041, stallNcm: 9.5, stallA: 0.45, extrapolated: true,
            loadPoints: [[4.5, 4.08, 39, 0.18], [6, 4.08, 84, 0.18], [7.5, 4.08, 126, 0.19], [9, 4.08, 171, 0.19],
                [10.5, 4.08, 213, 0.20], [12, 4.08, 255, 0.20]]},
        pyb: PYBRICKS_INTERACTIVE, encoder: RELATIVE_1DEG, encoderSource: PHILO_ENCODER}),
    philoMotor({id: 'boost-move-hub-motor', name: 'BOOST Move hub internal motor (in 88006)', ids: {lpf2: 39},
        idsSource: `${PYBRICKS_IDS} (LEGO_DEVICE_TYPE_ID_MOVE_HUB_MOTOR = 39)`, supply: 'powered-up',
        philo: {column: 'Boost Int.', noLoadRpm: 350, noLoadA: 0.140, stallNcm: 15.8, stallA: 1.05,
            loadPoints: [[4.5, 4.08, 81, 0.33], [6, 4.08, 141, 0.34], [7.5, 4.08, 201, 0.35], [9, 4.08, 264, 0.37],
                [10.5, 4.08, 327, 0.38], [12, 4.08, 384, 0.39]]},
        pyb: PYBRICKS_MOVEHUB, encoder: RELATIVE_1DEG, encoderSource: PYBRICKS_ENCODED}),
    philoMotor({id: 'technic-large-motor', name: 'Control+ Technic Large motor (88013)', parts: ['22169.dat'], ids: {lpf2: 46}, numbers: {set: '88013'},
        idsSource: `${PYBRICKS_IDS} (LUMP_TYPE_ID_TECHNIC_L_MOTOR = 46)`, numbersSource: SET_NUMBER, supply: 'powered-up',
        philo: {column: 'Control+ L', noLoadRpm: 315, noLoadA: 0.120, stallNcm: 26, stallA: 1.4, extrapolated: true,
            loadPoints: [[4.5, 8.81, 36, 0.49], [6, 8.81, 93, 0.48], [7.5, 8.81, 141, 0.51], [9, 8.81, 198, 0.52],
                [10.5, 8.81, 255, 0.52], [12, 8.81, 312, 0.53]]},
        pyb: PYBRICKS_TECHNIC_L, encoder: SPIKE_ENCODER, encoderSource: `${PHILO_ENCODER} "and an absolute encoder"`}),
    philoMotor({id: 'technic-xl-motor', name: 'Control+ Technic XL motor (88014)', parts: ['22172.dat'], ids: {lpf2: 47}, numbers: {set: '88014'},
        idsSource: `${PYBRICKS_IDS} (LUMP_TYPE_ID_TECHNIC_XL_MOTOR = 47)`, numbersSource: SET_NUMBER, supply: 'powered-up',
        philo: {column: 'Control+ XL', noLoadRpm: 330, noLoadA: 0.060, stallNcm: 22, stallA: 1.1, extrapolated: true,
            loadPoints: [[4.5, 8.81, 33, 0.45], [6, 8.81, 93, 0.46], [7.5, 8.81, 147, 0.46], [9, 8.81, 198, 0.47],
                [10.5, 8.81, 252, 0.47], [12, 8.81, 306, 0.47]]},
        pyb: PYBRICKS_TECHNIC_XL, encoder: SPIKE_ENCODER, encoderSource: `${PHILO_ENCODER} (the same rotation/angle sensors as the C+ L motor)`})
];

// RCX SENSORS (docs/ROBOT-LAB-RCX.md). Passive (the touch switch) and active (light, rotation:
// the RCX powers them through the same two wires and reads them between power pulses) 9 V
// sensors; the hub reports no id (devices/rcx-sensors.js turns each probe into the 10-bit raw
// value the RCX's ADC reads, hubs/rcx/ hands it to the bytecode VM).
const RCX_REF = 'lego-rcx-ref: LEGO MINDSTORMS "RCX 2.0 Firmware Command Overview" (2000-07-04; ' +
    'LEGO_3804_RCX-2.0-Firmware_Byte_Codes_Reference.pdf, BrickBot Archive, github.com/BrickBot/Archive/releases/tag/LEGO)';
const RCX_SENSORS = [
    {id: 'rcx-touch', class: 'sensor-passive', name: 'RCX touch sensor (879)', parts: ['75973.dat'], ids: {},
        numbers: {part: '879'}, source: `${RCX_REF}: sensor type Switch, default BooleanMode, Sensor bool = the raw value ` +
            'with thresholds and hysteresis at 45/55 % (source 13); a switch to ground: closed reads low, open reads full scale',
        sensor: {kind: 'force', encoder: 'rcx-touch'}},
    {id: 'rcx-light', class: 'sensor-active', name: 'RCX light sensor (9758)', parts: ['72634.dat'], ids: {},
        numbers: {part: '2982c01', set: '9758'}, source: `${RCX_REF}: sensor type Reflection, default PctFullScaleMode ` +
            '(0..100); percent = 146 − raw/7 (M. Gasperi, quoted on LUGNET robotics.rcx.legos #2539, 2002 — community); ' +
            'the reflectance → percent line is estimated (devices/rcx-sensors.js)',
        sensor: {kind: 'color', encoder: 'rcx-light'}},
    {id: 'rcx-rotation', class: 'sensor-active', name: 'RCX rotation sensor (2977)', parts: ['72632.dat'], ids: {},
        numbers: {part: '2977c01'}, source: `${RCX_REF}: sensor type Angle, default AngleStepsMode, "counts rotations in ` +
            '1/16 ticks" (ClearSensorValue): 16 counts per turn of the axle through it',
        sensor: {kind: 'rotation', encoder: 'rcx-rotation'}, encoder: {countsPerRev: 16, absolute: false}}
];

// EV3 AND NXT SENSORS (docs/ROBOT-LAB-EV3-NXT.md). The EV3's are UART devices that identify
// themselves (devices/ev3-sensors.js: type and mode numbers from LEGO's EV3 Firmware Developer Kit
// §5), its touch sensor a switch the brick reads on an analog pin; the NXT's are a switch, an
// active light sensor and an I2C ultrasonic sensor the program configures (devices/nxt-sensors.js,
// LEGO's NXT Bluetooth and Hardware Developer Kits). The probes are sensors.js's: a ray, as for
// SPIKE's sensors; the gyro reads the yaw of the brick's body.
const EV3_FDK = 'lego-ev3-fdk: LEGO MINDSTORMS "EV3 Firmware Developer Kit" (2013), §5 "Device type list"';
const NXT_BDK = 'lego-nxt-bdk: LEGO MINDSTORMS "NXT Bluetooth Developer Kit" (2006), Appendix 2 "Direct commands", SETINPUTMODE';
const EV3_SENSORS = [
    {id: 'ev3-touch', class: 'sensor-passive', name: 'EV3 touch sensor (45507)', parts: ['95648.dat'], ids: {ev3: 16},
        numbers: {part: '95648', set: '45507'}, source: `${EV3_FDK}: type 16 EV3-Touch, modes 0 Touch, 1 Bump`,
        sensor: {kind: 'force', encoder: 'ev3-touch'}},
    {id: 'ev3-color', class: 'sensor-digital', name: 'EV3 colour sensor (45506)', parts: ['95650.dat'], ids: {ev3: 29},
        numbers: {part: '95650', set: '45506'}, source: `${EV3_FDK}: type 29 EV3-Color, modes 0 Reflected, 1 Ambient, 2 Color, ` +
            '3 Reflected-Raw, 4 RGB-Raw; colours 0-7 (none, black, blue, green, yellow, red, white, brown)',
        sensor: {kind: 'color', encoder: 'ev3-color'}},
    {id: 'ev3-ultrasonic', class: 'sensor-digital', name: 'EV3 ultrasonic sensor (45504)', parts: ['95652.dat'], ids: {ev3: 30},
        numbers: {part: '95652', set: '45504'}, source: `${EV3_FDK}: type 30 EV3-Ultrasonic, modes 0 Cm, 1 Inch, 2 Listen; ` +
            'LEGO\'s product page: 3-250 cm, 255 when nothing echoes',
        sensor: {kind: 'distance', encoder: 'ev3-ultrasonic'}},
    {id: 'ev3-gyro', class: 'sensor-digital', name: 'EV3 gyro sensor (45505)', parts: ['99380.dat'], ids: {ev3: 32},
        numbers: {part: '99380', set: '45505'}, source: `${EV3_FDK}: type 32 EV3-Gyro, modes 0 Angle, 1 Rate, 2 Fast, 3 Rate & Angle`,
        sensor: {kind: 'gyro', encoder: 'ev3-gyro'}}
];
const NXT_SENSORS = [
    {id: 'nxt-touch', class: 'sensor-passive', name: 'NXT touch sensor (9843)', parts: ['53793.dat'], ids: {},
        numbers: {part: '53793', set: '9843'}, source: `${NXT_BDK}: sensor type SWITCH (0x01), BOOLEANMODE (0x20)`,
        sensor: {kind: 'force', encoder: 'nxt-touch'}},
    {id: 'nxt-light', class: 'sensor-active', name: 'NXT light sensor (9844)', parts: ['55969.dat'], ids: {},
        numbers: {part: '55969', set: '9844'}, source: `${NXT_BDK}: sensor types LIGHT_ACTIVE (0x05) / LIGHT_INACTIVE (0x06), ` +
            'PCTFULLSCALEMODE (0x80); the reflectance → percent line is estimated (devices/nxt-sensors.js)',
        sensor: {kind: 'color', encoder: 'nxt-light'}},
    {id: 'nxt-ultrasonic', class: 'sensor-digital', name: 'NXT ultrasonic sensor (9846)', parts: ['53792.dat'], ids: {},
        numbers: {part: '53792', set: '9846'}, source: `${NXT_BDK}: sensor type LOWSPEED_9V (0x0B); LEGO MINDSTORMS "NXT Hardware ` +
            'Developer Kit", Appendix 7 "Ultrasonic sensor I2C communication protocol": address 0x02, measurement byte 0 at 0x42, cm',
        sensor: {kind: 'distance', encoder: 'nxt-ultrasonic'}}
];
// POWERED UP / WeDo 2.0 SENSORS (docs/LWP3-VIRTUAL-HUB-NOTES.md, docs/WEDO-HUB-PROTOCOL-NOTES.md). The hub
// reports the id (LWP3 §3.8.4 IO Type IDs: 0x22 External Tilt Sensor, 0x23 Motion Sensor, 0x25 Vision Sensor —
// LEGO); what each mode reads is modelled from the probe (hubs/lwp3/, hubs/wedo2/ say how).
const LWP3_IO_TYPES = 'lego-lwp3: LEGO Wireless Protocol 3.0.00 §3.8.4 IO Type IDs (lego.github.io/lego-ble-wireless-protocol-docs)';
const POWERED_UP_SENSORS = [
    {id: 'boost-color-distance', class: 'sensor-lpf2', name: 'BOOST colour and distance sensor (88007)', parts: ['26912.dat'],
        ids: {lpf2: 37}, numbers: {set: '88007'}, source: `${LWP3_IO_TYPES}: 0x0025 Vision Sensor; colour index and ` +
            'reflection from the colour probe (sensors.js), proximity only as "something within the probe\'s 32 mm" (estimated)',
        sensor: {kind: 'color', encoder: 'boost-color-distance'}},
    {id: 'wedo2-tilt', class: 'sensor-lpf2', name: 'WeDo 2.0 tilt sensor (45305)', parts: ['20841.dat'],
        ids: {lpf2: 34}, numbers: {set: '45305'}, source: `${LWP3_IO_TYPES}: 0x0022 External Tilt Sensor; the WeDo 2.0 ` +
            'SDK\'s angle mode reports two signed bytes (scratch-vm extensions/scratch3_wedo2: tiltX, tiltY), here the ' +
            'sensor body\'s pitch and roll in degrees (sensors.js tilt)',
        sensor: {kind: 'tilt', encoder: 'wedo2-tilt'}},
    {id: 'wedo2-motion', class: 'sensor-lpf2', name: 'WeDo 2.0 motion sensor (45304)', parts: ['20844.dat'],
        ids: {lpf2: 35}, numbers: {set: '45304'}, source: `${LWP3_IO_TYPES}: 0x0023 Motion Sensor; an infrared ` +
            'proximity sensor, its detect mode 0..10 (raw) / 0..100 (percent) modelled from a short ray (sensors.js ' +
            'proximity) as hubs/wedo2/wedo2-virtual-hub.js MOTION_RANGE_MM says (estimated)',
        sensor: {kind: 'proximity', encoder: 'wedo2-motion'}}
];

/** @type {DeviceModel[]} */
export const DEVICE_MODELS = Object.freeze([
    ...MOTORS,
    {id: 'spike-color', class: 'sensor-lpf2', parts: ['37308.dat'], ids: {lpf2: 61}, source: V1_SOURCE,
        sensor: {kind: 'color', encoder: 'spike-color'}},
    {id: 'spike-distance', class: 'sensor-lpf2', parts: ['37316.dat'], ids: {lpf2: 62}, source: V1_SOURCE,
        sensor: {kind: 'distance', encoder: 'spike-distance'}},
    {id: 'spike-force', class: 'sensor-lpf2', parts: ['37312.dat'], ids: {lpf2: 63}, source: V1_SOURCE,
        sensor: {kind: 'force', encoder: 'spike-force'}},
    ...RCX_SENSORS,
    ...EV3_SENSORS,
    ...NXT_SENSORS,
    ...POWERED_UP_SENSORS
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
