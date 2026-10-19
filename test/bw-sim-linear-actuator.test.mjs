// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The small Technic linear actuator (kinds/screw.js, physics/screw.js), compiled from its three
 * real parts (body 92693c01, spindle 92695, piston 92696) placed as LDraw's own assemblies place
 * them, and run in the Jolt core.
 *
 * Expectations are derived, never read back from what the code set:
 *   - the stroke is LDraw's: the piston's offset between the vendored contracted and extended
 *     assemblies (92693c01-f1/-f2.dat), read here from those files;
 *   - the lead is that stroke over the measured turns of a full stroke (7165° — the mean of six
 *     encoder readings, Eurobricks "linear actuator degrees to full length", 2023; the deriver
 *     cites it): extension per input revolution = lead;
 *   - self-locking from the thread's lead angle (rod radius from the mesh) against plastic's
 *     friction angle;
 *   - the closed loop (frame – boom – actuator) against the law of cosines.
 *
 * The rigs clamp the actuator's body (or a frame) to the bench (a static body, as
 * test/bw-sim-gear-trains.test.mjs does) and put a motor on the spindle's hinge, as a gear train
 * from a SPIKE motor would turn it.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {validateCompiledMechanism, LDU_M} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {BUILTIN_KINDS} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js';
import {parseLDraw, flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {SPIKE_MEDIUM_ANGULAR} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const LIB = path.join(GUI, 'static/ldraw');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(GUI, 'src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const read = p => {
    try { return readFileSync(path.join(LIB, p.toLowerCase()), 'latin1'); } catch { return undefined; }
};

const STEP_HZ = 200;
const DT = 1 / STEP_HZ;
const DEG = 180 / Math.PI;

// ---- what LDraw and the measurement say -----------------------------------------------

/** The piston's placement in a vendored assembly (translation; the files use identity rotations). */
const pistonAt = file => {
    const ref = parseLDraw(read(`parts/${file}`)).refs.find(r => r.file.toLowerCase() === '92696.dat');
    return ref.x.t;
};
const P1 = pistonAt('92693c01-f1.dat');
const P2 = pistonAt('92693c01-f2.dat');
const STROKE_LDU = Math.hypot(...P2.map((v, i) => v - P1[i]));
const TURNS_FULL_STROKE = 7165 / 360;
const LEAD_M = STROKE_LDU * LDU_M / TURNS_FULL_STROKE;
/** The spindle rod's radius, from its mesh beyond the input stub and collar (z > 10 in its frame). */
const ROD_R_LDU = Math.max(...flattenPart('92695.dat', read).polys.flat().filter(v => v[2] > 10).map(v => Math.hypot(v[0], v[1])));

// ---- rigs ---------------------------------------------------------------------------

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Rotation (row-major) whose columns are where the local x, y, z axes go. */
const cols = (ex, ey, ez) => [ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, s = 1) => a.map((v, i) => v + s * b[i]);

/**
 * The actuator's three parts as LDraw's contracted assembly has them, extended by `ext` LDU, with
 * the lug holes' line through `at`, its axis along unit `dir` and its lugs along x.
 */
const actuator = (prefix, at, dir, ext = 0) => {
    const ex = [1, 0, 0];
    const ey = cross(dir, ex);
    const R = cols(ex, ey, dir);
    const place = (id, part, local) => ({id: `${prefix}${id}`, part, position: add(at, local[0] === 0 && local[1] === 0 ? dir.map(v => v * local[2]) : local), rotation: R});
    return [place('body', '92693c01.dat', [0, 0, 0]), place('spindle', '92695.dat', [0, 0, 30]), place('piston', '92696.dat', [0, 0, P1[2] + ext])];
};

/** Clamp the body holding `partId` to the bench; put a SPIKE medium motor on the hinge that turns `spindleId`. */
const benchAndMotor = (m, clampPart, spindlePart) => {
    const frame = m.bodies.find(b => b.parts.includes(clampPart));
    frame.motion = 'static';
    frame.massKg = 0;
    const spindleBody = m.bodies.find(b => b.parts.includes(spindlePart)).id;
    const screw = m.couplings.find(c => c.kind === 'screw');
    const hinge = m.joints.find(j => j.id === screw.hingeJoint);
    assert.ok([hinge.body1, hinge.body2].includes(spindleBody), 'the screw\'s hinge turns the spindle');
    const motor = {port: 'A', maxTorqueNm: SPIKE_MEDIUM_ANGULAR.motor.stallTorqueNm, maxSpeedRadPerSec: SPIKE_MEDIUM_ANGULAR.motor.servoMaxDegPerSec / DEG, deviceId: 48};
    hinge.motor = motor;
    m.actuators.push({id: 'a0', joint: hinge.id, hub: null, port: 'A', device: SPIKE_MEDIUM_ANGULAR.id, sign: 1,
        maxTorqueNm: motor.maxTorqueNm, maxSpeedRadPerSec: motor.maxSpeedRadPerSec, ids: {lpf2: 48}});
    assert.deepEqual(validateCompiledMechanism(m, {kinds: BUILTIN_KINDS}), []);
    return {screw, hinge, slider: m.joints.find(j => j.id === screw.sliderJoint), frame: frame.id};
};

const run = (core, seconds, each) => {
    for (let i = 0; i < Math.round(seconds * STEP_HZ); i++) {
        core.step(DT);
        if (each) each(core, i);
    }
};

const J = await loadJolt();

test('LDraw\'s assemblies give the stroke; the measured turns give the lead; the thread self-locks', () => {
    assert.equal(STROKE_LDU, 60, 'LDraw: the piston travels 60 LDU (24 mm, 3 studs) from contracted to extended');
    assert.ok(Math.abs(LEAD_M - 0.001206) < 0.000002, `lead ${LEAD_M} m per turn`);
    // Lead angle on the 2.4 mm rod against plastic on plastic (μ 0.2–0.35): self-locking at the low end too.
    const lambda = Math.atan(LEAD_M / (2 * Math.PI * ROD_R_LDU * LDU_M));
    assert.ok(Math.abs(ROD_R_LDU - 3) < 0.05, `rod radius ${ROD_R_LDU} LDU`);
    assert.ok(Math.tan(lambda) < 0.2, `lead angle ${(lambda * DEG).toFixed(1)}° is below the friction angle of μ = 0.2`);
});

test('the three parts compile to a hinge, a slider with the stroke as its travel, and a screw coupling of lead / 2π', () => {
    const model = {version: 1, parts: actuator('', [0, 0, 0], [0, 0, 1])};
    for (const p of model.parts) assert.deepEqual(solidOverlaps(model, CATALOG, p), [], `${p.id}: the actuator's parts nest`);
    const m = compile(model, CATALOG, {ground: false, version: 2});
    assert.deepEqual(m.diagnostics, []);
    assert.equal(m.bodies.length, 3);
    const screw = m.couplings.find(c => c.kind === 'screw');
    assert.ok(screw, 'a screw coupling');
    assert.ok(Math.abs(Math.abs(screw.ratio) / (LEAD_M / (2 * Math.PI)) - 1) < 1e-4, `|ratio| ${screw.ratio} = lead / 2π`);
    const slider = m.joints.find(j => j.id === screw.sliderJoint);
    const travel = slider.limits[1] - slider.limits[0];
    assert.ok(Math.abs(travel - STROKE_LDU * LDU_M) < 1e-9, `travel ${travel} m = the stroke`);
    // Built contracted: it can only extend (limits [0, stroke] along the piston's way out).
    assert.ok(Math.min(Math.abs(slider.limits[0]), Math.abs(slider.limits[1])) < 1e-9);
    // Half extended: the nut is mid-thread, the travel splits.
    const mid = compile({version: 1, parts: actuator('', [0, 0, 0], [0, 0, 1], 20)}, CATALOG, {ground: false, version: 2});
    const ms = mid.joints.find(j => j.type === 'slider');
    assert.deepEqual(ms.limits.map(v => Math.round(Math.abs(v) / LDU_M)).sort((a, b) => a - b), [20, 40]);
    // Moving the piston off the spindle's line loses the coupling (and the slider).
    const off = actuator('', [0, 0, 0], [0, 0, 1]);
    off[2].position = add(off[2].position, [0, 3, 0]);
    assert.equal(compile({version: 1, parts: off}, CATALOG, {ground: false, version: 2}).couplings.filter(c => c.kind === 'screw').length, 0);
});

/** The actuator hanging piston-down from a clamped body, the piston carrying `loadKg`. */
const hangingRig = ({loadKg = 0.5, clutchForceN = null} = {}) => {
    // LDraw +y is down: the actuator's axis along +y puts the piston below the body.
    const m = compile({version: 1, parts: actuator('', [0, 0, 0], [0, 1, 0])}, CATALOG, {ground: false, version: 2});
    const rig = benchAndMotor(m, 'body', 'spindle');
    m.bodies.find(b => b.parts.includes('piston')).massKg = loadKg;
    if (clutchForceN !== null) rig.screw.clutchForceN = clutchForceN;
    return {m, ...rig};
};
/** Extension (m, ≥ 0 going out) and spindle angle (rad) of a rig. */
const state = (core, rig) => {
    const sign = Math.sign(rig.slider.limits[1] + rig.slider.limits[0]) || 1;
    return {x: sign * core.jointState(rig.slider.id).position, theta: core.jointState(rig.hinge.id).angle};
};

test('extension per input revolution is the lead, both ways', () => {
    const rig = hangingRig({loadKg: 0.2});
    const core = createPhysicsCore(J, rig.m, {stepHz: STEP_HZ});
    try {
        run(core, 0.2);
        const s0 = state(core, rig);
        // Whichever way extends: turn 5 revolutions one way, then back.
        core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: 6});
        run(core, 2);
        core.setMotor(rig.hinge.id, {mode: 'brake'});
        run(core, 0.2);
        const s1 = state(core, rig);
        const dir = Math.sign(s1.x - s0.x);
        const turns = (s1.theta - s0.theta) / (2 * Math.PI);
        if (dir < 0) {
            // That way retracts: the actuator was at its contracted end. Go the other way.
            core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: -6});
            run(core, 4);
            core.setMotor(rig.hinge.id, {mode: 'brake'});
            run(core, 0.2);
        }
        const a = state(core, rig);
        core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: dir < 0 ? -6 : 6});
        run(core, 2);
        core.setMotor(rig.hinge.id, {mode: 'brake'});
        run(core, 0.2);
        const b = state(core, rig);
        const revs = Math.abs(b.theta - a.theta) / (2 * Math.PI);
        const perRev = Math.abs(b.x - a.x) / revs;
        assert.ok(revs > 1.5, `the spindle turned ${revs} revolutions`);
        assert.ok(Math.abs(perRev - LEAD_M) / LEAD_M < 0.01, `${(perRev * 1000).toFixed(4)} mm per revolution vs the lead ${(LEAD_M * 1000).toFixed(4)} mm (turns ${turns.toFixed(2)})`);
        // And back: the same amount in.
        core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: dir < 0 ? 6 : -6});
        run(core, 2);
        core.setMotor(rig.hinge.id, {mode: 'brake'});
        run(core, 0.2);
        const c = state(core, rig);
        const back = Math.abs(c.x - b.x) / (Math.abs(c.theta - b.theta) / (2 * Math.PI));
        assert.ok(Math.abs(back - LEAD_M) / LEAD_M < 0.01, `back: ${(back * 1000).toFixed(4)} mm per revolution`);
    } finally {
        core.destroy();
    }
});

