// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Robot Lab validation suite: test machines built from real LEGO parts
 * (test/fixtures/bw-sim/machines/*.ldr, each header says how it is built) run through
 * the real pipeline — LDraw text → parseModel → compile (mech/compile.js, CompiledMechanism
 * v2) → the Jolt core (physics/jolt-core.js) → the virtual SPIKE hub and its DC motor model
 * (hub-bridge.js) where a motor drives — and compared with answers derived HERE, by hand,
 * from the parts' catalog geometry (part-meta/parts.json) and textbook physics: gear and
 * rack kinematics, the physical pendulum, the four-bar loop equation, statics, free fall,
 * rolling, contact geometry. No expected number is read back from a simulation.
 *
 * Every fixture is a real build: test/bw-sim-models-solid.test.mjs walks
 * test/fixtures/bw-sim/ and checks each one (colliders and LDraw meshes do not
 * interpenetrate, no pin overreaches, no two pins share a hole); the first test here checks
 * that each is connected (no loose part, except the drop test's loose parts by design) and
 * compiles without diagnostics.
 *
 * A machine the simulation gets wrong is a `todo` test that states the expected value, the
 * measured one and the diagnosis; docs/ROBOT-LAB-VALIDATION.md is the table of all of them.
 * Where a todo's cause is isolated, a control test runs the same machine with that one cause
 * removed (a collision pair switched off) and passes: the control proves the diagnosis.
 *
 * Benches: like test/bw-sim-gear-trains.test.mjs, a machine "on the bench" has its frame
 * clamped — the body that carries the frame is made static (the vice), so its parts are
 * the fixed frame of the machine.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {LDU_M, PART_FRICTION, MATERIALS, pitchRadiusLdu} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {SimHubBridge, STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';

const J = await loadJolt();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(GUI, 'src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const MACHINES = path.join(ROOT, 'test/fixtures/bw-sim/machines');
const STEP_HZ = 1000 / STEP_MS; // 200 Hz, the app's step
const DT = 1 / STEP_HZ;
const G = 9.81;
const DEG = 180 / Math.PI;

const ldr = file => parseModel(readFileSync(file, 'utf8'), {catalog: CATALOG}).model;
const machine = name => ldr(path.join(MACHINES, name));
const shipped = name => ldr(path.join(GUI, MODELS_BASE, name));
const meta = part => CATALOG.get(part);
const bodyOf = (mech, partId) => mech.bodies.find(b => b.parts.includes(partId));
/** The (only) motorised hinge. */
const motorJoint = mech => {
    const motors = mech.joints.filter(j => j.motor);
    assert.equal(motors.length, 1, 'one motor');
    return motors[0];
};
/** Clamp a body to the bench: static, part of the machine's fixed frame. */
const clamp = (mech, bodyId) => {
    const b = mech.bodies.find(x => x.id === bodyId);
    b.motion = 'static';
    b.massKg = 0;
    return b.id;
};
const run = (core, seconds, each) => {
    for (let i = 0; i < Math.round(seconds * STEP_HZ); i++) {
        core.step(DT);
        if (each) each(i);
    }
};
/** A core with a SPIKE hub on `hubBody` (its motors driven by the DC model, as in the app). */
const withHub = (mech, hubBody) => {
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    const hub = new VirtualSpikeHubState();
    const bridge = new SimHubBridge({hubState: hub, core, mechanism: mech, hubBody});
    return {core, hub, bridge, dispose: () => { bridge.dispose(); core.destroy(); }};
};
/** Advance the hub's world in STEP_MS steps for `ms`, letting the hub's promises settle every 50 ms. */
const tick = async (bridge, ms, each) => {
    for (let t = 0; t < ms; t += STEP_MS) {
        bridge.tick(STEP_MS);
        if (each) each(t);
        if (t % 50 === 0) await new Promise(resolve => setImmediate(resolve));
    }
};
const relErr = (a, e) => Math.abs(a - e) / Math.abs(e);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** Rotate v by the unit quaternion [x, y, z, w]. */
const qrot = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};
/** Rotation of a body about world +y since t = 0 (counter-clockwise seen from above positive), rad. */
const yawOf = q => {
    const v = qrot(q, [1, 0, 0]);
    return Math.atan2(-v[2], v[0]);
};
/** A part's catalog box collider, half extents along the WORLD axes for its placed rotation (LDU). */
const worldHalfExtents = (placed, collider) => [0, 1, 2].map(i => [0, 1, 2].reduce((s, k) =>
    s + Math.abs(placed.rotation[i * 3 + k]) * collider.halfExtents[k], 0));

// ---------------------------------------------------------------------------------------------
test('the validation machines are real, connected builds that compile cleanly', () => {
    const names = readdirSync(MACHINES).filter(f => f.endsWith('.ldr')).sort();
    assert.ok(names.length >= 11, names.join(', '));
    for (const name of names) {
        const model = machine(name);
        for (const p of model.parts) assert.deepEqual(solidOverlaps(model, CATALOG, p), [], `${name}: ${p.id}`);
        const mech = compile(model, CATALOG, {version: 2});
        const diags = mech.diagnostics.map(d => d.code);
        // The drop test's brick and beams are loose by design (nothing holds a falling part).
        if (name === 'drop-on-beams.ldr') assert.deepEqual(diags, ['loose-part', 'loose-part'], name);
        else assert.deepEqual(diags, [], `${name}: ${JSON.stringify(mech.diagnostics)}`);
    }
});

// ---- 1. gear trains ------------------------------------------------------------------------
/**
 * Expected output/input of a gear train, derived from the tooth counts and the compiled hinge
 * axes only. An external mesh of parallel axes turns the driven gear the other way at
 * N_driver/N_driven: ω_out = −(N1/N2)·ω_in as world vectors. A hinge angle θ measures body2
 * about the joint axis a relative to body1, the frame here, so a gear's world rate along a is
 * s·θ̇ with s = +1 if the gear is body2, −1 if body1. Hence
 *   θ̇_out/θ̇_in = Π(−N_driver/N_driven) · s_in·s_out · (a_in·a_out).
 */
