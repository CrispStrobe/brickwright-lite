// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Pneumatics v1 (kinds/pneumatic.js, docs/ROBOT-LAB-UX.md §16): a valve (19474-f1) with an axle in
// its lever hole, and a 1 x 11 cylinder (body u9145c01, rod 21828c01) beside it, the valve's outlets
// hosed to the cylinder's ports. Turning the lever one way sends the rod out, the other way in;
// in between the valve is shut and the rod holds.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const HZ = 1000 / STEP_MS;
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const LDU_M = 0.0004;

const rig = () => ({version: 1, parts: [
    {id: 'valve', part: '19474-f1.dat', position: [0, 0, 0], rotation: I},
    {id: 'lever', part: '4519.dat', position: [0, 0, 0], rotation: I},
    {id: 'body', part: 'u9145c01.dat', position: [100, 0, 0], rotation: I},
    {id: 'rod', part: '21828c01.dat', position: [100, -200, 0], rotation: I}],
hoses: [{id: 'h1', a: {part: 'valve', port: 'a'}, b: {part: 'body', port: 'a'}},
    {id: 'h2', a: {part: 'valve', port: 'b'}, b: {part: 'body', port: 'b'}}]});

test('hoses in the model: valid, through LDraw and back, gone with a part, back on undo', () => {
    const model = rig();
    assert.deepEqual(validatePlacedModel(model, CATALOG), []);
    const text = serializeModel(model);
    assert.match(text, /^0 !BW HOSE h1 valve a body a\r?$/m);
    assert.deepEqual(parseModel(text).model.hoses, model.hoses);
    const ed = createEditor({model: {...model, hoses: undefined}, catalog: CATALOG});
    ed.apply({type: 'addHose', a: {part: 'valve', port: 'a'}, b: {part: 'body', port: 'a'}});
    ed.apply({type: 'delete', id: 'body'});
    assert.equal(ed.model.hoses, undefined);
    ed.undo();
    assert.equal(ed.model.hoses.length, 1);
});

test('the cylinder slides over its 120 LDU stroke, fed through the hoses by the valve on its lever axle', () => {
    const mech = compile(rig(), CATALOG, {version: 2});
    const p = mech.couplings.filter(c => c.kind === 'pneumatic');
    assert.equal(p.length, 1, JSON.stringify(mech.couplings));
    const slider = mech.joints.find(j => j.id === p[0].sliderJoint);
    assert.ok(Math.abs((slider.limits[1] - slider.limits[0]) / LDU_M - 120) < 1e-6, `the stroke: ${slider.limits.map(x => x / LDU_M)}`);
    assert.deepEqual([p[0].extendFrom, p[0].retractFrom], ['outA', 'outB']);
    assert.ok(Math.abs(p[0].forceN - 150e3 * Math.PI * 0.005 ** 2) < 1e-9, `p·A: ${p[0].forceN} N`);
    const unhosed = compile({...rig(), hoses: undefined}, CATALOG, {version: 2});
    assert.equal(unhosed.couplings.filter(c => c.kind === 'pneumatic').length, 0, 'no hose, no air');
});

test('the lever one way sends the rod out, the other way in; shut, it holds', async t => {
    const J = await loadJolt();
    const mech = compile(rig(), CATALOG, {version: 2});
    const c = mech.couplings.find(k => k.kind === 'pneumatic');
    for (const id of ['valve', 'body']) mech.bodies.find(b => b.parts.includes(id)).motion = 'static';
    mech.gravity = [0, 0, 0];
    // A motor turns the lever's axle (the medium motor's drive, borrowed from the gear bench).
    const bench = compile(json('test/fixtures/bw-sim/gears/8-24.json'), CATALOG, {version: 2});
    const hinge = mech.joints.find(j => j.id === c.valveJoint);
    hinge.motor = {...bench.joints.find(j => j.motor).motor};
    mech.actuators = [{...bench.actuators[0], joint: hinge.id}];
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    const rod = mech.bodies.find(b => b.parts.includes('rod')).id;
    const y = () => core.bodyPose(rod).position[1];
    const run = s => { for (let i = 0; i < s * HZ; i++) core.step(1 / HZ); };
    const turn = rad => { core.setMotor(hinge.id, {mode: 'velocity', radPerSec: Math.sign(rad) * 2}); run(Math.abs(rad) / 2); core.setMotor(hinge.id, {mode: 'velocity', radPerSec: 0}); };
    const y0 = y();
    run(0.5);
    assert.ok(Math.abs(y() - y0) < 0.0005, `shut, the rod holds: ${((y() - y0) * 1000).toFixed(2)} mm`);
    // The rod starts fully in. One way, the other way, back the first way, then neutral (shut).
    const phases = [];
    for (const rad of [0.6, -1.2, 1.2]) {
        const from = y();
        turn(rad);
        run(2);
        phases.push({state: core.pneumaticState()[0].state, moved: y() - from});
    }
    turn(-0.6);
    const y3 = y();
    run(1);
    const heldMoved = y() - y3;
    t.diagnostic(`phases ${phases.map(p => `${p.state} ${(p.moved * 1000).toFixed(1)} mm`).join(', ')}; shut again: moved ${(heldMoved * 1000).toFixed(2)} mm`);
    core.destroy();
    const states = phases.map(p => p.state);
    assert.ok(states[0] !== states[1] && states[2] === states[0], `the lever's two ways: ${states}`);
    // The rod's whole stroke is 120 LDU = 48 mm: out from fully in, then back in to where it started.
    const out = phases.find(p => p.state === 'out' && Math.abs(p.moved) > 0.01);
    const back = phases[phases.indexOf(out) + 1];
    assert.ok(out && Math.abs(Math.abs(out.moved) - 0.048) < 0.002, `out by the stroke: ${JSON.stringify(phases)}`);
    assert.ok(back && back.state === 'in' && Math.abs(back.moved + out.moved) < 0.002, `and back in: ${JSON.stringify(phases)}`);
    assert.ok(Math.abs(heldMoved) < 0.0005, 'shut again, it holds');
});

