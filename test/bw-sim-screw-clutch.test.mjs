// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Actual screw-coupling source against small interface fakes. These controls
// observe its branch, state and reaction commands; they do not run a Jolt solver.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createScrewDrives} from '../overlay/scratch-gui/src/lib/bw-sim/physics/screw.js';

const DT = 0.005;
const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-12,
    `${message}: ${actual} versus ${expected}`);
const rig = ({velocity = 1, side = 2, ratio = 0.0002, efficiency = 0.4,
    position = 0, rotation = [0, 0, 0, 1]} = {}) => {
    let limitForce = 200; let motorForce = 0;
    const torques = [], bounds = [], speeds = [], settings = {};
    class Vec3 { constructor (x, y, z) { this.values = [x, y, z]; } Set (x, y, z) { this.values = [x, y, z]; } }
    const J = {Vec3, EMotorState_Velocity: 'velocity', EActivation_Activate: 'activate', destroy () {}};
    const h = {unwrapped: 0, velocity, localAxis1: [1, 0, 0], localAxis2: [1, 0, 0]};
    const slider = {GetMotorSettings: () => settings, SetMotorState () {},
        SetLimits: (lo, hi) => bounds.push([lo, hi]), SetTargetVelocity: v => speeds.push(v),
        GetTotalLambdaPositionLimits: () => limitForce * DT, GetTotalLambdaMotor: () => motorForce * DT};
    const s = {slider, constraint: {SetNumVelocityStepsOverride () {}, SetNumPositionStepsOverride () {}}, position};
    const c = {id: 'clutch', hingeJoint: 'hinge', sliderJoint: 'slider', ratio, efficiency, clutchForceN: 60};
    const driver = createScrewDrives({J, couplings: [c], hingeMap: new Map([['hinge', h]]),
        sliderMap: new Map([['slider', s]]), jointMap: new Map([
            ['hinge', {body1: side === 2 ? 'frame' : 'spindle', body2: side === 2 ? 'spindle' : 'frame'}],
            ['slider', {body1: 'frame', body2: 'piston', limits: [-0.008, 0.016]}]]),
        bodyInterface: {GetRotation: () => ({GetX: () => rotation[0], GetY: () => rotation[1],
            GetZ: () => rotation[2], GetW: () => rotation[3]}),
            AddTorque: (id, v) => torques.push({id, value: v.values.slice()})},
        bodyIdOf: id => id, bodyOf: () => null, dt: DT});
    return {h, s, c, driver, bounds, speeds, settings, torques,
        force: (limits, motor = 0) => { limitForce = limits; motorForce = motor; },
        step: () => { torques.length = 0; driver.beforeStep(); },
        torque: id => torques.find(t => t.id === id)?.value || [0, 0, 0]};
};
const repeat = (r, n) => { for (let i = 0; i < n; i++) r.step(); };
const cap = r => r.c.clutchForceN * Math.abs(r.c.ratio) / r.c.efficiency;

test('normal screw load keeps its existing torque, motor limits and equal opposite frame reaction', () => {
    const r = rig(); r.force(20); r.step();
    near(r.torque('spindle')[0], -0.01); near(r.torque('frame')[0], 0.01);
    assert.equal(r.driver.drives[0].slips, 0);
    assert.equal(r.settings.mMinForceLimit, -60); assert.equal(r.settings.mMaxForceLimit, 60);
    near(r.speeds.at(-1), r.c.ratio);
});

test('the existing 50 ms filter admits the transient and caps torque only after slip is recognized', () => {
    const r = rig();
    for (const load of [20, 38, 54.2]) {
        r.step(); near(r.driver.drives[0].load, load);
        assert.equal(r.driver.drives[0].slips, 0); near(r.torque('spindle')[0], -0.1);
    }
    r.step(); near(r.driver.drives[0].load, 68.78);
    assert.equal(r.driver.drives[0].slips, 1); near(r.torque('spindle')[0], -cap(r));
});

