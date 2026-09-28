// SPDX-License-Identifier: BSD-3-Clause
// The SPIKE arena's model against closed-form answers and constructed scenes:
// the hub's motor model, the command translator, kinematics, every sensor and
// collisions. docs/SPIKE-ARENA.md states what is modelled; each claim there
// that can be checked is checked here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = resolve(here, '../overlay/scratch-gui/src/lib');
const {default: HubState} = await import(resolve(lib, 'virtual-hub/spike-hub-state.js'));
const {applyHubPython, applyScratchVerb, steeringFactors} = await import(resolve(lib, 'virtual-hub/spike-hub-commands.js'));
const {ArenaSim, SPIKE_DRIVING_BASE, COLOR_IDS} = await import(resolve(lib, 'spike-arena/arena-sim.js'));
const {ArenaHubBridge} = await import(resolve(lib, 'spike-arena/arena-hub-bridge.js'));
const {assertValidWorld} = await import(resolve(lib, 'spike-arena/arena-world.js'));

const close = (actual, expected, tolerance, message) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not within ${tolerance} of ${expected}`);

const WHEEL_CM = Math.PI * 5.6; // one wheel rotation
const world = (extra = {}) => assertValidWorld({
    id: 'scene', title: {en: 'scene', de: 'Szene'}, intro: {en: 'x', de: 'x'},
    mat: {width: 300, height: 200, background: 'white', ...(extra.mat || {})},
    start: {x: 50, y: 100, heading: 0},
    timeLimitMs: 60000,
    success: [{type: 'touch', object: 'probe'}],
    objects: [{id: 'probe', shape: {type: 'circle', x: 290, y: 10, r: 1}}, ...(extra.objects || [])],
    walls: extra.walls || [],
    zones: extra.zones || [],
    ...(extra.start ? {start: extra.start} : {})
});

// ---------------------------------------------------------------- motor model

test('the motor model: run for degrees stops exactly on target and resolves completed', async () => {
    const hub = new HubState();
    hub.setPort('A', 'motor', {deviceId: 48});
    const done = hub.motors.runForDegrees('A', 400, 555); // 50 % of 1110 deg/s
    let result = null;
    done.then(value => { result = value; });
    for (let i = 0; i < 1000 && hub.motors.busy('A'); i++) hub.stepMotors(5);
    await done;
    assert.equal(result, 'completed');
    assert.equal(hub.data.motors[0].position, 400, 'no overshoot, no undershoot');
    assert.equal(hub.data.motors[0].speed, 0);
});

test('the motor model: direction is sign(degrees) * sign(speed), as SPIKE run_for_degrees', async () => {
    const hub = new HubState();
    const done = hub.motors.runForDegrees('B', -90, -300);
    for (let i = 0; i < 200; i++) hub.stepMotors(5);
    assert.equal(await done, 'completed');
    assert.equal(hub.data.motors[1].position, 90);
});

test('the motor model: a new command interrupts the old one', async () => {
    const hub = new HubState();
    const first = hub.motors.runForDegrees('C', 3600, 500);
    hub.stepMotors(100);
    hub.motors.runAtSpeed('C', -500);
    assert.equal(await first, 'interrupted');
    hub.stepMotors(100);
    close(hub.data.motors[2].position, 0, 1e-9, 'back where it started');
});

test('the motor model: percent is of the device\'s documented full speed', () => {
    const hub = new HubState();
    hub.setPort('A', 'motor', {deviceId: 65});
    hub.setPort('B', 'motor', {deviceId: 49});
    assert.equal(hub.motors.percentToDps('A', 100), 660);
    assert.equal(hub.motors.percentToDps('B', 50), 525);
    assert.equal(hub.motors.percentToDps('C', 100), 1110, 'an unknown device reads as the medium motor');
});

test('setMotorSpeed (the tunnel JSON and panel route) now turns the motor', () => {
    const hub = new HubState();
    hub.setMotorSpeed('A', 50);
    hub.stepMotors(1000);
    assert.equal(hub.data.motors[0].speed, 50);
    close(hub.data.motors[0].position, 555, 1e-9, 'one second at 50 %');
    hub.stopAll();
    hub.stepMotors(1000);
    close(hub.data.motors[0].position, 555, 1e-9, 'stopped');
});

// ---------------------------------------------------------------- the translator

test('the translator: every statement the spikeprime extension sends for a motor is understood', async () => {
    const cases = [
        ['import hub; hub.port.A.motor.run_for_degrees(360, 50)', 0, 360],
        ['import hub; hub.port.B.motor.run_for_time(1000, 50)', 1, 555],
        ['hub.port.C.motor.pwm(50)', 2, 555],
        ['motor.run(port.D, 1110)', 3, 1110]
    ];
    for (const [text, index, expected] of cases) {
        const hub = new HubState();
        const {handled, unhandled} = applyHubPython(hub, text);
        assert.ok(handled, `${text} unhandled: ${unhandled}`);
        hub.stepMotors(1000);
        close(hub.data.motors[index].position, expected, 1e-6, text);
    }
    const hub = new HubState();
    applyHubPython(hub, 'hub.port.C.motor.pwm(50); motor.run(port.D, 1110)');
    hub.stepMotors(1000);
    applyHubPython(hub, 'hub.port.C.motor.pwm(0); hub.port.C.motor.brake()');
    applyHubPython(hub, 'motor.stop(port.D)');
    hub.stepMotors(1000);
    close(hub.data.motors[2].position, 555, 1e-6, 'pwm(0); brake() stops');
    close(hub.data.motors[3].position, 1110, 1e-6, 'motor.stop stops');
    assert.deepEqual(applyHubPython(hub, 'hub.light_matrix.write("x")').unhandled, ['hub.light_matrix.write("x")'],
        'an unknown statement is reported, not guessed at');
});

test('the translator: the movement pair drives the mirrored left motor backwards for forward', async () => {
    const hub = new HubState();
    const done = applyHubPython(hub, "motors.move(2, 'rotations', speed=50)").pending[0];
    for (let i = 0; i < 400; i++) hub.stepMotors(5);
    assert.equal(await done, 'completed');
    assert.equal(hub.data.motors[0].position, -720, 'left (A) counterclockwise');
    assert.equal(hub.data.motors[1].position, 720, 'right (B) clockwise');
});

test('the translator: steering follows SPIKE (inner wheel stops at 50, reverses at 100)', () => {
    assert.deepEqual(steeringFactors(0), [1, 1]);
    assert.deepEqual(steeringFactors(50), [1, 0]);
    assert.deepEqual(steeringFactors(100), [1, -1]);
    assert.deepEqual(steeringFactors(-100), [-1, 1]);
});

test('the translator: SPIKE 2 scratch.* motion verbs complete when the motion does', async () => {
    const hub = new HubState();
    const {done} = applyScratchVerb(hub, 'scratch.motor_run_for_degrees', {port: 'E', speed: 50, degrees: 180});
    let finished = false;
    done.then(() => { finished = true; });
    hub.stepMotors(100);
    await Promise.resolve();
    assert.equal(finished, false, 'still running after 100 ms');
    hub.stepMotors(1000);
    await done;
    assert.equal(hub.data.motors[4].position, 180);
    assert.equal(applyScratchVerb(hub, 'scratch.display_clear', {}), null, 'not a motion verb');
});

test('reset_yaw zeroes yaw at the current heading', () => {
    const hub = new HubState();
    hub.resetHeading(30);
    hub.setHeading(75);
    assert.equal(hub.data.imu.yaw, 45);
    applyHubPython(hub, 'import hub; hub.motion.reset_yaw()');
    assert.equal(hub.data.imu.yaw, 0);
    hub.setHeading(70);
    assert.equal(hub.data.imu.yaw, -5);
    hub.setHeading(30 + 45 + 200);
    assert.equal(hub.data.imu.yaw, -160, 'wrapped to -180..180');
});

// ---------------------------------------------------------------- kinematics

test('kinematics: N degrees on both wheels drives N/360 * pi * 5.6 cm straight', () => {
    const sim = new ArenaSim(world());
    for (let i = 0; i < 100; i++) sim.advanceWheels(WHEEL_CM * 3 / 100, WHEEL_CM * 3 / 100, 10);
    close(sim.pose.x - 50, 3 * WHEEL_CM, 1e-9, 'three rotations');
    close(sim.pose.y, 100, 1e-9, 'no drift');
    close(sim.pose.heading, 0, 1e-9, 'no turn');
});

test('kinematics: opposite wheels turn in place by travel / (track / 2) radians', () => {
    const sim = new ArenaSim(world());
    // A quarter turn needs each wheel to travel a quarter of the circle whose diameter is the track.
    const quarter = Math.PI * SPIKE_DRIVING_BASE.axleTrack / 4;
    for (let i = 0; i < 50; i++) sim.advanceWheels(quarter / 50, -quarter / 50, 10);
    close(sim.pose.heading, 90, 1e-9, 'left forward, right back is a right (clockwise) turn');
    close(sim.pose.x, 50, 1e-9, 'in place');
    close(sim.pose.y, 100, 1e-9, 'in place');
});

test('kinematics: an arc is integrated exactly, so step size does not change the answer', () => {
    const a = new ArenaSim(world());
    const b = new ArenaSim(world());
    a.advanceWheels(20, 10, 1000);
    for (let i = 0; i < 1000; i++) b.advanceWheels(0.02, 0.01, 1);
    close(a.pose.x, b.pose.x, 1e-9, 'x');
    close(a.pose.y, b.pose.y, 1e-9, 'y');
    close(a.pose.heading, b.pose.heading, 1e-9, 'heading');
    // Closed form: radius R = track * (dl + dr) / (2 * (dl - dr)), angle (dl - dr) / track.
    const track = SPIKE_DRIVING_BASE.axleTrack;
    const angle = 10 / track;
    const radius = track * 30 / 20;
    close(a.pose.x - 50, radius * Math.sin(angle), 1e-9, 'x on the circle');
    close(a.pose.y - 100, radius * (1 - Math.cos(angle)), 1e-9, 'y on the circle (y down: a right turn)');
});

test('kinematics through the hub: 720 degrees on both motors at 50 % is 2 wheel rotations', async () => {
    const hub = new HubState();
    const bridge = new ArenaHubBridge({hubState: hub, world: world()});
    const done = applyHubPython(hub, "motors.move(720, 'degrees', speed=50)").pending[0];
    for (let i = 0; i < 300; i++) bridge.tick(10);
    await done;
    close(bridge.sim.pose.x - 50, 2 * WHEEL_CM, 1e-9, 'exactly two rotations of travel');
    close(bridge.sim.pose.heading, 0, 1e-9, 'straight');
});

test('kinematics through the hub: a steering-100 move of D wheel degrees turns D * d / track degrees', async () => {
    const hub = new HubState();
    const bridge = new ArenaHubBridge({hubState: hub, world: world()});
    const degrees = 180;
    applyHubPython(hub, `motors.move(${degrees}, 'degrees', 100, speed=30)`);
    for (let i = 0; i < 200; i++) bridge.tick(10);
    close(bridge.sim.pose.heading, degrees * 5.6 / 11.2, 1e-9, 'a spin right');
    close(hub.data.imu.yaw, 90, 1e-9, 'the hub IMU yaw follows, clockwise positive');
});

// ---------------------------------------------------------------- sensors

test('colour sensor: reads the colour of the mat under it, with SPIKE ids and reflection', () => {
    const sim = new ArenaSim(world({mat: {shapes: [
        {color: 'black', shape: {type: 'rect', x: 58, y: 100, w: 2, h: 40}},
        {color: 'red', shape: {type: 'circle', x: 58, y: 100, r: 0.5}}
    ]}}));
    // The colour sensor sits 7 cm ahead of the axle: over x = 57.
    const read = () => sim.readSensors().C;
    assert.equal(read().color, COLOR_IDS.black);
    assert.equal(read().reflection, 10);
    sim.advanceWheels(1, 1, 10);
    assert.equal(read().colorName, 'red', 'the later shape is drawn on top');
    assert.equal(read().color, 9);
    sim.advanceWheels(5, 5, 10);
    assert.equal(read().color, COLOR_IDS.white, 'background');
    assert.equal(read().reflection, 100);
});

test('distance sensor: raycasts to walls and objects in mm, -1 out of range', () => {
    const scene = world({walls: [{shape: {type: 'rect', x: 150, y: 100, w: 2, h: 200}}],
        objects: [{id: 'rock', shape: {type: 'circle', x: 100, y: 100, r: 5}}]});
    const sim = new ArenaSim(scene);
    // The sensor face is 9 cm ahead of the axle (x = 59); the rock's near edge is at x = 95.
    assert.equal(sim.readSensors().D.distance, 360);
    sim.objects = sim.objects.filter(object => object.id !== 'rock');
    assert.equal(sim.readSensors().D.distance, 900, 'the wall face at x = 149');
    const near = new ArenaSim(world({start: {x: 12, y: 100, heading: 180}}));
    assert.equal(near.readSensors().D.distance, -1, 'the border 3 cm ahead: under the 50 mm minimum');
    const edge = new ArenaSim(world({start: {x: 14, y: 100, heading: 180}}));
    assert.equal(edge.readSensors().D.distance, 50, 'exactly the 50 mm minimum reads');
    const open = new ArenaSim(world({mat: {width: 500, border: false}, start: {x: 20, y: 100, heading: 0}}));
    assert.equal(open.readSensors().D.distance, -1, 'nothing within 2 m');
});

test('force sensor: pressed only when its tip touches something solid', () => {
    const scene = world({objects: [{id: 'rock', shape: {type: 'rect', x: 80, y: 103, w: 20, h: 6}}]});
    const sim = new ArenaSim(scene);
    assert.equal(sim.readSensors().E.pressed, false);
    for (let i = 0; i < 400 && !sim.readSensors().E.pressed; i++) sim.advanceWheels(0.05, 0.05, 5);
    const tipX = sim.pose.x + 9.8;
    assert.equal(sim.readSensors().E.pressed, true);
    close(tipX, 70, 0.35, 'pressed at the rock face');
});

// ---------------------------------------------------------------- collisions

test('collisions: a wall stops the body with no penetration, while the wheels slip', async () => {
    const hub = new HubState();
    const scene = world({walls: [{shape: {type: 'rect', x: 100, y: 100, w: 2, h: 200}}]});
    const bridge = new ArenaHubBridge({hubState: hub, world: scene});
    applyHubPython(hub, "motors.move(10, 'rotations', speed=50)");
    let everBlocked = false;
    for (let i = 0; i < 700; i++) { bridge.tick(10); everBlocked ||= bridge.sim.blocked; }
    const front = bridge.sim.pose.x + SPIKE_DRIVING_BASE.body.front;
    assert.ok(front <= 99, `no penetration: body front at ${front}`);
    close(front, 99, 0.01, 'stopped at contact, not short of it');
    assert.equal(everBlocked, true);
    assert.ok(bridge.sim.touching.has('wall'));
    assert.equal(hub.data.motors[1].position, 3600, 'the motors finished their rotations regardless (slip)');
});

test('collisions: a pushable object moves ahead of the robot until it meets a wall', () => {
    const scene = world({walls: [{shape: {type: 'rect', x: 120, y: 100, w: 2, h: 200}}],
        objects: [{id: 'crate', pushable: true, shape: {type: 'rect', x: 70, y: 100, w: 6, h: 6}}]});
    const sim = new ArenaSim(scene);
    for (let i = 0; i < 1000; i++) sim.advanceWheels(0.1, 0.1, 5);
    const crate = sim.objects.find(o => o.id === 'crate');
    close(crate.shape.x + 3, 119, 0.05, 'the crate is against the wall');
    assert.ok(sim.pushed.has('crate'));
    close(sim.pose.x + 9, crate.shape.x - 3, 0.05, 'the robot is against the crate');
});

test('collisions: the mat border is a wall', () => {
    const sim = new ArenaSim(world({start: {x: 50, y: 100, heading: 180}}));
    for (let i = 0; i < 200; i++) sim.advanceWheels(0.5, 0.5, 5);
    close(sim.pose.x - SPIKE_DRIVING_BASE.body.front, 0, 0.01, 'stopped at x = 0');
});

// ---------------------------------------------------------------- determinism

test('the same commands give the same world, bit for bit', async () => {
    const run = () => {
        const hub = new HubState();
        const bridge = new ArenaHubBridge({hubState: hub, world: world()});
        applyHubPython(hub, "motors.start(30, speed=40)");
        for (let i = 0; i < 97; i++) bridge.tick(13);
        return JSON.stringify(bridge.sim.pose);
    };
    assert.equal(run(), run());
});

// ---------------------------------------------------------------- world format and checker

test('the validator names every broken path', async () => {
    const {validateWorld} = await import(resolve(lib, 'spike-arena/arena-world.js'));
    const errors = validateWorld({id: 'Bad Id', title: {en: 'x'}, intro: {en: 'x', de: 'x'},
        mat: {width: 10, height: 10, background: 'plaid', shapes: [{color: 'black', shape: {type: 'blob'}}]},
        zones: [{id: 'z', role: 'goal', shape: {type: 'circle', x: 1, y: 1}}],
        start: {x: 1}, timeLimitMs: 0,
        success: [{type: 'reach', zone: 'nowhere'}, {type: 'avoid', zone: 'z'}],
        failure: [{type: 'touch', object: 'rock'}]});
    for (const fragment of ['id:', 'title: needs both', 'mat.background: unknown colour plaid',
        'mat.shapes[0].shape: shape type', 'zones[0].shape.r', 'start: x and y', 'timeLimitMs',
        'success[0]: no zone nowhere', 'success[1].type: avoid is not allowed here',
        'failure[0].type: touch is not allowed here']) {
        assert.ok(errors.some(error => error.includes(fragment)), `missing "${fragment}" in:\n${errors.join('\n')}`);
    }
});

test('the checker: stopIn needs the robot stopped inside for the hold time; a failure wins first', async () => {
    const {ArenaChecker} = await import(resolve(lib, 'spike-arena/arena-checker.js'));
    const scene = assertValidWorld({
        id: 'check', title: {en: 'c', de: 'c'}, intro: {en: 'c', de: 'c'}, mat: {width: 100, height: 100},
        start: {x: 10, y: 10, heading: 0}, timeLimitMs: 5000,
        zones: [{id: 'goal', role: 'goal', shape: {type: 'rect', x: 50, y: 50, w: 10, h: 10}},
            {id: 'pit', role: 'hazard', shape: {type: 'circle', x: 80, y: 80, r: 5}}],
        success: [{type: 'stopIn', zone: 'goal', holdMs: 500}], failure: [{type: 'avoid', zone: 'pit'}]});
    const view = (t, x, y, speed = 0) => ({timeMs: t, pose: {x, y, heading: 0}, speed, turnRate: 0,
        footprint: [[x - 1, y - 1], [x + 1, y - 1], [x + 1, y + 1], [x - 1, y + 1]], touching: [], touchedEver: [], objects: []});
    const checker = new ArenaChecker(scene);
    assert.equal(checker.evaluate(view(0, 50, 50, 10)).status, 'running', 'moving through the goal is not stopping in it');
    assert.equal(checker.evaluate(view(100, 50, 50)).status, 'running');
    assert.equal(checker.evaluate(view(550, 50, 50)).status, 'running', 'held 450 ms of 500');
    assert.equal(checker.evaluate(view(600, 50, 50)).reason, 'pass.stoppedIn');
    const failing = new ArenaChecker(scene);
    assert.deepEqual([failing.evaluate(view(0, 76, 80)).status, failing.verdict.reason], ['fail', 'fail.enteredZone']);
    const late = new ArenaChecker(scene);
    assert.equal(late.evaluate(view(5000, 20, 20)).reason, 'fail.timeLimit');
    assert.equal(late.evaluate(view(5100, 50, 50)).status, 'fail', 'a decided verdict does not change');
});
