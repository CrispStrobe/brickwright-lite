// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The RCX in the Robot Lab (docs/ROBOT-LAB-RCX.md; docs/ROBOT-LAB-HUBS-PLAN.md
 * phase "RCX"): NQC source → the shipped nqc-wasm → an `.rcx` image → the
 * runtime's `rcxDownload` with "Robot Lab RCX" CHOSEN as its target → the
 * clean-room bytecode VM resident in the scene's RCX (hubs/rcx/), on the Lab's
 * one clock → its outputs as PWM drives into the mini-motors' DC model, its
 * inputs from the touch, light and rotation sensors' probes.
 *
 * Every expectation comes from somewhere other than the code under test: the
 * scene (the wall body the mat compiles, the oval's centre line, the probe's
 * height over the floor), the motor catalogue (Philo's numbers → the no-load
 * speed), LEGO's firmware reference (16 counts a turn, 45/55 % boolean
 * thresholds) and the device model's cited formula for the light sensor.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {SimSession, MODELS, MODELS_BASE, PROGRAMS_BASE, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {hubRegistry} = await import(path.join(SIM, 'hubs/index.js'));
const {validateHubProfile} = await import(path.join(SIM, 'hubs/hub-profile.js'));
const {RcxVirtualHub} = await import(path.join(SIM, 'hubs/rcx/rcx-virtual-hub.js'));
const {robotLabRcxTarget, ROBOT_LAB_RCX_TARGET} = await import(path.join(SIM, 'hubs/rcx/rcx-lab-target.js'));
const {deviceModels, dcLineAt} = await import(path.join(SIM, 'devices/catalog.js'));
const {lightRaw} = await import(path.join(SIM, 'devices/rcx-sensors.js'));
const {distanceToOvalCentre, createMat} = await import(path.join(SIM, 'world/mats.js'));
const {registerRcxTarget, selectRcxTarget, rcxTargetOf, TOWER_TARGET} = await import(path.join(GUI, 'src/lib/rcx/rcx-targets.js'));
const {installRcxDownloader} = await import(path.join(GUI, 'src/lib/rcx-download-hook.js'));
const {loadToolchain, compileWithToolchain} = await import(path.join(GUI, 'src/lib/nqc-wasm/compiler.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const toolchain = await loadToolchain();
const BUMPER_CAR = readFileSync(path.join(GUI, MODELS_BASE, 'rcx-bumper-car.ldr'), 'utf8');
const ROTATION_BENCH = readFileSync(path.join(ROOT, 'test/fixtures/bw-sim/rcx-rotation-bench.ldr'), 'utf8');
const WHEEL_BENCH = readFileSync(path.join(ROOT, 'test/fixtures/bw-sim/rcx-wheel-bench.ldr'), 'utf8');
const program = name => readFileSync(path.join(GUI, PROGRAMS_BASE, name), 'utf8');

const nqc = async source => {
    const out = await compileWithToolchain(source, 'RCX2', toolchain);
    assert.equal(out.ok, true, out.log);
    return out.bytes;
};

const open = async (text, mat = null) => {
    const {session, issues} = await SimSession.fromText(text, {hubState: null, catalog: CATALOG, mat});
    assert.ok(session, issues.map(i => i.message).join('; '));
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    const rcx = session.hubs.find(h => h.profile === 'rcx');
    assert.ok(rcx, 'the model\'s hub is an RCX');
    return {session, hub: rcx.hub, body: rcx.body};
};

/** A runtime as the GUI has it: the real download hook, the Lab's target registered on it. */
const labRuntime = getHub => {
    const vm = {runtime: {}};
    assert.equal(installRcxDownloader(vm), true);
    registerRcxTarget(vm.runtime, robotLabRcxTarget(getHub));
    return vm.runtime;
};

// ---- rotate a body-local vector by a quaternion [x, y, z, w] ---------------------
const rotate = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};
/** The foremost point along +x of a body's colliders at its simulated pose (boxes and spheres; cylinders by their bounding box). */
const frontOf = (session, bodyDef) => {
    const pose = session.core.bodyPose(bodyDef.id);
    let best = -Infinity;
    for (const c of bodyDef.colliders) {
        if (c.region) continue;
        const centre = rotate(pose.rotation, c.position || [0, 0, 0]).map((v, i) => v + pose.position[i]);
        const q = c.rotation || [0, 0, 0, 1];
        const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(a => rotate(pose.rotation, rotate(q, a)));
        const h = c.shape === 'box' ? c.halfExtents : c.shape === 'sphere' ? [c.radius, c.radius, c.radius] :
            [c.radius, c.halfHeight, c.radius];
        best = Math.max(best, centre[0] + axes.reduce((s, a, i) => s + Math.abs(a[0]) * h[i], 0));
    }
    return best;
};

test('the RCX is a registered hub family: outputs A–C, inputs 1–3, PWM drive; it refuses what it cannot take', () => {
    const profile = hubRegistry.get('rcx').profile;
    assert.deepEqual(validateHubProfile(profile), []);
    assert.deepEqual(profile.ports.map(p => p.id), ['A', 'B', 'C', '1', '2', '3']);
    assert.equal(profile.drive, 'pwm');
    assert.deepEqual(profile.parts, ['76454c02.dat']);
    const hub = hubRegistry.create('rcx', {id: 'rcx'});
    assert.ok(hub instanceof RcxVirtualHub);
    const refusals = hub.plug([
        {port: '1', class: 'motor', ids: {}, device: 'technic-minimotor-71427'},
        {port: 'B', class: 'sensor', ids: {}, sensor: 'force', device: 'rcx-touch'},
        {port: '2', class: 'sensor', ids: {}, sensor: 'color', device: 'spike-color'},
        {port: 'D', class: 'motor', ids: {}, device: 'technic-minimotor-71427'}
    ]);
    assert.deepEqual(refusals.map(r => r.code), ['port-refuses-device', 'port-refuses-device', 'port-refuses-device', 'port-unknown']);
});

test('downloads go to the tower unless "Robot Lab RCX" is chosen; a chosen target that is gone refuses', async () => {
    const bytes = await nqc('task main() { OnFwd(OUT_A); }');
    let hub = new RcxVirtualHub({id: 'rcx'});
    const runtime = labRuntime(() => hub);
    assert.equal(rcxTargetOf(runtime), TOWER_TARGET, 'the tower is the default');
    // Not chosen: the tower path runs (in node there is no Web Serial: it refuses) and the Lab's RCX gets nothing.
    const tower = await runtime.rcxDownload(bytes);
    assert.equal(tower.ok, false);
    assert.equal(hub.status, 'empty', 'nothing reached the Lab RCX without the choice');
    // Chosen: the image goes into the Lab's RCX and starts.
    selectRcxTarget(runtime, ROBOT_LAB_RCX_TARGET);
    const sent = await runtime.rcxDownload(bytes);
    assert.equal(sent.ok, true, sent.log);
    assert.equal(sent.target, ROBOT_LAB_RCX_TARGET);
    assert.equal(hub.status, 'running');
    // The scene has no RCX any more: a refusal, not the tower.
    hub = null;
    const gone = await runtime.rcxDownload(bytes);
    assert.equal(gone.ok, false);
    assert.match(gone.log, /no RCX/);
    // A target nobody registered cannot be chosen; an unregistered one refuses at download.
    assert.throws(() => selectRcxTarget(runtime, 'elsewhere'), /no RCX download target/);
    const unknown = await runtime.rcxDownload(bytes, {target: 'elsewhere'});
    assert.equal(unknown.ok, false);
    assert.match(unknown.log, /not available/);
    // A bad image is refused by the Lab RCX as by the tower path.
    hub = new RcxVirtualHub({id: 'rcx'});
    const bad = await runtime.rcxDownload(new Uint8Array([1, 2, 3]));
    assert.equal(bad.ok, false);
    assert.equal(hub.status, 'empty');
});

test('the bumper car (shipped NQC, downloaded to the Lab RCX) drives to the wall, backs off when the bumper is pressed, turns and stops', async () => {
    const entry = MODELS.find(m => m.file === 'rcx-bumper-car.ldr' && !m.id);
    assert.equal(entry.mat, 'wall');
    const {session, hub, body} = await open(BUMPER_CAR, entry.mat);
    const runtime = labRuntime(() => hub);
    selectRcxTarget(runtime, ROBOT_LAB_RCX_TARGET);
    const sent = await runtime.rcxDownload(await nqc(program(entry.example)));
    assert.equal(sent.ok, true, sent.log);
    const wall = session.mechanism.bodies.find(b => b.id === 'obstacle:wall');
    const wallFace = wall.position[0] - wall.colliders[0].halfExtents[0];
    const robot = session.mechanism.bodies.filter(b => b.motion === 'dynamic');
    let front = -Infinity;
    let pressedAt = null;
    let reversedAt = null;
    let xAtPress = null;
    let xMin = Infinity;
    for (let t = 5; t <= 4000; t += 5) {
        session.tick(5);
        front = Math.max(front, ...robot.map(b => frontOf(session, b)));
        const x = session.core.bodyPose(body).position[0];
        if (pressedAt === null && hub.vm.sensorValue(0) === 1) { pressedAt = t; xAtPress = x; }
        if (pressedAt !== null && reversedAt === null && hub.vm.s.outputs[0].direction === 1) reversedAt = t;
        if (pressedAt !== null) xMin = Math.min(xMin, x);
        if (hub.status === 'stopped') break;
    }
    assert.ok(pressedAt !== null, 'the bumper was pressed');
    // Pressed against the wall: the robot's front reached the wall face and did not go through it — at the
    // impact (about 0.9 m/s) the contact solver lets it a few millimetres in (Jolt resolves penetration over
    // the following steps), never more than 5 mm.
    assert.ok(front <= wallFace + 0.005, `front ${front.toFixed(4)} m vs wall face ${wallFace.toFixed(4)} m`);
    assert.ok(front >= wallFace - 0.002, `the bumper met the wall: front ${front.toFixed(4)} m, face ${wallFace.toFixed(4)} m`);
    // The program reverses on the next VM turn after the press (one physics step at most).
    assert.ok(reversedAt - pressedAt <= 5, `reversed ${reversedAt - pressedAt} ms after the press`);
    assert.ok(xAtPress - xMin > 0.1, `backed off ${(xAtPress - xMin).toFixed(3)} m`);
    assert.equal(hub.status, 'stopped', 'the program ended');
    assert.deepEqual(hub.readDrives().map(d => [d.port, d.duty, d.decay]), [['A', 0, 'brake'], ['C', 0, 'brake']], 'Off brakes both');
    assert.ok(hub.events.some(e => e.kind === 'sound'), 'PlaySound is recorded');
    session.dispose();
});

test('the line follower (shipped NQC) follows the line-oval mat one lap; the light sensor reads the mat through its device model', async () => {
    const entry = MODELS.find(m => m.id === 'rcx-line-follower');
    assert.equal(entry.mat, 'line-oval');
    const {session, hub, body} = await open(BUMPER_CAR, entry.mat);
    // The light probe's height over the floor at t = 0, from the compiled scene.
    const probe = session.mechanism.devices.find(d => d.device === 'rcx-light');
    const ground = session.mechanism.bodies.find(b => b.id === 'ground');
    const groundTop = ground.position[1] + ground.colliders[0].halfExtents[1];
    const height = probe.probe.origin[1] - groundTop;
    assert.ok(height > 0 && height < 0.032, `the eye is ${height} m over the floor, inside the probe's reach`);
    const expect = reflection => lightRaw({color: 10, reflection: Math.round(reflection * (1 - height / 0.032))});
    // White under the eye at the start (it sits beside the line): the model's value for white at that height.
    const mat = createMat('line-oval');
    const start = mat.colorAt(probe.probe.origin[0], probe.probe.origin[2]);
    assert.equal(start.color, 10, 'the eye starts over white');
    assert.equal(hub.inputs[1], expect(start.reflection));
    // The example's threshold lies between what the firmware makes of white and of the black line.
    const threshold = Number(/#define THRESHOLD (\d+)/.exec(program(entry.example))[1]);
    const percent = raw => 146 - Math.trunc(raw / 7);
    assert.ok(percent(expect(100)) > threshold && percent(expect(5)) < threshold,
        `white ${percent(expect(100))} %, black ${percent(expect(5))} %, threshold ${threshold}`);

    const runtime = labRuntime(() => hub);
    selectRcxTarget(runtime, ROBOT_LAB_RCX_TARGET);
    assert.equal((await runtime.rcxDownload(await nqc(program(entry.example)))).ok, true);
    // Half the track (the motors' hinge points) — the line must stay between the wheels.
    const hinges = session.mechanism.joints.filter(j => j.motor).map(j => j.point);
    const halfTrack = Math.hypot(hinges[0][0] - hinges[1][0], hinges[0][2] - hinges[1][2]) / 2;
    let swept = 0;
    let prev = null;
    let off = 0;
    let darkest = 0;
    let lapMs = null;
    for (let t = 5; t <= 20000; t += 5) {
        session.tick(5);
        const p = session.core.bodyPose(body).position;
        const a = Math.atan2(p[2], p[0]);
        if (prev !== null) swept += Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
        prev = a;
        off = Math.max(off, distanceToOvalCentre(p[0], p[2]));
        darkest = Math.max(darkest, hub.inputs[1]);
        if (Math.abs(swept) >= 2 * Math.PI) { lapMs = t; break; }
    }
    assert.ok(lapMs !== null, `one lap in 20 s (swept ${(swept * 180 / Math.PI).toFixed(0)}°)`);
    assert.ok(off < halfTrack, `the robot's centre stayed ${off.toFixed(3)} m from the line, inside its half track ${halfTrack.toFixed(3)} m`);
    // Over the line the eye read the model's black at its height (± one percent step of the firmware's scale).
    assert.ok(Math.abs(darkest - expect(5)) <= 7, `darkest raw ${darkest}, the model's black ${expect(5)}`);
    session.dispose();
});

test('power levels: duty (p+1)/8 on/float into the mini-motor\'s DC model — no-load speed at every level, torque and damping scale with the level', async () => {
    const motor = deviceModels.get('technic-minimotor-71427').motor;
    const omega0 = dcLineAt(motor, hubRegistry.get('rcx').profile.ports[0].supplyVolts).noLoadRadPerSec;
    const k = {};
    for (const p of [0, 1, 3, 7]) {
        const {session, hub} = await open(WHEEL_BENCH);
        hub.loadProgram(await nqc(`task main() { SetPower(OUT_A, ${p}); OnFwd(OUT_A); Wait(200); }`));
        for (let t = 0; t < 200; t += 5) session.tick(5); // the bench settles on its legs
        hub.run();
        const joint = session.mechanism.joints.find(j => j.motor).id;
        const speeds = [];
        for (let t = 0; t < 1000; t += 5) {
            session.tick(5);
            speeds.push(Math.abs(session.core.jointState(joint).velocity));
        }
        // Drive/float PWM: the back-EMF acts only while driven, so the wheel reaches the motor's
        // no-load speed (Philo's 9 V line) at every power level.
        assert.ok(Math.abs(speeds.at(-1) - omega0) / omega0 < 0.01, `power ${p}: ${speeds.at(-1).toFixed(2)} rad/s vs ${omega0.toFixed(2)}`);
        // The first step from rest, solved implicitly: ω1 = ω0·κ/(1+κ), κ = duty·(τs/ω0)·dt/I.
        k[p] = speeds[0] / (omega0 - speeds[0]);
        session.dispose();
    }
    for (const p of [0, 1, 3]) {
        assert.ok(Math.abs(k[p] / k[7] - (p + 1) / 8) < 0.02, `power ${p}: κ ratio ${(k[p] / k[7]).toFixed(3)} vs ${(p + 1) / 8}`);
    }
});

test('the rotation sensor counts 16 per turn of the axle in its hole, as the hinge turns', async () => {
    const {session, hub} = await open(ROTATION_BENCH);
    hub.loadProgram(await nqc('int count; task main() { SetSensor(SENSOR_3, SENSOR_ROTATION); SetPower(OUT_A, 0); ' +
        'OnFwd(OUT_A); Wait(40); Off(OUT_A); Wait(30); count = SENSOR_3; }'));
    hub.run();
    const joint = session.mechanism.joints.find(j => j.motor);
    // The hinge the sensor reads (sensors.js rotationJoint) is the motor's: the axle in its hole is the motor's output.
    const sensor = session.mechanism.devices.find(d => d.device === 'rcx-rotation');
    assert.ok(Math.abs(joint.axis[0] * sensor.probe.direction[0] + joint.axis[1] * sensor.probe.direction[1] +
        joint.axis[2] * sensor.probe.direction[2]) > 0.999, 'coaxial');
    let checked = 0;
    for (let t = 5; t <= 1000 && hub.status === 'running'; t += 5) {
        session.tick(5);
        const turns = session.core.jointState(joint.id).angle / (2 * Math.PI);
        // Count from the hinge's measured angle at this step; the VM saw the previous step's (zero-order hold).
        const value = hub.vm.sensorValue(2);
        assert.ok(Math.abs(Math.abs(value) - Math.abs(Math.trunc(turns * 16))) <= 1, `t=${t}: SENSOR_3 ${value}, ${turns.toFixed(3)} turns`);
        checked++;
    }
    assert.equal(hub.status, 'stopped');
    const turns = Math.abs(session.core.jointState(joint.id).angle / (2 * Math.PI));
    assert.ok(turns > 1, `the axle turned ${turns.toFixed(2)} times`);
    assert.equal(Math.abs(hub.vm.getVariable('count')), Math.trunc(turns * 16), 'the program read 16 counts a turn');
    assert.ok(checked > 50);
    session.dispose();
});

test('a mirror hub rebuilt from exportState drives exactly as the RCX it copies (the worker\'s replay, rollback)', async () => {
    const {session, hub} = await open(BUMPER_CAR, 'wall');
    hub.loadProgram(await nqc(program('rcx-bumper-car.nqc')));
    hub.run();
    for (let t = 0; t < 400; t += 5) session.tick(5);
    const state = structuredClone(hub.exportState());
    const mirror = hubRegistry.create('rcx', {id: hub.id});
    mirror.plug(session.bridge.hubs[0].bindings);
    mirror.importState(state);
    assert.equal(mirror.stateKey(mirror.exportState()), hub.stateKey(state), 'the same state');
    // Both run on, given the same readings: the same drives every step.
    for (let i = 0; i < 200; i++) {
        const frame = session.bridge.step();
        mirror.advanceTo(frame.t);
        assert.deepEqual(mirror.readDrives(), frame.hubs[hub.id].drives, `step ${i}`);
        mirror.writeReadings(frame.hubs[hub.id].readings);
    }
    session.dispose();
});

test('the bumper car binds its motors to outputs A and C, the bumper to input 1 and the light sensor to input 2', async () => {
    const {session} = await open(BUMPER_CAR);
    assert.deepEqual(session.mechanism.devices.map(d => [d.port, d.device]).sort(), [['1', 'rcx-touch'], ['2', 'rcx-light']]);
    assert.deepEqual(session.mechanism.actuators.map(a => [a.port, a.device]).sort(),
        [['A', 'technic-minimotor-71427'], ['C', 'technic-minimotor-71427']]);
    session.dispose();
});
