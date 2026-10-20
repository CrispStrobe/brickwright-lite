// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The EV3 sensors as device models (docs/ROBOT-LAB-EV3-NXT.md "EV3 sensors"; devices/catalog.js
// EV3_SENSORS): what the EV3's input port reports in a device mode for a probe sensors.js measured
// in the scene. Pure functions, no imports. The EV3 brick (hubs/ev3/) asks one of them per read,
// in the format the direct command wants: SI (a float in the mode's unit), PCT (0..100) or RAW.
//
// SOURCES. Type and mode numbers: LEGO "EV3 Firmware Developer Kit" §5 "Device type list":
// 16 EV3-Touch (0 Touch, 1 Bump), 29 EV3-Color (0 Reflected, 1 Ambient, 2 Color, 3 Reflected-Raw,
// 4 RGB-Raw), 30 EV3-Ultrasonic (0 Cm, 1 Inch, 2 Listen), 32 EV3-Gyro (0 Angle, 1 Rate, 2 Fast,
// 3 Rate & Angle), 7/8 the Large/Medium motor (0 Degree, 1 Rotation, 2 Power). The colour ids
// 0..7 (none, black, blue, green, yellow, red, white, brown) and the CDK's example §4.2.4 ("a value
// between 0-8 … the color of the object"). Ranges where the kits are silent are LEGO's product
// pages (the ultrasonic "3–250 cm", 255 when nothing echoes) or marked "estimated".

/** EV3 device types [FDK §5]. 126 = no device on the port; 125 = a port error. */
export const EV3_TYPE = Object.freeze({touch: 16, color: 29, ultrasonic: 30, gyro: 32, largeMotor: 7, mediumMotor: 8,
    none: 126, error: 125});

/** EV3 colour ids (mode 2 "EV3-Color-Color"). */
export const EV3_COLOR_ID = Object.freeze({none: 0, black: 1, blue: 2, green: 3, yellow: 4, red: 5, white: 6, brown: 7});

/**
 * sensors.js colours are LEGO's SPIKE ids (0 black, 1 violet, 3 blue, 4 azure, 5 green, 7 yellow,
 * 9 red, 10 white; −1 nothing). The EV3 sensor's eight classes take them as their nearest.
 */
export const SPIKE_TO_EV3_COLOR = Object.freeze({'-1': 0, 0: 1, 1: 2, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6});

/** Nothing echoes: the EV3 ultrasonic reports its full scale, 255.0 cm (and 100.0 in). */
export const US_NOTHING_CM = 255;
export const US_NOTHING_IN = 100;
/** Ambient light the scene has no model of: a dim room, estimated. */
export const AMBIENT_PCT = 8;

/** Modes per type: [name, SI unit, figures] [FDK §5]; GET_MODENAME and GET_FORMAT read them. */
export const EV3_MODES = Object.freeze({
    16: ['TOUCH', 'BUMPS'],
    29: ['COL-REFLECT', 'COL-AMBIENT', 'COL-COLOR', 'REF-RAW', 'RGB-RAW', 'COL-CAL'],
    30: ['US-DIST-CM', 'US-DIST-IN', 'US-LISTEN', 'US-SI-CM', 'US-SI-IN', 'US-DC-CM', 'US-DC-IN'],
    32: ['GYRO-ANG', 'GYRO-RATE', 'GYRO-FAS', 'GYRO-G&A', 'GYRO-CAL'],
    7: ['L-MOTOR-DEG', 'L-MOTOR-ROT', 'L-MOTOR-POW'],
    8: ['M-MOTOR-DEG', 'M-MOTOR-ROT', 'M-MOTOR-POW']
});

/** Device names as the brick reports them (GET_NAME). */
export const EV3_NAMES = Object.freeze({16: 'TOUCH', 29: 'COLOR', 30: 'US', 32: 'GYRO', 7: 'L-MOTOR', 8: 'M-MOTOR'});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * One reading of an EV3 sensor, as SI values of its mode.
 * @param {number} type EV3_TYPE
 * @param {number} mode the device mode
 * @param {object} state the input's state: {probe (sensors.js reading), bumps, gyroZeroDeg, headingDeg, rateDps}
 * @returns {number[]} the mode's values (one, or three for RGB, two for rate & angle)
 */
