// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The gear-mechanics examples run for real (gearbox lane): their DEVICE SPIKE programs through
 * the Scratch VM, the spikeprime extension and the virtual hub (test/helpers/sim-lab-vm.mjs), on
 * the shipped models.
 *
 *   Two-speed gearbox (static/sim-lab/models/gearbox.ldr, programs/gearbox.bw): motor A drives,
 *   motor B shifts. In gear 1 the output turns at the 8T:24T ratio of the motor, in gear 2 at
 *   16T:16T — the tooth counts read from the catalogue — and the program's shift changes it.
 *   Differential (differential.ldr, differential.bw): motor C holds the right side, and the left
 *   wheel turns twice as fast as the casing; then C turns the right side with the casing and the
 *   left one follows at the casing's speed (Willis: left + right = 2 × casing).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {REPO} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS, MODELS_BASE, PROGRAMS_BASE} = await import(path.join(SIM, 'sim-session.js'));
const {runOnSimLab, CATALOG} = await import('./helpers/sim-lab-vm.mjs');

const REL_TOL = 0.03;
const relErr = (a, e) => Math.abs(a - e) / Math.abs(e);
const shipped = file => {
    const entry = MODELS.find(m => m.file === file);
    return {entry, modelText: readFileSync(path.join(GUI, MODELS_BASE, file), 'utf8'), program: readFileSync(path.join(GUI, PROGRAMS_BASE, entry.example), 'utf8')};
};
const partTeeth = (modelText, id) => {
    const m = new RegExp(`0 !BW ID ${id}\\r?\\n(?:0 [^\\n]*\\n)*1 \\S+(?: \\S+){12} (\\S+)`).exec(modelText);
    return CATALOG.get(m[1]).gear.teeth;
};
/** Mean rate (rad/s) of a joint over the track frames in [t0, t1] (ms), from its angle. */
const rate = (track, jointId, t0, t1) => {
    const a = track.find(f => f.t >= t0);
    const b = [...track].reverse().find(f => f.t <= t1);
    return (b.joints[jointId].angle - a.joints[jointId].angle) / ((b.t - a.t) / 1000);
};
const bodyOf = (m, partId) => m.bodies.find(b => b.parts.includes(partId)).id;

test('the gearbox and the differential are shipped with their programs, titled in English and German', () => {
    for (const [file, de] of [['gearbox.ldr', 'Zweigang-Schaltgetriebe'], ['differential.ldr', 'Differenzialgetriebe']]) {
        const {entry, program} = shipped(file);
        assert.equal(entry.title.de, de);
        assert.match(program, /^DEVICE SPIKE\s*$/m);
    }
});

test('two-speed gearbox: the program shifts, and each gear turns the output at its tooth ratio', async t => {
    const {modelText, program} = shipped('gearbox.ldr');
    const {track, issues, mechanism: m} = await runOnSimLab(program, {modelText, timeLimitMs: 12000});
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    const motor = m.joints.find(j => j.motor && j.motor.port === 'A');
    const out = m.joints.find(j => j.type === 'hinge' && j.body1 === motor.body1 && j.body2 === bodyOf(m, 'outputAxle'));
    // The program: gear 1 from ~0.5 s to 4.5 s, gear 2 from ~5 s to 8.5 s, neutral after.
    const gear = (t0, t1) => rate(track, out.id, t0, t1) / rate(track, motor.id, t0, t1);
    const g1 = gear(1500, 4000);
    const g2 = gear(5500, 8000);
    const want1 = -partTeeth(modelText, 'input8') / partTeeth(modelText, 'clutch24');
    const want2 = -partTeeth(modelText, 'input16') / partTeeth(modelText, 'clutch16');
    t.diagnostic(`gear 1: output/motor ${g1.toFixed(4)} (teeth ${want1.toFixed(4)}); gear 2: ${g2.toFixed(4)} (teeth ${want2.toFixed(4)})`);
    assert.ok(rate(track, motor.id, 1500, 4000) > 5, 'motor A drives');
    assert.ok(relErr(g1, want1) <= REL_TOL, `gear 1 ${g1} vs ${want1}`);
    assert.ok(relErr(g2, want2) <= REL_TOL, `gear 2 ${g2} vs ${want2}`);
});

