// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rubber bands end to end: editor/belt-path.js lays a band round parts and picks its size, the
// model keeps it (`belts`, `0 !BW BELT` in LDraw, undoable), kinds/belt.js makes it a belt drive or
// a spring, and the Jolt core runs it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beltRound, beltPoints, partCircle, BANDS} from '../overlay/scratch-gui/src/lib/bw-sim/editor/belt-path.js';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const HZ = 1000 / STEP_MS;
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const UP = [0, -1, 0, 1, 0, 0, 0, 0, 1];

/** The gear bench (8-24.json) with the 24T's axle in the beam's end hole, 60 LDU out: the gears do not mesh. */
const bench = () => {
    const m = json('test/fixtures/bw-sim/gears/8-24.json');
    m.parts = m.parts.map(p => (p.id === 'a24' ? {...p, position: [60, -10, 0]} : p.id === 'g24' ? {...p, position: [60, -60, 0]} : p));
    return m;
};
const withBand = (model, ids) => {
    const r = beltRound(model, CATALOG, ids);
    assert.ok(!r.error, JSON.stringify(r));
    return {...model, belts: [{id: 'b1', band: r.band, around: r.around}]};
};

test('a band\'s circle: a bush or a gear by its round collider on its hole, a pin by its shaft', () => {
    assert.equal(partCircle(CATALOG.get('3713.dat')).r, 7);
    assert.equal(partCircle(CATALOG.get('3647.dat')).r, 10, 'the 8T: its tooth tips less 2 LDU, its pitch circle');
    assert.equal(partCircle(CATALOG.get('2780.dat')).r, 4);
    assert.equal(partCircle(CATALOG.get('3001.dat')), null, 'a brick has nothing round to hold a band');
});

test('the band round two gears is the one stretched nearest 1.4 times; impossible bands are refused', () => {
    const r = beltRound(bench(), CATALOG, ['g8', 'g24']);
    // An open loop round r 12 and 32 (circle + the band's own radius), 60 apart: ≈ 2·56.6 + π·44 + 2·20·asin(1/3) ≈ 265.
    assert.ok(Math.abs(r.lengthLdu - 265.1) < 2, `length ${r.lengthLdu}`);
    assert.equal(r.band, '85545.dat', 'the 26 mm band (204 LDU at rest) stretched 1.3 times');
    assert.ok(beltPoints({...bench(), belts: []}, CATALOG, {around: ['g8', 'g24']}).length > 20);
    assert.equal(beltRound(bench(), CATALOG, ['g8']).error, 'needTwo');
    assert.equal(beltRound(bench(), CATALOG, ['g8', 'beam']).error, 'notRound', 'a beam has nothing round to hold a band');
    const across = {...bench(), parts: [...bench().parts, {id: 'px', part: '2780.dat', position: [0, -60, 80], rotation: I}]};
    assert.equal(beltRound(across, CATALOG, ['g8', 'px']).error, 'notParallel', 'a pin lying across the axles');
    const far = {...bench(), parts: bench().parts.map(p => (p.id === 'g24' ? {...p, position: [600, -60, 0]} : p))};
    assert.equal(beltRound(far, CATALOG, ['g8', 'g24']).error, 'tooLong');
    const pins = {version: 1, parts: [{id: 'a', part: '2780.dat', position: [0, 0, 0], rotation: UP}, {id: 'b', part: '2780.dat', position: [20, 0, 0], rotation: UP}]};
    assert.equal(beltRound(pins, CATALOG, ['a', 'b']).error, 'tooShort', 'even the 15 mm band hangs loose round two pins one hole apart');
});

test('the model keeps a band: valid, through LDraw and back, gone with its part and back on undo', () => {
    const model = withBand(bench(), ['g8', 'g24']);
    assert.deepEqual(validatePlacedModel(model, CATALOG), []);
    const text = serializeModel(model);
    assert.match(text, /^0 !BW BELT b1 85545\.dat g8 g24\r?$/m);
    const back = parseModel(text);
    assert.deepEqual(back.refusals, []);
    assert.deepEqual(back.model.belts, model.belts);
    const broken = parseModel(text.replace('g8 g24', 'g8 nope'));
    assert.equal(broken.model.belts, undefined);
    assert.equal(broken.refusals[0].code, 'bad-belt');
    const ed = createEditor({model: bench(), catalog: CATALOG});
    ed.apply({type: 'addBelt', around: ['g8', 'g24'], band: '85545.dat'});
    assert.deepEqual(ed.model.belts.map(b => b.around), [['g8', 'g24']]);
    ed.apply({type: 'delete', id: 'g24'});
    assert.equal(ed.model.belts, undefined, 'a band round a deleted part goes too');
    ed.undo();
    assert.equal(ed.model.belts.length, 1, 'and comes back with it');
    ed.apply({type: 'removeBelt', id: ed.model.belts[0].id});
    assert.equal(ed.model.belts, undefined);
    assert.throws(() => ed.apply({type: 'addBelt', around: ['g8'], band: '85545.dat'}));
});

