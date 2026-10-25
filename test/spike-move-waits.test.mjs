// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * `move forward 30 cm` ends when the robot has moved 30 cm, so the next block's command
 * (`start tank ...` in the Maze example) cannot override it part-way.
 *
 * The Maze example once needed `wait 1.5 seconds` after every `move forward 30 cm`. The
 * block's wait is _waitForMovement (the encoders of BOTH movement motors, relative to where
 * they stood when the block began, within 5 degrees of the commanded degrees; the safety net
 * is no encoder progress for 2 s); this file pins that behaviour on the bundle as shipped,
 * on a clock the test owns, with the encoders turned by the test: 30 cm at 17.6 cm per wheel
 * rotation is 613.6 degrees, so the block must not end before the wheels are within 1 cm
 * (20.5 degrees) of that, however slowly they turn, whichever way each motor is mounted, and
 * however far the encoders already stood. The end-to-end proof is test/bw-sim-maze-program.test.mjs
 * (the Maze program without the waits, on the physics).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quietConsole} from './helpers/quiet-console.mjs';
import {makeRuntime} from '../scripts/spike/fake-runtime.mjs';
import {bundleSource} from '../scripts/spike/bundled-upstream.mjs';

quietConsole();

/** A clock the test owns: Date.now, setTimeout, setInterval. */
const clock = (() => {
    let now = 0;
    let seq = 0;
    const timers = new Map();
    const add = (fn, ms, every) => { const id = ++seq; timers.set(id, {fn, at: now + Math.max(0, ms || 0), every}); return id; };
    return {
        install () {
            globalThis.Date.now = () => now;
            globalThis.setTimeout = (fn, ms) => add(fn, ms, 0);
            globalThis.setInterval = (fn, ms) => add(fn, ms, Math.max(1, ms || 1));
            globalThis.clearTimeout = id => timers.delete(id);
            globalThis.clearInterval = id => timers.delete(id);
        },
        get now () { return now; },
        /** Advance to `t` ms, firing timers in order. */
        advance (t) {
            for (;;) {
                let next = null;
                for (const [id, x] of timers) if (x.at <= t && (!next || x.at < next[1].at)) next = [id, x];
                if (!next) break;
                const [id, x] = next;
                now = x.at;
                if (x.every) x.at += x.every; else timers.delete(id);
                x.fn();
            }
            now = t;
        }
    };
})();

globalThis.window = globalThis;
globalThis.document = {documentElement: {lang: 'en'}, createElement: () => ({style: {}, appendChild () {}, click () {}, setAttribute () {}}),
    body: {appendChild () {}, removeChild () {}}};
globalThis.localStorage = {getItem: () => null, setItem: () => {}};
globalThis.addEventListener = () => {};
Object.defineProperty(globalThis, 'navigator', {value: {language: 'en-US', userAgent: 'node'}, configurable: true, writable: true});
clock.install();

const extension = (() => {
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
    new Function('Scratch', bundleSource('spikeprime'))(Scratch);
    return captured;
})();

/** One wheel rotation moves the robot 17.6 cm (the bundle's constant); degrees for a distance. */
const CM_PER_ROTATION = 17.6;
const degreesFor = cm => cm / CM_PER_ROTATION * 360;
const TOLERANCE_DEG = degreesFor(1);

/** A hub whose movement pair is A and B; each encoder reads `encoders[port]` (relative position). */
const hub = encoders => {
    const sent = [];
    extension._peripheral = {
        movementMotors: ['A', 'B'],
        motorSettings: {A: {speed: 30}, B: {speed: 30}},
        sendPythonCommand: code => { sent.push(code); return Promise.resolve(); },
        _sensors: {motorPositions: Object.fromEntries(Object.keys(encoders).map(port => [port, {
            get relativePosition () { return encoders[port]; }
        }]))},
        portValues: {}
    };
    return sent;
};

/** Runs `move forward 30 cm`; the probe records the encoders at the moment the block ended. */
const moveThirty = encoders => {
    const state = {done: false, at: null};
    Promise.resolve(extension.moveForward({DIRECTION: 'forward', VALUE: 30, UNIT: 'cm'})).then(() => {
        state.done = true;
        state.at = {...encoders};
    });
    return state;
};
const flush = () => new Promise(resolve => setImmediate(resolve));

