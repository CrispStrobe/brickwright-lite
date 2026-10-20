// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// NXT direct commands, executed (docs/ROBOT-LAB-EV3-NXT.md "NXT direct commands"; the facts and their
// citations: docs/NXT-PROTOCOL-FACTS.md). Clean-room: no code, table or text of any source is copied here.
//
// Telegram layouts follow LEGO's PUBLIC "LEGO MINDSTORMS NXT Bluetooth Developer Kit" (BDK, 2006):
//   Appendix 1 "Communication protocol" (v1.00): byte 0 the telegram type (0x00 direct command, reply
//     required; 0x01 system command, reply required; 0x02 reply; 0x80 / 0x81 the same without reply),
//     byte 1 the command, then its data; over Bluetooth every telegram is preceded by its length as two
//     bytes, LSB first, the telegram itself at most 64 bytes. System commands GET FIRMWARE VERSION (0x88)
//     and GET DEVICE INFO (0x9B).
//   Appendix 2 "Direct commands" (v1.00): each command's bytes and its reply (0x02, the command, the
//     status, then the data) and the status codes.
// Behaviour where the BDK is silent or differs — which status a bad port gets, how long an error reply
// is, what MESSAGEREAD reads — follows LEGO's open-source NXT firmware (c_cmd.c's remote-command
// handler, as published in the NXT Improved Firmware tree), which is the authority where the two
// disagree. Verified 2026-10-20 against the PDFs themselves and that source (docs/NXT-PROTOCOL-FACTS.md).
//
// This module knows the telegrams; the brick (hubs/nxt/nxt-virtual-hub.js) knows the physics.

export const DIRECT_REPLY_REQUIRED = 0x00;
export const SYSTEM_REPLY_REQUIRED = 0x01;
export const REPLY = 0x02;
export const DIRECT_NO_REPLY = 0x80;
export const SYSTEM_NO_REPLY = 0x81;

export const NXT_CMD = Object.freeze({
    STARTPROGRAM: 0x00, STOPPROGRAM: 0x01, PLAYSOUNDFILE: 0x02, PLAYTONE: 0x03, SETOUTPUTSTATE: 0x04,
    SETINPUTMODE: 0x05, GETOUTPUTSTATE: 0x06, GETINPUTVALUES: 0x07, RESETINPUTSCALEDVALUE: 0x08,
    MESSAGEWRITE: 0x09, RESETMOTORPOSITION: 0x0a, GETBATTERYLEVEL: 0x0b, STOPSOUNDPLAYBACK: 0x0c,
    KEEPALIVE: 0x0d, LSGETSTATUS: 0x0e, LSWRITE: 0x0f, LSREAD: 0x10, GETCURRENTPROGRAMNAME: 0x11,
    MESSAGEREAD: 0x13
});
/** System commands answered (Appendix 1): GET FIRMWARE VERSION, GET DEVICE INFO. */
export const NXT_SYS = Object.freeze({GET_FIRMWARE_VERSION: 0x88, GET_DEVICE_INFO: 0x9b});

/**
 * Status codes (BDK Appendix 2 "Error message back to the host"; the firmware's own numbers agree). The
 * firmware answers a bad port in a direct command with OUT_OF_RANGE, not BAD_PORT.
 */
export const STATUS = Object.freeze({SUCCESS: 0x00, PENDING: 0x20, MAILBOX_EMPTY: 0x40, FILE_NOT_FOUND: 0xbd,
    UNKNOWN_OPCODE: 0xbe, INSANE_PACKET: 0xbf, OUT_OF_RANGE: 0xc0, BUS_ERROR: 0xdd, BUFFER_FULL: 0xde,
    CHANNEL_INVALID: 0xdf, CHANNEL_NOT_READY: 0xe0, NO_PROGRAM: 0xec, ILLEGAL_SIZE: 0xed, BAD_QUEUE: 0xee,
    BAD_FIELD: 0xef, BAD_PORT: 0xf0, NO_MEMORY: 0xfb, BAD_ARGUMENTS: 0xff});

/** A message is a zero-terminated string of at most 59 bytes, the terminator included (Appendix 2 MESSAGEWRITE). */
export const MAX_MESSAGE_SIZE = 59;
/** Low-speed (I2C) transfers carry at most 16 bytes each way (Appendix 2 LSWRITE / LSREAD). */
export const LS_MAX_BYTES = 16;