test('a band round two gears on axles in one frame is a belt drive: the 24T turns the motor\'s way at about 1/3', async () => {
    const mech = compile(withBand(bench(), ['g8', 'g24']), CATALOG, {version: 2});
    const belts = mech.couplings.filter(c => c.kind === 'belt');
    assert.equal(belts.length, 1, JSON.stringify(mech.couplings.map(c => c.kind)));
    assert.ok(Math.abs(Math.abs(belts[0].ratio) - 1 / 3) < 1e-9 || Math.abs(Math.abs(belts[0].ratio) - 3) < 1e-9, `ratio ${belts[0].ratio}`);
    const J = await loadJolt();
    const motor = mech.joints.find(j => j.motor);
    mech.bodies.find(b => b.id === motor.body1).motion = 'static';
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    const driven = [belts[0].joint1, belts[0].joint2].find(id => id !== motor.id);
    const [m0, d0] = [motor.id, driven].map(id => core.jointState(id).angle);
    core.setMotor(motor.id, {mode: 'velocity', radPerSec: 300 * Math.PI / 180});
    for (let i = 0; i < 2 * HZ; i++) core.step(1 / HZ);
    const ratio = (core.jointState(driven).angle - d0) / (core.jointState(motor.id).angle - m0);
    core.destroy();
    assert.ok(ratio > 0.3 && ratio < 0.34, `driven/motor ${ratio.toFixed(4)}: the same way, at the pulleys' ratio (a band may slip a little)`);
});

test('a band round an arm\'s pin and a pin on the base is a spring: it swings the arm towards the base pin, and no further than its rest', async () => {
    // A Beam 7 on the floor, a Beam 3 arm on a frictionless pin (3673: a hinge) in its last hole, turned to point
    // along x; friction pins (2780: rigid) standing in the arm's far hole and in the beam's middle hole: the band
    // between them pulls the arm round.
    const model = {version: 1, parts: [
        {id: 'base', part: '32524.dat', position: [0, 0, 0], rotation: I},
        {id: 'p1', part: '3673.dat', position: [0, -10, 60], rotation: UP},
        {id: 'arm', part: '32523.dat', position: [20, -20, 60], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0]},
        {id: 'tip', part: '2780.dat', position: [40, -30, 60], rotation: UP},
        {id: 'post', part: '2780.dat', position: [0, -10, 0], rotation: UP}]};
    const banded = withBand(model, ['tip', 'post']);
    assert.equal(banded.belts[0].band, '85543.dat');
    const mech = compile(banded, CATALOG, {version: 2});
    const springs = mech.couplings.filter(c => c.kind === 'spring');
    assert.equal(springs.length, 1, JSON.stringify(mech.couplings));
    const restLdu = springs[0].restM / 0.0004;
    assert.ok(Math.abs(restLdu - (BANDS[0].restLdu - Math.PI * 8) / 2) < 1e-6, `rest ${restLdu}`);
    const J = await loadJolt();
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    const armBody = mech.bodies.find(b => b.parts.includes('arm')).id;
    const baseBody = mech.bodies.find(b => b.parts.includes('base')).id;
    const tipLocal = springs[0].body1 === armBody ? springs[0].local1 : springs[0].local2;
    const tipWorld = () => {
        const {position, rotation: q} = core.bodyPose(armBody);
        const [x, y, z, w] = q;
        const v = tipLocal;
        const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
        return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])].map((c, i) => c + position[i]);
    };
    const postWorld = (springs[0].body1 === baseBody ? springs[0].local1 : springs[0].local2).map((c, i) => c + core.bodyPose(baseBody).position[i]);
    const gap = () => Math.hypot(tipWorld()[0] - postWorld[0], tipWorld()[2] - postWorld[2]) / 0.0004;
    const before = gap();
    for (let i = 0; i < 1.5 * HZ; i++) core.step(1 / HZ);
    const after = gap();
    core.destroy();
    assert.ok(before > 70 && after < before - 15, `the band pulled the tip from ${before.toFixed(1)} to ${after.toFixed(1)} LDU from the post`);
    assert.ok(after > restLdu - 6, `and not through its slack (rest ${restLdu.toFixed(1)} LDU): ${after.toFixed(1)}`);
});
