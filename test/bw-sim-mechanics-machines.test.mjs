// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODELS, catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';
import {judgeMechanicsRun} from '../scripts/lib/sim-lab-mechanics-judge.mjs';

const GUI = new URL('../overlay/scratch-gui/', import.meta.url);
const catalog = catalogFrom(JSON.parse(readFileSync(new URL('src/lib/bw-sim/part-meta/parts.json', GUI))));
const modelText = id => readFileSync(new URL(`static/sim-lab/models/${id}.ldr`, GUI), 'utf8');
const program = id => readFileSync(new URL(`static/sim-lab/programs/${id}.bw`, GUI), 'utf8');
const machines = [['crank-rocker', 15, ['A']], ['parallel-lift', 23, ['A']],
    ['screw-crane', 44, ['A', 'C']], ['pivot-rover', 30, ['A', 'B', 'C']]];

for (const [id, pieces, ports] of machines) {
    test(`${id}: connected physical parts, registered program, no overlaps and complete instructions`, () => {
        const {model, mechanism, issues} = prepareModel(modelText(id), catalog, {mat: 'plain'});
        assert.deepEqual(issues, []);
        assert.equal(model.parts.length, pieces);
        assert.deepEqual(mechanism.actuators.map(a => a.port).sort(), ports);
        assert.ok(MODELS.some(m => m.file === `${id}.ldr` && m.example === `${id}.bw`));
        for (const p of model.parts) assert.deepEqual(solidOverlaps(model, catalog, p), [], p.id);
        const plan = buildSteps(model, catalog);
        assert.ok(plan.steps.every(s => !s.loose));
        assert.deepEqual(plan.steps.flatMap(s => s.parts).sort(), model.parts.map(p => p.id).sort());
    });

    test(`${id}: all motors at 60% for two seconds, finite assembly and upright base`, async () => {
        const {mechanism} = prepareModel(modelText(id), catalog, {mat: 'plain'});
        const core = createPhysicsCore(await loadJolt(), mechanism, {stepHz: 200});
        const frame = mechanism.bodies.find(b => b.parts.includes('hub')).id;
        try {
            for (let i = 0; i < 40; i++) core.step(0.005);
            for (const a of mechanism.actuators) core.setMotor(a.joint, {mode: 'velocity', radPerSec: 0.6 * a.maxSpeedRadPerSec});
            for (let i = 0; i < 400; i++) {
                core.step(0.005);
                const hub = core.bodyPose(frame);
                const [x, , z] = hub.rotation;
                assert.ok(1 - 2 * (x * x + z * z) > 0.97);
                for (const b of mechanism.bodies.filter(b => b.motion === 'dynamic')) {
                    const p = core.bodyPose(b.id);
                    assert.ok([...p.position, ...p.rotation].every(Number.isFinite));
                    assert.ok(Math.hypot(...p.position.map((v, n) => v - hub.position[n])) < 0.5);
                }
            }
            for (const a of mechanism.actuators) assert.ok(Math.abs(core.jointState(a.joint).angle) > 0.2, a.port);
            if (id === 'parallel-lift') {
                // Mechanical posts stop a powered overrun before a flat change point can flip the tray.
                const angle = Math.abs(core.jointState(mechanism.actuators[0].joint).angle);
                assert.ok(angle > Math.PI / 4 && angle < 80 * Math.PI / 180, `physical stop at ${angle}`);
            }
        } finally { core.destroy(); }
    });

    test(`${id}: actual VM example performs its intended mechanism experiment`, async t => {
        const r = await runOnSimLab(program(id), {modelText: modelText(id), mat: 'plain', timeLimitMs: 18000});
        const metrics = judgeMechanicsRun(id, {...r, unsupported: r.run.unsupported});
        t.diagnostic(JSON.stringify(metrics));
    });
}

test('the mechanism judges reject an encoder-only substitute without output motion', async () => {
    const r = await runOnSimLab(program('parallel-lift'), {modelText: modelText('parallel-lift'), mat: 'plain', timeLimitMs: 10000});
    const tray = r.mechanism.bodies.find(b => b.parts.includes('coupler')).id;
    const frozen = r.track.map(f => ({...f, bodies: {...f.bodies, [tray]: r.track[0].bodies[tray]}}));
    assert.throws(() => judgeMechanicsRun('parallel-lift', {...r, track: frozen, unsupported: r.run.unsupported}), /curved-path/);
});
