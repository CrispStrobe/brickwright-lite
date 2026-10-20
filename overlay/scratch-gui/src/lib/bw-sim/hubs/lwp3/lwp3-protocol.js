// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LEGO Wireless Protocol 3.0 (LWP3) framing, clean-room from LEGO's PUBLIC document
// "LEGO Wireless Protocol 3.0.00" (https://lego.github.io/lego-ble-wireless-protocol-docs/,
// © 2018 LEGO System A/S; read 2026-10-19). Section numbers below are that document's.
// Pure functions over byte arrays, no imports: the hub (lwp3-virtual-hub.js), the GATT
// peripheral (virtual-hub/lwp3-peripheral.js) and the tests all use these.
//
// What is NOT in LEGO's document and comes from community sources, each marked where used
// (docs/LWP3-VIRTUAL-HUB-NOTES.md lists them): the port ids of each hub's internal devices,
// the System Type IDs of the Technic hubs, and the mode numbers/value formats of the
// devices (a real hub reports them through Port Mode Information 0x44, §3.20, which this
// virtual hub does not implement).

/** §3 LEGO Hub Service and its one characteristic. */
export const LWP3_SERVICE = '00001623-1212-efde-1623-785feabcd123';
export const LWP3_CHARACTERISTIC = '00001624-1212-efde-1623-785feabcd123';

/** §2 Advertising: the manufacturer data's company id (LEGO System A/S). */
export const LEGO_COMPANY_ID = 0x0397;

/** §3.3 Message Types (those this hub reads or writes). */
export const MSG = Object.freeze({
    HUB_PROPERTIES: 0x01, HUB_ACTIONS: 0x02, HUB_ALERTS: 0x03, HUB_ATTACHED_IO: 0x04, ERROR: 0x05,
    PORT_INFORMATION_REQUEST: 0x21, PORT_MODE_INFORMATION_REQUEST: 0x22,
    PORT_INPUT_FORMAT_SETUP_SINGLE: 0x41, PORT_INPUT_FORMAT_SETUP_COMBINED: 0x42,
    PORT_VALUE_SINGLE: 0x45, PORT_INPUT_FORMAT_SINGLE: 0x47,
    VIRTUAL_PORT_SETUP: 0x61, PORT_OUTPUT_COMMAND: 0x81, PORT_OUTPUT_COMMAND_FEEDBACK: 0x82
});

/** §3.5.3 Hub Property Reference. */
export const PROP = Object.freeze({
    ADVERTISING_NAME: 0x01, BUTTON: 0x02, FW_VERSION: 0x03, HW_VERSION: 0x04, RSSI: 0x05, BATTERY_VOLTAGE: 0x06,
    BATTERY_TYPE: 0x07, MANUFACTURER_NAME: 0x08, RADIO_FW_VERSION: 0x09, LWP_VERSION: 0x0a, SYSTEM_TYPE_ID: 0x0b,
    HW_NETWORK_ID: 0x0c, PRIMARY_MAC: 0x0d, SECONDARY_MAC: 0x0e, HW_NETWORK_FAMILY: 0x0f
});

/** §3.5.4 Hub Property Operation. */
export const PROP_OP = Object.freeze({SET: 0x01, ENABLE_UPDATES: 0x02, DISABLE_UPDATES: 0x03, RESET: 0x04,
    REQUEST_UPDATE: 0x05, UPDATE: 0x06});

/** §3.6.2 Action Types (downstream). */
export const ACTION = Object.freeze({SWITCH_OFF: 0x01, DISCONNECT: 0x02, VCC_ON: 0x03, VCC_OFF: 0x04,
    BUSY_ON: 0x05, BUSY_OFF: 0x06, HUB_WILL_SWITCH_OFF: 0x30, HUB_WILL_DISCONNECT: 0x31});

/** §3.7 Alert types and operations. */
export const ALERT_OP = Object.freeze({ENABLE_UPDATES: 0x01, DISABLE_UPDATES: 0x02, REQUEST_UPDATES: 0x03, UPDATE: 0x04});