test('differential: the held side stops, the other turns twice the casing; driven alike, both turn with it', async t => {
    const {modelText, program} = shipped('differential.ldr');
    const {track, issues, mechanism: m} = await runOnSimLab(program, {modelText, timeLimitMs: 8500});
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    const frame = m.joints.find(j => j.motor && j.motor.port === 'A').body1;
    const hinge = (a, b) => m.joints.find(j => j.type === 'hinge' && j.body1 === a && j.body2 === b);
    const L = hinge(frame, bodyOf(m, 'leftAxle'));
    const R = hinge(frame, bodyOf(m, 'rightAxle'));
    const inCasing = hinge(bodyOf(m, 'casing'), bodyOf(m, 'leftAxle'));
    const phase = (t0, t1) => {
        const l = rate(track, L.id, t0, t1);
        return {l, r: rate(track, R.id, t0, t1), c: l - rate(track, inCasing.id, t0, t1)};
    };
    const held = phase(1500, 4000);
    const along = phase(5500, 8000);
    t.diagnostic(`right held: left/casing ${(held.l / held.c).toFixed(4)}, right ${held.r.toFixed(4)} rad/s; driven: left/casing ${(along.l / along.c).toFixed(4)}, right/casing ${(along.r / along.c).toFixed(4)}`);
    assert.ok(Math.abs(held.c) > 2, 'the casing turns');
    assert.ok(Math.abs(held.r) < 0.02 * Math.abs(held.c), 'motor C holds the right side');
    assert.ok(relErr(held.l, 2 * held.c) <= REL_TOL, `left = 2 × casing (${held.l / held.c})`);
    assert.ok(relErr(along.l + along.r, 2 * along.c) <= REL_TOL, 'left + right = 2 × casing');
});

test('chain drive: the 24T sprocket turns the motor\'s way at 16:24, forward and back', async t => {
    const {modelText, program} = shipped('chain-drive.ldr');
    const {track, issues, mechanism: m} = await runOnSimLab(program, {modelText, timeLimitMs: 8000});
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    assert.equal(m.couplings.filter(c => c.kind === 'chain').length, 1, 'one chain');
    const motor = m.joints.find(j => j.motor && j.motor.port === 'A');
    const driven = m.joints.find(j => j.type === 'hinge' && (j.body2 === bodyOf(m, 'drivenAxle') || j.body1 === bodyOf(m, 'drivenAxle')));
    const expected = partTeeth(modelText, 'sprocketSmall') / partTeeth(modelText, 'sprocketBig');
    for (const [t0, t1, way] of [[1000, 3800, 'forward'], [4800, 6800, 'back']]) {
        const ratio = rate(track, driven.id, t0, t1) / rate(track, motor.id, t0, t1);
        t.diagnostic(`${way}: driven/motor ${ratio.toFixed(4)} (want +${expected.toFixed(4)})`);
        assert.ok(Math.abs(rate(track, motor.id, t0, t1)) > 2, `${way}: the motor turns`);
        assert.ok(relErr(ratio, expected) <= REL_TOL, `${way}: ${ratio} = +${expected}, the same way round`);
    }
});

test('drawing robot: its castor ball is a pen, and the program drives it round a 20 cm square', async t => {
    const {modelText, program} = shipped('drawing-robot.ldr');
    assert.match(modelText, /0 !BW ID ball\r?\n0 !BW PEN\r?\n/, 'the castor ball draws');
    const {track, issues, mechanism: m} = await runOnSimLab(program, {modelText, timeLimitMs: 25000});
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    // The square is the robot's: the hub, between the wheels, drives its sides; the ball behind them
    // swings round each corner on the turn (its line is the square with loops at the corners).
    const at = id => track.filter(f => f.bodies[id]).map(f => [f.bodies[id].position[0] * 100, f.bodies[id].position[2] * 100]);
    const spanOf = path => [0, 1].map(k => Math.max(...path.map(p => p[k])) - Math.min(...path.map(p => p[k])));
    const centre = at(bodyOf(m, 'hub'));
    const ball = at(bodyOf(m, 'ball'));
    const span = spanOf(centre);
    const gap = Math.hypot(centre.at(-1)[0] - centre[0][0], centre.at(-1)[1] - centre[0][1]);
    t.diagnostic(`the robot's square spans ${span.map(v => v.toFixed(1)).join(' × ')} cm and ends ${gap.toFixed(1)} cm from its start; the ball's line ${spanOf(ball).map(v => v.toFixed(1)).join(' × ')} cm`);
    for (const v of span) assert.ok(v > 17 && v < 26, `a square about 20 cm across: ${span}`);
    assert.ok(gap < 10, `it comes round near where it started (the turns stop a little late): ${gap.toFixed(1)} cm`);
    assert.ok(spanOf(ball).every((v, k) => v > span[k]), 'the ball\'s line swings wider at the corners');
});
