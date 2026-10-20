// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Ropes (editor/rope-path.js, kinds/rope.js, physics/rope.js; architecture M10): a winch — a bush
// on an axle turning in a clamped beam is the drum — and a brick hung from it on a rope. No ground,
// so the brick hangs. A motor holding the drum holds the brick; turning it winds the brick up or
// lets it down by r·Δθ; a free drum is turned by the weight (the rope's tension on the drum).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ropeTie, ropePoints} from '../overlay/scratch-gui/src/lib/bw-sim/editor/rope-path.js';
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
const LDU_M = 0.0004;

/** A beam with its holes along x, an 8L axle through its middle hole, a bush on the axle (the drum), a brick below. */
const winch = () => ({version: 1, parts: [
    {id: 'frame', part: '32524.dat', position: [0, 0, 0], rotation: [0, 1, 0, -1, 0, 0, 0, 0, 1]},
    {id: 'axle', part: '3707.dat', position: [60, 0, 0], rotation: I},
    {id: 'drum', part: '3713.dat', position: [50, 0, 0], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0]},
    {id: 'hook', part: '3001.dat', position: [50, 200, 0], rotation: I}]});
const tied = () => {
    const m = winch();
    const r = ropeTie(m, CATALOG, ['drum', 'hook']);
    assert.ok(!r.error, JSON.stringify(r));
    return {...m, ropes: [{id: 'r1', around: r.around, lengthLdu: r.lengthLdu}]};
};

test('a rope tied from a drum to a hook: taut, through LDraw and back, gone with its hook', () => {
    const r = ropeTie(winch(), CATALOG, ['drum', 'hook']);
    const pts = ropePoints(winch(), CATALOG, ['drum', 'hook']);
    assert.deepEqual(pts[0], [50, 0, 0], 'from the drum\'s centre');
    assert.ok(pts[1][1] > 150 && pts[1][1] < 200, `to the brick's top: ${pts[1]}`);
    assert.ok(Math.abs(r.lengthLdu - Math.hypot(...pts[1].map((v, i) => v - pts[0][i]))) < 0.1);
    assert.equal(ropeTie(winch(), CATALOG, ['hook', 'drum']).error, 'drumNotRound', 'a brick is no drum');
    assert.equal(ropeTie(winch(), CATALOG, ['drum']).error, 'needTwo');
    const model = tied();
    assert.deepEqual(validatePlacedModel(model, CATALOG), []);
    // Hung on the rope, the hook is held: not a loose part (it is, without the rope).
    assert.ok(compile(winch(), CATALOG, {version: 2}).diagnostics.some(d => d.code === 'loose-part'));
    assert.ok(!compile(model, CATALOG, {version: 2}).diagnostics.some(d => d.code === 'loose-part'), 'the rope holds the hook');
    const text = serializeModel(model);
    assert.match(text, /^0 !BW ROPE r1 [\d.]+ drum hook\r?$/m);
    assert.deepEqual(parseModel(text).model.ropes, model.ropes);
    const ed = createEditor({model: winch(), catalog: CATALOG});
    ed.apply({type: 'addRope', around: ['drum', 'hook'], lengthLdu: r.lengthLdu});
    ed.apply({type: 'delete', id: 'hook'});
    assert.equal(ed.model.ropes, undefined);
    ed.undo();
    assert.equal(ed.model.ropes.length, 1);
});

/** Runs the winch: the frame clamped, the drum's hinge given `cmd` (or left free); returns the hook's drop and the drum's turn. */
const run = async (cmd, seconds = 1.5) => {
    const mech = compile(tied(), CATALOG, {version: 2, ground: false});
    const rope = mech.couplings.find(c => c.kind === 'rope');
    assert.ok(rope && rope.drumJoint, JSON.stringify(mech.couplings));
    mech.bodies.find(b => b.parts.includes('frame')).motion = 'static';
    const hinge = mech.joints.find(j => j.id === rope.drumJoint);
    if (cmd) {
        const bench = compile(json('test/fixtures/bw-sim/gears/8-24.json'), CATALOG, {version: 2});
        hinge.motor = {...bench.joints.find(j => j.motor).motor};
        mech.actuators = [{...bench.actuators[0], joint: hinge.id}];
    }
    const J = await loadJolt();
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    const hook = mech.bodies.find(b => b.parts.includes('hook')).id;
    for (let i = 0; i < 0.3 * HZ; i++) core.step(1 / HZ); // the rope takes the weight
    const y0 = core.bodyPose(hook).position[1];
    const a0 = core.jointState(hinge.id).angle;
    if (cmd) core.setMotor(hinge.id, cmd);
    for (let i = 0; i < seconds * HZ; i++) core.step(1 / HZ);
    const out = {rise: core.bodyPose(hook).position[1] - y0, wound: rope.drumSign * (core.jointState(hinge.id).angle - a0), r: rope.radiusM,
        state: core.ropeState()[0]};
    core.destroy();
    return out;
};

test('a motor holding the drum holds the hook; turning it winds the hook up or lets it down by r·Δθ', async t => {
    const held = await run({mode: 'velocity', radPerSec: 0});
    assert.ok(Math.abs(held.rise) < 0.001, `held: moved ${(held.rise * 1000).toFixed(2)} mm`);
    t.diagnostic(`held: ${(held.rise * 1000).toFixed(3)} mm, tension ${held.state.tension.toFixed(3)} N`);
    assert.ok(held.state.tension > 0.01, `the rope carries the brick: ${held.state.tension.toFixed(3)} N`);
    for (const radPerSec of [6, -6]) {
        const r = await run({mode: 'velocity', radPerSec});
        t.diagnostic(`${radPerSec} rad/s: wound ${r.wound.toFixed(2)} rad, rose ${(r.rise * 1000).toFixed(2)} mm vs r·θ ${(r.r * r.wound * 1000).toFixed(2)} mm`);
        assert.ok(Math.abs(r.wound) > 5, `the drum turned ${r.wound.toFixed(2)} rad`);
        assert.ok(Math.abs(r.rise - r.r * r.wound) < Math.max(0.002, Math.abs(r.r * r.wound) * 0.1),
            `${radPerSec > 0 ? '+' : '−'}: the hook rose ${(r.rise * 1000).toFixed(1)} mm for ${(r.r * r.wound * 1000).toFixed(1)} mm of rope wound`);
    }
});

test('a free drum: the hanging weight turns it and the hook sinks by the rope it pays out', async t => {
    const r = await run(null, 0.8);
    t.diagnostic(`free: sank ${(r.rise * 1000).toFixed(2)} mm, r·θ ${(r.r * r.wound * 1000).toFixed(2)} mm`);
    assert.ok(r.rise < -0.003, `the hook sank ${(r.rise * 1000).toFixed(1)} mm`);
    assert.ok(Math.abs(r.rise - r.r * r.wound) < Math.max(0.002, Math.abs(r.rise) * 0.15), `by the rope paid out: ${(r.r * r.wound * 1000).toFixed(1)} mm`);
});
