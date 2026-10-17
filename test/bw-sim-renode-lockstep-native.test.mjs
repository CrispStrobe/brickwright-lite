// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Robot Lab R13a, the desktop side of the lockstep contract (brickwright-lite#1055):
 *   - the GUI's native capability map carries `renode.spike.lockstep.{begin,step,end}`,
 *     so R13d's pane gate (lockstepAvailable) and transport (capabilityTransport) see
 *     them, and each crosses the native broker request unchanged;
 *   - every request contract.js builds during a real fake-firmware run is admitted by
 *     the closed JS validator (the same rules as arena_inputs.rs valid_lockstep_*), and
 *     each malformed variant is refused;
 *   - one Renode session per app: the Robot Lab route and the SPIKE arena refuse to
 *     start while the other owns the shared hub (configurationOwner), and the Robot
 *     Lab's claim ends with its driver.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RenodeLockstepDriver, capabilityTransport, lockstepAvailable} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/driver.js';
import {LOCKSTEP_OPS, stepRequest, LockstepUnsupportedError} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/contract.js';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {RenodeArenaSession} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-session.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
import {FakeSpikeRenode} from './bw-sim-renode-lockstep-fake.mjs';

const require_ = createRequire(import.meta.url);
const {createNativeRenodeCapabilities, OPERATIONS} = require_('../overlay/scratch-vm/src/extension-support/native-renode-capability.js');
const {validLockstepBegin, validLockstepStep, validLockstepEnd, validNuttxProgramControl} = require_('../overlay/scratch-vm/src/extension-support/arena-inputs.js');
const {OPERATIONS: VOCABULARY} = require_('../overlay/scratch-vm/src/extension-support/capability-broker.js');

/**
 * The route module as the GUI bundle sees it: its bare `scratch-vm/…` import points at the
 * overlay file (as in spike-arena-pane-units.test.mjs) and its relative imports at the real
 * modules; the copy lives in the OS temp dir, never inside the scanned source tree.
 */
const loadRoute = async () => {
    const sourceUrl = new URL('../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/index.js', import.meta.url);
    const tempPath = path.join(tmpdir(), `bw-route-test-${randomUUID()}.mjs`);
    const source = (await readFile(sourceUrl, 'utf8'))
        .replace("from 'scratch-vm/src/extension-support/native-renode-capability.js'",
            `from '${new URL('../overlay/scratch-vm/src/extension-support/native-renode-capability.js', import.meta.url).href}'`)
        .replace(/from '(\.{1,2}\/[^']+)'/g, (_, relative) => `from '${new URL(relative, sourceUrl).href}'`);
    await writeFile(tempPath, source);
    try { return await import(pathToFileURL(tempPath).href); } finally { await unlink(tempPath); }
};

/** The fake emulator as the desktop capability object (operation name → handler). */
const fakeCapabilities = fake => Object.fromEntries(Object.values(LOCKSTEP_OPS).map(op => [op, args => fake.call(op, args)]));


test('the GUI capability map carries the lockstep ops, and R13d\'s gate and transport use them', async () => {
    assert.equal(OPERATIONS.lockstepBegin, LOCKSTEP_OPS.begin);
    assert.equal(OPERATIONS.lockstepStep, LOCKSTEP_OPS.step);
    assert.equal(OPERATIONS.lockstepEnd, LOCKSTEP_OPS.end);
    assert.equal(OPERATIONS.programControlSubmit, 'renode.spike.program.control.submit');
    const requests = [];
    const invoke = async (command, params) => {
        if (command === 'native_broker_open') return 'c'.repeat(64);
        requests.push(JSON.parse(params.payload));
        return JSON.stringify({kind: 'capability', result: `{"op":"${JSON.parse(params.payload).operation}"}`});
    };
    const capabilities = createNativeRenodeCapabilities({invoke});
    assert.equal(lockstepAvailable(capabilities), true, 'the desktop build offers the firmware route');
    const transport = capabilityTransport(capabilities);
    const step = stepRequest({quantumUs: 5000, expectClockNs: 1e9, shafts: [{port: 'A', positionMdeg: -1500, speedMdps: 360000}],
        sensors: [{port: 'D', kind: 'distance', values: {distanceMillimeters: 175}}]});
    for (const [operation, args] of [[LOCKSTEP_OPS.begin, {quantumUs: 5000}], [LOCKSTEP_OPS.step, step], [LOCKSTEP_OPS.end, {}]]) {
        assert.equal(await transport.call(operation, args), `{"op":"${operation}"}`, 'the reply is the native JSON text');
    }
    assert.deepEqual(requests, [
        {kind: 'capability', operation: LOCKSTEP_OPS.begin, args: {quantumUs: 5000}},
        {kind: 'capability', operation: LOCKSTEP_OPS.step, args: step},
        {kind: 'capability', operation: LOCKSTEP_OPS.end, args: {}}
    ]);
    for (const op of [LOCKSTEP_OPS.begin, LOCKSTEP_OPS.step, LOCKSTEP_OPS.end, OPERATIONS.programControlSubmit]) {
        assert.equal(typeof VOCABULARY[op]?.validate, 'function', `${op} is in the reviewed vocabulary`);
    }
});