/** Output mode bits, regulation modes and run states (SETOUTPUTSTATE, Appendix 2). */
export const MODE = Object.freeze({MOTORON: 0x01, BRAKE: 0x02, REGULATED: 0x04});
export const REGULATION = Object.freeze({IDLE: 0x00, MOTOR_SPEED: 0x01, MOTOR_SYNC: 0x02});
export const RUN_STATE = Object.freeze({IDLE: 0x00, RAMPUP: 0x10, RUNNING: 0x20, RAMPDOWN: 0x40});

const s8 = v => (v << 24) >> 24;
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const le16 = v => [v & 0xff, (v >> 8) & 0xff];
const le32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
/** A file name field: 15.3 characters and a terminator, 20 bytes (Appendix 2 STARTPROGRAM). */
const name20 = text => [...String(text).slice(0, 19)].map(c => c.charCodeAt(0) & 0xff).concat(Array(20).fill(0)).slice(0, 20);
const readName = (b, i) => {
    let s = '';
    for (let k = i; k < Math.min(b.length, i + 20) && b[k] !== 0; k++) s += String.fromCharCode(b[k]);
    return s;
};

/** Data bytes each direct command carries after its command byte (null: variable). */
const DATA = {
    [NXT_CMD.STARTPROGRAM]: 20, [NXT_CMD.STOPPROGRAM]: 0, [NXT_CMD.PLAYSOUNDFILE]: 21, [NXT_CMD.PLAYTONE]: 4,
    [NXT_CMD.SETOUTPUTSTATE]: 10, [NXT_CMD.SETINPUTMODE]: 3, [NXT_CMD.GETOUTPUTSTATE]: 1, [NXT_CMD.GETINPUTVALUES]: 1,
    [NXT_CMD.RESETINPUTSCALEDVALUE]: 1, [NXT_CMD.MESSAGEWRITE]: null, [NXT_CMD.RESETMOTORPOSITION]: 2,
    [NXT_CMD.GETBATTERYLEVEL]: 0, [NXT_CMD.STOPSOUNDPLAYBACK]: 0, [NXT_CMD.KEEPALIVE]: 0, [NXT_CMD.LSGETSTATUS]: 1,
    [NXT_CMD.LSWRITE]: null, [NXT_CMD.LSREAD]: 1, [NXT_CMD.GETCURRENTPROGRAMNAME]: 0, [NXT_CMD.MESSAGEREAD]: 3
};

/**
 * The reply's data length (after type, command, status) per command. The firmware fills these with zeros
 * on an error, so an error reply keeps its full size — except LSGETSTATUS and LSREAD given a port above 3,
 * which answer with the status alone (`short` below).
 */
const REPLY_DATA = {
    [NXT_CMD.GETOUTPUTSTATE]: 22, [NXT_CMD.GETINPUTVALUES]: 13, [NXT_CMD.GETBATTERYLEVEL]: 2, [NXT_CMD.KEEPALIVE]: 4,
    [NXT_CMD.LSGETSTATUS]: 1, [NXT_CMD.LSREAD]: 17, [NXT_CMD.GETCURRENTPROGRAMNAME]: 20, [NXT_CMD.MESSAGEREAD]: 61
};

const reply = (command, status, data = []) => Uint8Array.from([REPLY, command, status, ...data]);
const fail = (command, status) => reply(command, status, Array(REPLY_DATA[command] || 0).fill(0));

/**
 * Executes one telegram (without its Bluetooth length bytes).
 * @param {Uint8Array|number[]} telegram
 * @param {object} brick the NXT (hubs/nxt/nxt-virtual-hub.js)
 * @returns {{reply: Uint8Array|null, command: number, status: number}} reply: the reply telegram
 *          when one is asked for (without length bytes)
 */
