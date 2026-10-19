// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * `run motor C clockwise 573 degrees` waits for the MOVE, not for a wall-clock guess.
 *
 * Until 2026-10-18 the spikeprime extension's motorRunFor resolved after
 * degrees / (speed · 6) + 0.5 s of wall time. A motor slower than that guess — under load, or a
 * simulated hub whose physics runs slower than real time — was still turning when the block
 * ended, and the next block's command overrode it part-way: the Robot Lab Forklift lifted 38.1 mm
 * of 40 in CI (run 39079251326), 28.8 mm with its physics worker answering 600 ms late
 * (scripts/verify-sim-lab-browser.mjs --worker-latency=600). It now waits on the encoders
 * (_waitForMovement, as move forward does); the safety net is no encoder progress for 2 s.
 *
 * The bundle as shipped is evaluated (scripts/spike/bundled-upstream.mjs bundleSource), its
 * peripheral replaced by a stub whose encoder the test turns, on a clock the test owns.
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

/** A hub on port C whose encoder reads `encoder.deg` (relative position), the commands it was sent. */
const hub = () => {
    const encoder = {deg: 0};
    const sent = [];
    extension._peripheral = {
        motorSettings: {C: {speed: 30, stopMode: 1, stallDetection: true}},
        sendPythonCommand: code => { sent.push(code); return Promise.resolve(); },
        _sensors: {motorPositions: {C: {get relativePosition () { return encoder.deg; }}}},
        portValues: {}
    };
    return {encoder, sent};
};

/** Runs the block; returns a probe of whether it has ended. */
const run = args => {
    const state = {done: false};
    Promise.resolve(extension.motorRunFor(args)).then(() => { state.done = true; });
    return state;
};
const flush = () => new Promise(resolve => setImmediate(resolve));

test('a slow move is waited out: the block ends when the encoder has turned the degrees, however long that takes', async () => {
    const {encoder, sent} = hub();
    const start = clock.now;
    const block = run({PORT: 'C', DIRECTION: 1, VALUE: 573, UNIT: 'degrees'});
    assert.match(sent[0], /run_for_degrees\(573, 30\)/);
    // The old wall-clock guess: 573 / (30 · 6) s + 0.5 s = 3.68 s. The motor here turns 57°/s (a
    // loaded motor, or a simulated hub at a sixth of real time): 10 s for the move.
    for (let t = 100; t <= 9800; t += 100) {
        encoder.deg = 573 * (t / 10000);
        clock.advance(start + t);
        await flush();
        assert.equal(block.done, false, `the block ended at ${t} ms with the motor at ${encoder.deg.toFixed(0)}° of 573`);
    }
    encoder.deg = 572;
    clock.advance(start + 9900);
    await flush();
    assert.equal(block.done, true, 'the block ends once the encoder is there (within 5°)');
});

test('a blocked motor does not hang the program: no encoder progress for 2 s ends the block', async () => {
    const {encoder} = hub();
    const start = clock.now;
    const block = run({PORT: 'C', DIRECTION: -1, VALUE: 360, UNIT: 'degrees'});
    clock.advance(start + 300);
    encoder.deg = -40; // it moved, then stuck here
    clock.advance(start + 320);
    await flush();
    clock.advance(start + 2200);
    await flush();
    assert.equal(block.done, false, 'still moving 2 s after the last change is not yet stalled');
    clock.advance(start + 2400);
    await flush();
    assert.equal(block.done, true, 'stalled at -40° for 2 s: the block ends');
});

test('rotations are degrees too', async () => {
    const {encoder, sent} = hub();
    const start = clock.now;
    const block = run({PORT: 'C', DIRECTION: 1, VALUE: 2, UNIT: 'rotations'});
    assert.match(sent[0], /run_for_degrees\(720, 30\)/);
    for (let t = 100; t <= 8000; t += 100) {
        encoder.deg = 700 * t / 8000;
        clock.advance(start + t);
    }
    await flush();
    assert.equal(block.done, false, 'at 700° of 720 the block still waits');
    encoder.deg = 718;
    clock.advance(start + 8100);
    await flush();
    assert.equal(block.done, true);
});