/** §3.8.3 Event. */
export const IO_EVENT = Object.freeze({DETACHED: 0x00, ATTACHED: 0x01, ATTACHED_VIRTUAL: 0x02});

/**
 * §3.8.4 IO Type IDs (UInt16). LEGO's list stops at 0x0028; the later ids are the community's
 * (node-poweredup src/consts.ts DeviceType; pybricks lib/lego/lego/device.h), marked `community`.
 */
export const IO_TYPE = Object.freeze({
    MOTOR: 0x0001, TRAIN_MOTOR: 0x0002, BUTTON: 0x0005, LED_LIGHT: 0x0008, VOLTAGE: 0x0014, CURRENT: 0x0015,
    PIEZO: 0x0016, RGB_LIGHT: 0x0017, EXTERNAL_TILT: 0x0022, MOTION_SENSOR: 0x0023, VISION_SENSOR: 0x0025,
    EXTERNAL_MOTOR_TACHO: 0x0026, INTERNAL_MOTOR_TACHO: 0x0027, INTERNAL_TILT: 0x0028,
    // community (not in LEGO's §3.8.4 list):
    TECHNIC_L_MOTOR: 0x002e, TECHNIC_XL_MOTOR: 0x002f, SPIKE_M_MOTOR: 0x0030, SPIKE_L_MOTOR: 0x0031,
    TECHNIC_HUB_TEMPERATURE: 0x003c, TECHNIC_HUB_ACCELEROMETER: 0x0039, TECHNIC_HUB_GYRO: 0x003a,
    TECHNIC_HUB_TILT: 0x003b, SPIKE_S_MOTOR: 0x0041
});

/** §3.9.2 Error Codes. */
export const ERROR_CODE = Object.freeze({ACK: 0x01, MACK: 0x02, BUFFER_OVERFLOW: 0x03, TIMEOUT: 0x04,
    COMMAND_NOT_RECOGNIZED: 0x05, INVALID_USE: 0x06, OVERCURRENT: 0x07, INTERNAL_ERROR: 0x08});

/** §3.26.2 Startup and Completion Information: ssss cccc. */
export const STARTUP = Object.freeze({BUFFER_IF_NECESSARY: 0x00, EXECUTE_IMMEDIATELY: 0x10});
export const COMPLETION = Object.freeze({NO_ACTION: 0x00, COMMAND_FEEDBACK: 0x01});

/** §3.27 Motor sub commands (single motor, and the synchronised ones this hub refuses). */
export const SUB = Object.freeze({
    START_POWER_PAIR: 0x02, SET_ACC_TIME: 0x05, SET_DEC_TIME: 0x06, START_SPEED: 0x07, START_SPEED_PAIR: 0x08,
    START_SPEED_FOR_TIME: 0x09, START_SPEED_FOR_TIME_PAIR: 0x0a, START_SPEED_FOR_DEGREES: 0x0b,
    START_SPEED_FOR_DEGREES_PAIR: 0x0c, GOTO_ABSOLUTE_POSITION: 0x0d, GOTO_ABSOLUTE_POSITION_PAIR: 0x0e,
    PRESET_ENCODER_PAIR: 0x14, WRITE_DIRECT: 0x50, WRITE_DIRECT_MODE_DATA: 0x51
});

/** §3.27.7 EndState [0 = FLOAT, 126 = HOLD, 127 = BRAKE]. */
export const END_STATE = Object.freeze({FLOAT: 0, HOLD: 126, BRAKE: 127});

/** §3.27.1 StartPower(Power): [0] FLOAT, [127] BRAKE; StartSpeed: [0] implicit [126] HOLD POSITION (§3.27.5). */
export const POWER_FLOAT = 0;
export const POWER_BRAKE = 127;

/** §3.32.1 Port Output Command Feedback, bit fields. */
export const FEEDBACK = Object.freeze({IN_PROGRESS: 0x01, COMPLETED: 0x02, DISCARDED: 0x04, IDLE: 0x08, BUSY_FULL: 0x10});

/** §2.1 System Type and Device Number (SSS DDDDD). LEGO lists 0x00, 0x20, 0x40, 0x41, 0x42; the Technic
 *  hubs' ids are the community's (node-poweredup BLEManufacturerData; pybricks lwp3 hub kinds). */
