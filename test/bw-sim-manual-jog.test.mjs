// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Command validation only. The browser gate measures real motor motion and Stop.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {mixerJogTarget, setMixerMotorJog, setMixerMotorPower, manualDriveAllowed} from '../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-motor-control.js';

const LIMITS = Object.freeze({minDeg: -2, maxDeg: 2, stepDeg: 0.5, speedDps: 5});
const fakeApi = ({angle = 0, direct = true, encoderOk = true, result = {ok: true, done: Promise.resolve('completed')}} = {}) => {
    const calls = [];
    const api = {
        motors: () => [{id: 'a0', port: 'A', direct}],
        encoder: id => { calls.push(['encoder', id]); return {ok: encoderOk, angleDeg: angle}; },
        setMotor: (id, command) => { calls.push(['setMotor', id, command]); return result; },
        stopMotor: (id, action) => { calls.push(['stopMotor', id, action]); return {ok: true}; }
    };
    return {api, calls};
};

test('all three Resonance choices have the same finite port A policy; unrestricted choices keep their controls', () => {
    const bounded = MODELS.filter(model => model.file === 'resonance-lab.ldr');
    assert.deepEqual(bounded.map(model => model.id || model.file), ['resonance-lab.ldr', 'resonance-lab-slow', 'resonance-lab-fast']);
    assert.equal(MODELS.filter(model => model.manualJog === undefined).length, 84);
    for (const model of bounded) assert.deepEqual(model.manualJog, {A: LIMITS});
});

test('continuous drive is excluded when either current movement-pair port has manual jog limits', () => {
    for (const port of ['A', 'B']) assert.equal(manualDriveAllowed({[port]: LIMITS}), false);
    for (const port of ['C', 'D']) assert.equal(manualDriveAllowed({[port]: LIMITS}, ['C', 'D']), false);
    assert.equal(manualDriveAllowed({A: LIMITS}, ['C', 'D']), true);
    assert.equal(manualDriveAllowed({C: LIMITS}), true);
    assert.equal(manualDriveAllowed({A: null}), false, 'invalid configured limits must not expose continuous drive');
    for (const model of MODELS.filter(model => model.manualJog === undefined)) {
        assert.equal(manualDriveAllowed(model.manualJog), true, model.file);
    }
});

test('jog targets use half-degree steps and shorten only the final step to a finite endpoint', () => {
    assert.deepEqual(mixerJogTarget(LIMITS, 0, 1), {ok: true, targetDeg: 0.5, degrees: 0.5, speedDps: 5});
    assert.deepEqual(mixerJogTarget(LIMITS, 0, -1), {ok: true, targetDeg: -0.5, degrees: -0.5, speedDps: 5});
    for (const angle of [-2, -1.95, -1.5, -0.01, 0, 0.01, 1.5, 1.95, 2]) for (const direction of [-1, 1]) {
        const target = mixerJogTarget(LIMITS, angle, direction);
        if (!target.ok) {
            assert.equal(target.code, 'limit');
            assert.ok((angle === -2 && direction === -1) || (angle === 2 && direction === 1));
            continue;
        }
        assert.ok(target.targetDeg >= -2 && target.targetDeg <= 2);
        assert.ok(Math.abs(target.degrees) <= 0.5);
        assert.equal(Math.sign(target.degrees), direction);
        assert.equal(target.targetDeg, angle + target.degrees);
    }
    assert.equal(mixerJogTarget(LIMITS, 1.95, 1).targetDeg, 2);
    assert.equal(mixerJogTarget(LIMITS, -1.95, -1).targetDeg, -2);
});

test('out-of-range and missing encoder readings are refused, including an inward request', () => {
    for (const angle of [-2.000000001, 2.000000001, -20, 20]) for (const direction of [-1, 1]) {
        assert.deepEqual(mixerJogTarget(LIMITS, angle, direction), {ok: false, code: 'out-of-bounds'});
    }
    for (const angle of [NaN, Infinity, -Infinity, null, undefined, '0', {}, []]) {
        assert.deepEqual(mixerJogTarget(LIMITS, angle, 1), {ok: false, code: 'no-encoder'});
    }
    for (const direction of [0, 2, -2, NaN, Infinity, '1', null, undefined]) {
        assert.deepEqual(mixerJogTarget(LIMITS, 0, direction), {ok: false, code: 'invalid-direction'});
    }
});