test('self-locking: a load hanging on the piston does not turn the spindle; above the clutch force it slips', () => {
    for (const [label, opts, holds] of [['0.5 kg, motor coasting', {loadKg: 0.5}, true], ['the clutch set below the load (2 N < 4.9 N)', {loadKg: 0.5, clutchForceN: 2}, false]]) {
        const rig = hangingRig(opts);
        const core = createPhysicsCore(J, rig.m, {stepHz: STEP_HZ});
        try {
            // Half way out first, then let go of the motor.
            core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: 6});
            run(core, 0.1);
            const probe = state(core, rig);
            core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: 0});
            run(core, 0.1);
            const out = state(core, rig).x >= probe.x - 1e-6 ? 6 : -6;
            core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: out});
            run(core, 4);
            core.setMotor(rig.hinge.id, {mode: 'coast'});
            run(core, 0.2);
            const a = state(core, rig);
            run(core, 3);
            const b = state(core, rig);
            const moved = Math.abs(b.x - a.x);
            const stroke = STROKE_LDU * LDU_M;
            if (holds) {
                assert.ok(a.x > 0.002 && a.x < stroke - 0.002, `${label}: mid-stroke (${a.x} m)`);
                assert.ok(moved < 0.00005, `${label}: the piston moved ${(moved * 1000).toFixed(3)} mm in 3 s`);
                assert.ok(Math.abs(b.theta - a.theta) < 0.05, `${label}: the spindle turned ${b.theta - a.theta} rad`);
            } else {
                // The load pulls the piston out through the slipping clutch, to the end of the stroke.
                assert.ok(b.x > stroke - 0.0003, `${label}: the piston slid out to ${(b.x * 1000).toFixed(3)} mm of ${stroke * 1000}`);
            }
        } finally {
            core.destroy();
        }
    }
});