export const SYSTEM_TYPE = Object.freeze({WEDO2_HUB: 0x00, DUPLO_TRAIN: 0x20, MOVE_HUB: 0x40, TWO_PORT_HUB: 0x41,
    TWO_PORT_HANDSET: 0x42, TECHNIC_MEDIUM_HUB: 0x80, TECHNIC_SMALL_HUB: 0x83});

// ---- §3.1 / §3.2 the common header ------------------------------------------------------

/**
 * One message: Common Header (Length, Hub ID 0x00, Message Type) + payload. Lengths up to 127
 * take one byte; longer ones two (bit 7 of the first set, §3.2).
 * @param {number} type
 * @param {number[]|Uint8Array} payload
 * @returns {Uint8Array}
 */
export const message = (type, payload = []) => {
    const body = [0x00, type, ...payload];
    const n = body.length + 1;
    if (n <= 127) return Uint8Array.from([n, ...body]);
    const total = body.length + 2;
    return Uint8Array.from([0x80 | (total & 0x7f), total >> 7, ...body]);
};

/**
 * Splits a message into {length, hubId, type, payload}; throws on a malformed one.
 * @param {Uint8Array|number[]} bytes
 */
export const parse = bytes => {
    const b = Uint8Array.from(bytes);
    if (b.length < 3) throw new RangeError('an LWP3 message has at least 3 bytes');
    let length = b[0];
    let at = 1;
    if (length & 0x80) {
        if (b.length < 4) throw new RangeError('truncated two-byte length');
        length = (length & 0x7f) | (b[1] << 7);
        at = 2;
    }
    if (length !== b.length) throw new RangeError(`length byte says ${length}, message has ${b.length}`);
    return {length, hubId: b[at], type: b[at + 1], payload: b.slice(at + 2)};
};

// ---- little-endian helpers ---------------------------------------------------------------

export const int8 = v => (v << 24) >> 24;
export const u16 = v => [v & 0xff, (v >> 8) & 0xff];
export const i16 = v => u16(v & 0xffff);
export const i32 = v => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
export const readI16 = (b, at) => ((b[at] | (b[at + 1] << 8)) << 16) >> 16;
export const readU16 = (b, at) => b[at] | (b[at + 1] << 8);
export const readI32 = (b, at) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24);
export const readU32 = (b, at) => readI32(b, at) >>> 0;

// ---- upstream messages (hub → host) --------------------------------------------------------

/** §3.5.2 Hub Properties, operation Update (0x06). */
export const propertyUpdate = (property, payload) => message(MSG.HUB_PROPERTIES, [property, PROP_OP.UPDATE, ...payload]);

/** §3.5.6 Version Number Encoding: Int32 LE, 0MMM mmmm | BBBB BBBB (BCD) | build (BCD, 2 bytes). */
export const versionNumber = (major, minor, bugfix, build) => {
    const bcd = (n, digits) => parseInt(String(n).padStart(digits, '0').slice(-digits), 16);
    return [bcd(build, 4) & 0xff, bcd(build, 4) >> 8, bcd(bugfix, 2), ((major & 0x7) << 4) | (minor & 0xf)];
};

/** §3.8.1 Hub Attached I/O, Attached (15 bytes): port, event, IO type (UInt16), HW and SW revision (Int32 each). */
export const attachedIo = (port, ioType, hw = versionNumber(1, 0, 0, 0), sw = versionNumber(1, 0, 0, 0)) =>
    message(MSG.HUB_ATTACHED_IO, [port, IO_EVENT.ATTACHED, ...u16(ioType), ...hw, ...sw]);

/** §3.8.1 Detached (5 bytes). */
export const detachedIo = port => message(MSG.HUB_ATTACHED_IO, [port, IO_EVENT.DETACHED]);

/** §3.9.1 Generic Error: the command type that caused it, and the code. */
export const errorMessage = (commandType, code) => message(MSG.ERROR, [commandType, code]);