export const executeTelegram = (telegram, brick) => {
    const t = telegram instanceof Uint8Array ? telegram : Uint8Array.from(telegram);
    const type = t[0];
    const command = t[1];
    const wants = type === DIRECT_REPLY_REQUIRED || type === SYSTEM_REPLY_REQUIRED;
    const done = r => ({reply: wants ? r : null, command, status: r[2]});
    if (t.length < 2) return {reply: null, command: -1, status: STATUS.INSANE_PACKET};
    if (type === SYSTEM_REPLY_REQUIRED || type === SYSTEM_NO_REPLY) return done(systemCommand(command, t, brick));
    if (type !== DIRECT_REPLY_REQUIRED && type !== DIRECT_NO_REPLY) return {reply: null, command, status: STATUS.INSANE_PACKET};
    if (!(command in DATA)) return done(fail(command, STATUS.UNKNOWN_OPCODE));
    const d = t.subarray(2);
    // A short telegram: the firmware reads whatever its buffer holds; this brick refuses it (our choice).
    if (DATA[command] !== null && d.length < DATA[command]) return done(fail(command, STATUS.ILLEGAL_SIZE));
    const port3 = p => p >= 0 && p <= 2;
    const port4 = p => p >= 0 && p <= 3;
    // A bad port is OUT_OF_RANGE in the firmware (every port check in its remote-command handler).
    const badPort = () => done(fail(command, STATUS.OUT_OF_RANGE));
    const short = () => done(reply(command, STATUS.OUT_OF_RANGE));
    switch (command) {
    case NXT_CMD.STARTPROGRAM: return done(reply(command, brick.startProgram(readName(d, 0))));
    case NXT_CMD.STOPPROGRAM: return done(reply(command, brick.stopProgram()));
    case NXT_CMD.PLAYSOUNDFILE: brick.playSoundFile(d[0] !== 0, readName(d, 1)); return done(reply(command, STATUS.SUCCESS));
    case NXT_CMD.PLAYTONE: brick.playTone(u16(d, 0), u16(d, 2)); return done(reply(command, STATUS.SUCCESS));
    case NXT_CMD.SETOUTPUTSTATE: {
        const port = d[0];
        if (!port3(port) && port !== 0xff) return badPort();
        // The firmware stores the power as given (no range check) and limits the drive to ±100.
        const power = s8(d[1]);
        const state = {power, mode: d[2], regulation: d[3], turnRatio: s8(d[4]), runState: d[5], tachoLimit: u32(d, 6)};
        for (const p of port === 0xff ? [0, 1, 2] : [port]) brick.setOutputState(p, state);
        return done(reply(command, STATUS.SUCCESS));
    }
    case NXT_CMD.SETINPUTMODE:
        if (!port4(d[0])) return badPort();
        brick.setInputMode(d[0], d[1], d[2]);
        return done(reply(command, STATUS.SUCCESS));
    case NXT_CMD.GETOUTPUTSTATE: {
        if (!port3(d[0])) return badPort();
        const o = brick.getOutputState(d[0]);
        return done(reply(command, STATUS.SUCCESS, [d[0], o.power & 0xff, o.mode, o.regulation, o.turnRatio & 0xff, o.runState,
            ...le32(o.tachoLimit), ...le32(o.tachoCount), ...le32(o.blockTachoCount), ...le32(o.rotationCount)]));
    }
    case NXT_CMD.GETINPUTVALUES: {
        if (!port4(d[0])) return badPort();
        const v = brick.getInputValues(d[0]);
        return done(reply(command, STATUS.SUCCESS, [d[0], v.valid ? 1 : 0, v.calibrated ? 1 : 0, v.type, v.mode,
            ...le16(v.raw), ...le16(v.normalized), ...le16(v.scaled), ...le16(v.calibratedValue)]));
    }
    case NXT_CMD.RESETINPUTSCALEDVALUE:
        if (!port4(d[0])) return badPort();
        brick.resetInputScaledValue(d[0]);
        return done(reply(command, STATUS.SUCCESS));
    case NXT_CMD.MESSAGEWRITE: {
        const size = d[1];
        if (d.length < 2 + size) return done(fail(command, STATUS.ILLEGAL_SIZE));
        // The firmware refuses an empty, oversize or unterminated message as out of range.
        if (size === 0 || size > MAX_MESSAGE_SIZE || d[2 + size - 1] !== 0) return done(fail(command, STATUS.OUT_OF_RANGE));
        return done(reply(command, brick.messageWrite(d[0], Array.from(d.subarray(2, 2 + size)))));
    }
    case NXT_CMD.RESETMOTORPOSITION:
        if (!port3(d[0])) return badPort();
        brick.resetMotorPosition(d[0], d[1] !== 0);
        return done(reply(command, STATUS.SUCCESS));
    case NXT_CMD.GETBATTERYLEVEL: return done(reply(command, STATUS.SUCCESS, le16(brick.batteryMillivolts())));
    case NXT_CMD.STOPSOUNDPLAYBACK: brick.stopSound(); return done(reply(command, STATUS.SUCCESS));
    case NXT_CMD.KEEPALIVE: return done(reply(command, STATUS.SUCCESS, le32(brick.keepAlive())));
    case NXT_CMD.LSGETSTATUS: {
        if (!port4(d[0])) return short();
        // The bytes-ready count comes back whatever the status (the firmware fills it in regardless).
        const r = brick.lsGetStatus(d[0]);
        return done(reply(command, r.status, [r.bytesReady & 0xff]));
    }
    case NXT_CMD.LSWRITE: {
        const [port, txLength, rxLength] = d;
        if (!port4(port)) return short();
        if (d.length < 3 + txLength) return done(fail(command, STATUS.ILLEGAL_SIZE));
        if (txLength > LS_MAX_BYTES || rxLength > LS_MAX_BYTES) return done(fail(command, STATUS.ILLEGAL_SIZE));
        return done(reply(command, brick.lsWrite(port, Array.from(d.subarray(3, 3 + txLength)), rxLength)));
    }
    case NXT_CMD.LSREAD: {
        if (!port4(d[0])) return short();
        // Always 16 data bytes, zero-padded, after the count read (Appendix 2 LSREAD); status from the channel.
        const r = brick.lsRead(d[0]);
        const data = r.data.slice(0, LS_MAX_BYTES);
        return done(reply(command, r.status, [data.length, ...data.concat(Array(LS_MAX_BYTES).fill(0)).slice(0, LS_MAX_BYTES)]));
    }
    case NXT_CMD.GETCURRENTPROGRAMNAME: {
        const name = brick.currentProgramName();
        return done(name ? reply(command, STATUS.SUCCESS, name20(name)) : fail(command, STATUS.NO_PROGRAM));
    }
    case NXT_CMD.MESSAGEREAD: {
        // Byte 2 the remote inbox — the brick's queue read (0–19; 10–19 hold what a program sends its
        // master) —, byte 3 the local inbox, echoed in the reply, byte 4 remove? The reply is always
        // local inbox, size, 59 data bytes (zero-padded), whatever the status.
        const [remote, local, remove] = d;
        const r = brick.messageRead(remote, remove !== 0);
        const m = r.status === STATUS.SUCCESS ? r.message.slice(0, MAX_MESSAGE_SIZE) : [];
        return done(reply(command, r.status, [local, m.length, ...m.concat(Array(MAX_MESSAGE_SIZE).fill(0)).slice(0, MAX_MESSAGE_SIZE)]));
    }
    default: return done(fail(command, STATUS.UNKNOWN_OPCODE));
    }
};