const trainRatio = (meshes, jIn, jOut, bodyIn, bodyOut) => {
    const s = (j, b) => (j.body2 === b ? 1 : -1);
    const dot = jIn.axis.reduce((acc, v, i) => acc + v * jOut.axis[i], 0);
    return meshes.reduce((r, [n1, n2]) => r * (-n1 / n2), 1) * s(jIn, bodyIn) * s(jOut, bodyOut) * dot;
};
const teeth = part => meta(part).gear.teeth;

const GEAR_TRAINS = [
    // [fixture, [[driver part, driven part] per mesh], output part, label]
    ['gears-compound-8-24-8-40.ldr', [['3647.dat', '3648.dat'], ['3647.dat', '3649.dat']], 'gOut', '8:24 · 8:40 compound'],
    ['gears-24-8.ldr', [['3648.dat', '3647.dat']], 'gOut', '24:8 speed-up'],
    ['gears-idler-24-24-24.ldr', [['3648.dat', '3648.dat'], ['3648.dat', '3648.dat']], 'gOut', '24:24:24 idler'],
];

for (const [file, meshes, outPart, label] of GEAR_TRAINS) {
    test(`gear train ${label}: output angle / motor angle over 2.5 s at 300 °/s matches the tooth counts`, async t => {
        // Tolerance 1 %: the gear constraint is exact kinematics; what remains is the solver's
        // residual (30 velocity iterations in gear islands) — the existing trains run at < 0.1 %.
        const mech = compile(machine(file), CATALOG, {version: 2, ground: false});
        const mj = motorJoint(mech);
        const housing = clamp(mech, mj.body1);
        const outBody = bodyOf(mech, outPart).id;
        const oj = mech.joints.find(j => j.type === 'hinge' && (j.body1 === outBody || j.body2 === outBody));
        const expected = trainRatio(meshes.map(([a, b]) => [teeth(a), teeth(b)]), mj, oj, mj.body2, outBody);
        const {core, hub, bridge, dispose} = withHub(mech, housing);
        const m0 = core.jointState(mj.id).angle;
        const o0 = core.jointState(oj.id).angle;
        hub.motors.runAtSpeed('A', 300);
        await tick(bridge, 2500);
        const dm = core.jointState(mj.id).angle - m0;
        const ratio = (core.jointState(oj.id).angle - o0) / dm;
        dispose();
        t.diagnostic(`motor ${(dm * DEG).toFixed(1)}°, output/motor ${ratio.toFixed(5)} vs ${expected.toFixed(5)} (error ${(relErr(ratio, expected) * 100).toFixed(3)} %)`);
        assert.ok(Math.abs(dm * DEG) > 600, `the motor turned ${dm * DEG}°`);
        assert.ok(relErr(ratio, expected) <= 0.01, `output/motor ${ratio} vs ${expected}`);
    });
}

// ---- 2. worm self-lock vs spur back-drive -------------------------------------------------------
test('worm self-lock: a loaded arm on a worm-driven 24T holds; the same arm on an 8:24 spur pair back-drives the motor', t => {
    // Closed form: a worm is self-locking when its lead angle λ is below the friction angle,
    // tan λ < μ. A single-start worm advances one tooth pitch π·m per turn on its pitch circle
    // 2π·r_w: tan λ = m / (2·r_w). Module m from the catalog's pitch radius rule (r = 1.25 LDU per
    // tooth, contracts.js pitchRadiusLdu: m = 2.5 LDU), r_w from the worm's connector (10 LDU);
    // μ = PART_FRICTION (ABS on ABS, 0.4). Spur gears have no such lock: their arm falls.
    const wormMeta = meta('4716.dat').connectors.find(c => c.type === 'worm').data;
    const module = 2 * pitchRadiusLdu(1);
    const tanLead = module / (2 * wormMeta.pitchRadiusLdu) / wormMeta.starts;
    assert.ok(tanLead < PART_FRICTION, `tan λ = ${tanLead} vs μ = ${PART_FRICTION}`);
    const coast = file => {
        const mech = compile(machine(file), CATALOG, {version: 2, ground: false});
        const mj = motorJoint(mech);
        clamp(mech, mj.body1);
        const arm = bodyOf(mech, 'arm').id;
        const aj = mech.joints.find(j => j.type === 'hinge' && (j.body1 === arm || j.body2 === arm));
        const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
        // The motor coasts with its gearbox drag off: only the gears can hold the load (as in
        // test/bw-sim-worm.test.mjs: the motor's 18 mN·m drag alone would hold this light arm).
        core.setMotor(mj.id, {mode: 'coast', frictionNm: 0});
        const a0 = core.jointState(aj.id).angle;
        const m0 = core.jointState(mj.id).angle;
        run(core, 3);
        const r = {arm: (core.jointState(aj.id).angle - a0) * DEG, motor: (core.jointState(mj.id).angle - m0) * DEG};
        core.destroy();
        return r;
    };
    const worm = coast('load-worm-24.ldr');
    const spur = coast('load-spur-8-24.ldr');
    t.diagnostic(`tan λ ${tanLead.toFixed(3)} < μ ${PART_FRICTION}; worm: arm moved ${worm.arm.toFixed(4)}° in 3 s; ` +
        `spur: arm fell ${spur.arm.toFixed(2)}°, the motor back-driven ${spur.motor.toFixed(2)}° (ratio ${(spur.motor / spur.arm).toFixed(3)})`);
    assert.ok(Math.abs(worm.arm) <= 0.5, `the worm-held arm moved ${worm.arm}°`);
    assert.ok(Math.abs(spur.arm) > 30, `the spur-held arm moved only ${spur.arm}°`);
    // Back-driven through the mesh at the mesh's own ratio: the 8T turns 24/8 = 3 times as far, the other way.
    assert.ok(Math.abs(spur.motor / spur.arm + 3) <= 0.03, `motor/arm ${spur.motor / spur.arm} vs −3`);
});