/** §3.23.1 Port Input Format (Single), the handshake to 0x41: port, mode, delta (UInt32), notification. */
export const portInputFormat = (port, mode, delta, notify) =>
    message(MSG.PORT_INPUT_FORMAT_SINGLE, [port, mode, ...i32(delta), notify ? 1 : 0]);

/** §3.21.1 Port Value (Single): port, then the value bytes in the mode's format. */
export const portValue = (port, valueBytes) => message(MSG.PORT_VALUE_SINGLE, [port, ...valueBytes]);

/** §3.32.1 Port Output Command Feedback: port, feedback bits. */
export const outputFeedback = (port, bits) => message(MSG.PORT_OUTPUT_COMMAND_FEEDBACK, [port, bits]);

// ---- downstream messages (host → hub): what the tests and a host send ------------------------

/** §3.17.1 Port Input Format Setup (Single): port, mode, delta (UInt32), notification enabled. */
export const inputFormatSetup = (port, mode, delta, notify) =>
    message(MSG.PORT_INPUT_FORMAT_SETUP_SINGLE, [port, mode, ...i32(delta), notify ? 1 : 0]);

/** §3.26.1 Port Output Command: port, startup/completion, sub command, payload. */
export const outputCommand = (port, startup, sub, payload) =>
    message(MSG.PORT_OUTPUT_COMMAND, [port, startup, sub, ...payload]);

// ---- device value formats (mode tables are the community's, see the header) ----------------

/**
 * Modes a hub here reports, per IO type, with the value encoder. Motors with a tacho
 * (node-poweredup src/devices/tachomotor.ts, absolutemotor.ts; pybricks lump.h): 1 SPEED
 * (Int8 %), 2 POS (Int32 degrees), 3 APOS (Int16 degrees, −180..179; absolute motors only).
 * Tilt 0x28 (movehubtiltsensor.ts): 0 ANGLE (2 × Int8 degrees). Technic hub tilt 0x3B
 * (technicmediumhubtiltsensor.ts): 0 POS (3 × Int16 degrees). Vision sensor 0x25
 * (colordistancesensor.ts): 0 COLOR (UInt8 colour index), 1 PROX (UInt8 0..10), 3 REFLT (UInt8 %).
 */
const TACHO = {1: v => [int8(v.speedPct) & 0xff], 2: v => i32(Math.round(v.positionDeg))};
const ABSOLUTE = {...TACHO, 3: v => i16(Math.round(((v.positionDeg % 360) + 540) % 360 - 180))};
export const MODE_FORMATS = Object.freeze({
    [IO_TYPE.EXTERNAL_MOTOR_TACHO]: TACHO,
    [IO_TYPE.INTERNAL_MOTOR_TACHO]: TACHO,
    [IO_TYPE.TECHNIC_L_MOTOR]: ABSOLUTE,
    [IO_TYPE.TECHNIC_XL_MOTOR]: ABSOLUTE,
    [IO_TYPE.SPIKE_M_MOTOR]: ABSOLUTE,
    [IO_TYPE.SPIKE_L_MOTOR]: ABSOLUTE,
    [IO_TYPE.SPIKE_S_MOTOR]: ABSOLUTE,
    [IO_TYPE.INTERNAL_TILT]: {0: v => [int8(v.rollDeg) & 0xff, int8(v.pitchDeg) & 0xff]},
    [IO_TYPE.TECHNIC_HUB_TILT]: {0: v => [...i16(Math.round(v.yawDeg)), ...i16(Math.round(v.pitchDeg)), ...i16(Math.round(v.rollDeg))]},
    [IO_TYPE.VISION_SENSOR]: {0: v => [v.colorIndex & 0xff], 1: v => [v.proximity & 0xff], 3: v => [v.reflection & 0xff]}
});

/** IO types that are motors with a tacho (relative encoder, 1° resolution). */
export const TACHO_TYPES = Object.freeze(new Set(Object.entries(MODE_FORMATS).filter(([, m]) => m[2]).map(([t]) => Number(t))));
/** IO types that are motors (with or without a tacho). */
export const MOTOR_TYPES = Object.freeze(new Set([IO_TYPE.MOTOR, IO_TYPE.TRAIN_MOTOR, ...TACHO_TYPES]));
