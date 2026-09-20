/**
 * The WeDo 2.0 extension against a Scratch Link session that enforces the
 * rules ours actually enforces.
 *
 * Every LEGO extension we ship is exercised, if at all, by hand against
 * hardware. This one was not, and four separate defects had accumulated in
 * the Scratch Link path -- which is its DEFAULT transport. Each of the four
 * is a distinct assertion below, so a regression names itself.
 *
 * The session modelled here is `apps/tauri/src-tauri/src/scratchlink/ble.rs`:
 *
 *   - `discover` is answered with null and results arrive afterwards as
 *     `didDiscoverPeripheral`, closed by `discoverDidFinish`
 *     (ble.rs: "Returns immediately; discovered devices stream back as
 *     notifications")
 *   - the service allowance is filters + optionalServices, REPLACED by each
 *     discover, and consulted on read, write and both notification calls
 *     (ble.rs: SessionState::begin_discovery / check_allowed_service)
 *
 * With ONE deliberate difference, and it is the point of the fourth test: a
 * characteristic is resolved INSIDE the service the request names. blec pairs
 * services implicitly and only echoes `serviceId` back, so our own transport
 * would forgive a mislabelled write; the official Swift BLESession does not,
 * and neither does this. A test that only reproduced our forgiving behaviour
 * would have let the routing defect through.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');

const ADVERTISED = '00001523-1212-efde-1523-785feabcd123';
const IO_SERVICE = '00004f0e-1212-efde-1523-785feabcd123';
const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';

/** The real hub's tree, as read off an LPF2 Smart Hub on 2026-09-20. */
const PERIPHERAL = {
    [ADVERTISED]: [
        '00001524-1212-efde-1523-785feabcd123', '00001526-1212-efde-1523-785feabcd123',
        '00001527-1212-efde-1523-785feabcd123', '00001528-1212-efde-1523-785feabcd123',
        '00001529-1212-efde-1523-785feabcd123', '0000152a-1212-efde-1523-785feabcd123',
        '0000152b-1212-efde-1523-785feabcd123', '0000152c-1212-efde-1523-785feabcd123',
        '0000152d-1212-efde-1523-785feabcd123', '0000152e-1212-efde-1523-785feabcd123'
    ],
    [IO_SERVICE]: [
        '00001560-1212-efde-1523-785feabcd123', '00001561-1212-efde-1523-785feabcd123',
        '00001563-1212-efde-1523-785feabcd123', '00001565-1212-efde-1523-785feabcd123'
    ],
    [BATTERY_SERVICE]: ['00002a19-0000-1000-8000-00805f9b34fb']
};

/** The shipped extension source: the builtin's embedded string IS the pin. */
function shippedSource () {
    const wrapper = readFileSync(
        path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/wedo2unified/index.js'),
        'utf8');
    const open = wrapper.indexOf('makeExt(') + 'makeExt('.length;
    const literal = wrapper.slice(open).trim();
    return JSON.parse(literal.slice(0, literal.lastIndexOf('")') + 1));
}