test('every request a fake-firmware run sends is admitted by the closed validator', async () => {
    const fake = new FakeSpikeRenode({program: [[1, 0, 300, 0], [2, 50, 0, 0], [0, 0, 0, 0]]});
    const seen = {begin: 0, step: 0, end: 0};
    const transport = {
        call (operation, args) {
            if (operation === LOCKSTEP_OPS.begin) { seen.begin++; assert.equal(validLockstepBegin(args), true); }
            if (operation === LOCKSTEP_OPS.step) { seen.step++; assert.equal(validLockstepStep(args), true, JSON.stringify(args)); }
            if (operation === LOCKSTEP_OPS.end) { seen.end++; assert.equal(validLockstepEnd(args), true); }
            return fake.call(operation, args);
        }
    };
    const driver = new RenodeLockstepDriver({transport});
    await driver.begin();
    for (let k = 0; k < 40; k++) {
        await driver.step({shafts: [{port: 'A', positionMdeg: k * 1500, speedMdps: 300000}, {port: 'B', positionMdeg: -k, speedMdps: 0}],
            sensors: [{port: 'C', kind: 'color', values: {colorId: 255, reflectionPercent: 12, ambientPercent: 0}},
                {port: 'D', kind: 'distance', values: {distanceMillimeters: -1}},
                {port: 'E', kind: 'force', values: {forcePercent: 0, pressed: false}}],
            motorPorts: ['A', 'B']});
    }
    await driver.end();
    assert.deepEqual(seen, {begin: 1, step: 40, end: 1});
});

test('the JS validator refuses each malformed lockstep request', () => {
    const ok = {quantumUs: 5000, expectClockNs: 0, shafts: [{port: 'A', positionMdeg: 0, speedMdps: 0}],
        sensors: [{port: 'D', kind: 'distance', values: {distanceMillimeters: 100}}]};
    assert.equal(validLockstepStep(ok), true);
    assert.equal(validLockstepStep({...ok, quantumUs: 10000}), true);
    // Exactly the Runtime's quanta (renode-spike-prime#59): nothing passes here only to be
    // refused there, and the contract that builds the request agrees.
    for (const quantumUs of [1000, 4000, 6000, 7000, 15000, 20000, 5000.5, '5000']) {
        assert.equal(validLockstepStep({...ok, quantumUs}), false, `step ${quantumUs}`);
        assert.equal(validLockstepBegin({quantumUs}), false, `begin ${quantumUs}`);
        assert.throws(() => stepRequest({...ok, quantumUs}), /quantumUs/);
    }
    const hub = {buttons: {left: false, center: true, right: false, bluetooth: false},
        imuRaw: {temperature: 0, angularRate: [0, 0, 0], acceleration: [0, 0, 4096]}};
    assert.equal(validLockstepStep({...ok, hub}), true);
    for (const bad of [null, [], {...ok, monitor: 'start'}, {...ok, quantumUs: 7500}, {...ok, quantumUs: 0},
        {...ok, quantumUs: 25000}, {...ok, expectClockNs: -1}, {...ok, expectClockNs: 0.5},
        {...ok, expectClockNs: Number.MAX_SAFE_INTEGER + 1},
        {...ok, shafts: [{port: 'G', positionMdeg: 0, speedMdps: 0}]},
        {...ok, shafts: [{port: 'A', positionMdeg: 0, speedMdps: 0}, {port: 'A', positionMdeg: 1, speedMdps: 0}]},
        {...ok, sensors: [{port: 'A', kind: 'distance', values: {distanceMillimeters: 1}}]},
        {...ok, shafts: [{port: 'A', positionMdeg: 0.5, speedMdps: 0}]},
        {...ok, shafts: [{port: 'A', positionMdeg: 2 ** 31, speedMdps: 0}]},
        {...ok, shafts: [{port: 'A', positionMdeg: 0, speedMdps: 2e6 + 1}]},
        {...ok, shafts: [{port: 'A', positionMdeg: 0, speedMdps: 0, address: 0}]},
        {...ok, sensors: [{port: 'D', kind: 'gyro', values: {}}]},
        {...ok, sensors: [{port: 'D', kind: 'distance', values: {distanceMillimeters: -2}}]},
        {...ok, hub: {buttons: {}}}, {...ok, hub: null},
        {...ok, shafts: Array.from({length: 7}, () => ({port: 'A', positionMdeg: 0, speedMdps: 0}))}]) {
        assert.equal(validLockstepStep(bad), false, JSON.stringify(bad));
    }
    assert.equal(validLockstepBegin({quantumUs: 5000}), true);
    for (const bad of [{}, {quantumUs: 999}, {quantumUs: 5000.5}, {quantumUs: '5000'}, {quantumUs: 5000, extra: 1}]) {
        assert.equal(validLockstepBegin(bad), false);
    }
    assert.equal(validLockstepEnd({}), true);
    assert.equal(validLockstepEnd({quantumUs: 5000}), false);
    // Program control inside lockstep: START (3) / STOP (4) packets only.
    for (const op of [3, 4]) assert.equal(validNuttxProgramControl({bytes: [112, 1, op, 0, 1, 0, 0, 0]}), true);
    for (const op of [0, 1, 2, 5, 8, 9]) assert.equal(validNuttxProgramControl({bytes: [112, 1, op, 0, 1, 0, 0, 0]}), false);
    assert.equal(validNuttxProgramControl({bytes: [112, 1, 3, 0, 1, 0, 0, 0], path: 'x'}), false);
});