test('end stops: driven past its stroke the piston stops at the end, the spindle turns on (the clutch), and reversing retracts at once', () => {
    const rig = hangingRig({loadKg: 0.05});
    const core = createPhysicsCore(J, rig.m, {stepHz: STEP_HZ});
    try {
        const lo = rig.slider.limits[0];
        const hi = rig.slider.limits[1];
        // 24 mm takes 19.9 turns: 30 turns at 2 turns/s goes well past the end, either way.
        for (const w of [4 * Math.PI, -4 * Math.PI]) {
            core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: w});
            run(core, 15);
            const pos = core.jointState(rig.slider.id).position;
            assert.ok(pos >= lo - 0.0003 && pos <= hi + 0.0003, `the slider stays within [${lo}, ${hi}]: ${pos}`);
            const atEnd = Math.min(Math.abs(pos - lo), Math.abs(pos - hi));
            assert.ok(atEnd < 0.0003, `it is at an end: ${pos}`);
            const t0 = core.jointState(rig.hinge.id).angle;
            run(core, 1);
            assert.ok(Math.abs(core.jointState(rig.hinge.id).angle - t0) > 10, 'the spindle keeps turning at the end (the clutch slips)');
            assert.ok(Math.abs(core.jointState(rig.slider.id).position - pos) < 0.0003, 'and the piston stays');
            // Reverse: within 0.5 s the piston has left the end by most of what 1 turn gives.
            core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: -w});
            run(core, 0.5);
            const left = Math.abs(core.jointState(rig.slider.id).position - pos);
            assert.ok(left > 0.8 * LEAD_M, `reversed, it left the end by ${(left * 1000).toFixed(3)} mm in 0.5 s`);
        }
    } finally {
        core.destroy();
    }
});