/** Runs `source` against the modelled session and records what it asked for. */
async function connectOverScratchLink (source) {
    const record = {writes: [], reads: [], notifications: [], refusals: [], allowance: null};
    let allowed = null;
    const lower = s => String(s).toLowerCase();

    const checkAllowed = params => {
        const service = lower(params.serviceId);
        if (allowed && !allowed.has(service)) {
            const why = `attempt to access unexpected service: ${service}`;
            record.refusals.push(why);
            throw new Error(why);
        }
        return service;
    };
    // Strict, as the official session is: the characteristic must be in the
    // service the caller named.
    const resolve = (service, characteristic) => {
        const chars = PERIPHERAL[service];
        if (!chars) throw new Error(`service ${service} not found on the peripheral`);
        if (!chars.includes(lower(characteristic))) {
            const why = `characteristic ${lower(characteristic)} is not in service ${service}`;
            record.refusals.push(why);
            throw new Error(why);
        }
    };

    let notify = null;
    const socket = {
        setOnOpen: f => (socket._open = f),
        setOnClose: () => {},
        setOnError: () => {},
        setHandleMessage: f => (notify = f),
        isOpen: () => true,
        close: () => {},
        open () { setImmediate(() => socket._open()); },
        sendMessage (req) {
            const reply = result =>
                setImmediate(() => notify({jsonrpc: '2.0', id: req.id, result}));
            const fail = message =>
                setImmediate(() => notify({jsonrpc: '2.0', id: req.id, error: {message}}));
            const note = (method, params) =>
                setImmediate(() => notify({jsonrpc: '2.0', method, params}));
            const p = req.params || {};
            try {
                switch (req.method) {
                case 'discover': {
                    allowed = new Set([
                        ...(p.filters || []).flatMap(f => (f.services || []).map(lower)),
                        ...(p.optionalServices || []).map(lower)
                    ]);
                    record.allowance = [...allowed].sort();
                    reply(null);
                    note('didDiscoverPeripheral',
                        {peripheralId: 'AA:BB:CC:DD:EE:FF', name: 'LPF2 Smart Hub', rssi: -55});
                    note('discoverDidFinish', {count: 1});
                    return;
                }
                case 'connect': return reply(null);
                case 'write': {
                    const service = checkAllowed(p);
                    resolve(service, p.characteristicId);
                    record.writes.push({service, characteristic: lower(p.characteristicId)});
                    return reply(p.message.length);
                }
                case 'read': {
                    const service = checkAllowed(p);
                    resolve(service, p.characteristicId);
                    record.reads.push({service, characteristic: lower(p.characteristicId)});
                    return reply({message: 'ZA==', encoding: 'base64'}); // 100%
                }
                case 'startNotifications': {
                    const service = checkAllowed(p);
                    resolve(service, p.characteristicId);
                    record.notifications.push(
                        {service, characteristic: lower(p.characteristicId)});
                    return reply(null);
                }
                default: return reply(null);
                }
            } catch (e) { fail(e.message); }
        }
    };

    const runtime = {
        getScratchLinkSocket: () => socket,
        getLocale: () => 'en',
        registerPeripheralExtension: () => {},
        emit: () => {},
        on: () => {},
        constructor: {
            PERIPHERAL_LIST_UPDATE: 'PERIPHERAL_LIST_UPDATE',
            PERIPHERAL_CONNECTED: 'PERIPHERAL_CONNECTED',
            PERIPHERAL_REQUEST_ERROR: 'PERIPHERAL_REQUEST_ERROR'
        }
    };
    let extension = null;
    const Scratch = {
        vm: {runtime},
        extensions: {register: e => (extension = e), unsandboxed: true},
        BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat'},
        ArgumentType: {NUMBER: 'number', STRING: 'string', ANGLE: 'angle', COLOR: 'color'},
        TargetType: {SPRITE: 'sprite', STAGE: 'stage'},
        Cast: {toNumber: Number, toString: String, toBoolean: Boolean},
        translate: Object.assign(s => (typeof s === 'string' ? s : s.default), {setup: () => {}})
    };
    const context = vm.createContext({
        Scratch, console: {...console, log: () => {}, info: () => {}, warn: () => {},
            error: () => {}, debug: () => {}, trace: () => {}, group: () => {},
            groupEnd: () => {}},
        setTimeout, clearTimeout, setInterval, clearInterval,
        TextEncoder, TextDecoder, Promise, Math, Date, JSON, Object, Array,
        String, Number, Boolean, Error, Uint8Array, Uint16Array, btoa, atob
    });
    vm.runInContext(source, context);

    record.error = null;
    try {
        await extension.connect();
    } catch (e) {
        record.error = e.message;
    }
    record.connected = Boolean(extension && extension.isConnected());
    // The hub starts a 5 s battery heartbeat on connect. Left running it keeps
    // the test process alive long after the assertions are done.
    try {
        await extension.disconnect();
    } catch {
        // never connected; nothing to tear down
    }
    return record;
}

test('the hub can be constructed at all', async () => {
    const run = await connectOverScratchLink(shippedSource());
    // _onConnect was bound in the constructor and defined nowhere, so this
    // threw before a transport was even chosen -- Web Bluetooth included.
    assert.ok(!/reading 'bind'/.test(run.error || ''),
        `WeDo2Hub constructor still binds a method that does not exist: ${run.error}`);
});

test('discovery waits for didDiscoverPeripheral instead of reading the reply', async () => {
    const run = await connectOverScratchLink(shippedSource());
    // `discover` resolves to null; taking .peripheralId off it is a TypeError.
    assert.ok(!/Cannot read properties of null/.test(run.error || ''),
        `the discover REPLY is still being read as a device: ${run.error}`);
});

test('the discover declares every service the extension goes on to use', async () => {
    const run = await connectOverScratchLink(shippedSource());
    assert.deepEqual(run.allowance, [ADVERTISED, BATTERY_SERVICE, IO_SERVICE].sort(),
        'the session allowance must cover the IO and battery services, not just the ' +
        'advertised one -- otherwise attachedIO, inputValues, inputCommand, outputCommand ' +
        'and the heartbeat battery read are all refused');
});

test('commands are addressed to the service that actually owns them', async () => {
    const run = await connectOverScratchLink(shippedSource());
    assert.deepEqual(run.refusals, [],
        `the session refused: ${run.refusals.join('; ')}`);
    assert.ok(run.connected, `connect() did not establish a session: ${run.error}`);

    // Every WeDo 2.0 UUID ends "-1523-785feabcd123", so a substring test for
    // "152" matches all of them and sent the IO writes to the advertised
    // service.
    // Which service owns what is the hub's business, not ours: 1524-152e are
    // on the ADVERTISED service and only 1560/1561/1563/1565 are on the IO
    // service. attachedIO is 1527, so it belongs with the former -- we had it
    // with the latter.
    const owner = c => (run.notifications.find(n => n.characteristic === c) || {}).service;
    assert.equal(owner('00001527-1212-efde-1523-785feabcd123'), ADVERTISED,
        'attachedIO (1527) is on the advertised service, not the IO service');
    assert.equal(owner('00001560-1212-efde-1523-785feabcd123'), IO_SERVICE,
        'inputValues (1560) is on the IO service');
    assert.equal(owner('00001526-1212-efde-1523-785feabcd123'), ADVERTISED,
        'the button (1526) is on the advertised service');

    const led = run.writes.filter(w =>
        w.characteristic === '00001565-1212-efde-1523-785feabcd123');
    assert.ok(led.length > 0, 'the hub must write the LED colour on connect');
    assert.deepEqual([...new Set(led.map(w => w.service))], [IO_SERVICE],
        'outputCommand is on the IO service, not the advertised one');
});