/**
 * System commands (Appendix 1): the version and device info; anything else (files, flash) refused with
 * UNKNOWN_OPCODE (our choice: the firmware's system-command handler leaves an unknown command unanswered).
 * GET DEVICE INFO: name 15 bytes (14 characters + terminator), Bluetooth address 7 bytes, 4 bytes the BDK
 * calls the signal strength (the firmware puts one link-quality byte per connection there), free flash ULONG.
 */
const systemCommand = (command, t, brick) => {
    if (command === NXT_SYS.GET_FIRMWARE_VERSION) {
        const v = brick.versions();
        return reply(command, STATUS.SUCCESS, [v.protocol[1], v.protocol[0], v.firmware[1], v.firmware[0]]);
    }
    if (command === NXT_SYS.GET_DEVICE_INFO) {
        const info = brick.deviceInfo();
        const nameBytes = [...info.name.slice(0, 14)].map(c => c.charCodeAt(0)).concat(Array(15).fill(0)).slice(0, 15);
        return reply(command, STATUS.SUCCESS, [...nameBytes, ...info.address.concat(Array(7).fill(0)).slice(0, 7),
            ...le32(info.signal), ...le32(info.freeFlash)]);
    }
    return reply(command, STATUS.UNKNOWN_OPCODE);
};

/** Cuts a Bluetooth byte stream into telegrams by their two length bytes (Appendix 1). */
export const telegramReader = () => {
    let buffer = [];
    return bytes => {
        buffer = buffer.concat(Array.from(bytes));
        const out = [];
        while (buffer.length >= 2) {
            const length = buffer[0] | (buffer[1] << 8);
            if (length > 64) {
                // Appendix 2 "Maximum command length": a telegram is at most 64 bytes, the two length
                // bytes not counted; a longer length is a broken stream.
                buffer = [];
                throw new RangeError(`an NXT telegram of ${length} bytes is more than 64`);
            }
            if (buffer.length < length + 2) break;
            out.push(Uint8Array.from(buffer.slice(2, length + 2)));
            buffer = buffer.slice(length + 2);
        }
        return out;
    };
};

/** A telegram with its Bluetooth length bytes. */
export const withLength = telegram => Uint8Array.from([telegram.length & 0xff, telegram.length >> 8, ...telegram]);