test('recognized sustained overload bounds transmitted torque for both shaft signs, spindle sides and ratios', () => {
    for (const velocity of [-1, 1]) for (const side of [1, 2]) for (const ratio of [-0.0002, 0.0002]) {
        const r = rig({velocity, side, ratio, efficiency: 0.2}); repeat(r, 15);
        assert.ok(r.driver.drives[0].slips > 0);
        const direction = -Math.sign(velocity) * (side === 2 ? 1 : -1);
        near(r.torque('spindle')[0], direction * cap(r));
        near(r.torque('frame')[0], -direction * cap(r));
        near(r.speeds.at(-1), ratio * velocity);
    }
});

test('after slip the actual smaller load is preserved and slip stops once the average recovers', () => {
    const r = rig(); repeat(r, 4); const slips = r.driver.drives[0].slips;
    r.force(20); r.step();
    assert.ok(r.driver.drives[0].load > 60); near(r.torque('spindle')[0], -0.01);
    assert.equal(r.driver.drives[0].slips, slips + 1);
    r.step(); assert.ok(r.driver.drives[0].load < 60);
    assert.equal(r.driver.drives[0].slips, slips + 1); near(r.torque('spindle')[0], -0.01);
});

test('the averaged-load threshold remains strict at equality', () => {
    const r = rig(); r.driver.registrant.restore([[0, 0, 0, 60]]);
    r.force(60); r.step(); assert.equal(r.driver.drives[0].load, 60);
    assert.equal(r.driver.drives[0].slips, 0); near(r.torque('spindle')[0], -cap(r));
    r.force(60.001); r.step(); assert.equal(r.driver.drives[0].slips, 1);
    near(r.torque('spindle')[0], -cap(r));
});

test('signed motor and limit impulses cancel before their absolute load is measured', () => {
    const r = rig(); r.force(200, -200); repeat(r, 10);
    near(r.driver.drives[0].load, 0); assert.equal(r.driver.drives[0].slips, 0);
    assert.deepEqual(r.torques, []);
    r.force(200, -150); r.step(); near(r.driver.drives[0].load, 5);
    near(r.torque('spindle')[0], -0.025);
});

test('recognized-slip torque retains the zero-speed and signed half-radian fade boundary', () => {
    for (const velocity of [0, -0.25, 0.25, -0.5, 0.5, -1, 1]) {
        const r = rig({velocity}); repeat(r, 10);
        near(r.torque('spindle')[0], -Math.max(-1, Math.min(1, velocity / 0.5)) * cap(r));
        if (velocity === 0) assert.deepEqual(r.torques, []);
    }
});

test('recognized slip at an end stop keeps the existing target window and reverse speed command', () => {
    const r = rig({position: 0.016}); r.h.unwrapped = 200; repeat(r, 10);
    near(r.bounds.at(-1)[0], 0.016 - 0.000001); near(r.bounds.at(-1)[1], 0.016 + 0.000001);
    near(r.torque('spindle')[0], -cap(r));
    r.h.velocity = -1; r.h.unwrapped -= 1; r.step();
    near(r.torque('spindle')[0], cap(r)); near(r.speeds.at(-1), -r.c.ratio);
    near(r.bounds.at(-1)[0], 0.016 - 0.000001); near(r.bounds.at(-1)[1], 0.016 + 0.000001);
});

test('restoring the existing screw state preserves the next recognized-slip target and torque', () => {
    const a = rig(); repeat(a, 3); const saved = a.driver.registrant.save();
    assert.equal(saved[0].length, 4, 'no additional checkpoint state');
    a.step(); const expected = {state: a.driver.registrant.save(), bounds: a.bounds.at(-1), torque: a.torques};
    const b = rig(); b.driver.registrant.restore(saved); b.step();
    assert.deepEqual({state: b.driver.registrant.save(), bounds: b.bounds.at(-1), torque: b.torques}, expected);
    near(b.torque('spindle')[0], -cap(b));
});

test('the bounded reaction follows the actual frame axis and preserves the opposite torque pair', () => {
    const r = rig({rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2]}); repeat(r, 10);
    const a = r.torque('spindle'), b = r.torque('frame');
    near(a[0], 0); near(a[1], -cap(r)); near(a[2], 0);
    a.forEach((v, i) => near(v + b[i], 0));
});
