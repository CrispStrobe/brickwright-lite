// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * T4 forklift (slice R4 of docs/ROBOT-LAB-ARCHITECTURE.md), the shipped Forklift example run
 * for real: its DEVICE SPIKE program (static/sim-lab/programs/forklift.bw: raise, wait, lower)
 * through the Scratch VM, the spikeprime extension, the virtual hub's controller and the DC
 * motor model (test/helpers/sim-lab-vm.mjs), on the Warehouse mat whose pallet (world/objects.js,
 * a `load`) stands around the forks.
 *
 * The build (static/sim-lab/models/forklift.ldr): a SPIKE medium motor stands on a beam on the
 * hub and turns an 8T gear; the gear meshes with a 1 × 13 rack (64781) on the carriage. The
 * carriage — the rack, an axle through it, two L-beams, two forks on a 3L pin — rides a frame
 * axle through the eyes of a smooth toggle joint (48496: slide-bores, kinds/slide.js). So the
 * compiler emits a slider (carriage on the guide) and a rackAndPinion coupling (kinds/rack.js)
 * whose ratio is derived from the geometry: |ratio| = the 8T's pitch radius, m·z/2 = 4 mm.
 *
 * Acceptance (binding, §7 R4): the motor raises the pallet by 40 mm (± 1 mm of r·θ, θ the motor
 * joint's measured angle), holds it while the motor holds (the R3 note: the drift of a held,
 * loaded rack, measured over the program's 5 s wait, ≤ 0.5 mm), lowers it, and the pallet stays
 * on the forks — its position relative to the carriage changes by ≤ 2 mm over the cycle.
 * The judge is shown able to fail: half the rotation raises 20 mm; turning the other way first
 * leaves the pallet on the floor.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS, MODELS_BASE, PROGRAMS_BASE, prepareModel, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {PALLET} = await import(path.join(SIM, 'world/objects.js'));
const {loadJolt, createPhysicsCore} = await import(path.join(SIM, 'physics/jolt-core.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const ENTRY = MODELS.find(m => m.file === 'forklift.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');
/** Technic module (m) and the 8T's pitch radius: m · z / 2. */
const R_PINION = 0.001 * 8 / 2;
const LIFT_M = 0.04;
const TOL_M = 0.001;
const DRIFT_M = 0.0005;
const SLIP_M = 0.002;

const prepared = () => prepareModel(MODEL_TEXT, CATALOG, {mat: ENTRY.mat});

test('the Forklift is the shipped example with its program and mat, titled in English and German', () => {
    assert.ok(ENTRY, 'MODELS lists forklift.ldr');
    assert.deepEqual(ENTRY.title, {en: 'Forklift', de: 'Gabelstapler'});
    assert.equal(ENTRY.mat, 'warehouse');
    assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
    assert.match(PROGRAM, /run motor C clockwise 573 degrees/);
    assert.match(PROGRAM, /wait 5 seconds/);
    assert.match(PROGRAM, /run motor C counterclockwise 573 degrees/);
});

test('the Forklift compiles to a slider and a rack-and-pinion coupling of the 8T\'s pitch radius, with no issues', () => {
    const {mechanism, issues} = prepared();
    assert.deepEqual(issues, []);
    const sliders = mechanism.joints.filter(j => j.type === 'slider');
    assert.equal(sliders.length, 1, 'one slider: the carriage on its guide');
    const [rp, ...more] = mechanism.couplings.filter(c => c.kind === 'rackAndPinion');
    assert.deepEqual(more, []);
    assert.equal(rp.sliderJoint, sliders[0].id);
    assert.equal(mechanism.actuators.find(a => a.joint === rp.hingeJoint).port, 'C', 'the lift motor on port C turns the pinion');
    assert.ok(Math.abs(Math.abs(rp.ratio) - R_PINION) < 1e-12, `|ratio| ${rp.ratio} = 4 mm per rad`);
    // The travel the compiler measured: up to where the pinion leaves the teeth, down to where the
    // toggle's lower eye meets the tee holding the guide. Lifting 40 mm fits.
    const [lo, hi] = sliders[0].limits;
    const up = sliders[0].axis[1] < 0 ? -lo : hi;
    assert.ok(up > LIFT_M + 0.01, `the carriage can rise ${up} m`);
    // The pallet is a load on the floor.
    const pallet = mechanism.bodies.find(b => b.id === 'load:pallet');
    assert.equal(pallet.role, 'load');
    assert.equal(pallet.massKg, PALLET.massKg);
});

test('at rest the tines sit in the pallet\'s pockets: nothing pushes the pallet, nothing lifts it', async t => {
    const {mechanism} = prepared();
    const J = await loadJolt();
    const core = createPhysicsCore(J, mechanism, {stepHz: 200});
    try {
        const p0 = core.bodyPose('load:pallet').position;
        for (let i = 0; i < 200; i++) core.step(0.005);
        const p1 = core.bodyPose('load:pallet').position;
        const moved = Math.hypot(...p1.map((v, i) => v - p0[i]));
        t.diagnostic(`pallet moved ${(moved * 1000).toFixed(3)} mm in 1 s at rest`);
        assert.ok(moved < 0.0001, `the pallet stays where it stands (${moved} m)`);
    } finally {
        core.destroy();
    }
});

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the Robot Lab program run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab} = await import('./helpers/sim-lab-vm.mjs');
    const run = source => runOnSimLab(source, {modelText: MODEL_TEXT, mat: ENTRY.mat, timeLimitMs: 15000});

    /** The cycle, measured: pallet rise at the hold, r·θ there, drift over the hold, end height, slip. */
    const judge = result => {
        const {track, mechanism} = result;
        const slider = mechanism.joints.find(j => j.type === 'slider');
        const rp = mechanism.couplings.find(c => c.kind === 'rackAndPinion');
        const carriage = slider.body2;
        const rel = p => [0, 1, 2].map(i => p.bodies['load:pallet'].position[i] - p.bodies[carriage].position[i]);
        const y = (p, id) => p.bodies[id].position[1];
        const p0 = track[0];
        const rise = p => y(p, 'load:pallet') - y(p0, 'load:pallet');
        const top = track.reduce((m, p) => (rise(p) > rise(m) ? p : m));
        // The hold: the frames, high up, in which the carriage's slider is still (< 0.1 mm/s): its
        // span says how long the motor held, the pallet's height range over it is the drift.
        const holdSpan = track.filter(p => rise(p) > 0.03 && Math.abs(p.joints[slider.id].velocity) < 0.0001);
        const holdFrom = holdSpan[0] || top;
        const holdTo = holdSpan.at(-1) || top;
        const theta = top.joints[rp.hingeJoint].angle - p0.joints[rp.hingeJoint].angle;
        const lifted = track.filter(p => rise(p) > 0.005);
        const slip = Math.max(0, ...lifted.map(p => Math.hypot(...rel(p).map((v, i) => v - rel(lifted[0])[i]))));
        return {
            rise: rise(top), rTheta: R_PINION * Math.abs(theta), carriageRise: y(top, carriage) - y(p0, carriage),
            holdS: (holdTo.t - holdFrom.t) / 1000,
            drift: Math.max(...holdSpan.map(p => rise(p))) - Math.min(...holdSpan.map(p => rise(p))),
            end: rise(track.at(-1)), slip
        };
    };
    const report = r => `pallet rose ${(r.rise * 1000).toFixed(2)} mm (r·θ ${(r.rTheta * 1000).toFixed(2)} mm, carriage ${(r.carriageRise * 1000).toFixed(2)} mm); ` +
        `held ${r.holdS.toFixed(1)} s drifting ${(r.drift * 1000).toFixed(3)} mm; ends ${(r.end * 1000).toFixed(2)} mm up; slip on the forks ${(r.slip * 1000).toFixed(2)} mm`;

    test('T4: the example program raises the pallet 40 mm (± 1 mm of r·θ), holds it, lowers it, and the pallet stays on the forks', async t => {
        const result = await run(PROGRAM);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, [], 'every command was understood by the hub');
        const r = judge(result);
        t.diagnostic(report(r));
        assert.ok(Math.abs(r.rise - LIFT_M) <= TOL_M, `rose ${r.rise} m, not 40 mm`);
        assert.ok(Math.abs(r.rise - r.rTheta) <= TOL_M, `rise ${r.rise} m vs r·θ ${r.rTheta} m`);
        assert.ok(r.holdS >= 4.5, `held for ${r.holdS} s (the program waits 5 s)`);
        assert.ok(r.drift <= DRIFT_M, `the held, loaded rack drifted ${r.drift} m`);
        assert.ok(Math.abs(r.end) <= TOL_M, `lowered back to ${r.end} m`);
        assert.ok(r.slip <= SLIP_M, `the pallet slipped ${r.slip} m on the forks`);
    });

    test('the judge can fail: half the rotation lifts the pallet 20 mm, not 40', async t => {
        const half = PROGRAM.replace('clockwise 573 degrees', 'clockwise 286 degrees');
        assert.notEqual(half, PROGRAM);
        const r = judge(await run(half));
        t.diagnostic(`286°: ${report(r)}`);
        assert.ok(Math.abs(r.rise - LIFT_M) > TOL_M, `half the rotation still rose ${r.rise} m`);
        assert.ok(Math.abs(r.rise - LIFT_M / 2) <= TOL_M, `half the rotation, half the lift: ${r.rise} m`);
    });

    test('the judge can fail: turning the other way first drives the forks down, and the pallet stays on the floor', async t => {
        const reversed = PROGRAM.replace('run motor C clockwise 573', 'run motor C TMP 573')
            .replace('run motor C counterclockwise 573', 'run motor C clockwise 573').replace('run motor C TMP 573', 'run motor C counterclockwise 573');
        assert.notEqual(reversed, PROGRAM);
        const result = await run(reversed);
        const p0 = result.track[0];
        const ys = result.track.map(p => p.bodies['load:pallet'].position[1] - p0.bodies['load:pallet'].position[1]);
        // The first move and the 5 s wait (the second move, now upwards, starts after them).
        const maxAt = result.track.findIndex(p => p.t >= 6000);
        const early = Math.max(...ys.slice(0, maxAt));
        const low = Math.min(...result.track.slice(0, maxAt).map(p => p.joints[result.mechanism.joints.find(j => j.type === 'slider').id].position));
        t.diagnostic(`reversed: in the first 6 s the pallet rose at most ${(early * 1000).toFixed(2)} mm; the slider reached ${(low * 1000).toFixed(2)} mm`);
        assert.ok(early < 0.001, `the reversed program lifted the pallet ${early} m`);
    });
}
