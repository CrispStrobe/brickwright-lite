// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab API (overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js) and the
 * `lab-direct` hub behind it (hubs/lab-direct/lab-direct-hub.js), headless, on the real
 * Jolt physics (docs/ROBOT-LAB-HUBS-PLAN.md P0/P1):
 *
 *   - a model WITHOUT a hub gets the lab-direct hub, and `setMotor(…, {degrees: 360})`
 *     turns its motor's encoder to 360 ± 2° with no hub program at all; the wait ends on
 *     the step the encoder says so (the command's promise), never on a wall clock;
 *   - the tolerance is derived, not chosen: the command ends within POSITION_TOLERANCE_DEG
 *     of the target and slower than SPEED_TOLERANCE_DPS, then the shorted (braking) motor
 *     stops within one mechanical time constant J·ω0/τs at that speed;
 *   - part poses are the same, to the last bit, with the physics in the worker and a
 *     direct command that arrives while a batch is in flight (the batch is redone from the
 *     worker's checkpoint, rollback) as on this thread with the command before the tick;
 *   - on a SPIKE hub driven from Scratch blocks the API is ALLOWED (it commands the hub's
 *     own controller, as a block does); on a hub whose program runs on the hub (the
 *     firmware route: a VirtualHub with no directCommand) it is REFUSED by name, and so
 *     on the RCX, whose NQC program runs in the clean-room VM;
 *   - with no session every call answers {ok: false} and the block-level methods neutral
 *     values; reads (sensors, parts, contact) work on the shipped models.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {SimSession, catalogFrom, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {PhysicsClient} from '../overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import {LabDirectHub, LAB_DIRECT_PROFILE, POSITION_TOLERANCE_DEG, SPEED_TOLERANCE_DPS} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/lab-direct/lab-direct-hub.js';
import {validateHubProfile} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/hub-profile.js';
import {SpikeVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js';
import {SPIKE_MEDIUM_ANGULAR} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {setMixerMotorPower} from '../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-motor-control.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const modelText = file => readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, file), 'latin1');
const DEG = 180 / Math.PI;

/** The shipped motor bench (no hub): a SPIKE medium motor standing on the floor, an 8-tooth gear on a vertical axle in its output. */
const BENCH = modelText('motor-bench.ldr');

const hostFor = (session, extra = {}) => ({getSession: () => session, getStatus: () => 'running', locale: () => 'en', ...extra});

/** Ticks a session in browser-like frames until `until()` or `maxMs` of simulated time. */
const run = async (session, maxMs, until = () => false) => {
    const start = session.time;
    while (session.time - start < maxMs && !until()) {
        session.tick(16);
        await session.idle();
        await null;
    }
};

test('position hold stops a loaded rack lift after a prolonged manual drive', async () => {
    const {session, issues} = await SimSession.fromText(modelText('forklift.ldr'),
        {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
    const api = createRobotLabApi(hostFor(session));
    try {
        assert.deepEqual(issues, []);
        await run(session, 200);
        assert.equal(setMixerMotorPower(api, 'C', 60).ok, true);
        await run(session, 2000);
        const target = api.encoder('C').angleDeg;
        assert.equal(setMixerMotorPower(api, 'C', 0).ok, true);
        // Decelerate and recover the held angle before measuring long-term gravity creep.
        await run(session, 1000);
        const stopped = api.encoder('C').angleDeg;
        assert.ok(Math.abs(stopped - target) < 0.5, 'the hold loop recovers the stopped angle');
        await run(session, 1000);
        assert.ok(Math.abs(api.encoder('C').angleDeg - stopped) < 1, 'a stopped lift retains its position under gravity');
    } finally { session.dispose(); }
});

test('lab-direct: its profile validates, and a model without a hub gets it with every motor', async () => {
    assert.deepEqual(validateHubProfile(LAB_DIRECT_PROFILE), []);
    const {session, issues} = await SimSession.fromText(BENCH, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    assert.deepEqual(session.hubs.map(h => [h.id, h.profile]), [['lab-direct', 'lab-direct']]);
    assert.ok(session.hubs[0].hub instanceof LabDirectHub);
    const api = createRobotLabApi(hostFor(session));
    assert.deepEqual(api.motors().map(m => [m.id, m.part, m.port, m.hub, m.direct]), [['a0', 'motor', 'A', 'lab-direct', true]]);
    session.dispose();
});

test('setMotor turns the encoder of a hubless motor to 360 ± 2°, ending on the encoder, not a clock', async () => {
    const {session} = await SimSession.fromText(BENCH, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
    const api = createRobotLabApi(hostFor(session));
    await run(session, 300);
    const before = api.encoder('A').angleDeg;
    const r = api.setMotor('motor', {degrees: 360, speedDps: 360});
    assert.equal(r.ok, true, JSON.stringify(r));
    let result = null;
    let doneAt = null;
    r.done.then(x => { result = x; doneAt = session.time; });
    const t0 = session.time;
    await run(session, 5000, () => result !== null);
    assert.equal(result, 'completed');
    // On the step it ended: inside the completion window the controller itself uses.
    const atEnd = api.encoder('A');
    assert.ok(Math.abs(atEnd.angleDeg - before - 360) <= POSITION_TOLERANCE_DEG + 1e-9 || Math.abs(atEnd.speedDps) <= SPEED_TOLERANCE_DPS,
        JSON.stringify(atEnd));
    // A trapezoid at 360 °/s with 1500 °/s² ramps: at least 1 s + the ramp; not seconds of slack.
    assert.ok(doneAt - t0 >= 1000 && doneAt - t0 < 2500, `ended after ${doneAt - t0} ms of simulated time`);
    // Then the shorted motor brakes from at most SPEED_TOLERANCE_DPS: it runs on at most ω·τm with
    // τm = J·ω0/τs the motor's mechanical time constant (the bare rotor; the 8T gear and axle add
    // ~1e-8 kg·m², so 10 % of margin on J covers them many times over).
    const m = SPIKE_MEDIUM_ANGULAR.motor;
    const tauM = 1.1 * m.rotorInertiaKgM2 * m.noLoadRadPerSec / m.stallTorqueNm;
    const bound = POSITION_TOLERANCE_DEG + SPEED_TOLERANCE_DPS * tauM;
    assert.ok(bound < 2, `the derived bound ${bound.toFixed(2)}° is inside the acceptance's 2°`);
    await run(session, 1000);
    const end = api.encoder('A');
    assert.ok(Math.abs(end.angleDeg - before - 360) <= bound, `turned ${(end.angleDeg - before).toFixed(2)}° (bound ±${bound.toFixed(2)})`);
    assert.ok(Math.abs(end.speedDps) < 1, `at rest: ${end.speedDps}`);
    // The encoder is the hinge: the joint's measured rotation agrees.
    const joint = session.core.jointState(session.mechanism.joints.find(j => j.motor).id);
    assert.ok(Math.abs(Math.abs(joint.angle * DEG) - Math.abs(end.angleDeg)) < 1e-6, 'encoder = hinge angle');
    session.dispose();
});

test('power, speed, hold, coast and a new command interrupting a wait', async () => {
    const {session} = await SimSession.fromText(BENCH, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
    const api = createRobotLabApi(hostFor(session));
    await run(session, 200);
    assert.equal(api.setMotor('A', {speedDps: 300}).ok, true);
    await run(session, 1500);
    assert.ok(Math.abs(api.encoder('A').speedDps - 300) < 15, `speed ${api.encoder('A').speedDps}`);
    // Power is open loop: half the duty, about half the no-load speed (friction takes a little).
    assert.equal(api.setMotor('A', {power: 50}).ok, true);
    await run(session, 1500);
    const w0 = SPIKE_MEDIUM_ANGULAR.motor.noLoadRadPerSec * DEG;
    const s = api.encoder('A').speedDps;
    assert.ok(s > 0.3 * w0 && s < 0.5 * w0, `power 50 % turns at ${s.toFixed(0)} °/s (no-load ${w0.toFixed(0)})`);
    // Hold keeps the angle the shaft had.
    api.stopMotor('A', 'hold');
    await run(session, 500);
    const held = api.encoder('A').angleDeg;
    await run(session, 500);
    assert.ok(Math.abs(api.encoder('A').angleDeg - held) < 0.5, 'hold holds');
    // A wait ends 'interrupted' when another command takes the port.
    const r = api.setMotor('A', {degrees: 720, speedDps: 200});
    let result = null;
    r.done.then(x => { result = x; });
    await run(session, 200);
    api.setMotor('A', {stop: 'coast'});
    await null;
    await null;
    assert.equal(result, 'interrupted');
    // Refusals say why.
    assert.equal(api.setMotor('Z', {power: 10}).code, 'no-motor');
    assert.equal(api.setMotor('A', {stop: 'drift'}).code, 'bad-command');
    assert.equal(api.setMotor('A', {power: 'lots'}).code, 'bad-command');
    session.dispose();
});

// argv: the GUI-scope hook in the worker thread names this test as the one crossing the boundary.
const startWorker = () => new Worker(path.join(ROOT, 'test/fixtures/bw-sim/physics-worker-host.mjs'), {argv: [fileURLToPath(import.meta.url)]});

test('part poses are bit-identical in the worker, through a redone (rolled back) batch, as on this thread', async () => {
    const worker = startWorker();
    const client = new PhysicsClient(worker);
    const {session: here} = await SimSession.fromText(BENCH, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
    const {session: there} = await SimSession.fromText(BENCH, {hubState: new VirtualSpikeHubState(), catalog: CATALOG, worker: client});
    try {
        assert.equal(there.worker, true, there.workerError);
        const apiHere = createRobotLabApi(hostFor(here));
        const apiThere = createRobotLabApi(hostFor(there));
        const seen = api => ({gear: api.pose('gear'), axle: api.pose('axle'), motor: api.pose('motor'), enc: api.encoder('A')});
        const tick = async ms => { here.tick(ms); there.tick(ms); await there.idle(); };
        for (let i = 0; i < 10; i++) await tick(16.7);
        assert.deepStrictEqual(seen(apiThere), seen(apiHere));
        // The command reaches the worker's hub while its batch is in flight: redone from the checkpoint.
        there.tick(16.7);
        assert.ok(there._inFlight, 'a batch is in flight');
        apiThere.setMotor('A', {degrees: 180, speedDps: 400});
        apiHere.setMotor('A', {degrees: 180, speedDps: 400});
        here.tick(16.7);
        await there.idle();
        assert.equal(there.stats.redos, 1, 'the batch was redone once (rollback)');
        assert.deepStrictEqual(seen(apiThere), seen(apiHere), 'after the redone batch');
        for (let i = 0; i < 80; i++) {
            await tick([16.7, 33.4, 2.1, 16.6][i % 4]);
            assert.deepStrictEqual(seen(apiThere), seen(apiHere), `frame ${i}`);
        }
        const turned = apiHere.encoder('A').angleDeg;
        assert.ok(Math.abs(turned - 180) < 3, `the gear turned ${turned.toFixed(1)}°`);
    } finally {
        here.dispose();
        there.dispose();
        await worker.terminate();
    }
});

/** A hub whose program runs on the hub (the firmware route's shape): it takes no direct command. */
class OnHubProgram extends SpikeVirtualHub {
    get directCommand () { return undefined; }
}

test('a SPIKE hub run from blocks takes direct commands; a hub running its own program refuses them by name', async () => {
    const hubState = new VirtualSpikeHubState();
    const {session} = await SimSession.fromText(modelText('driving-base.ldr'), {hubState, catalog: CATALOG});
    const api = createRobotLabApi(hostFor(session));
    assert.deepEqual(api.motors().map(m => [m.part, m.port, m.hub, m.direct]).sort(), [['motorL', 'A', 'hub', true], ['motorR', 'B', 'hub', true]]);
    const start = api.pose('hub').position;
    // Allowed: the hub's own controller, as a SPIKE block's command (SPIKE's 1° position window).
    const r = api.setMotor('B', {degrees: 360, speedDps: 300});
    assert.equal(r.ok, true, JSON.stringify(r));
    let result = null;
    r.done.then(x => { result = x; });
    await run(session, 5000, () => result !== null);
    assert.equal(result, 'completed');
    assert.ok(Math.abs(hubState.data.motors[1].position - 360) <= 2, `B at ${hubState.data.motors[1].position}`);
    assert.ok(Math.abs(api.motorAngle('B') - 360) <= 2, 'the reporter reads the hub\'s encoder');
    assert.notDeepEqual(api.pose('hub').position, start, 'one wheel turning moved the robot');
    session.dispose();

    const firm = new VirtualSpikeHubState();
    const {session: fw} = await SimSession.fromText(modelText('driving-base.ldr'), {hubState: firm, catalog: CATALOG,
        createHub: ({id}) => new OnHubProgram({hubState: firm, id})});
    const api2 = createRobotLabApi(hostFor(fw));
    const refused = api2.setMotor('A', {power: 50});
    assert.equal(refused.ok, false);
    assert.equal(refused.code, 'hub-program');
    assert.match(refused.message, /Motor A belongs to the SPIKE Prime hub, whose own program drives it/);
    const de = createRobotLabApi(hostFor(fw, {locale: () => 'de'})).setMotor('A', {power: 50});
    assert.match(de.message, /gehört zum SPIKE-Prime-Hub/);
    assert.equal(api2.motors()[0].direct, false);
    fw.dispose();
});

test('an RCX takes the Lab\'s motor commands as its IR direct commands do: power and stop; a move by degrees is refused by name', async () => {
    // RcxVirtualHub.directCommand: Set Power / Set Direction / On-Off-Float on the VM's own output state, beside an
    // NQC program (the last one wins), so the motor mixer, blocks and words turn an RCX's motors too.
    const {session} = await SimSession.fromText(modelText('rcx-bumper-car.ldr'), {hubState: null, catalog: CATALOG, mat: 'wall'});
    assert.deepEqual(session.hubs.map(h => h.profile), ['rcx']);
    const api = createRobotLabApi(hostFor(session));
    assert.deepEqual(api.motors().map(m => [m.port, m.direct]).sort(), [['A', true], ['C', true]]);
    assert.equal(api.setMotor('A', {power: 80}).ok, true);
    await run(session, 400);
    assert.ok(Math.abs(api.motorAngle('A')) > 30, `A turns: ${api.motorAngle('A')}`);
    assert.equal(api.stopMotor('A', 'hold').code, 'refused', 'RCX has no encoder hold');
    assert.equal(setMixerMotorPower(api, 'A', 0).ok, true, 'mixer falls back to the RCX brake');
    await run(session, 1000);
    const stopped = api.motorAngle('A');
    await run(session, 400);
    assert.ok(Math.abs(api.motorAngle('A') - stopped) < 3, 'RCX mixer stop brakes the shaft');
    const degrees = api.setMotor('C', {degrees: 90});
    assert.equal(degrees.ok, false);
    assert.match(degrees.message || degrees.code, /encoder|refused/);
    session.dispose();
});

test('reads: a distance sensor, part positions and contact with the ground and the wall', async () => {
    const hubState = new VirtualSpikeHubState();
    const {session} = await SimSession.fromText(modelText('wall-stopper.ldr'), {hubState, catalog: CATALOG, mat: 'wall'});
    const api = createRobotLabApi(hostFor(session));
    const sensor = api.sensors().find(s => s.kind === 'distance');
    assert.ok(sensor, JSON.stringify(api.sensors()));
    await run(session, 300);
    const d0 = api.readSensor(sensor.port);
    assert.equal(d0.ok, true);
    assert.equal(api.sensorValue(sensor.port), d0.value);
    assert.ok(typeof d0.value === 'number', JSON.stringify(d0));
    const wheels = api.parts().filter(p => /wheel/i.test(p.id)).map(p => p.id);
    assert.ok(wheels.length >= 2, JSON.stringify(api.parts()));
    assert.equal(api.touching(wheels[0], 'ground'), true, 'a wheel stands on the ground');
    assert.equal(api.touching('hub', 'ground'), false, 'the hub does not');
    // Drive at the wall; the contact event fires on the step something first touches it.
    const front = api.parts();
    let hits = [];
    const offs = front.map(p => api.onContact(p.id, 'wall', e => hits.push({...e, t: session.time})));
    const x0 = api.partPosition('hub', 'x');
    for (const m of api.motors()) api.setMotor(m.port, {power: m.part === 'motorL' ? -60 : 60});
    await run(session, 12000, () => hits.length > 0);
    assert.ok(hits.length > 0, 'something touched the wall');
    assert.ok(api.partPosition('hub', 'x') > x0 + 10, `the robot drove ${api.partPosition('hub', 'x') - x0} cm along x`);
    assert.ok(api.sensorValue(sensor.port) < d0.value || d0.value < 0, 'the wall came closer');
    for (const off of offs) off();
    session.dispose();
});

test('with no model, every call says so and the block methods answer neutral values', async () => {
    const api = createRobotLabApi({getSession: () => null, getStatus: () => 'ready'});
    assert.equal(api.status(), 'no-model');
    assert.equal(api.setMotor('A', {power: 1}).code, 'no-model');
    assert.equal(api.readSensor('A').code, 'no-model');
    assert.equal(api.pose('hub').code, 'no-model');
    assert.equal(api.motorAngle('A'), 0);
    assert.equal(api.sensorValue('A'), 0);
    assert.equal(api.partPosition('hub', 'x'), 0);
    assert.equal(api.whenTouch('a', 'b'), false);
    assert.equal(await api.runMotorDegrees('A', 90, 100), 'no-model');
    assert.deepEqual(api.motors(), []);
    const loading = createRobotLabApi({getSession: () => null, getStatus: () => 'loading'});
    assert.equal(loading.setMotor('A', {power: 1}).code, 'loading');
    assert.equal((await loading.loadModel('no-such-model')).code, 'no-model', 'without a host loader');
    const models = createRobotLabApi({getSession: () => null, listModels: () => [{id: 'driving-base'}], loadModel: async id => ({ok: true, id})});
    assert.equal((await models.loadModel('nope')).code, 'bad-model');
    assert.deepEqual(await models.loadModel('driving-base.ldr'), {ok: true, id: 'driving-base'});
    assert.equal(models.setTimeScale(5).scale, 4);
    assert.equal(models.setTimeScale(2).scale, 2);
    assert.equal(models.setTimeScale(0.01).scale, 0.1);
    assert.equal(models.camera('sideways').ok, false);
});
