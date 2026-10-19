// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The WeDo 2.0 Smart Hub's own GATT protocol — NOT LEGO Wireless Protocol 3 (docs/WEDO-HUB-PROTOCOL-NOTES.md
// "Which protocol applies"). Sources, all public: LEGO's WeDo 2.0 communication SDK (2.4.0, the
// official archive; its service/characteristic definitions as quoted in the notes doc), scratch-vm's
// own extensions/scratch3_wedo2/index.js (BSD-3-Clause, Scratch Foundation; in this repository) and
// node-poweredup src/hubs/wedo2smarthub.ts (MIT; port map and the piezo command, as the notes doc
// cross-checks). Byte layouts:
//
//   Attached IO   (notify, 1527)  connectId, attached (1) / detached (0), hub index, IO type, …
//   Input Command (write, 1563)   1 (command id "sensor format"), 2 (type "write"), connectId, IO type,
//                                 mode, delta interval (UInt32 LE), unit (0 raw, 1 percent, 2 SI),
//                                 notifications enabled (1)
//   Input Values  (notify, 1560)  a first byte the readers above skip (sent as 0x00 here), connectId,
//                                 the value: raw/percent one byte per dataset, SI a Float32 LE
//   Output Command (write, 1565)  connectId, command, payload length, payload:
//                                 1 motor power (Int8 −100..100; 0 float, 127 brake), 2 play tone
//                                 (frequency UInt16, duration ms UInt16), 3 stop tone, 4 write RGB
//                                 (R, G, B; or one colour index)
//   Disconnect    (write, 152E)   any byte: the hub disconnects
//   Battery level (read, 2A19)    one byte, percent (the standard GATT Battery Service)
//
// Connect ids (node-poweredup wedo2smarthub.ts portMap): A 1, B 2, current 3, voltage 4,
// piezo 5, RGB LED 6 (the notes doc's clone announces the piezo on 5 too).

export const WEDO2_SERVICE = '00001523-1212-efde-1523-785feabcd123';
export const WEDO2_IO_SERVICE = '00004f0e-1212-efde-1523-785feabcd123';
export const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';

export const CHAR = Object.freeze({
    NAME: '00001524-1212-efde-1523-785feabcd123',
    BUTTON: '00001526-1212-efde-1523-785feabcd123',
    ATTACHED_IO: '00001527-1212-efde-1523-785feabcd123',
    LOW_VOLTAGE: '00001528-1212-efde-1523-785feabcd123',
    DISCONNECT: '0000152e-1212-efde-1523-785feabcd123',
    INPUT_VALUES: '00001560-1212-efde-1523-785feabcd123',
    INPUT_COMMAND: '00001563-1212-efde-1523-785feabcd123',
    OUTPUT_COMMAND: '00001565-1212-efde-1523-785feabcd123',
    BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb'
});

/** The GATT tree a Web Bluetooth / Scratch Link host discovers (services → characteristics). */
export const WEDO2_GATT = Object.freeze([
    {uuid: WEDO2_SERVICE, characteristics: [CHAR.NAME, CHAR.BUTTON, CHAR.ATTACHED_IO, CHAR.LOW_VOLTAGE, CHAR.DISCONNECT].map(uuid => ({uuid}))},
    {uuid: WEDO2_IO_SERVICE, characteristics: [CHAR.INPUT_VALUES, CHAR.INPUT_COMMAND, CHAR.OUTPUT_COMMAND].map(uuid => ({uuid}))},
    {uuid: BATTERY_SERVICE, characteristics: [{uuid: CHAR.BATTERY_LEVEL}]}
]);

export const CONNECT_ID = Object.freeze({A: 1, B: 2, CURRENT: 3, VOLTAGE: 4, PIEZO: 5, LED: 6});

/** IO type ids (the same numbers LWP3 §3.8.4 lists). */
export const WEDO_IO = Object.freeze({MOTOR: 0x01, VOLTAGE: 0x14, CURRENT: 0x15, PIEZO: 0x16, RGB_LED: 0x17,
    TILT: 0x22, MOTION: 0x23});

export const OUTPUT = Object.freeze({MOTOR_POWER: 1, PLAY_TONE: 2, STOP_TONE: 3, WRITE_RGB: 4});

export const UNIT = Object.freeze({RAW: 0, PERCENT: 1, SI: 2});

/** Motor power bytes (Int8): 0 float, 127 brake. */
export const MOTOR_FLOAT = 0;
export const MOTOR_BRAKE = 127;

/** Attached IO notification: connectId, 1, hub index 0, IO type, then HW and FW revision (4 bytes each). */
export const attachedIo = (connectId, ioType) => Uint8Array.from([connectId, 1, 0, ioType, 0, 0, 0, 0x10, 0, 0, 0, 0x10]);

/** Detached IO notification. */
export const detachedIo = connectId => Uint8Array.from([connectId, 0]);

/** Input Values notification for one port: a first byte 0x00, connectId, value bytes. */
export const inputValues = (connectId, valueBytes) => Uint8Array.from([0x00, connectId, ...valueBytes]);

/** Float32 little-endian bytes. */
export const float32 = v => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    return [...b];
};

/** An Input Command (sensor format) as a host writes it. */
export const inputCommand = (connectId, ioType, mode, delta, unit, notify) =>
    Uint8Array.from([1, 2, connectId, ioType, mode, delta & 0xff, (delta >> 8) & 0xff, (delta >> 16) & 0xff, (delta >>> 24) & 0xff, unit, notify ? 1 : 0]);

/** An Output Command as a host writes it. */
export const outputCommand = (connectId, command, payload) => Uint8Array.from([connectId, command, payload.length, ...payload]);
