// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// DC-motor DeviceModels (docs/ROBOT-LAB-ARCHITECTURE.md §5.2 DcMotorSpec):
// the numbers physics/actuators.js turns a `pwm` drive into a hinge torque
// with. Every number carries where it comes from (`sources`); a number that
// is derived or guessed says so (`estimated: true` and how). Owner decision
// D6 (who measures real motors) is open: until a bench measurement exists,
// the published LEGO figures below are the reference, and the tests compare
// the simulation against the MODEL's own prediction, not against a motor.
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

const spikeMotor = ({id, parts, lpf2, sheet, noLoadRpm, stallNcm, noLoadA, stallA, pyb, servoMaxDegPerSec}) => Object.freeze({
    id,
    class: 'motor',
    parts: Object.freeze(parts),
    ids: Object.freeze({lpf2: Object.freeze(lpf2)}),
    source: sheet,
    motor: Object.freeze({
        nominalVolts: 7.2,
        noLoadRadPerSec: noLoadRpm * RPM,
        stallTorqueNm: stallNcm / 100,
        encoder: Object.freeze({countsPerRev: 360, absolute: true}),
        frictionTorqueNm: pyb.frictionTorqueNm,
        rotorInertiaKgM2: pyb.rotorInertiaKgM2,
        servoMaxDegPerSec
    }),
    sources: Object.freeze({
        nominalVolts: Object.freeze({source: LEGO_MEDIUM_SHEET + ' (the 7.2 V test supply is stated on the medium ' +
            'motor\'s sheet; the large motor\'s sheet is assumed to use the same supply)', estimated: id !== 'spike-medium-angular'}),
        noLoadRadPerSec: Object.freeze({source: sheet}),
        stallTorqueNm: Object.freeze({source: sheet}),
        encoder: Object.freeze({source: LEGO_ENCODER}),
        frictionTorqueNm: Object.freeze({source: `${PYBRICKS_MODEL} (torque_friction); cross-check from ` +
            `the LEGO sheet's currents τs·I0/(Is − I0) = ${currentBound(stallNcm / 100, noLoadA, stallA).toFixed(4)} N·m`,
        community: true}),
        rotorInertiaKgM2: Object.freeze({source: `${PYBRICKS_MODEL} (d_torque_d_acceleration); LEGO publishes ` +
            'neither the gear ratio nor the rotor inertia', community: true}),
        crossCheck: Object.freeze({source: `${PYBRICKS_MODEL}: stall torque at 7.2 V ` +
            `${pyb.stallTorqueAt72Nm.toFixed(3)} N·m, no-load speed ${(pyb.stallTorqueAt72Nm / pyb.backEmfNmsPerRad / RPM).toFixed(0)} rpm ` +
            `(LEGO: ${stallNcm / 100} N·m, ${noLoadRpm} rpm)`}),
        servoMaxDegPerSec: Object.freeze({source: SPIKE_PYTHON_SPEEDS})
    })
});

/** SPIKE medium angular motor (45603; Robot Inventor's dark version reports 75). */
export const SPIKE_MEDIUM_ANGULAR = spikeMotor({
    id: 'spike-medium-angular', parts: ['54696p01.dat'], lpf2: [48, 75], sheet: LEGO_MEDIUM_SHEET,
    noLoadRpm: 185, stallNcm: 18, noLoadA: 0.110, stallA: 0.800, pyb: PYBRICKS_MEDIUM, servoMaxDegPerSec: 1110
});

/** SPIKE large angular motor (45602; Robot Inventor / Technic version reports 76). */
export const SPIKE_LARGE_ANGULAR = spikeMotor({
    id: 'spike-large-angular', parts: ['54675.dat'], lpf2: [49, 76], sheet: LEGO_LARGE_SHEET,
    noLoadRpm: 175, stallNcm: 25, noLoadA: 0.135, stallA: 1.400, pyb: PYBRICKS_LARGE, servoMaxDegPerSec: 1050
});

export const DC_MOTORS = Object.freeze([SPIKE_MEDIUM_ANGULAR, SPIKE_LARGE_ANGULAR]);

/**
 * The DeviceModel of a motor, by the LPF2 id it reports or its part; else a model
 * built from the joint's part-meta numbers (top speed as ω0, torque limit as τs),
 * marked estimated: those numbers were never a datasheet's.
 * @param {{deviceId?: number, maxTorqueNm: number, maxSpeedRadPerSec: number}} motor a joint's `motor`
 * @param {string} [part] the motor's LDraw part
 */
export const dcMotorFor = (motor, part = null) => {
    const found = DC_MOTORS.find(d => (motor && d.ids.lpf2.includes(motor.deviceId)) || (part && d.parts.includes(part)));
    if (found) return found;
    return Object.freeze({
        id: 'part-meta-motor',
        class: 'motor',
        parts: Object.freeze(part ? [part] : []),
        ids: Object.freeze({lpf2: Object.freeze(motor && motor.deviceId != null ? [motor.deviceId] : [])}),
        source: 'part-meta/parts.json motor numbers (maxTorqueNm as stall torque, maxSpeedDegPerSec as no-load speed)',
        estimated: true,
        motor: Object.freeze({
            nominalVolts: 7.2,
            noLoadRadPerSec: motor.maxSpeedRadPerSec,
            stallTorqueNm: motor.maxTorqueNm,
            frictionTorqueNm: 0,
            rotorInertiaKgM2: 0,
            servoMaxDegPerSec: motor.maxSpeedRadPerSec * 180 / Math.PI
        })
    });
};