test('the hose tool picks a valve outlet and a cylinder port, the nearest free ones, and draws a sagging path', async () => {
    const {hoseTie, hosePoints} = await import('../overlay/scratch-gui/src/lib/bw-sim/editor/hose-path.js');
    const model = {...rig(), hoses: undefined};
    assert.deepEqual(hoseTie(model, CATALOG, ['valve']), {error: 'needTwo'});
    assert.deepEqual(hoseTie(model, CATALOG, ['valve', 'lever']), {error: 'noPorts'});
    const first = hoseTie(model, CATALOG, ['valve', 'body']);
    assert.equal(first.a.part, 'valve');
    assert.ok(['a', 'b'].includes(first.a.port), `a valve outlet, not the supply: ${first.a.port}`);
    const withOne = {...model, hoses: [{id: 'h1', ...first}]};
    const second = hoseTie(withOne, CATALOG, ['valve', 'body']);
    assert.notEqual(second.a.port, first.a.port);
    assert.notEqual(second.b.port, first.b.port);
    const pts = hosePoints(withOne, CATALOG, withOne.hoses[0]);
    assert.equal(pts.length, 5);
    assert.ok(pts[2][1] > Math.min(pts[1][1], pts[3][1]), 'it sags (+y is down)');
});

// v2: the valve's supply hosed to an air tank (through a T-piece), and a pump.
const P_ATM = 101.325;
const tankRig = () => {
    const m = rig();
    m.parts.push({id: 'tank', part: '75974.dat', position: [0, 200, -150], rotation: I},
        {id: 'tee', part: '4697b.dat', position: [0, 100, -60], rotation: I});
    m.hoses.push({id: 'h3', a: {part: 'valve', port: 'p'}, b: {part: 'tee', port: 'a'}},
        {id: 'h4', a: {part: 'tee', port: 'b'}, b: {part: 'tank', port: 'l'}});
    return m;
};

test('air networks: the valve\'s supply, a T-piece and a tank are one network, pumped up; a T-piece rides on its hose', () => {
    const mech = compile(tankRig(), CATALOG, {version: 2});
    const c = mech.couplings.find(k => k.kind === 'pneumatic');
    assert.ok(c.network, 'the supply is a network, not ideal');
    assert.ok(Math.abs(c.network.volumeM3 - 38e-6) < 1e-12, `the tank's 37 cm³ and 1 cm³ of hose: ${c.network.volumeM3}`);
    assert.equal(c.network.startKpa, 150);
    const bodyOf = id => mech.bodies.find(b => b.parts.includes(id)).id;
    assert.equal(bodyOf('tee'), bodyOf('valve'), 'the T-piece is welded to the valve its first hose goes to');
    assert.notEqual(bodyOf('tank'), bodyOf('valve'), 'and nothing else');
    assert.equal(compile(rig(), CATALOG, {version: 2}).couplings.find(k => k.kind === 'pneumatic').network, null, 'no supply hose: ideal');
});

