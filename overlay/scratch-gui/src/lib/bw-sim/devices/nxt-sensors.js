// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The NXT sensors as device models (docs/ROBOT-LAB-EV3-NXT.md "NXT sensors"; devices/catalog.js
// NXT_SENSORS): what an NXT input port reports for a probe sensors.js measured in the scene, in
// the four numbers GETINPUTVALUES returns — the raw A/D value, the normalized A/D value (0..1023),
// the scaled value (in the port's mode) and the calibrated value ("currently unused"). Pure
// functions, no imports.
//
// SOURCES. Sensor types and modes: LEGO "MINDSTORMS NXT Bluetooth Developer Kit", Appendix 2
// "Direct commands" (v1.00), SETINPUTMODE: NO_SENSOR 0x00, SWITCH 0x01, TEMPERATURE 0x02,
// REFLECTION 0x03, ANGLE 0x04, LIGHT_ACTIVE 0x05, LIGHT_INACTIVE 0x06, SOUND_DB 0x07,
// SOUND_DBA 0x08, CUSTOM 0x09, LOWSPEED 0x0A, LOWSPEED_9V 0x0B; RAWMODE 0x00, BOOLEANMODE 0x20,
// TRANSITIONCNTMODE 0x40, PERIODCOUNTERMODE 0x60, PCTFULLSCALEMODE 0x80, CELSIUSMODE 0xA0,
// FAHRENHEITMODE 0xC0, ANGLESTEPSMODE 0xE0. The ultrasonic sensor's I2C registers: LEGO
// "MINDSTORMS NXT Hardware Developer Kit", Appendix 7 "Ultrasonic sensor I2C communication
// protocol" (address 0x02; 0x00 version, 0x08 product id, 0x10 sensor type, 0x41 command,
// 0x42–0x49 measurement bytes 0–7; distance in cm, 255 = nothing). Where a number is ours it
// says "estimated".

export const NXT_SENSOR_TYPE = Object.freeze({none: 0x00, switch: 0x01, temperature: 0x02, reflection: 0x03, angle: 0x04,
    lightActive: 0x05, lightInactive: 0x06, soundDb: 0x07, soundDba: 0x08, custom: 0x09, lowspeed: 0x0a, lowspeed9v: 0x0b});
export const NXT_SENSOR_MODE = Object.freeze({raw: 0x00, boolean: 0x20, transitions: 0x40, periods: 0x60, percent: 0x80,
    celsius: 0xa0, fahrenheit: 0xc0, angleSteps: 0xe0});

/** The NXT's input A/D converter is 10-bit; an open input reads full scale. */
export const RAW_FULL = 1023;
/**
 * A pressed touch sensor shorts its input through the switch: a low reading (estimated: anything
 * below the boolean threshold, 45 % of full scale, reads pressed — the threshold the RCX's firmware
 * reference documents for the same kind of switch, hubs/rcx).
 */
export const TOUCH_PRESSED_RAW = 183;
export const BOOLEAN_LOW_PCT = 45;
export const BOOLEAN_HIGH_PCT = 55;

/** The light sensor's percent over black and white paper (estimated, as the RCX's: builders report the 30s and 50s). */
export const LIGHT_PCT_AT_BLACK = 30;
export const LIGHT_PCT_AT_WHITE = 56;
/** The sound sensor in a quiet room, percent (estimated: the scene has no sound). */
export const SOUND_QUIET_PCT = 4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The analog part of a reading: {raw, normalized} for a probe and the device on the port.
 * @param {string} device catalogue id ('nxt-touch', 'nxt-light', 'nxt-sound')
 * @param {object|null} probe sensors.js reading
 * @param {number} type the port's sensor type (LIGHT_ACTIVE / LIGHT_INACTIVE)
 */
export const nxtAnalog = (device, probe, type) => {
    if (device === 'nxt-touch') {
        const raw = probe && probe.pressed ? TOUCH_PRESSED_RAW : RAW_FULL;
        return {raw, normalized: raw};
    }
    if (device === 'nxt-light') {
        // Reflected light (LIGHT_ACTIVE: its LED on): the scene's reflectance on the line from black to white.
        const r = probe && probe.color !== -1 && Number.isFinite(probe.reflection) ? clamp(probe.reflection, 0, 100) : 0;
        const pct = type === NXT_SENSOR_TYPE.lightInactive ? 5 : LIGHT_PCT_AT_BLACK + (LIGHT_PCT_AT_WHITE - LIGHT_PCT_AT_BLACK) * r / 100;
        // More light, a higher normalized value; the raw A/D reading runs the other way (estimated).
        const normalized = Math.round(pct * RAW_FULL / 100);
        return {raw: RAW_FULL - normalized, normalized};
    }
    if (device === 'nxt-sound') {
        const normalized = Math.round(SOUND_QUIET_PCT * RAW_FULL / 100);
        return {raw: RAW_FULL - normalized, normalized};
    }
    return {raw: RAW_FULL, normalized: RAW_FULL};
};

/**
 * The scaled value in a mode, with the port's boolean state (hysteresis between 45 and 55 %) and
 * transition count kept in `memory` ({bool, transitions}).
 */
export const nxtScaled = (mode, normalized, memory) => {
    const pct = normalized * 100 / RAW_FULL;
    // A switch reads TRUE while pressed: a LOW reading.
    if (pct < BOOLEAN_LOW_PCT && !memory.bool) {
        memory.bool = true;
        memory.transitions += 1;
    } else if (pct > BOOLEAN_HIGH_PCT && memory.bool) {
        memory.bool = false;
        memory.transitions += 1;
    }
    const m = mode & 0xe0;
    if (m === NXT_SENSOR_MODE.boolean) return memory.bool ? 1 : 0;
    if (m === NXT_SENSOR_MODE.transitions) return memory.transitions;
    if (m === NXT_SENSOR_MODE.periods) return Math.floor(memory.transitions / 2);
    if (m === NXT_SENSOR_MODE.percent) return Math.round(pct);
    return normalized;
};

/** The ultrasonic sensor's distance byte: centimetres, 255 when nothing echoes (sensors.js: −1). */
export const usDistanceCm = probe => {
    const mm = probe ? Number(probe.distance) : -1;
    return mm >= 0 ? clamp(Math.round(mm / 10), 0, 254) : 255;
};

/** The ultrasonic sensor's I2C register file [HDK Appendix 7], read at an address. */
export const usRegister = (address, probe) => {
    const text = (s, at) => (at >= 0 && at < s.length ? s.charCodeAt(at) : 0);
    if (address >= 0x00 && address < 0x08) return text('V1.0', address - 0x00);
    if (address >= 0x08 && address < 0x10) return text('LEGO', address - 0x08);
    if (address >= 0x10 && address < 0x18) return text('Sonar', address - 0x10);
    if (address === 0x41) return 0x02; // continuous measurement
    if (address === 0x42) return usDistanceCm(probe);
    if (address > 0x42 && address <= 0x49) return 255; // echoes 1–7: none beyond the first
    return 0;
};

/** I2C address of the ultrasonic sensor. */
export const US_I2C_ADDRESS = 0x02;