test('a closed loop — frame, boom, actuator — moves as the law of cosines says', t => {
    // A 15L frame beam standing upright (holes along x), a 15L boom pinned to it at P and an actuator
    // pinned to it at B, 100 LDU below P; the piston's eye is pinned to the boom 100 LDU from P. The
    // pins are frictionless (3673, and 3L 32556b where they bridge a gap): four hinges and the slider
    // close one loop. Boom, actuator and frame stand 10 LDU apart, so nothing rubs — touching parts
    // that no joint links collide, and a boom rubbing the frame loads the loop far past the clutch.
    const up = [0, -1, 0];
    const fwd = [0, 0, -1];
    const beam = (dir) => cols(cross([1, 0, 0], dir), [1, 0, 0], dir);
    const B = [0, 0, 0];
    const P = [0, -100, 0];
    const C = add(P, fwd, 100);
    const L0 = Math.hypot(...C.map((v, i) => v - B[i]));
    const dir = C.map((v, i) => (v - B[i]) / L0);
    const pin = (id, at, part = '3673.dat') => ({id, part, position: at, rotation: I});
    const parts = [
        {id: 'frame', part: '32278.dat', position: add([60, 0, 0], up, -40), rotation: beam(up)},
        ...actuator('la', B, dir, L0 - P1[2]),
        {id: 'boom', part: '32278.dat', position: add(add(P, fwd, 140), [30, 0, 0]), rotation: beam(fwd)},
        pin('pinB', [50, 0, 0], '32556b.dat'),
        pin('pinP', [40, -100, 0], '32556b.dat'),
        pin('pinC', add(C, [20, 0, 0]))
    ];
    const m = compile({version: 1, parts}, CATALOG, {ground: false, version: 2});
    assert.deepEqual(m.diagnostics.filter(d => d.severity === 'error' || d.code === 'loose-part'), []);
    // The free pins are welded into the parts they join (mech/free-pins.js): five bodies, one loop.
    assert.equal(m.bodies.length, 5);
    assert.deepEqual(m.joints.map(j => j.type).sort(), ['hinge', 'hinge', 'hinge', 'hinge', 'slider']);
    const rig = benchAndMotor(m, 'frame', 'laspindle'); 
    const boomBody = m.bodies.find(b => b.parts.includes('boom')).id;
    const core = createPhysicsCore(J, m, {stepHz: STEP_HZ});
    // The boom's turn about x from its start orientation q0: the relative rotation q·q0⁻¹.
    const turnFrom = (q, q0) => {
        const [x, y, z, w] = q;
        const [a, b, c, d] = [-q0[0], -q0[1], -q0[2], q0[3]];
        const rx = w * a + x * d + y * c - z * b;
        const rw = w * d - x * a - y * b - z * c;
        return 2 * Math.atan2(rx, rw);
    };
    try {
        core.setMotor(rig.hinge.id, {mode: 'brake'});
        // At rest, the spindle braked: once settled (0.3 s), the loop holds the boom (self-locking, no sag).
        run(core, 0.3);
        const qa = core.bodyPose(boomBody).rotation;
        let sag = 0;
        run(core, 2, c => { sag = Math.max(sag, Math.abs(turnFrom(c.bodyPose(boomBody).rotation, qa))); });
        assert.ok(sag < 0.2 / DEG, `at rest the boom moved ${(sag * DEG).toFixed(3)}°`);
        const q0 = core.bodyPose(boomBody).rotation;
        const x0 = state(core, rig).x;
        const samples = [];
        for (const w of [8, -8]) {
            core.setMotor(rig.hinge.id, {mode: 'velocity', radPerSec: w});
            run(core, 3, (c, i) => {
                if (i % 40) return;
                // The actuator's pin-to-pin length now, and the boom's turn since the start.
                samples.push({L: L0 + (state(c, rig).x - x0) / LDU_M, turn: turnFrom(c.bodyPose(boomBody).rotation, q0)});
            });
        }
        // Law of cosines: the angle at P between PB (straight down) and PC is α(L); the boom turns by α(L) − α(L0).
        const alpha = L => Math.acos((100 ** 2 + 100 ** 2 - L ** 2) / (2 * 100 * 100));
        let worst = 0;
        let span = 0;
        for (const s of samples) {
            // Opening the angle at P swings PC from PB (down) towards up: in the world frame (+y up,
            // +z backwards) that is a turn about +x by −Δα.
            const expected = -(alpha(s.L) - alpha(L0));
            worst = Math.max(worst, Math.abs(s.turn - expected));
            span = Math.max(span, Math.abs(expected));
        }
        t.diagnostic(`swing ${(span * DEG).toFixed(1)}°, worst deviation from the law of cosines ${(worst * DEG).toFixed(3)}°`);
        assert.ok(span > 5 / DEG, `the boom swung ${(span * DEG).toFixed(1)}°`);
        assert.ok(worst < 0.5 / DEG, `the boom's angle follows the actuator's length within ${(worst * DEG).toFixed(3)}°`);
    } finally {
        core.destroy();
    }
});