/** A core on the tank rig: the valve, the cylinder's body and the tank held still, no gravity, motor on the valve's axle. */
const tankCore = async (model = tankRig()) => {
    const J = await loadJolt();
    const mech = compile(model, CATALOG, {version: 2});
    const c = mech.couplings.find(k => k.kind === 'pneumatic');
    for (const id of ['valve', 'body', 'tank']) mech.bodies.find(b => b.parts.includes(id)).motion = 'static';
    mech.gravity = [0, 0, 0];
    const bench = compile(json('test/fixtures/bw-sim/gears/8-24.json'), CATALOG, {version: 2});
    const hinge = mech.joints.find(j => j.id === c.valveJoint);
    hinge.motor = {...bench.joints.find(j => j.motor).motor};
    mech.actuators = [{...bench.actuators[0], joint: hinge.id}];
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    const rod = mech.bodies.find(b => b.parts.includes('rod')).id;
    const run = s => { for (let i = 0; i < s * HZ; i++) core.step(1 / HZ); };
    const turn = rad => { core.setMotor(hinge.id, {mode: 'velocity', radPerSec: Math.sign(rad) * 2}); run(Math.abs(rad) / 2); core.setMotor(hinge.id, {mode: 'velocity', radPerSec: 0}); };
    return {core, c, run, turn, y: () => core.bodyPose(rod).position[1]};
};

test('a tank empties stroke by stroke: each stroke takes (p + p_atm)·A·L of air, until the rod stops', async t => {
    const {core, c, run, turn, y} = await tankCore();
    const kpa = () => core.airState()[0].kPa;
    const strokes = [];
    // The lever towards 'out' (-0.6 rad from neutral, as the v1 test found), then towards 'in', six times.
    for (let i = 0; i < 6; i++) {
        for (const way of ['out', 'in']) {
            const [p0, y0] = [kpa(), y()];
            turn(way === 'in' ? 1.2 : i === 0 ? -0.6 : -1.2);
            run(2);
            strokes.push({way, p0, p1: kpa(), mm: Math.abs(y() - y0) * 1000});
        }
    }
    core.destroy();
    t.diagnostic(strokes.map(s => `${s.way} ${s.mm.toFixed(1)} mm ${s.p0.toFixed(1)}→${s.p1.toFixed(1)} kPa`).join('; '));
    // A full stroke takes the chamber's volume at the network's pressure: n·exp(−A·L/V).
    const want = (P_ATM + strokes[0].p0) * Math.exp(-c.areaM2 * 0.048 / c.network.volumeM3) - P_ATM;
    assert.ok(Math.abs(strokes[0].mm - 48) < 1, `the first stroke is full: ${strokes[0].mm}`);
    assert.ok(Math.abs(strokes[0].p1 - want) < 2, `after it ${strokes[0].p1.toFixed(1)} kPa, want ${want.toFixed(1)}`);
    for (let i = 1; i < strokes.length; i++) assert.ok(strokes[i].p1 <= strokes[i - 1].p1 + 1e-6, 'the pressure only falls');
    assert.ok(strokes.at(-1).p1 < 1, `the tank ends empty: ${strokes.at(-1).p1}`);
    assert.ok(strokes.at(-1).mm < 1 && strokes.at(-2).mm < 1, 'and the rod stops moving');
});

test('a pump pushed in puts the air it sweeps into its tank (p_atm·A·stroke)', async t => {
    const J = await loadJolt();
    const model = {version: 1, parts: [
        {id: 'pump', part: '2943bc01.dat', position: [0, 0, 0], rotation: I},
        {id: 'piston', part: '2944c02.dat', position: [0, -140, 0], rotation: I},
        {id: 'tank', part: '75974.dat', position: [0, 200, -150], rotation: I}],
    hoses: [{id: 'h1', a: {part: 'pump', port: 'o'}, b: {part: 'tank', port: 'l'}}]};
    const mech = compile(model, CATALOG, {version: 2});
    const pc = mech.couplings.find(k => k.kind === 'pump');
    assert.ok(pc, JSON.stringify(mech.couplings));
    for (const id of ['pump', 'tank']) mech.bodies.find(b => b.parts.includes(id)).motion = 'static';
    // A heavy hand on the piston: gravity pushes it in (LDraw −y, the piston above its body, is up).
    mech.bodies.find(b => b.parts.includes('piston')).massKg = 2;
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    const piston = mech.bodies.find(b => b.parts.includes('piston')).id;
    const p0 = core.airState()[0].kPa;
    const y0 = core.bodyPose(piston).position[1];
    for (let i = 0; i < 1.5 * HZ; i++) core.step(1 / HZ);
    const p1 = core.airState()[0].kPa;
    const dy = (core.bodyPose(piston).position[1] - y0) * 1000;
    core.destroy();
    const want = P_ATM * pc.areaM2 * 0.016 / pc.network.volumeM3;
    t.diagnostic(`the piston went in ${(-dy).toFixed(1)} mm; the tank ${p0.toFixed(1)} → ${p1.toFixed(1)} kPa (+${(p1 - p0).toFixed(2)}, want +${want.toFixed(2)})`);
    assert.ok(Math.abs(-dy - 16) < 0.5, `the piston goes all the way in: ${-dy} mm`);
    assert.ok(Math.abs(p1 - p0 - want) < 0.2, `the tank gains a stroke of air: +${p1 - p0}`);
});
