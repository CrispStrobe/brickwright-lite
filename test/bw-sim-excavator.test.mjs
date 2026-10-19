// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Excavator (static/sim-lab/models/excavator.ldr, scripts/gen-excavator-model.mjs): a SPIKE
 * driving base with a 28-tooth turntable slewed by an 8T on motor C, and an arm whose boom, stick and
 * bucket move on three small linear actuators (D, E, F), each turned 1:1 from its motor through 16T
 * gears and 12T bevel gears. Its example program (static/sim-lab/programs/excavator.bw) digs, lifts,
 * swings a quarter turn, dumps and swings the other way.
 *
 * Expectations are derived, never read back from what the code set:
 *   - the couplings' ratios from the parts: tooth counts (parts.json, the turntable's counted on its
 *     mesh), the actuators' lead from LDraw's contracted/extended assemblies and the measured turns of
 *     a full stroke (as test/bw-sim-linear-actuator.test.mjs derives it);
 *   - the boom's angle from its actuator's length by the law of cosines, on the hinge points the
 *     compiler found (the boom pivot P, the actuator's pivot B, its eye on the boom C): the boom
 *     turns by the angle that makes |C − B| the actuator's length;
 *   - the dig cycle from the bucket's own geometry: the lowest corner of its colliders against the
 *     floor, and the turntable's angle between its halves.
 * That it is a real build (no two solid parts overlap, no pin past its hole, every part connected)
 * is test/bw-sim-models-solid.test.mjs and test/bw-sim-models.test.mjs, which check every MODELS entry.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS, MODELS_BASE, PROGRAMS_BASE, prepareModel, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {loadJolt, createPhysicsCore} = await import(path.join(SIM, 'physics/jolt-core.js'));
const {LDU_M} = await import(path.join(SIM, 'contracts.js'));
const {parseLDraw} = await import(path.join(SIM, 'ldraw/ldraw-geometry.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const ENTRY = MODELS.find(m => m.file === 'excavator.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');
const STEP_HZ = 200;
const DEG = 180 / Math.PI;

/** The small actuator's lead (m per turn): LDraw's stroke over the measured turns of a full stroke. */
const pistonAt = file => parseLDraw(readFileSync(path.join(GUI, 'static/ldraw/parts', file), 'latin1'))
    .refs.find(r => r.file.toLowerCase() === '92696.dat').x.t;
const STROKE_LDU = Math.hypot(...pistonAt('92693c01-f2.dat').map((v, i) => v - pistonAt('92693c01-f1.dat')[i]));
const LEAD_M = STROKE_LDU * LDU_M / (7165 / 360);

const prepared = () => prepareModel(MODEL_TEXT, CATALOG, {mat: ENTRY.mat});
const bodyOf = (m, part) => m.bodies.find(b => b.parts.includes(part)).id;
/** The joint between the bodies carrying parts a and b. */
const jointBetween = (m, a, b) => {
    const A = bodyOf(m, a);
    const B = bodyOf(m, b);
    return m.joints.find(j => (j.body1 === A && j.body2 === B) || (j.body1 === B && j.body2 === A));
};
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(...a);
/** Rotate v about unit axis k by angle t (Rodrigues). */
const rotate = (v, k, t) => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    const kv = cross(k, v);
    const kd = dot(k, v) * (1 - c);
    return v.map((x, i) => x * c + kv[i] * s + k[i] * kd);
};
/** The turn about unit axis k that takes orientation q0 to q (quaternions [x, y, z, w]). */
const turnAbout = (q, q0, k) => {
    const [x, y, z, w] = q;
    const [a, b, c, d] = [-q0[0], -q0[1], -q0[2], q0[3]];
    const r = [w * a + x * d + y * c - z * b, w * b - x * c + y * d + z * a, w * c + x * b - y * a + z * d, w * d - x * a - y * b - z * c];
    return 2 * Math.atan2(dot(r, k), r[3]);
};

test('the Excavator is a shipped example with its program, titled in English and German', () => {
    assert.ok(ENTRY, 'MODELS lists excavator.ldr');
    assert.deepEqual(ENTRY.title, {en: 'Excavator', de: 'Bagger'});
    assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
    for (const port of 'CDEF') assert.match(PROGRAM, new RegExp(`run motor ${port} `), `the program drives ${port}`);
});

test('it compiles to six motors on A–F, a turntable mesh of the tooth ratio and three screw couplings of the lead', () => {
    const {mechanism: m, model, issues} = prepared();
    assert.deepEqual(issues, []);
    assert.deepEqual(m.actuators.map(a => a.port).sort(), ['A', 'B', 'C', 'D', 'E', 'F']);
    const teeth = id => CATALOG.get(model.parts.find(p => p.id === id).part).gear.teeth;
    const tt = m.couplings.find(c => c.parts && c.parts.includes('ttTop'));
    assert.deepEqual([...tt.parts].sort(), ['slewPinion', 'ttTop']);
    const [z1, z2] = tt.parts[0] === 'ttTop' ? [teeth('ttTop'), teeth('slewPinion')] : [teeth('slewPinion'), teeth('ttTop')];
    assert.ok(Math.abs(Math.abs(tt.ratio) - z1 / z2) < 1e-9, `turntable ratio ${tt.ratio} = ${z1}/${z2}`);
    const screws = m.couplings.filter(c => c.kind === 'screw');
    assert.deepEqual(screws.map(c => c.parts[0]).sort(), ['boomLaSpindle', 'bucketLaSpindle', 'stickLaSpindle']);
    for (const c of screws) assert.ok(Math.abs(Math.abs(c.ratio) / (LEAD_M / (2 * Math.PI)) - 1) < 1e-4, `${c.parts[0]}: ${c.ratio} m/rad`);
    // Each actuator is turned 1:1 from its motor: two gear pairs of equal teeth (16T and 12T bevel) per actuator.
    for (const k of ['boom', 'stick', 'bucket']) {
        // (The bevel pair turns in the actuator, which swings about the pivot axle: a 'relativeGear', mech/gears.js.)
        const pairs = m.couplings.filter(c => (c.kind === 'gear' || c.kind === 'relativeGear') && c.parts.some(p => p.startsWith(k)));
        assert.equal(pairs.length, 2, k);
        for (const c of pairs) assert.ok(Math.abs(Math.abs(c.ratio) - 1) < 1e-9, `${k}: ${c.parts} ${c.ratio}`);
    }
});

test('the boom follows its actuator\'s length by the law of cosines on the compiled hinge points', async t => {
    const {mechanism: m} = prepared();
    const base = m.bodies.find(b => b.parts.includes('hub'));
    base.motion = 'static';
    base.massKg = 0;
    const B = jointBetween(m, 'boomLaBody', 'boomLaAxle').point;
    const Pj = jointBetween(m, 'boom', 'ttTop');
    const P = Pj.point;
    const k = Pj.axis;
    const C = jointBetween(m, 'boom', 'boomLaPiston').point;
    const screw = m.couplings.find(c => c.kind === 'screw' && c.parts[0] === 'boomLaSpindle');
    const slider = m.joints.find(j => j.id === screw.sliderJoint);
    // Which way the slider's position grows the actuator: its axis against B → C, signed by the piston's side.
    const pistonIs2 = slider.body2 === bodyOf(m, 'boomLaPiston');
    const out = (pistonIs2 ? 1 : -1) * Math.sign(dot(slider.axis, sub(C, B)));
    // The compiled points are in the world frame (m), as the slider's position is.
    const L0 = len(sub(C, B));
    /** The boom's turn about P that makes the actuator L long (bisection on the geometry alone). */
    const turnFor = L => {
        const f = t => len(sub(rotate(sub(C, P), k, t).map((v, i) => v + P[i]), B)) - L;
        let lo = -1; let hi = 1;
        if (Math.sign(f(lo)) === Math.sign(f(hi))) throw new Error('no turn gives that length');
        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    };
    const J = await loadJolt();
    const core = createPhysicsCore(J, m, {stepHz: STEP_HZ});
    try {
        for (const a of m.actuators) core.setMotor(a.joint, {mode: 'brake'});
        const run = (s, each) => { for (let i = 0; i < s * STEP_HZ; i++) { core.step(1 / STEP_HZ); if (each) each(i); } };
        run(0.5);
        const boom = bodyOf(m, 'boom');
        const q0 = core.bodyPose(boom).rotation;
        const x0 = core.jointState(slider.id).position;
        // The settled pose already differs from the build by the arm's sag: compare turns from here.
        const turn0 = turnFor(L0 + out * x0);
        const motor = m.actuators.find(a => a.port === 'D').joint;
        let worst = 0;
        let span = 0;
        // Slowly (2/3 turn of the spindle a second, 0.8 mm/s): the law is the quasi-static one.
        for (const w of [4, -4]) {
            core.setMotor(motor, {mode: 'velocity', radPerSec: w});
            run(6, i => {
                if (i % 20) return;
                const L = L0 + out * core.jointState(slider.id).position;
                const expected = turnFor(L) - turn0;
                const got = turnAbout(core.bodyPose(boom).rotation, q0, k);
                worst = Math.max(worst, Math.abs(got - expected));
                span = Math.max(span, Math.abs(expected));
            });
        }
        t.diagnostic(`boom swung ${(span * DEG).toFixed(1)}°; worst deviation from the law of cosines ${(worst * DEG).toFixed(2)}°`);
        assert.ok(span > 5 / DEG, `the boom swung ${(span * DEG).toFixed(1)}°`);
        // Within 1.5°: the arm is loaded and moving (in test/bw-sim-linear-actuator.test.mjs's bare loop: 0.05°).
        assert.ok(worst < 1.5 / DEG, `the boom follows the law of cosines within ${(worst * DEG).toFixed(2)}°`);
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
    const run = source => runOnSimLab(source, {modelText: MODEL_TEXT, mat: ENTRY.mat, timeLimitMs: 56000});

    /** Rotate v by the unit quaternion q = [x, y, z, w]. */
    const qrot = ([x, y, z, w], v) => {
        const ix = w * v[0] + y * v[2] - z * v[1];
        const iy = w * v[1] + z * v[0] - x * v[2];
        const iz = w * v[2] + x * v[1] - y * v[0];
        const iw = -x * v[0] - y * v[1] - z * v[2];
        return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
    };
    const yaw = q => 2 * Math.atan2(q[1], q[3]);

    /** The dig cycle, measured: the bucket's lowest point over the floor, the turntable's angle, the base's yaw. */
    const judge = result => {
        const {track, mechanism: m} = result;
        const bucket = m.bodies.find(b => b.parts.includes('bucket'));
        const floor = m.bodies.find(b => b.id === 'ground').position[1] + 0.01;
        const lowest = p => {
            const pose = p.bodies[bucket.id];
            let lo = Infinity;
            for (const c of bucket.colliders) {
                for (let i = 0; i < 8; i++) {
                    const corner = c.halfExtents.map((h, k) => ((i >> k) & 1 ? h : -h));
                    const local = (c.rotation ? qrot(c.rotation, corner) : corner).map((x, k) => x + (c.position || [0, 0, 0])[k]);
                    lo = Math.min(lo, qrot(pose.rotation, local)[1] + pose.position[1]);
                }
            }
            return lo - floor;
        };
        const tt = m.couplings.find(c => c.parts && c.parts.includes('ttTop'));
        const ttJoint = [tt.joint1, tt.joint2].find(id => {
            const j = m.joints.find(x => x.id === id);
            return [j.body1, j.body2].includes(m.bodies.find(b => b.parts.includes('ttTop')).id);
        });
        const slew = m.actuators.find(a => a.port === 'C').joint;
        const hub = m.bodies.find(b => b.parts.includes('hub')).id;
        const heights = track.map(lowest);
        const lowAt = heights.indexOf(Math.min(...heights));
        // The swings: from where the turntable stands when the slew motor first moves.
        const swingFrom = track.findIndex(p => Math.abs(p.joints[slew].angle - track[0].joints[slew].angle) > 0.5);
        const ttAngle = p => p.joints[ttJoint].angle;
        const swings = swingFrom < 0 ? [] : track.slice(swingFrom - 1).map(p => (ttAngle(p) - ttAngle(track[swingFrom - 1])) * DEG);
        return {
            low: heights[lowAt], lowAt, raised: Math.max(...heights.slice(lowAt)),
            swingMin: swings.length ? Math.min(...swings) : 0, swingMax: swings.length ? Math.max(...swings) : 0,
            swingEnd: swings.length ? swings.at(-1) : 0,
            series: track.filter((_, i) => i % 20 === 0).map(p => `${(yaw(p.bodies[hub].rotation) * DEG).toFixed(0)}:${(p.joints[slew].angle * DEG).toFixed(0)}:${(ttAngle(p) * DEG).toFixed(0)}`).join(' '),
            baseYaw: Math.max(...track.map(p => Math.abs(yaw(p.bodies[hub].rotation) - yaw(track[0].bodies[hub].rotation)))) * DEG,
            busy: track.at(-1).busy
        };
    };
    const report = r => `bucket teeth down to ${(r.low * 1000).toFixed(1)} mm over the floor (frame ${r.lowAt}), then up to ${(r.raised * 1000).toFixed(1)} mm; ` +
        `turntable swung ${r.swingMin.toFixed(1)}° … ${r.swingMax.toFixed(1)}°, ending ${r.swingEnd.toFixed(1)}° from where it started; base yawed ${r.baseYaw.toFixed(1)}°; ${r.series}`;

    test('the example program digs to the floor, lifts, swings a quarter turn each way and comes back', async t => {
        const result = await run(process.env.TRUNC ? PROGRAM.slice(0, PROGRAM.indexOf(process.env.TRUNC)) : process.env.DIGN ? PROGRAM.replace('run motor D counterclockwise 5000 degrees', `run motor D counterclockwise ${process.env.DIGN} degrees`) : PROGRAM);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, [], 'every command was understood by the hub');
        const r = judge(result);
        t.diagnostic(report(r));
        // Dig: the teeth reach the floor (within 2 mm; the floor is rigid), then the load is lifted 5 cm.
        assert.ok(r.low < 0.002, `the bucket only came down to ${r.low} m over the floor`);
        assert.ok(r.raised > 0.05, `the bucket was lifted only ${r.raised} m`);
        // Slew: 315° of the motor through 8T into 28T is 90°; each way within 12° (the base is not
        // clamped: the swing's reaction turns it a little, and the turntable's gear couples world rates).
        assert.ok(Math.abs(r.swingMin + 90) < 12, `one way the turntable swung ${r.swingMin}°`);
        assert.ok(Math.abs(r.swingMax - 90) < 12, `the other way it swung ${r.swingMax}°`);
        assert.ok(Math.abs(r.swingEnd) < 12, `it came back to ${r.swingEnd}°`);
        assert.ok(r.baseYaw < 10, `the base turned ${r.baseYaw}° on the floor`);
    });

    test('the judge can fail: without lowering the boom the bucket never reaches the floor', async t => {
        const shallow = PROGRAM.replace(/^ {2}run motor D counterclockwise 5000 degrees\n/m, '');
        assert.notEqual(shallow, PROGRAM);
        const r = judge(await run(shallow));
        t.diagnostic(`no boom lowering: ${report(r)}`);
        assert.ok(r.low > 0.003, `the bucket still came down to ${r.low} m`);
    });
}
