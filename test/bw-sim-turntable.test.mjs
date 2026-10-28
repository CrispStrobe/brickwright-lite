// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Technic turntables (kinds/turntable.js): the two halves turn on each other, and the toothed top
 * half is a spur gear for the ordinary gear rules.
 *
 *   - Each pair (60T 18938/18939, 28T 99010/99009), placed on one origin as LDraw draws it
 *     assembled, compiles to ONE hinge on the turntable's axis, and nothing else; moved off the
 *     axis it does not seat. (test/fixtures/bw-sim/turntable-60.ldr is in the shipped-model mesh
 *     check, test/bw-sim-models-solid.test.mjs: the halves' meshes do not interpenetrate; the 28T
 *     pair is checked there in the Excavator.)
 *   - The ratio, measured in the core: the Excavator with its base clamped to the bench (so the
 *     frame the pinion and the turntable turn in does not move — the case Jolt's gear constraint
 *     is exact for), its slew motor (C) turning: the turntable turns −θ·z_pinion/z_turntable, the
 *     tooth counts read from the parts' metadata (the turntable's counted on its mesh by
 *     test/bw-sim-part-meta.test.mjs).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(GUI, 'src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const STEP_HZ = 200;

for (const [top, bottom, teeth] of [['18938.dat', '18939.dat', 60], ['99010.dat', '99009.dat', 28]]) {
    test(`the ${teeth}-tooth turntable's halves on one origin are one hinge on its axis`, () => {
        assert.equal(CATALOG.get(top).gear.teeth, teeth);
        const pair = (dx = 0) => ({version: 1, parts: [
            {id: 'bottom', part: bottom, position: [0, 0, 0], rotation: I},
            {id: 'top', part: top, position: [dx, 0, 0], rotation: I}
        ]});
        const m = compile(pair(), CATALOG, {ground: false, version: 2});
        assert.equal(m.bodies.length, 2);
        assert.deepEqual(m.joints.map(j => j.type), ['hinge']);
        const [j] = m.joints;
        assert.ok(Math.abs(Math.abs(j.axis[1]) - 1) < 1e-9, `vertical axis ${j.axis}`);
        assert.ok(Math.hypot(j.point[0], j.point[2]) < 1e-9, 'on the turntable\'s axis');
        assert.deepEqual(m.noCollide, [[m.bodies[0].id, m.bodies[1].id].sort()]);
        // A millimetre off the axis: the ring is not in its race.
        assert.equal(compile(pair(2.5), CATALOG, {ground: false, version: 2}).joints.length, 0);
    });
}

test('slewing: the turntable turns the pinion\'s angle times z_pinion / z_turntable, the other way', async () => {
    const text = readFileSync(path.join(GUI, 'static/sim-lab/models/excavator.ldr'), 'utf8');
    const {mechanism: m, model} = prepareModel(text, CATALOG);
    const pinionPart = model.parts.find(p => p.id === 'slewPinion').part;
    const ttPart = model.parts.find(p => p.id === 'ttTop').part;
    const expected = -CATALOG.get(pinionPart).gear.teeth / CATALOG.get(ttPart).gear.teeth;
    const mesh = m.couplings.find(c => c.parts && c.parts.includes('ttTop') && c.parts.includes('slewPinion'));
    assert.ok(mesh, 'the turntable meshes with the slew pinion');
    // The bench: the base (the hub's body) clamped.
    const base = m.bodies.find(b => b.parts.includes('hub'));
    base.motion = 'static';
    base.massKg = 0;
    const slew = m.actuators.find(a => a.port === 'C').joint;
    const ttJoint = [mesh.joint1, mesh.joint2].find(id => {
        const j = m.joints.find(x => x.id === id);
        return [j.body1, j.body2].includes(m.bodies.find(b => b.parts.includes('ttTop')).id);
    });
    const J = await loadJolt();
    const core = createPhysicsCore(J, m, {stepHz: STEP_HZ});
    try {
        for (const a of m.actuators) core.setMotor(a.joint, {mode: 'brake'});
        for (let i = 0; i < 0.5 * STEP_HZ; i++) core.step(1 / STEP_HZ);
        const t0 = core.jointState(ttJoint).angle;
        const p0 = core.jointState(slew).angle;
        core.setMotor(slew, {mode: 'velocity', radPerSec: 4});
        for (let i = 0; i < 2 * STEP_HZ; i++) core.step(1 / STEP_HZ);
        core.setMotor(slew, {mode: 'brake'});
        for (let i = 0; i < 0.3 * STEP_HZ; i++) core.step(1 / STEP_HZ);
        const turned = core.jointState(ttJoint).angle - t0;
        const driven = core.jointState(slew).angle - p0;
        assert.ok(Math.abs(driven) > 5, `the pinion turned ${driven} rad`);
        assert.ok(Math.abs(turned / driven - expected) < 0.01 * Math.abs(expected), `turntable ${turned} rad for pinion ${driven} rad: ${turned / driven}, not ${expected}`);
    } finally {
        core.destroy();
    }
});