export const ev3SensorSi = (type, mode, state) => {
    const probe = state.probe || {};
    if (type === EV3_TYPE.touch) return mode === 1 ? [state.bumps || 0] : [probe.pressed ? 1 : 0];
    if (type === EV3_TYPE.color) {
        const seen = probe.color !== undefined && probe.color !== -1;
        if (mode === 1) return [AMBIENT_PCT];
        if (mode === 2) return [seen ? (SPIKE_TO_EV3_COLOR[probe.color] ?? 0) : 0];
        // The reflected-light mode: the scene's reflectance 0..100 (falling off with distance, sensors.js).
        const pct = clamp(Math.round(Number(probe.reflection) || 0), 0, 100);
        if (mode === 3) return [Math.round(pct * 10.23), 0];
        if (mode === 4) return ['red', 'green', 'blue'].map(c => clamp(Math.round(Number(probe[c]) || 0), 0, 1020));
        return [pct];
    }
    if (type === EV3_TYPE.ultrasonic) {
        // The echo's own distance when the scene gives it (sensors.js rangeMm), else SPIKE's windowed one.
        const mm = Number(probe.rangeMm ?? probe.distance);
        // Nothing echoes within reach, or beyond the sensor's 255 cm.
        const none = !(mm >= 0) || mm > US_NOTHING_CM * 10;
        // Listen (mode 2, "US-LISTEN", 0..1): 1 while another ultrasonic sensor's ping is heard
        // (sensors.js usHeard: the scene's other MINDSTORMS ultrasonic sensors pinging towards this one).
        if (mode === 2) return [Number(probe.usHeard) > 0 ? 1 : 0];
        // The sensor resolves 0.1 cm (and 0.1 in).
        if (mode === 1 || mode === 4 || mode === 6) return [none ? US_NOTHING_IN : Math.round(mm / 25.4 * 10) / 10];
        return [none ? US_NOTHING_CM : Math.round(mm) / 10];
    }
    if (type === EV3_TYPE.gyro) {
        // Degrees, clockwise seen from above positive (the brick's heading), from where it was last reset.
        const angle = Math.round((Number(state.headingDeg) || 0) - (Number(state.gyroZeroDeg) || 0));
        const rate = Math.round(Number(state.rateDps) || 0);
        if (mode === 1 || mode === 2) return [rate];
        if (mode === 3) return [angle, rate];
        return [angle];
    }
    return [0];
};

/** PCT: the mode's value on 0..100 (touch 0/100, ultrasonic of its 255 cm full scale). */
export const ev3SensorPct = (type, mode, state) => {
    const [v] = ev3SensorSi(type, mode, state);
    if (type === EV3_TYPE.touch) return [mode === 1 ? clamp(v, 0, 100) : v ? 100 : 0];
    if (type === EV3_TYPE.ultrasonic && mode === 2) return [v ? 100 : 0];
    if (type === EV3_TYPE.ultrasonic) return [clamp(Math.round(v * 100 / (mode === 1 ? US_NOTHING_IN : US_NOTHING_CM)), 0, 100)];
    if (type === EV3_TYPE.color && mode === 2) return [Math.round(v * 100 / 7)];
    return [clamp(Math.round(v), -100, 100)];
};

/** RAW: integers of the SI values (the EV3 sensors are digital: their raw is their value). */
export const ev3SensorRaw = (type, mode, state) => ev3SensorSi(type, mode, state).map(v => Math.round(type === EV3_TYPE.ultrasonic && mode !== 2 ? v * 10 : v));

/** The SI range of a mode (GET_MINMAX). */
export const ev3SensorMinMax = (type, mode) => {
    if (type === EV3_TYPE.touch) return mode === 1 ? [0, 1e6] : [0, 1];
    if (type === EV3_TYPE.color) return mode === 2 ? [0, 7] : mode === 4 ? [0, 1020] : [0, 100];
    if (type === EV3_TYPE.ultrasonic) return mode === 1 ? [0, 100] : mode === 2 ? [0, 1] : [0, 255];
    if (type === EV3_TYPE.gyro) return mode === 1 || mode === 2 ? [-440, 440] : [-32768, 32767];
    return [0, 100];
};

/** The catalogue device id → its EV3 type. */
export const EV3_DEVICE_TYPE = Object.freeze({
    'ev3-touch': EV3_TYPE.touch, 'ev3-color': EV3_TYPE.color, 'ev3-ultrasonic': EV3_TYPE.ultrasonic, 'ev3-gyro': EV3_TYPE.gyro,
    'ev3-large-motor': EV3_TYPE.largeMotor, 'ev3-medium-motor': EV3_TYPE.mediumMotor
});