// ---- 3. rack and pinion -------------------------------------------------------------------------
test('rack and pinion (the Forklift\'s mast on the bench): travel = pitch radius × pinion angle', async t => {
    // The shipped forklift.ldr: an 8T on the medium motor (port C) meshes with the 1 × 13 rack
    // of the carriage, which slides on the mast. The hub's body (the frame: hub, mast, motor
    // housing) is clamped. Expected travel per pinion radian = r = m·z/2 = 2.5 LDU·8/2 = 10 LDU
    // = 4 mm, i.e. π·d = 25.13 mm per turn, upwards for a positive turn (the Forklift program
    // raises with "clockwise"). Tolerance 0.5 %: the rack-and-pinion constraint is exact
    // kinematics; the carriage's weight loads it.
    const mech = compile(shipped('forklift.ldr'), CATALOG, {version: 2, ground: false});
    const frame = clamp(mech, bodyOf(mech, 'hub').id);
    const mj = motorJoint(mech);
    const rack = bodyOf(mech, 'rack').id;
    const {core, hub, bridge, dispose} = withHub(mech, frame);
    const y0 = core.bodyPose(rack).position[1];
    const a0 = core.jointState(mj.id).angle;
    let done = false;
    hub.motors.runForDegrees('C', 540, 200).then(() => { done = true; });
    for (let ms = 0; ms < 6000 && !done; ms += 50) await tick(bridge, 50);
    await tick(bridge, 300);
    const turned = core.jointState(mj.id).angle - a0;
    const lift = core.bodyPose(rack).position[1] - y0;
    dispose();
    const expected = pitchRadiusLdu(meta('3647.dat').gear.teeth) * LDU_M * Math.abs(turned);
    t.diagnostic(`pinion ${(turned * DEG).toFixed(2)}°, rack rose ${(lift * 1000).toFixed(3)} mm vs r·θ ${(expected * 1000).toFixed(3)} mm ` +
        `(${(expected / Math.abs(turned) * 2 * Math.PI * 1000).toFixed(2)} mm per turn)`);
    assert.equal(done, true, 'run_for_degrees completed');
    assert.ok(lift > 0, 'a positive turn raises the carriage');
    assert.ok(relErr(lift, expected) <= 0.005, `rose ${lift} m vs ${expected} m`);
});

// ---- 4. physical pendulum -----------------------------------------------------------------------
/**
 * The pendulum's closed form uses the catalog's complete compound collision shape.
 * Jolt distributes the part mass by collider volume, including overlapping
 * primitives. Sum each primitive's independent inertia and parallel-axis term.
 * The rounded beam has a central box and two circular end caps; using only
 * its first box omits the mass and inertia of both ends.
 * d = 60 LDU from the pivot hole: I = I_cm + m·d². (The pin turns on its own about the same axis
 * and adds nothing.) Small-amplitude ω0 = √(m·g·d/I); at amplitude A the exact period is
 * T(A) = 4·K(sin(A/2))/ω0 (complete elliptic integral of the first kind, by the AGM).
 */
