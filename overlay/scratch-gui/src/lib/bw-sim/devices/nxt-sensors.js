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
// FAHRENHEITMODE 0xC0, ANGLESTEPSMODE 0xE0. The ultrasonic sensor's I2C register file: LEGO
// "MINDSTORMS NXT Hardware Developer Kit", Appendix 7 "Ultrasonic sensor I2C communication protocol"
// (v1.00), read 2026-10-20 — see docs/NXT-PROTOCOL-FACTS.md "Ultrasonic sensor" for the register
// table, its citations and what remains unverified. Where a number is ours it says "estimated".

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
    // The echo's own distance when the scene gives it (sensors.js rangeMm), else SPIKE's windowed one.
    const mm = probe ? Number(probe.rangeMm ?? probe.distance) : -1;
    return mm >= 0 ? clamp(Math.round(mm / 10), 0, 254) : 255;
};

/** I2C address of the ultrasonic sensor (8-bit form, as LSWRITE sends it; 0x01 as a 7-bit address). */
export const US_I2C_ADDRESS = 0x02;

/** Commands written to register 0x41 [HDK Appendix 7]. */
export const US_COMMAND = Object.freeze({off: 0x00, singleShot: 0x01, continuous: 0x02, eventCapture: 0x03, warmReset: 0x04});

/** The factory calibration the sensor reports (zero 0, scale factor 1, scale divisor 14) [HDK Appendix 7]. */
const US_FACTORY = Object.freeze({zero: 0x00, scale: 0x01, divisor: 0x0e});
/** The continuous-measurement interval after a reset (estimated: NxOS's default; not in Appendix 7). */
export const US_DEFAULT_INTERVAL = 1;

/** A sensor fresh from power-up: continuous measurement (the default), factory calibration. */
export const usFreshState = () => ({command: US_COMMAND.continuous, interval: US_DEFAULT_INTERVAL,
    zero: US_FACTORY.zero, scale: US_FACTORY.scale, divisor: US_FACTORY.divisor, held: null});

/** The eight measurement bytes for a probe: the first echo, the other seven none (estimated: one echo per probe). */
const usMeasure = probe => [usDistanceCm(probe), 255, 255, 255, 255, 255, 255, 255];

/**
 * Writes `bytes` from `register` on [HDK Appendix 7]: 0x41 the command (single shot measures once and
 * holds the result; off holds the last result; warm reset restores the defaults), 0x40 the interval,
 * 0x50–0x52 the actual zero, scale factor and divisor. Other registers are read-only.
 */
export const usWrite = (us, register, bytes, probe) => {
    bytes.forEach((value, k) => {
        const at = register + k;
        if (at === 0x41) {
            if (value === US_COMMAND.warmReset) {
                Object.assign(us, usFreshState());
                return;
            }
            // Off keeps the last measurement; single shot takes one now (Appendix 7: a new measurement
            // only each time the command is sent).
            const live = us.command === US_COMMAND.continuous || us.command === US_COMMAND.eventCapture;
            if (value === US_COMMAND.off && live) us.held = usMeasure(probe);
            if (value === US_COMMAND.singleShot) us.held = usMeasure(probe);
            us.command = value;
        } else if (at === 0x40) us.interval = value;
        else if (at === 0x50) us.zero = value;
        else if (at === 0x51) us.scale = value;
        else if (at === 0x52) us.divisor = value;
    });
};

/** The constant strings, each read as one block from its first register [HDK Appendix 7]. */
const US_STRINGS = Object.freeze({0x00: 'V1.0', 0x08: 'LEGO', 0x10: 'Sonar', 0x14: '10E-2m'});

/**
 * A read of `length` bytes from `register`. Appendix 7 reads the version, product id, sensor type and
 * units as zero-padded strings from their first register, while 0x11–0x13 are one-byte registers of
 * their own — so a string is a block, not bytes spread over the registers after it.
 */
export const usRead = (register, length, probe, us = usFreshState()) => {
    if (register in US_STRINGS) {
        const s = US_STRINGS[register];
        return Array.from({length}, (_, k) => (k < s.length ? s.charCodeAt(k) : 0));
    }
    return Array.from({length}, (_, k) => usRegister(register + k, probe, us));
};

/** The ultrasonic sensor's I2C register file [HDK Appendix 7], one byte at an address. */
export const usRegister = (address, probe, us = usFreshState()) => {
    const text = (s, at) => (at >= 0 && at < s.length ? s.charCodeAt(at) : 0);
    if (address >= 0x00 && address < 0x08) return text('V1.0', address - 0x00);
    if (address >= 0x08 && address < 0x10) return text('LEGO', address - 0x08);
    if (address === 0x10) return text('Sonar', 0);
    if (address === 0x11) return US_FACTORY.zero;
    if (address === 0x12) return US_FACTORY.scale;
    if (address === 0x13) return US_FACTORY.divisor;
    // The units, "10E-2m" (centimetres), from 0x14: 7 bytes with the terminator.
    if (address >= 0x14 && address < 0x1b) return text('10E-2m', address - 0x14);
    if (address === 0x40) return us.interval;
    if (address === 0x41) return us.command;
    if (address >= 0x42 && address <= 0x49) {
        // Continuous (and event capture: no other sensor in the scene) measure now; single shot and off
        // report what was held (nothing measured yet: 255, estimated).
        const live = us.command === US_COMMAND.continuous || us.command === US_COMMAND.eventCapture;
        const bytes = live ? usMeasure(probe) : (us.held || Array(8).fill(255));
        return bytes[address - 0x42];
    }
    if (address === 0x50) return us.zero;
    if (address === 0x51) return us.scale;
    if (address === 0x52) return us.divisor;
    return 0;
};
