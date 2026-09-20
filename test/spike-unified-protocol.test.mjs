// SPDX-License-Identifier: Apache-2.0
//
// The unified extension's own moving parts, driven directly: the SPIKE 3 frame
// codec, the device-record parser, the transport selection, and what happens
// when a block asks a hub for something that firmware cannot do.
//
// These are the parts with no legacy equivalent to compare against, so the
// coverage test cannot judge them. They are judged here against the wire
// format and against the two behaviours the consolidation promises: that a
// unified block reads the same number from either firmware, and that a block
// whose firmware cannot do the thing says so rather than returning a
// plausible zero.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {quietConsole} from './helpers/quiet-console.mjs';
import {makeRuntime} from '../scripts/spike/fake-runtime.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

quietConsole();
globalThis.window = globalThis;
globalThis.document = {
    documentElement: {lang: 'en'},
    createElement: () => ({style: {}, appendChild () {}, click () {}, setAttribute () {}}),
    body: {appendChild () {}, removeChild () {}}
};
globalThis.localStorage = {getItem: () => null, setItem: () => {}};
globalThis.addEventListener = () => {};
globalThis.alert = () => {};
globalThis.setInterval = () => 0;

const setNavigator = value => Object.defineProperty(
    globalThis, 'navigator', {value, configurable: true, writable: true});
setNavigator({language: 'en-US', userAgent: 'node'});