const PENDULUM = (() => {
    const beam = meta('32524.dat');
    const m = beam.massGrams / 1000;
    const primitives = beam.colliders.map(c => {
        assert.equal(c.rotation, undefined, 'this analytical fixture has Y-aligned primitives');
        const [x,,z] = (c.position || [0,0,0]).map(v => v * LDU_M);
        if (c.shape === 'box') {
            const [hx,hy,hz] = c.halfExtents.map(v => v * LDU_M);
            return {volume: 8*hx*hy*hz, inertiaPerMass: ((2*hx)**2+(2*hz)**2)/12+x*x+z*z};
        }
        assert.equal(c.shape, 'cylinder');
        const radius = c.radius * LDU_M, height = 2 * c.halfHeight * LDU_M;
        return {volume: Math.PI*radius*radius*height, inertiaPerMass: radius*radius/2+x*x+z*z};
    });
    const volume = primitives.reduce((sum,p) => sum+p.volume,0);
    const d = 60 * LDU_M;
    const I = m * primitives.reduce((sum,p) => sum+p.volume/volume*p.inertiaPerMass,0) + m*d*d;
    const w0 = Math.sqrt(m * G * d / I);
    const K = k => {
        let a = 1;
        let b = Math.sqrt(1 - k * k);
        for (let i = 0; i < 30; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
        return Math.PI / (2 * a);
    };
    return {T: A => 4 * K(Math.sin(A / 2)) / w0, T0: 2 * Math.PI / w0, A0: Math.asin(0.6)};
})();

/** Swing the pendulum fixture 3 s; half-periods (zero crossings, interpolated) and the amplitude of each half swing. */
const swingPendulum = ({separateStand}) => {
    const mech = compile(machine('pendulum.ldr'), CATALOG, {version: 2, ground: false});
    const stand = clamp(mech, bodyOf(mech, 'stand').id);
    const bob = bodyOf(mech, 'bob').id;
    // The control: the swinging beam and the stand do not collide (they only touch face to face).
    if (separateStand) mech.noCollide.push([bob, stand].sort());
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    // The pivot is the LDraw origin (world origin); hanging straight down is world −y.
    const angle = () => {
        const p = core.bodyPose(bob).position;
        return Math.atan2(p[0], -p[1]);
    };
    const crossings = [];
    const peaks = [];
    let prev = angle();
    let peak = Math.abs(prev);
    let t = 0;
    run(core, 3, () => {
        t += DT;
        const a = angle();
        peak = Math.max(peak, Math.abs(a));
        if (Math.sign(a) !== Math.sign(prev)) {
            crossings.push(t - (a / (a - prev)) * DT);
            peaks.push(peak);
            peak = 0;
        }
        prev = a;
    });
    core.destroy();
    peaks.push(peak);
    // Half swing i runs from crossing i−1 to crossing i; its amplitude is the peak reached in it.
    const halves = crossings.slice(1).map((c, i) => ({T: 2 * (c - crossings[i]), A: peaks[i + 1]}));
    return {halves, release: PENDULUM.A0, firstPeak: peaks[1], fullPeriodPeak: peaks[2]};
};

test('pendulum control (the stand–beam contact switched off): period = 2π√(I/mgd) at each swing\'s amplitude', t => {
    // Tolerance 2 % on the period: Jolt's step (symplectic Euler with a velocity-level hinge) at
    // 200 Hz, ω0·dt = 0.08 — the same machine at 1 kHz is within 0.1 % (measured), so the
    // remainder is step size. Amplitude kept over one full period ≥ 90 %: the same step's
    // numerical dissipation (≈ 3 % per swing at 200 Hz, 0.5 % at 1 kHz, measured).
    const r = swingPendulum({separateStand: true});
    const errs = r.halves.map(h => h.T / PENDULUM.T(h.A) - 1);
    const kept = r.fullPeriodPeak / r.release;
    t.diagnostic(`T0 ${PENDULUM.T0.toFixed(4)} s; half swings: ${r.halves.slice(0, 4).map(h => `T ${h.T.toFixed(4)} at ${(h.A * DEG).toFixed(1)}° ` +
        `vs ${PENDULUM.T(h.A).toFixed(4)}`).join('; ')}; amplitude after one period ${(kept * 100).toFixed(1)} %`);
    assert.ok(r.halves.length >= 10, `${r.halves.length} half swings`);
    for (const e of errs) assert.ok(Math.abs(e) <= 0.02, `period error ${(e * 100).toFixed(2)} %`);
    assert.ok(kept >= 0.9, `amplitude kept ${kept}`);
});

test('pendulum as built: a beam on a frictionless pin swings with its period and loses little per swing', t => {
    // The swinging beam and the stand share the pin (not a joint): mech/collision-filter.js keeps bodies that
    // meet on one connector axis apart, so they no longer rub face to face (it took ~6° per half swing).
    const r = swingPendulum({separateStand: false});
    const kept = r.fullPeriodPeak / r.release;
    const errs = r.halves.map(h => h.T / PENDULUM.T(h.A) - 1);
    t.diagnostic(`amplitude ${(r.release * DEG).toFixed(1)}° → ${(r.firstPeak * DEG).toFixed(1)}° → ${(r.fullPeriodPeak * DEG).toFixed(1)}° ` +
        `(kept ${(kept * 100).toFixed(1)} % after one period); period errors ${errs.slice(0, 5).map(e => (e * 100).toFixed(1)).join(', ')} %`);
    assert.ok(kept >= 0.9, `amplitude kept ${kept} over one period`);
    for (const e of errs) assert.ok(Math.abs(e) <= 0.02, `period error ${(e * 100).toFixed(2)} %`);
});

// ---- 5. four-bar linkage ------------------------------------------------------------------------
/**
 * Crank-rocker a = 40, b = 100, c = 60, d = 100 LDU (fixture header). In the LDraw x–z plane
 * with O = (0, 0) and D = (d, 0): B = a(cos θ, sin θ); C is where the circles |C−B| = b and
 * |C−D| = c meet, on the branch the build is assembled in (C starts at z < 0) — the loop
 * equation solved in closed form. The rocker angle φ = atan2(C_z, C_x − d).
 */
const FOUR_BAR = {a: 40, b: 100, c: 60, d: 100};
const rockerAngle = (theta, near) => {
    const {a, b, c, d} = FOUR_BAR;
    const B = [a * Math.cos(theta), a * Math.sin(theta)];
    const dx = d - B[0];
    const dz = -B[1];
    const L = Math.hypot(dx, dz);
    const along = (b * b - c * c + L * L) / (2 * L);
    const h = Math.sqrt(b * b - along * along);
    const e = [dx / L, dz / L];
    return [[B[0] + along * e[0] + h * e[1], B[1] + along * e[1] - h * e[0]], [B[0] + along * e[0] - h * e[1], B[1] + along * e[1] + h * e[0]]]
        .map(C => Math.atan2(C[1], C[0] - d))
        .reduce((best, p) => (Math.abs(wrap(p - near)) < Math.abs(wrap(best - near)) ? p : best));
};

const runFourBar = async ({separateLinks}) => {
    const mech = compile(machine('four-bar-crank-rocker.ldr'), CATALOG, {version: 2, ground: false});
    const mj = motorJoint(mech);
    const housing = clamp(mech, mj.body1);
    const crank = bodyOf(mech, 'crank').id;
    const rocker = bodyOf(mech, 'rocker').id;
    if (separateLinks) {
        // The control: the linkage's bodies do not collide with each other (they lie in separate
        // layers and only touch face to face, so nothing else changes).
        const ids = mech.bodies.map(b => b.id).filter(id => id !== housing).sort();
        const have = new Set(mech.noCollide.map(pair => pair.join('|')));
        for (const [x, y] of ids.flatMap((x, i) => ids.slice(i + 1).map(y => [x, y]))) if (!have.has(`${x}|${y}`)) mech.noCollide.push([x, y]);
    }
    const {core, hub, bridge, dispose} = withHub(mech, housing);
    // Angles in the LDraw x–z plane (z_LDraw = −z_world): a rotation ψ about world +y turns the
    // LDraw-plane vector (cos, sin) by +ψ, so an LDraw-plane angle change is the world yaw change.
    const c0 = yawOf(core.bodyPose(crank).rotation);
    const r0 = yawOf(core.bodyPose(rocker).rotation);
    const phi0 = rockerAngle(0, -Math.PI / 2);
    let predicted = phi0;
    let worst = {err: 0};
    let span = [Infinity, -Infinity];
    hub.motors.runAtSpeed('A', 180);
    // Two crank turns (4 s); the first 0.1 s (the motor spinning up) is left out.
    await tick(bridge, 4100, ms => {
        const theta = wrap(yawOf(core.bodyPose(crank).rotation) - c0);
        const phi = phi0 + wrap(yawOf(core.bodyPose(rocker).rotation) - r0);
        predicted = rockerAngle(theta, predicted);
        span = [Math.min(span[0], phi), Math.max(span[1], phi)];
        const err = Math.abs(wrap(phi - predicted)) * DEG;
        if (ms >= 100 && err > worst.err) worst = {err, theta: theta * DEG, phi: phi * DEG, predicted: predicted * DEG};
    });
    dispose();
    return {worst, span: span.map(v => v * DEG)};
};

test('four-bar control (links do not touch each other): rocker angle = the loop equation\'s, within 1.5°', async t => {
    // 1.5°: the hinge chain's compliance (two light pins and an axle between the beams) and the
    // 200 Hz step. The rocker swings ~86° (−146° … −60°), so 1.5° is under 2 %; measured 1.2°, at a
    // limit of the rocker's swing, where it reverses (0.7° at 60 °/s).
    const r = await runFourBar({separateLinks: true});
    t.diagnostic(`rocker swept ${r.span[0].toFixed(1)}° … ${r.span[1].toFixed(1)}°; worst error ${r.worst.err.toFixed(2)}° ` +
        `(crank ${r.worst.theta?.toFixed(1)}°: rocker ${r.worst.phi?.toFixed(2)}° vs ${r.worst.predicted?.toFixed(2)}°)`);
    assert.ok(r.span[1] - r.span[0] > 80, `the rocker swept only ${r.span[1] - r.span[0]}°`);
    assert.ok(r.worst.err <= 1.5, `rocker off by ${r.worst.err}°`);
});

test('four-bar as built: rocker angle = the loop equation\'s, within 1.5°', async t => {
    // Neighbouring links share a pin: they no longer rub (mech/collision-filter.js); they were 3.0° off.
    const r = await runFourBar({separateLinks: false});
    t.diagnostic(`worst error ${r.worst.err.toFixed(2)}° (crank ${r.worst.theta?.toFixed(1)}°: rocker ${r.worst.phi?.toFixed(2)}° vs ${r.worst.predicted?.toFixed(2)}°)`);
    assert.ok(r.worst.err <= 1.5, `rocker off by ${r.worst.err}°`);
});

// ---- 6. lever / balance -------------------------------------------------------------------------
/** The balance fixtures on the bench (the stand clamped): the lever's body, its tilt off the pin axis and its angle. */
const balance = file => {
    const mech = compile(machine(file), CATALOG, {version: 2, ground: false});
    clamp(mech, bodyOf(mech, 'stand').id);
    const lever = bodyOf(mech, 'lever').id;
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    const q = () => core.bodyPose(lever).rotation;
    // Lever angle about the pin (world z; positive = the +x arm rises) and the tilt of the lever's own pin axis.
    const angle = () => {
        const v = qrot(q(), [1, 0, 0]);
        return Math.atan2(v[1], v[0]) * DEG;
    };
    const tilt = () => Math.acos(Math.min(1, Math.abs(qrot(q(), [0, 0, 1])[2]))) * DEG;
    return {mech, core, lever, angle, tilt};
};

test('balance, equal masses at equal arms: the lever stays level', t => {
    // Statics: Σ m·g·x = 0 about the pivot — the arms are mirror images. The pin is frictionless,
    // so nothing but symmetry holds it; 0.5° over 2 s allows the solver's rounding.
    const {core, angle, tilt} = balance('balance-equal.ldr');
    let worst = 0;
    let droop = 0;
    run(core, 2, () => { worst = Math.max(worst, Math.abs(angle())); droop = Math.max(droop, tilt()); });
    core.destroy();
    t.diagnostic(`largest lever angle ${worst.toFixed(4)}°; the pin axis drooped up to ${droop.toFixed(2)}°`);
    assert.ok(worst <= 0.5, `the lever turned ${worst}°`);
});

test('balance, equal masses: the lever stays on its pin\'s axis (no droop)', t => {
    // The frictionless pin was its own 0.25 g body between two hinges and the 9 g lever drooped 17.8° through
    // it; a free spinner is now welded to a neighbour (mech/free-pins.js): one hinge.
    // A real pin in two beam holes keeps the lever square to it: ≤ 1° (hole clearance).
    const {core, tilt} = balance('balance-equal.ldr');
    let droop = 0;
    run(core, 2, () => { droop = Math.max(droop, tilt()); });
    core.destroy();
    t.diagnostic(`the pin axis drooped up to ${droop.toFixed(2)}°`);
    assert.ok(droop <= 1, `drooped ${droop}°`);
});

/**
 * The unequal balance's expected start, by hand: each part's catalog mass spread uniformly over its
 * own colliders (so a part's mass sits at its colliders' centroid). Torque about the pin (world z
 * through the origin) τ = −Σ m_i·g·x_i (world x, y up: a weight at +x turns the lever clockwise
 * seen from +z, i.e. negative), moment of inertia I_z = Σ m_i[(w_x² + w_y²)/3 + x_i² + y_i²] over
 * each collider's rotated principal inertia (boxes, cylinders and spheres). α0 = τ / I_z. For the diagnosis, the same
 * with every collider at ONE density (what Jolt does when a body's colliders become one shape).
 */
const leverStart = model => {
    const fixed = new Set(['stand', 'pivot']);
    const items = [];
    for (const p of model.parts.filter(q => !fixed.has(q.id))) {
        const m = meta(p.part);
        const shapes = m.colliders.map(c => {
            const centre = [0, 1, 2].map(i => [0, 1, 2].reduce((s, k) => s + p.rotation[i * 3 + k] * (c.position || [0, 0, 0])[k], 0) + p.position[i]);
            // Independent principal inertias per unit mass, including the rounded
            // cylinder ends in the measured liftarm catalogue.
            let volume, principal;
            if (c.shape === 'box') {
                const [x,y,z] = c.halfExtents;
                volume = 8*x*y*z;
                principal = [(y*y+z*z)/3,(x*x+z*z)/3,(x*x+y*y)/3];
            } else if (c.shape === 'cylinder') {
                const r2=c.radius**2,h2=c.halfHeight**2;
                volume=2*Math.PI*r2*c.halfHeight;
                principal=[r2/4+h2/3,r2/2,r2/4+h2/3];
            } else if (c.shape === 'sphere') {
                volume=4*Math.PI*c.radius**3/3;
                principal=Array(3).fill(2*c.radius**2/5);
            } else throw Error(`unsupported analytical shape ${c.shape}`);
            // Rotate world z into the collider's principal frame. A reflection
            // of LDraw y has no effect on the squared components of I_z.
            const zPart=p.rotation.slice(6,9);
            const q=c.rotation || [0,0,0,1];
            const axis=qrot([-q[0],-q[1],-q[2],q[3]],zPart);
            const inertiaZ=principal.reduce((v,x,i)=>v+x*axis[i]**2,0)*LDU_M**2;
            const world = [centre[0] * LDU_M, -centre[1] * LDU_M];
            return {inertiaZ, world, volume};
        });
        const vol = shapes.reduce((s, b) => s + b.volume, 0);
        for (const b of shapes) items.push({...b, mass: m.massGrams / 1000 * b.volume / vol});
    }
    const moments = weight => {
        const tau = -items.reduce((s, b) => s + weight(b) * G * b.world[0], 0);
        const I = items.reduce((s, b) => s + weight(b) * (b.inertiaZ + b.world[0] ** 2 + b.world[1] ** 2), 0);
        return tau / I;
    };
    const total = items.reduce((s, b) => s + b.mass, 0);
    const volume = items.reduce((s, b) => s + b.volume, 0);
    return {alpha: moments(b => b.mass), alphaOneDensity: moments(b => total * b.volume / volume)};
};

test('balance, unequal: the heavier arm (three beams, 9 g) goes down against the bulkier lighter one (sensor, 8 g)', t => {
    // Each collider carries its share of its part's mass (mech/islands.js) and jolt-core.js gives each
    // sub-shape that density: the body's centre of mass and inertia are the parts', not the colliders' volume's.
    const {core, lever, angle} = balance('balance-unequal.ldr');
    const {alpha, alphaOneDensity} = leverStart(machine('balance-unequal.ldr'));
    // Over the first 0.05 s the angle is ½·α0·t² (t small: the lever turns < 2°).
    const t1 = 0.05;
    run(core, t1);
    const measured = 2 * (angle() / DEG) / (t1 * t1);
    const w = core.bodyAngularVelocity(lever);
    core.destroy();
    t.diagnostic(`α0 by part masses ${alpha.toFixed(2)} rad/s² (negative: the beams' side goes down); one density over all ` +
        `colliders would give ${alphaOneDensity.toFixed(2)}; measured ${measured.toFixed(2)} rad/s², ω ${w.map(v => v.toFixed(2)).join(', ')}`);
    assert.ok(alpha < 0 && alphaOneDensity > 0, 'the two mass models disagree on the direction (the machine is built to tell them apart)');
    assert.ok(measured < 0, `the lever turned the sensor's way (${measured} rad/s²)`);
    assert.ok(relErr(measured, alpha) <= 0.15, `α ${measured} vs ${alpha}`);
});

// ---- 7. free fall and drop ----------------------------------------------------------------------
/** The drop fixture with the brick's bottom `h` metres above the beams' tops. */
const dropFrom = h => {
    const model = machine('drop-on-beams.ldr');
    // In the fixture the brick's bottom (LDraw y = position + 24) is 125 LDU above the beams' tops (y −10).
    const brick = model.parts.find(p => p.id === 'brick');
    brick.position = [brick.position[0], -10 - 24 - h / LDU_M, brick.position[2]];
    const mech = compile(model, CATALOG, {version: 2});
    const body = bodyOf(mech, 'brick').id;
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    const y0 = core.bodyPose(body).position[1];
    return {core, body, y0};
};

test('free fall: a dropped brick accelerates at g', t => {
    // v(t) = g·t before it lands (20 cm: lands at √(2h/g) = 0.20 s; measured at 0.15 s).
    // Tolerance 0.5 %: the only other force is Jolt's default linear damping, 0.05 s⁻¹ (jolt-core
    // does not set it), which slows the brick by c·t/2 = 0.4 % at 0.15 s — no real air drag.
    const {core, body} = dropFrom(0.2);
    run(core, 0.15);
    const v = -core.bodyLinearVelocity(body)[1];
    core.destroy();
    t.diagnostic(`v(0.15 s) ${v.toFixed(4)} m/s vs g·t ${(G * 0.15).toFixed(4)} (error ${((v / (G * 0.15) - 1) * 100).toFixed(2)} %)`);
    assert.ok(relErr(v, G * 0.15) <= 0.005, `v ${v}`);
});

for (const h of [0.05, 0.2]) {
    test(`drop from ${h * 100} cm: the brick stops on the beams`, t => {
        // It comes to rest with its bottom on the beams' tops: it fell exactly h. ±1 mm: contact
        // slop (0.2 mm) and the brick settling on the beams' rounded edges.
        const {core, body, y0} = dropFrom(h);
        let lowest = y0;
        run(core, 2, () => { lowest = Math.min(lowest, core.bodyPose(body).position[1]); });
        const fell = y0 - core.bodyPose(body).position[1];
        core.destroy();
        t.diagnostic(`fell ${(fell * 1000).toFixed(2)} mm (expected ${h * 1000}), deepest ${((y0 - lowest - h) * 1000).toFixed(2)} mm below the beams' tops`);
        assert.ok(Math.abs(fell - h) <= 0.001, `fell ${fell} m`);
    });
}

test('drop from 50 cm and 1 m: the brick does not tunnel through the 8 mm beams, and its first bounce is straight', t => {
    // At 3–4.4 m/s the brick moves 16–22 mm per 5 ms step, more than the beams are thick: only continuous
    // collision (jolt-core.js: every dynamic body is EMotionQuality_LinearCast) stops it on them. Since the
    // materials (2026-10-20, ABS e 0.4) it also bounces: it leaves the beams at e·v, straight up (the Jolt fork's
    // 1.1.0-bw.3 hands a bounce across two bodies to the discrete solve; 1.1.0-bw.2 turned it over), and comes down
    // again. Not through them: its origin never sinks more than 4 mm (half a beam) below where it rests flat on
    // them, and it ends on them. Where it ends is not asserted: the discrete solve leaves the first bounce with a
    // little spin (Jolt's sequential impulses resolve a flat multi-point bounce non-uniquely, 0.1–0.3 rad/s), so the
    // second landing is a few degrees off flat and may leave it leaning on a beam edge (measured 34° and 40°).
    const out = [];
    for (const h of [0.5, 1]) {
        const {core, body, y0} = dropFrom(h);
        let lowest = y0;
        let prevV = 0;
        let bounce = null;
        let spin = 0;
        let apexTilt = null;
        run(core, 2, () => {
            const p = core.bodyPose(body);
            const v = core.bodyLinearVelocity(body)[1];
            lowest = Math.min(lowest, p.position[1]);
            if (bounce === null && v > 0) bounce = v / -prevV;
            else if (bounce !== null && apexTilt === null) {
                spin = Math.max(spin, Math.hypot(...core.bodyAngularVelocity(body)));
                if (v <= 0) apexTilt = 2 * Math.acos(Math.min(1, Math.abs(p.rotation[3]))) * DEG;
            }
            prevV = v;
        });
        const end = y0 - core.bodyPose(body).position[1];
        out.push({h, deepest: y0 - lowest - h, end: end - h, bounce, spin, apexTilt});
        core.destroy();
    }
    t.diagnostic(out.map(o => `${o.h} m: first bounce ${o.bounce.toFixed(3)} (e ${MATERIALS.abs.restitution}), spin ${o.spin.toFixed(2)} rad/s, ` +
        `tilt at its top ${o.apexTilt.toFixed(2)}°; deepest ${(o.deepest * 1000).toFixed(1)} mm, at rest ${(o.end * 1000).toFixed(1)} mm below flat on the beams`).join('; '));
    for (const o of out) {
        assert.ok(o.deepest <= 0.004 && o.end <= 0.004, `from ${o.h} m it sank ${o.deepest} m (rests ${o.end} m) below flat on the beams`);
        assert.ok(Math.abs(o.bounce / MATERIALS.abs.restitution - 1) <= 0.05, `from ${o.h} m its first bounce is ${o.bounce}`);
        assert.ok(o.spin < 0.5 && o.apexTilt < 5, `from ${o.h} m it left spinning ${o.spin} rad/s, ${o.apexTilt}° at its top`);
    }
});

// ---- 8. driving base ----------------------------------------------------------------------------
/**
 * The shipped driving base (static/sim-lab/models/driving-base.ldr): SPIKE wheels 39367p01, catalog
 * collider radius 70 LDU → d = 56 mm; wheel centres at x = ±170 LDU → track = 340 LDU = 136 mm.
 * Both wheels rolling without slip: distance = (θ_A + θ_B)/2 · d/2 for a drive; for a spin in
 * place the wheels run round a circle of diameter = track, so yaw = θ_wheel · d / track.
 * The wheel angles are the motors' encoder readings (the input), not the result. Tolerance 1 %:
 * tyre creep under the castor's drag.
 */
const DRIVE = (() => {
    const model = shipped('driving-base.ldr');
    const wheel = meta('39367p01.dat').colliders[0];
    const xs = model.parts.filter(p => p.part === '39367p01.dat').map(p => p.position[0]);
    return {d: 2 * wheel.radius * LDU_M, track: (Math.max(...xs) - Math.min(...xs)) * LDU_M, model};
})();

const driveBase = async (degA, degB, {obstacles, seconds = 8} = {}) => {
    const mech = compile(DRIVE.model, CATALOG, {version: 2, ...(obstacles ? {obstacles} : {})});
    const hubBody = bodyOf(mech, 'hub').id;
    const {core, hub, bridge, dispose} = withHub(mech, hubBody);
    const p0 = core.bodyPose(hubBody);
    let yaw = 0;
    let prev = yawOf(p0.rotation);
    let done = 0;
    hub.motors.runForDegrees('A', Math.abs(degA), 300 * Math.sign(degA)).then(() => done++);
    hub.motors.runForDegrees('B', Math.abs(degB), 300 * Math.sign(degB)).then(() => done++);
    const follow = () => {
        const y = yawOf(core.bodyPose(hubBody).rotation);
        yaw += wrap(y - prev);
        prev = y;
    };
    for (let ms = 0; ms < seconds * 1000 && done < 2; ms += 50) await tick(bridge, 50, follow);
    await tick(bridge, 500, follow);
    const p1 = core.bodyPose(hubBody);
    const r = {posA: hub.data.motors[0].position, posB: hub.data.motors[1].position, yaw: yaw * DEG,
        moved: Math.hypot(p1.position[0] - p0.position[0], p1.position[2] - p0.position[2]), dz: p1.position[2] - p0.position[2]};
    dispose();
    return r;
};

test('driving base: two wheel turns forward travel π·d per turn', async t => {
    // SPIKE convention (test/bw-sim-s1-driving-base.test.mjs): A negative and B positive is forward.
    const r = await driveBase(-720, 720);
    const expected = (Math.abs(r.posA) + Math.abs(r.posB)) / 2 / 360 * Math.PI * DRIVE.d;
    t.diagnostic(`A ${r.posA.toFixed(1)}°, B ${r.posB.toFixed(1)}°: moved ${(r.moved * 1000).toFixed(2)} mm vs ${(expected * 1000).toFixed(2)} mm, yaw ${r.yaw.toFixed(3)}°`);
    assert.ok(relErr(r.moved, expected) <= 0.01, `moved ${r.moved} m vs ${expected}`);
    assert.ok(Math.abs(r.yaw) <= 1, `yawed ${r.yaw}°`);
});

test('driving base: spinning in place, yaw per wheel turn = 360° · d / track', async t => {
    // Both motors positive turns left (counter-clockwise seen from above: positive yaw here).
    const r = await driveBase(720, 720);
    const expected = (r.posA + r.posB) / 2 * DRIVE.d / DRIVE.track;
    t.diagnostic(`A ${r.posA.toFixed(1)}°, B ${r.posB.toFixed(1)}°: yaw ${r.yaw.toFixed(2)}° vs ${expected.toFixed(2)}° ` +
        `(d ${(DRIVE.d * 1000).toFixed(0)} mm, track ${(DRIVE.track * 1000).toFixed(0)} mm: ${(360 * DRIVE.d / DRIVE.track).toFixed(1)}° per wheel turn)`);
    assert.ok(r.yaw > 0, 'turned left');
    assert.ok(relErr(r.yaw, expected) <= 0.01, `yaw ${r.yaw}° vs ${expected}°`);
});

// ---- 9. collisions with the world ---------------------------------------------------------------
test('driving base into a wall: it stops at the wall and does not pass', async t => {
    // The robot's front is its colliders' most forward point (world −z is forward), computed from
    // the compiled colliders at t = 0; a 2 cm wall stands with its face 50 mm ahead. The hub's body
    // must travel the gap and no more: ±1 mm (contact slop 0.2 mm, tyre compliance).
    const mech0 = compile(DRIVE.model, CATALOG, {version: 2});
    let front = Infinity;
    for (const b of mech0.bodies.filter(x => x.motion === 'dynamic')) {
        for (const c of b.colliders) {
            const q = c.rotation || [0, 0, 0, 1];
            const p = c.position || [0, 0, 0];
            let pts = [];
            if (c.shape === 'box') for (let k = 0; k < 8; k++) pts.push(qrot(q, c.halfExtents.map((h, i) => ((k >> i) & 1 ? h : -h))));
            else if (c.shape === 'sphere') pts = [[0, 0, -c.radius]];
            else {
                const ax = qrot(q, [0, 1, 0]);
                for (let k = 0; k < 360; k++) {
                    const u = qrot(q, [Math.cos(k * Math.PI / 180), 0, Math.sin(k * Math.PI / 180)]);
                    for (const s of [-1, 1]) pts.push(u.map((v, i) => v * c.radius + ax[i] * c.halfHeight * s));
                }
            }
            for (const v of pts) front = Math.min(front, b.position[2] + p[2] + v[2]);
        }
    }
    const GAP = 0.05;
    const r = await driveBase(-1440, 1440, {obstacles: [{id: 'wall', shape: 'box', size: [0.4, 0.1, 0.02], position: [0, 0, front - GAP - 0.01]}], seconds: 3});
    t.diagnostic(`front at z ${front.toFixed(4)} m; the robot moved ${(-r.dz * 1000).toFixed(2)} mm towards a wall ${GAP * 1000} mm away`);
    assert.ok(Math.abs(-r.dz - GAP) <= 0.001, `moved ${-r.dz} m to a wall ${GAP} m away`);
});

// ---- 10./11. stall and self-collision -------------------------------------------------------
/**
 * First touch of the motor-arm-stop fixture's arm, by hand. The arm (beam 5, catalog box 18 × 138
 * … 9 × 49 half extents in x, z) turns about the motor's hinge axis through x = z = 0; the stop
 * (the post's top end, or the bench obstacle in its place) is the box x 30..50, LDraw z −29..−11
 * — world z 11..29 LDU (world z = −LDraw z). Turning by φ about the hinge axis a (world): the arm
 * rectangle's corners rotate by Rodrigues; the first φ (0.01° steps, in the commanded direction)
 * at which the two rectangles overlap (separating-axis test) is the first touch. A positive motor
 * command turns the hinge positively (the actuator's sign is +1).
 */
const firstTouch = (axis, direction) => {
    const [hx, , hz] = meta('32316.dat').colliders[0].halfExtents;
    const arm = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    const stop = [[30, 11], [50, 11], [50, 29], [30, 29]];
    // Rotation about axis a (unit, along world ±y) of a world (x, z) point: v cos φ + (a × v) sin φ.
    const rot = ([x, z], phi) => {
        const cross = [axis[1] * z - axis[2] * 0, axis[2] * x - axis[0] * z, axis[0] * 0 - axis[1] * x];
        return [x * Math.cos(phi) + cross[0] * Math.sin(phi), z * Math.cos(phi) + cross[2] * Math.sin(phi)];
    };
    const overlap = (P, Q) => [P, Q].every(poly => poly.every((p, i) => {
        const q = poly[(i + 1) % poly.length];
        const n = [q[1] - p[1], p[0] - q[0]];
        const proj = s => s.map(v => v[0] * n[0] + v[1] * n[1]);
        const a = proj(P);
        const b = proj(Q);
        return Math.max(...a) > Math.min(...b) && Math.max(...b) > Math.min(...a);
    }));
    for (let deg = 0; deg < 360; deg += 0.01) {
        const phi = direction * deg / DEG;
        if (overlap(arm.map(v => rot(v, phi)), stop)) return direction * deg;
    }
    return null;
};

const swingArm = async ({mode, direction}) => {
    const full = machine('motor-arm-stop.ldr');
    let mech;
    if (mode === 'obstacle') {
        // Stall bench: the arm alone on the clamped motor; a world obstacle where the post's top was.
        const model = {...full, parts: full.parts.filter(p => !p.id.startsWith('post'))};
        const L = LDU_M;
        mech = compile(model, CATALOG, {version: 2, ground: false,
            obstacles: [{id: 'stop', shape: 'box', size: [20 * L, 30 * L, 18 * L], position: [40 * L, 45 * L, 20 * L]}]});
    } else mech = compile(full, CATALOG, {version: 2, ground: false});
    const mj = motorJoint(mech);
    // Both on the bench: the housing (with the post, when it is there) clamped.
    const housing = clamp(mech, mj.body1);
    const {core, hub, bridge, dispose} = withHub(mech, housing);
    const a0 = core.jointState(mj.id).angle;
    hub.motors.runAtSpeed('A', 300 * direction);
    await tick(bridge, 3000);
    const r = {angle: (core.jointState(mj.id).angle - a0) * DEG, stalled: hub.data.motors[0].stalled, expected: firstTouch(mj.axis, direction)};
    dispose();
    return r;
};

test('stall: a motor arm driven into a fixed obstacle stops at first touch and the hub reports the stall', async t => {
    // With Jolt's default 10 velocity / 2 position iterations the DC motor pushed the arm through the block;
    // a motorised hinge's island now solves with 60 / 5 (jolt-core.js MOTOR_VELOCITY_STEPS).
    const out = [];
    for (const direction of [1, -1]) out.push(await swingArm({mode: 'obstacle', direction}));
    t.diagnostic(out.map(r => `first touch ${r.expected.toFixed(2)}°: arm at ${r.angle.toFixed(2)}°, stalled ${r.stalled}`).join('; '));
    for (const r of out) {
        assert.ok(Math.abs(r.angle - r.expected) <= 3, `arm at ${r.angle}° vs first touch ${r.expected}°`);
        assert.equal(r.stalled, true);
    }
});

test('self-collision: an arm turned into its own machine\'s frame (the post on the motor housing) is stopped', async t => {
    // The motor's hinge joins the housing body (with the post) and the output body (with the arm). The filter
    // between them is local (mech/collision-filter.js localNoCollide, jolt-core.js SimShapeFilter): only parts
    // seated together or kept apart by the turn are excluded; the arm and the post collide.
    const r = await swingArm({mode: 'frame', direction: 1});
    t.diagnostic(`first touch ${r.expected.toFixed(2)}°: arm at ${r.angle.toFixed(2)}° after 3 s, stalled ${r.stalled}`);
    assert.ok(Math.abs(r.angle - r.expected) <= 3, `arm at ${r.angle}° vs first touch ${r.expected}°`);
});