/** Turns both wheels (A backwards, as the left motor is mounted) over `ms`, stepping 20 ms. */
const drive = async (encoders, from, degrees, ms, until) => {
    const start = clock.now;
    for (let t = 20; t <= ms; t += 20) {
        encoders.A = from.A - degrees * Math.min(1, t / ms);
        encoders.B = from.B + degrees * Math.min(1, t / ms);
        clock.advance(start + t);
        await flush();
        if (until()) return;
    }
};

test('the move block sends 30 cm as the wheel rotations it is', () => {
    const encoders = {A: 0, B: 0};
    const sent = hub(encoders);
    moveThirty(encoders);
    assert.match(sent[0], /motors\.move\(1\.7045\d*, 'rotations', speed=30\)/);
    assert.ok(Math.abs(degreesFor(30) - 613.6) < 0.1);
});

test('a 30 cm move is waited out: the next block starts only once the wheels have turned the distance', async () => {
    const encoders = {A: 0, B: 0};
    hub(encoders);
    const block = moveThirty(encoders);
    // A slow robot: 30 cm takes 12 s here (the hub's own pace is about 2.3 s).
    await drive(encoders, {A: 0, B: 0}, degreesFor(30), 12000, () => block.done);
    assert.equal(block.done, true, 'the block ends once the wheels are there');
    for (const port of ['A', 'B']) {
        assert.ok(Math.abs(block.at[port]) >= degreesFor(30) - TOLERANCE_DEG,
            `motor ${port} stood at ${block.at[port].toFixed(1)} degrees when the next block ran, 30 cm is ${degreesFor(30).toFixed(1)}`);
    }
});

test('the wheels already stand somewhere: the move is counted from there, not from zero', async () => {
    // After a turn in place the encoders are not zero (the Maze: A at -405, B at 836).
    const encoders = {A: -405, B: 836};
    hub(encoders);
    const block = moveThirty(encoders);
    // Half way the old positions alone are already past 30 cm of "movement" from zero.
    await drive(encoders, {A: -405, B: 836}, degreesFor(15), 3000, () => block.done);
    assert.equal(block.done, false, 'half the distance is not the move');
    await drive(encoders, {A: -405 - degreesFor(15), B: 836 + degreesFor(15)}, degreesFor(15), 3000, () => block.done);
    assert.equal(block.done, true);
    assert.ok(Math.abs(block.at.B - 836) >= degreesFor(30) - TOLERANCE_DEG, `B moved ${(block.at.B - 836).toFixed(1)} degrees`);
});

test('both motors count: one wheel arriving is not the move', async () => {
    const encoders = {A: 0, B: 0};
    hub(encoders);
    const block = moveThirty(encoders);
    const start = clock.now;
    // B (a wheel slipping, or a motor answering late) is at a third of the way when A is there.
    for (let t = 20; t <= 3000; t += 20) {
        encoders.A = -degreesFor(30) * Math.min(1, t / 2000);
        encoders.B = degreesFor(30) * Math.min(1, t / 6000);
        clock.advance(start + t);
        await flush();
        if (block.done) break;
    }
    assert.equal(block.done, false, `ended with A at ${encoders.A.toFixed(0)} and B at ${encoders.B.toFixed(0)} degrees`);
    encoders.B = degreesFor(30) - 1;
    clock.advance(start + 3100);
    await flush();
    assert.equal(block.done, true, 'both wheels there: the block ends');
});

test('a blocked robot does not hang the program: no encoder progress for 2 s ends the move', async () => {
    const encoders = {A: 0, B: 0};
    hub(encoders);
    const block = moveThirty(encoders);
    const start = clock.now;
    clock.advance(start + 400);
    encoders.A = -100;
    encoders.B = 100; // it moved, then met a wall
    await flush();
    clock.advance(start + 400 + 1900);
    await flush();
    assert.equal(block.done, false, '1.9 s after the last change is not yet stalled');
    clock.advance(start + 400 + 2200);
    await flush();
    assert.equal(block.done, true);
});