test('missing, nonnumeric, inverted, zero-step and unbounded-speed configurations cannot issue a jog', () => {
    const invalid = [null, undefined, {}, {...LIMITS, minDeg: 2}, {...LIMITS, maxDeg: -3},
        {...LIMITS, stepDeg: 0}, {...LIMITS, stepDeg: -0.5}, {...LIMITS, stepDeg: 5},
        {...LIMITS, speedDps: 0}, {...LIMITS, speedDps: -5}];
    for (const key of Object.keys(LIMITS)) for (const value of [NaN, Infinity, -Infinity, '2', null, undefined]) {
        invalid.push({...LIMITS, [key]: value});
    }
    for (const limits of invalid) assert.deepEqual(mixerJogTarget(limits, 0, 1), {ok: false, code: 'invalid-config'});
});

test('disabled override, an outstanding jog, unknown motors and nondirect hubs send no motor command', () => {
    for (const options of [{}, {enabled: false}, {enabled: true, busy: true}]) {
        const {api, calls} = fakeApi();
        assert.equal(setMixerMotorJog(api, 'a0', LIMITS, 1, options).ok, false);
        assert.deepEqual(calls, []);
    }
    for (const [id, direct] of [['missing', true], ['a0', false]]) {
        const {api, calls} = fakeApi({direct});
        assert.deepEqual(setMixerMotorJog(api, id, LIMITS, 1, {enabled: true}), {ok: false, code: 'no-direct-motor'});
        assert.deepEqual(calls, []);
    }
});

test('dispatch reads the encoder again and sends exactly one finite relative command with hold', async () => {
    for (const direction of [-1, 1]) {
        const done = Promise.resolve('completed');
        const {api, calls} = fakeApi({angle: direction * 1.75, result: {ok: true, done}});
        const result = setMixerMotorJog(api, 'a0', LIMITS, direction, {enabled: true});
        assert.equal(result.ok, true);
        assert.equal(result.targetDeg, direction * 2);
        assert.equal(result.done, done);
        assert.equal(await result.done, 'completed');
        assert.deepEqual(calls, [
            ['encoder', 'a0'],
            ['setMotor', 'a0', {degrees: direction * 0.25, speedDps: 5, then: 'hold'}]
        ]);
    }
});

test('stale, missing or boundary readings refuse dispatch; API refusal is preserved', () => {
    for (const config of [{angle: 6.5464225}, {angle: 2}, {angle: NaN}, {encoderOk: false}]) {
        const {api, calls} = fakeApi(config);
        assert.equal(setMixerMotorJog(api, 'a0', LIMITS, 1, {enabled: true}).ok, false);
        assert.deepEqual(calls, [['encoder', 'a0']]);
    }
    const refusal = {ok: false, code: 'refused', message: 'test refusal'};
    const {api} = fakeApi({result: refusal});
    assert.equal(setMixerMotorJog(api, 'a0', LIMITS, 1, {enabled: true}), refusal);
});

test('Stop remains real hold and the existing slider and encoderless brake routes remain unchanged', () => {
    const {api, calls} = fakeApi();
    assert.equal(setMixerMotorPower(api, 'a0', 0).ok, true);
    assert.equal(setMixerMotorPower(api, 'a0', 35).ok, true);
    assert.deepEqual(calls, [['stopMotor', 'a0', 'hold'], ['setMotor', 'a0', {power: 35}]]);
    const fallback = [];
    assert.equal(setMixerMotorPower({stopMotor: (id, action) => {
        fallback.push([id, action]);
        return action === 'hold' ? {ok: false, code: 'refused'} : {ok: true};
    }}, 'B', 0).ok, true);
    assert.deepEqual(fallback, [['B', 'hold'], ['B', 'brake']]);
});