const source = readFileSync(
    resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/spikeprime/source.js'), 'utf8');

/**
 * The extension keeps its internals closed over, which is right for shipped
 * code and inconvenient for a test. Rather than export them (and change the
 * program to suit its test), the source is run with a probe appended that
 * hands the pieces back.
 */
const internals = (() => {
    const probe = `${source.replace(
        /\n\}\)\(Scratch\);\s*$/,
        '\n  Scratch.__probe = {COBS, SPIKE3, Spike3Hub, HubRouter, HubMode, SpikePrime, describeHub};\n})(Scratch);\n'
    )}`;
    let captured = null;
    const Scratch = {
        BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat', LABEL: 'label'},
        ArgumentType: {STRING: 'string', NUMBER: 'number', ANGLE: 'angle', MATRIX: 'matrix', NOTE: 'note'},
        TargetType: {SPRITE: 'sprite'},
        Cast: {toString: String, toNumber: v => (Number.isNaN(Number(v)) ? 0 : Number(v)), toBoolean: Boolean},
        translate: Object.assign(m => m, {setup: () => {}}),
        extensions: {register: i => { captured = i; }, unsandboxed: true},
        vm: {runtime: makeRuntime()},
        runtime: makeRuntime()
    };
    // eslint-disable-next-line no-new-func
    new Function('Scratch', probe)(Scratch);
    return {...Scratch.__probe, instance: captured};
})();

const {COBS, SPIKE3, Spike3Hub, HubRouter, HubMode} = internals;

// ---------------------------------------------------------------- the codec

const cobsFixture = JSON.parse(readFileSync(resolve(root, 'test/fixtures/spike-cobs-v1.json'), 'utf8'));
const fromHex = h => Uint8Array.from((h.match(/../g) || []).map(v => Number.parseInt(v, 16)));
const toHex = v => Buffer.from(v).toString('hex');

test('the extension encodes the same frames as the virtual hub', () => {
    // Same fixture as test/spike-codec-fixtures.test.mjs, which judges
    // spike-prime-peripheral.js. Two implementations checked against one set
    // of vectors cannot drift into agreeing only with each other.
    for (const vector of cobsFixture.vectors) {
        assert.equal(toHex(COBS.pack(fromHex(vector.payload_hex))), vector.frame_hex,
            `pack(${vector.name})`);
        assert.equal(toHex(COBS.unpack(fromHex(vector.frame_hex))), vector.payload_hex,
            `unpack(${vector.name})`);
    }
});

test('SPIKE 3 framing round-trips every byte value', () => {
    const payload = Uint8Array.from({length: 256}, (_, i) => i);
    const framed = COBS.pack(payload);
    assert.equal(framed[framed.length - 1], SPIKE3.DELIMITER,
        'a frame must end with the delimiter');
    assert.deepEqual(Array.from(COBS.unpack(framed)), Array.from(payload));
});

test('a malformed frame is dropped, and the next good one still lands', () => {
    const {hub} = connectedHub();
    hub._onMessage(Buffer.from(Uint8Array.from([0x05, 0x05, SPIKE3.DELIMITER])).toString('base64'));
    feed(hub, notification([[SPIKE3.DEV_BATTERY, 61]]));
    assert.equal(hub.battery, 61, 'the stream resumed at the next delimiter');
});

test('no byte inside a frame can be mistaken for the delimiter', () => {
    // This is the whole reason for the XOR: a payload full of 0x02 must not
    // produce a 0x02 anywhere but the terminator, or the reader re-syncs in
    // the middle of a message.
    for (const fill of [0x00, 0x01, 0x02, 0x03, 0xff]) {
        const framed = COBS.pack(new Uint8Array(40).fill(fill));
        const body = framed.slice(0, -1);
        assert.ok(!body.includes(SPIKE3.DELIMITER),
            `a payload of 0x${fill.toString(16)} put a delimiter inside the frame`);
    }
});

test('a frame longer than one COBS block still round-trips', () => {
    // MAX_BLOCK_SIZE is 84; a run longer than that forces a second block.
    const payload = Uint8Array.from({length: 300}, (_, i) => (i % 250) + 5);
    assert.deepEqual(Array.from(COBS.unpack(COBS.pack(payload))), Array.from(payload));
});

// ------------------------------------------------------- the device records

/** A hub with a fake GATT link, so records can be fed in as the hub would. */
const connectedHub = () => {
    const runtime = {
        getLocale: () => 'en', on () {}, emit () {},
        constructor: {PERIPHERAL_CONNECTED: 'c', PERIPHERAL_DISCONNECTED: 'd'}
    };
    const hub = new Spike3Hub(runtime, 'spikeprime');
    const written = [];
    hub.attach({
        isConnected: () => true,
        write: (s, c, message) => { written.push(message); return Promise.resolve(); },
        startNotifications: () => Promise.resolve(),
        disconnect () {}
    });
    return {hub, written};
};

/** Wrap device records in a DEVICE_NOTIFICATION message. */
const notification = records => {
    const body = records.flat();
    return Uint8Array.from([SPIKE3.DEVICE_NOTIFICATION, body.length & 0xff, body.length >> 8, ...body]);
};

const feed = (hub, message) => hub._onMessage(
    Buffer.from(COBS.pack(message)).toString('base64'));

test('the motor record is read as 12 bytes, not 11', () => {
    // The bug this merge fixes: legospike_ble.js declared the record 11 bytes
    // long but took a 32-bit position from offset 8, which needs a twelfth.
    // Two motor records back to back catch both halves of that — a wrong
    // stride puts the second record's port in the wrong place.
    const {hub} = connectedHub();
    const motor = (port, position, speed) => [
        SPIKE3.DEV_MOTOR, port, 0, 0, 0, 0, 0, speed,
        position & 0xff, (position >> 8) & 0xff, (position >> 16) & 0xff, (position >> 24) & 0xff
    ];
    feed(hub, notification([motor(0, 720, 50), motor(2, -90, 0)]));

    assert.equal(hub.portValues.A.type, 'motor');
    assert.equal(hub.portValues.A.relativePosition, 720, 'port A cumulative degrees');
    assert.equal(hub.portValues.A.speed, 50);
    assert.ok(hub.portValues.C, 'the second record was not found: the stride is wrong');
    assert.equal(hub.portValues.C.relativePosition, -90, 'negative positions are signed');
});

test('motor position wraps to a 0-359 angle without losing the cumulative count', () => {
    const {hub} = connectedHub();
    feed(hub, notification([[
        SPIKE3.DEV_MOTOR, 0, 0, 0, 0, 0, 0, 0,
        810 & 0xff, (810 >> 8) & 0xff, 0, 0
    ]]));
    assert.equal(hub.portValues.A.relativePosition, 810, 'cumulative degrees are kept');
    assert.equal(hub.portValues.A.position, 90, '810 degrees is 90 degrees round');
});

test('the distance sensor is converted to centimetres and keeps its millimetres', () => {
    // The promise: a block written against a 2.x hub reads the same number
    // from a 3.x one. 2.x reported cm; 3.x reports mm.
    const {hub} = connectedHub();
    feed(hub, notification([[SPIKE3.DEV_DISTANCE, 1, 250 & 0xff, 250 >> 8]]));
    assert.equal(hub.portValues.B.distance, 25, '250 mm is 25 cm');
    assert.equal(hub.portValues.B.distanceMM, 250, 'the hub-reported millimetres survive');
});

test('an out-of-range distance reads as zero, as it did on 2.x', () => {
    // The 2.x stream used -1 for "nothing in range" and getDistance mapped it
    // to 0. A 3.x hub signals the same thing with a negative int16.
    const {hub} = connectedHub();
    feed(hub, notification([[SPIKE3.DEV_DISTANCE, 1, 0xff, 0xff]]));
    assert.equal(hub.portValues.B.distance, 0);
});

test('force, colour and battery records land in the 2.x shapes', () => {
    const {hub} = connectedHub();
    feed(hub, notification([
        [SPIKE3.DEV_FORCE, 3, 42, 1],
        [SPIKE3.DEV_COLOR, 4, 9, 10, 0, 20, 0, 30, 0],
        [SPIKE3.DEV_BATTERY, 77]
    ]));
    assert.deepEqual(
        {type: hub.portValues.D.type, force: hub.portValues.D.force, pressed: hub.portValues.D.pressed},
        {type: 'force', force: 42, pressed: true});
    assert.equal(hub.portValues.E.type, 'color');
    assert.equal(hub.portValues.E.color, 9);
    assert.deepEqual(
        [hub.portValues.E.red, hub.portValues.E.green, hub.portValues.E.blue], [10, 20, 30]);
    assert.equal(hub.battery, 77);
});

test('an unknown device record stops the walk instead of guessing a width', () => {
    // Every record type has its own fixed width. An unrecognised one has an
    // unknown width, so continuing would read the next record from the wrong
    // offset and invent values. Earlier fields must survive; later ones must
    // simply not appear.
    const {hub} = connectedHub();
    feed(hub, notification([[SPIKE3.DEV_BATTERY, 55], [0x7e, 1, 2, 3], [SPIKE3.DEV_FORCE, 3, 9, 1]]));
    assert.equal(hub.battery, 55, 'records before the unknown one are kept');
    assert.equal(hub.portValues.D, undefined, 'nothing is invented after an unknown record');
});

test('a truncated record is dropped rather than read past the end', () => {
    const {hub} = connectedHub();
    feed(hub, notification([[SPIKE3.DEV_MOTOR, 0, 0, 0]]));
    assert.equal(hub.portValues.A, undefined);
});

test('the InfoResponse version bytes are kept, not discarded', () => {
    // Both legacy BLE extensions parsed this message for packet sizes and
    // threw the versions away, which is why neither could tell you what
    // firmware it was talking to.
    const {hub} = connectedHub();
    const info = new Uint8Array(15);
    info[0] = SPIKE3.INFO_RESPONSE;
    info[1] = 1; info[2] = 2; info[3] = 3; info[4] = 0;      // rpc 1.2.3
    info[5] = 3; info[6] = 4; info[7] = 5; info[8] = 0;      // firmware 3.4.5
    info[9] = 100; info[10] = 0;                              // max packet 100
    info[13] = 200; info[14] = 0;                             // max chunk 200
    feed(hub, info);
    assert.equal(hub.firmwareVersion, '3.4.5');
    assert.equal(hub._maxPacketSize, 100);
});

test('tunnelled Python is framed as a TUNNEL message', () => {
    const {hub, written} = connectedHub();
    hub.sendPythonCommand('print(1)');
    assert.equal(written.length, 1);
    const message = COBS.unpack(Buffer.from(written[0], 'base64'));
    assert.equal(message[0], SPIKE3.TUNNEL);
    const length = message[1] | (message[2] << 8);
    assert.equal(new TextDecoder().decode(message.slice(3)), 'print(1)\r\n');
    assert.equal(length, 'print(1)\r\n'.length, 'the declared length matches the body');
});

test('sendCommand rejects so callers fall through to Python', () => {
    // Not a failure mode: it is how the 84 REPL-era blocks reach a 3.x hub.
    const {hub} = connectedHub();
    return assert.rejects(() => hub.sendCommand('scratch.motor_run_timed', {}));
});

// ------------------------------------------------------------- the router

const routerWith = ({scratchLink = false, webBluetooth = false, webSocket = false} = {}) => {
    setNavigator(webBluetooth
        ? {language: 'en-US', bluetooth: {requestDevice: () => Promise.resolve({})}}
        : {language: 'en-US'});
    const saved = globalThis.WebSocket;
    if (webSocket) globalThis.WebSocket = function () {}; else delete globalThis.WebSocket;
    const runtime = {
        getLocale: () => 'en', on () {}, emit () {}, registerPeripheralExtension () {},
        constructor: {PERIPHERAL_REQUEST_ERROR: 'e'}
    };
    if (scratchLink) runtime.getScratchLinkSocket = () => ({
        setOnOpen () {}, setOnClose () {}, setOnError () {}, setHandleMessage () {},
        open () {}, close () {}, isOpen: () => false, sendMessage: () => Promise.resolve()
    });
    const router = new HubRouter(runtime, 'spikeprime');
    return {router, restore: () => { globalThis.WebSocket = saved; }};
};

test('transport availability is detected, not assumed', () => {
    const bare = routerWith({});
    assert.deepEqual(bare.router.availableModes(), [], 'nothing available means nothing offered');
    bare.restore();

    const full = routerWith({scratchLink: true, webBluetooth: true, webSocket: true});
    assert.deepEqual(full.router.availableModes(), [
        HubMode.SCRATCH_LINK_BLE, HubMode.SCRATCH_LINK_BT, HubMode.WEB_BLE, HubMode.BRIDGE
    ], 'all four, in preference order');
    full.restore();

    const browserOnly = routerWith({webBluetooth: true, webSocket: true});
    assert.deepEqual(browserOnly.router.availableModes(), [HubMode.WEB_BLE, HubMode.BRIDGE],
        'without Scratch Link, only the two the browser can do itself');
    browserOnly.restore();
});

test('auto picks the first available route and reports which one it took', () => {
    const {router, restore} = routerWith({webBluetooth: true, webSocket: true});
    assert.equal(router.mode, HubMode.AUTO);
    assert.equal(router.resolvedMode, null, 'before scanning, auto is a policy and not yet a fact');
    router.scan();
    assert.equal(router.resolvedMode, HubMode.WEB_BLE);
    assert.equal(router.protocol, 'spike3');
    restore();
});

test('a chosen mode is honoured over the preference order', () => {
    const {router, restore} = routerWith({scratchLink: true, webBluetooth: true, webSocket: true});
    router.setMode(HubMode.BRIDGE);
    router.scan();
    assert.equal(router.resolvedMode, HubMode.BRIDGE);
    assert.equal(router.protocol, 'repl', 'the bridge carries the 2.x REPL stream');
    restore();
});

test('an unknown mode falls back to auto rather than wedging', () => {
    const {router, restore} = routerWith({webBluetooth: true});
    assert.equal(router.setMode('carrier-pigeon'), HubMode.AUTO);
    restore();
});

test('a mode whose transport is missing is not silently used', () => {
    const {router, restore} = routerWith({webBluetooth: true});
    router.setMode(HubMode.SCRATCH_LINK_BT);
    router.scan();
    assert.equal(router.resolvedMode, null, 'nothing was started');
    restore();
});

test('capability answers follow the active protocol', () => {
    const {router, restore} = routerWith({scratchLink: true, webBluetooth: true, webSocket: true});

    router.setMode(HubMode.SCRATCH_LINK_BT);
    router.scan();
    assert.equal(router.supports('reflection'), true, '2.x reports reflected light');
    assert.equal(router.supports('streaming'), false, '2.x has no streaming switch');

    router.setMode(HubMode.WEB_BLE);
    router.scan();
    assert.equal(router.supports('streaming'), true);
    assert.equal(router.supports('reflection'), false,
        'the 3.x colour record carries no reflection channel');
    restore();
});

test('the hub describes itself only once it has said something', () => {
    const {router, restore} = routerWith({webBluetooth: true});
    assert.equal(router.hubDescription, '', 'nothing is claimed before connecting');
    assert.equal(router.firmwareVersion, '');
    restore();
});

// ------------------------------------------- what a hub cannot do, it says

/** The extension instance, with its router pointed at a chosen protocol. */
const extensionOn = protocol => {
    const ext = internals.instance;
    ext._peripheral._activeProtocol = protocol;
    return ext;
};

test('a reading the firmware cannot take comes back blank, not plausible', () => {
    // The promise the palette makes: blocks do not disappear on connect, so a
    // learner can see one their hub cannot do — and what they must not see is
    // a number. "0% reflected light" and "25 degrees" are measurements someone
    // will act on; blank is visibly the absence of one.
    const spike3 = extensionOn('spike3');
    assert.equal(spike3.getReflection({PORT: 'A'}), '', 'the 3.x colour record has no reflection channel');
    assert.equal(spike3.getAmbientLight({PORT: 'A'}), '', 'nor an ambient one');
    assert.equal(spike3.getHubVoltage(), '', 'nor a power channel');
    assert.equal(spike3.getHubCurrent(), '');
    assert.equal(spike3.getBatteryTemperature(), '', 'this used to answer a flat 25');
    assert.equal(spike3.getHubTemperature(), '');

    const repl = extensionOn('repl');
    assert.equal(repl.getFaceUp(), '', 'only the 3.x IMU record carries a face index');
});

test('a reading the firmware CAN take is still a reading', () => {
    // The guard must not swallow the supported case.
    const repl = extensionOn('repl');
    assert.equal(repl.getHubVoltage(), 0, '2.x reports power, and zero here is a real zero');
    assert.equal(repl.getBatteryTemperature(), 25);
    assert.equal(repl.getReflection({PORT: 'A'}), 0);

    const spike3 = extensionOn('spike3');
    assert.equal(typeof spike3.getFaceUp(), 'string');
    assert.notEqual(spike3.getFaceUp(), '');
});