test('one Renode session per app: the Robot Lab and the SPIKE arena exclude each other', async () => {
    const {openFirmwareRoute} = await loadRoute();
    const hubState = new Hub();
    // The arena owns the hub: the Robot Lab route refuses before starting anything.
    const arenaCalls = [];
    let release;
    const arena = new RenodeArenaSession({bridge: new ArenaHubBridge({hubState, world: sandboxWorld()}),
        capabilities: Object.fromEntries(['session.start', 'session.close', 'run', 'state.read'].map(op =>
            [`renode.spike.${op}`, async () => {
                arenaCalls.push(op);
                if (op === 'session.start') await new Promise(resolve => { release = resolve; });
                return 'ready';
            }]))});
    const starting = arena.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hubState.configurationOwner, arena);
    const fake = new FakeSpikeRenode({});
    await assert.rejects(openFirmwareRoute({capabilities: fakeCapabilities(fake), hubState}), /owned by another session/);
    assert.deepEqual(fake.log, [], 'no Renode request while the arena owns the hub');
    const stopping = arena.stop();
    release();
    await Promise.all([starting.catch(() => {}), stopping]);
    assert.equal(hubState.configurationOwner, null);

    // The Robot Lab owns the hub: the arena refuses, and the claim ends with the driver.
    const {driver} = await openFirmwareRoute({capabilities: fakeCapabilities(fake), hubState});
    assert.equal(hubState.configurationOwner, driver);
    const second = new RenodeArenaSession({bridge: new ArenaHubBridge({hubState, world: sandboxWorld()}),
        capabilities: {'renode.spike.session.start': async () => { throw new Error('must not start'); }}});
    await assert.rejects(second.start(), /owned by another session/);
    await driver.end();
    assert.equal(hubState.configurationOwner, null);
    assert.deepEqual(fake.log.map(([op]) => op).filter(op => op !== LOCKSTEP_OPS.step),
        [LOCKSTEP_OPS.sessionStart, LOCKSTEP_OPS.stateRead, LOCKSTEP_OPS.run, LOCKSTEP_OPS.begin, LOCKSTEP_OPS.end,
            LOCKSTEP_OPS.sessionClose]);
});

test('a runtime without lockstep/v1 is "unsupported": no run, no begin, and the pane stops offering the route', async () => {
    const {openFirmwareRoute, firmwareRouteReady} = await loadRoute();
    const hubState = new Hub();
    // An older pinned package: the arena's capabilities, no lockstep.
    const fake = new FakeSpikeRenode({capabilities: ['arena-inputs/v1', 'arena-clock/v1', 'state-sample/v1', 'nuttx-program/v1']});
    const capabilities = fakeCapabilities(fake);
    assert.equal(firmwareRouteReady(capabilities), true, 'offered until a running target says otherwise');
    await assert.rejects(openFirmwareRoute({capabilities, hubState}),
        error => error instanceof LockstepUnsupportedError && error.code === 'lockstep-unsupported');
    assert.deepEqual(fake.log.map(([op]) => op), [LOCKSTEP_OPS.sessionStart, LOCKSTEP_OPS.stateRead, LOCKSTEP_OPS.sessionClose],
        'the target is checked before the guest runs or lockstep begins, and the session is closed');
    assert.equal(hubState.configurationOwner, null, 'the hub claim is released');
    assert.equal(firmwareRouteReady(capabilities, {unsupported: true}), false);
    assert.equal(firmwareRouteReady(null), false, 'the web build has no route');
    assert.equal(firmwareRouteReady({'renode.spike.state.read': () => null}), false, 'nor a desktop build without the ops');
});
