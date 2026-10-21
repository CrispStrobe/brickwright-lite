// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Crane (static/sim-lab/models/crane.ldr, scripts/gen-crane-model.mjs): a SPIKE Prime hub standing on
 * the floor with a 28-tooth turntable slewed by an 8T on motor A, and a 15L boom luffed by a small linear
 * actuator that motor B turns 1:1 through 16T gears and 12T bevel gears. A hook (a 5L link and a Technic
 * brick 1 x 4) hangs from the boom tip on a frictionless pin, free to swing. Its example program
 * (static/sim-lab/programs/crane.bw) lifts the boom, swings a quarter turn, lets the hook down and swings back.
 *
 * Expectations are derived, never read back from what the code set:
 *   - the couplings' ratios from the parts: tooth counts (parts.json), the actuator's lead from LDraw's
 *     contracted/extended assemblies and the measured turns of a full stroke (as
 *     test/bw-sim-linear-actuator.test.mjs derives it);
 *   - how high the hook rises from the actuator's length change (the luff motor's own encoder × the lead):
 *     the boom turns about its pivot P by the angle that makes |C − B| that length (the law of cosines on
 *     the hinge points the compiler found: the actuator's pivot B, its eye on the boom C), and the hook's
 *     pin Q turns with it; the load hangs straight below Q, so it rises as Q does;
 *   - the slew from the slew motor's encoder × 8/28.
 * That it is a real build (no two solid parts overlap, no pin past its hole, every part connected) is
 * test/bw-sim-models-solid.test.mjs and test/bw-sim-models.test.mjs, which check every MODELS entry.
 * No winch yet: ropes are not on main (docs/ROBOT-LAB-ARCHITECTURE.md T1, M10).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS, MODELS_BASE, PROGRAMS_BASE, prepareModel, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {LDU_M} = await import(path.join(SIM, 'contracts.js'));
const {parseLDraw} = await import(path.join(SIM, 'ldraw/ldraw-geometry.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const ENTRY = MODELS.find(m => m.file === 'crane.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');
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
const teeth = (model, id) => CATALOG.get(model.parts.find(p => p.id === id).part).gear.teeth;
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

test('the Crane is a shipped example with its program, titled in English and German', () => {
    assert.ok(ENTRY, 'MODELS lists crane.ldr');
    assert.deepEqual(ENTRY.title, {en: 'Crane', de: 'Kran'});
    assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
    for (const port of 'AB') assert.match(PROGRAM, new RegExp(`run motor ${port} `), `the program drives ${port}`);
});

test('it compiles to a slew mesh of the tooth ratio, a luffing screw of the lead and a hook that swings free', () => {
    const {mechanism: m, model, issues} = prepared();
    assert.deepEqual(issues, []);
    assert.deepEqual(m.actuators.map(a => a.port).sort(), ['A', 'B']);
    const tt = m.couplings.find(c => c.parts && c.parts.includes('ttTop'));
    assert.deepEqual([...tt.parts].sort(), ['slewPinion', 'ttTop']);
    assert.ok(Math.abs(Math.abs(tt.ratio) - teeth(model, 'ttTop') / teeth(model, 'slewPinion')) < 1e-9, `turntable ratio ${tt.ratio}`);
    const screws = m.couplings.filter(c => c.kind === 'screw');
    assert.deepEqual(screws.map(c => c.parts[0]), ['luffLaSpindle']);
    assert.ok(Math.abs(Math.abs(screws[0].ratio) / (LEAD_M / (2 * Math.PI)) - 1) < 1e-4, `screw ${screws[0].ratio} m/rad`);
    // The actuator is turned 1:1 from its motor: two gear pairs of equal teeth (16T, and 12T bevels in the swinging actuator).
    const pairs = m.couplings.filter(c => (c.kind === 'gear' || c.kind === 'relativeGear') && c.parts.some(p => p.startsWith('luff')));
    assert.equal(pairs.length, 2);
    for (const c of pairs) assert.ok(Math.abs(Math.abs(c.ratio) - 1) < 1e-9, `${c.parts} ${c.ratio}`);
    // The hook: its own body (link and load), on a hinge to the boom with no motor and no friction.
    const hook = jointBetween(m, 'hookLink', 'boom');
    assert.equal(hook.type, 'hinge');
    assert.ok(!hook.motor && !hook.frictionNm && !hook.limits, JSON.stringify(hook));
    assert.equal(bodyOf(m, 'load'), bodyOf(m, 'hookLink'), 'the load is pinned to the link');
    assert.notEqual(bodyOf(m, 'hookLink'), bodyOf(m, 'boom'));
});

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the Robot Lab program run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab} = await import('./helpers/sim-lab-vm.mjs');
    const run = source => runOnSimLab(source, {modelText: MODEL_TEXT, mat: ENTRY.mat, timeLimitMs: 20000});

    /** Rotate v by the unit quaternion q = [x, y, z, w]. */
    const qrot = ([x, y, z, w], v) => {
        const ix = w * v[0] + y * v[2] - z * v[1];
        const iy = w * v[1] + z * v[0] - x * v[2];
        const iz = w * v[2] + x * v[1] - y * v[0];
        const iw = -x * v[0] - y * v[1] - z * v[2];
        return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
    };
    const yaw = q => 2 * Math.atan2(q[1], q[3]);

    /**
     * The run, measured. Phases from the motors' busy flags: before the lift, the lift (B), the slew (A),
     * the lowering (B), the slew back (A); each phase's end is the last frame before the next one starts
     * (the program's waits let the hook settle there).
     */
    const judge = result => {
        const {track, mechanism: m} = result;
        const luff = m.actuators.find(a => a.port === 'B').joint;
        const slew = m.actuators.find(a => a.port === 'A').joint;
        const load = bodyOf(m, 'load');
        const link = bodyOf(m, 'hookLink');
        const hub = bodyOf(m, 'hub');
        const ttJoint = jointBetween(m, 'ttTop', 'ttBottom').id;
        const hookJoint = jointBetween(m, 'hookLink', 'boom').id;
        // Phase boundaries: the frames where a port goes busy.
        const starts = [];
        for (let i = 1; i < track.length; i++) {
            for (const port of ['A', 'B']) if (track[i].busy[port] && !track[i - 1].busy[port]) starts.push({i, port});
        }
        const before = i => track[Math.max(0, i - 1)];
        const end = track.at(-1);
        const at = {start: before(starts[0]?.i ?? 1), lifted: before(starts[1]?.i ?? track.length), slewed: before(starts[2]?.i ?? track.length),
            lowered: before(starts[3]?.i ?? track.length), end};
        const height = p => p.bodies[load].position[1];
        // The hook link's lean from the vertical: how far its body's up axis has turned from the world's up (+y);
        // it is built hanging straight down.
        const up0 = qrot(track[0].bodies[link].rotation, [0, 1, 0]);
        assert.ok(up0[1] > Math.cos(0.5 / DEG), 'the hook starts hanging straight');
        const lean = p => Math.acos(Math.min(1, qrot(p.bodies[link].rotation, [0, 1, 0])[1])) * DEG;
        return {
            starts: starts.map(s => s.port).join(''),
            luffTurn: (at.lifted.joints[luff].angle - at.start.joints[luff].angle) * DEG,
            slewTurn: (at.slewed.joints[slew].angle - at.lifted.joints[slew].angle) * DEG,
            ttSlewed: (at.slewed.joints[ttJoint].angle - at.start.joints[ttJoint].angle) * DEG,
            ttEnd: (end.joints[ttJoint].angle - at.start.joints[ttJoint].angle) * DEG,
            rise: height(at.lifted) - height(at.start),
            // While B holds (the program's wait after the lift), the actuator's screw holds the boom.
            sink: height(at.lifted) - Math.min(...track.filter(p => p.t >= at.lifted.t - 900 && p.t <= at.lifted.t).map(height)),
            hookTurn: (at.lifted.joints[hookJoint].angle - at.start.joints[hookJoint].angle) * DEG,
            maxLean: Math.max(...track.map(lean)),
            lowered: height(at.lowered) - height(at.start),
            baseYaw: Math.max(...track.map(p => Math.abs(yaw(p.bodies[hub].rotation) - yaw(track[0].bodies[hub].rotation)))) * DEG
        };
    };
    const report = r => `phases ${r.starts}; luff motor ${r.luffTurn.toFixed(1)}°: load rose ${(r.rise * 1000).toFixed(1)} mm (sank ${(r.sink * 1000).toFixed(2)} mm while held); ` +
        `slew motor ${r.slewTurn.toFixed(1)}°: turntable ${r.ttSlewed.toFixed(1)}°, back to ${r.ttEnd.toFixed(1)}°; ` +
        `the hook's pin turned ${r.hookTurn.toFixed(1)}° in the lift, the hook leaning at most ${r.maxLean.toFixed(1)}°; ` +
        `lowered to ${(r.lowered * 1000).toFixed(1)} mm from the start; base yawed ${r.baseYaw.toFixed(2)}°`;

    /** How high the hook's pin rises when the actuator grows by dL (m): the law of cosines on the compiled points. */
    const expectedRise = (m, dL) => {
        const B = jointBetween(m, 'luffLaBody', 'luffLaAxle').point;
        const Pj = jointBetween(m, 'boom', 'ttTop');
        const P = Pj.point;
        const k = Pj.axis.map(v => v / len(Pj.axis));
        const C = jointBetween(m, 'boom', 'luffLaPiston').point;
        const Q = jointBetween(m, 'boom', 'hookLink').point;
        const L1 = len(sub(C, B)) + dL;
        // The boom's turn about P (the sense that lengthens the actuator), by bisection on the geometry alone.
        const sense = Math.sign(len(sub(rotate(sub(C, P), k, 1e-3).map((v, i) => v + P[i]), B)) - len(sub(C, B)));
        const f = t => len(sub(rotate(sub(C, P), k, sense * t).map((v, i) => v + P[i]), B)) - L1;
        let lo = 0; let hi = 1.5;
        assert.ok(f(lo) < 0 && f(hi) > 0, 'a boom turn gives that length');
        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (f(mid) < 0) lo = mid; else hi = mid;
        }
        const Q1 = rotate(sub(Q, P), k, sense * lo).map((v, i) => v + P[i]);
        return {rise: Q1[1] - Q[1], turn: lo * DEG};
    };

    /** The example program's run, shared by the checks. */
    let craneRun = null;
    const lifted = () => (craneRun = craneRun || run(PROGRAM));

    test('the example program lifts the hook as high as the actuator\'s stroke and the boom\'s geometry say', async t => {
        const result = await lifted();
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, [], 'every command was understood by the hub');
        const r = judge(result);
        t.diagnostic(report(r));
        assert.equal(r.starts, 'BABA', 'lift, slew, lower, slew back');
        // The luff motor turned the 1800° it was told (its own encoder), and the spindle with it (1:1:1).
        assert.ok(Math.abs(Math.abs(r.luffTurn) - 1800) < 5, `luff motor ${r.luffTurn}°`);
        const want = expectedRise(result.mechanism, Math.abs(r.luffTurn) / 360 * LEAD_M);
        t.diagnostic(`expected: the boom turns ${want.turn.toFixed(1)}° up, the hook rises ${(want.rise * 1000).toFixed(1)} mm`);
        // Within 2 mm: the boom's beams and pins are rigid; the hook hangs straight below its pin when settled.
        assert.ok(Math.abs(r.rise - want.rise) < 0.002, `the load rose ${(r.rise * 1000).toFixed(1)} mm, the geometry says ${(want.rise * 1000).toFixed(1)} mm`);
        assert.ok(r.sink < 0.0005, `the boom sank ${(r.sink * 1000).toFixed(2)} mm while B held it`);
        // Back down: the same 1800° the other way put the hook where it started.
        assert.ok(Math.abs(r.lowered) < 0.002, `lowered to ${(r.lowered * 1000).toFixed(1)} mm from the start`);
    });

    test('it slews a quarter turn (8T into 28T) and back, the hook hanging free, the base standing still', async t => {
        const result = await lifted();
        const r = judge(result);
        t.diagnostic(report(r));
        // 315° of the slew motor through 8 teeth into 28 are 90°.
        assert.ok(Math.abs(Math.abs(r.slewTurn) - 315) < 5, `slew motor ${r.slewTurn}°`);
        assert.ok(Math.abs(Math.abs(r.ttSlewed) - Math.abs(r.slewTurn) * 8 / 28) < 2, `turntable ${r.ttSlewed}° for ${r.slewTurn}° of the motor`);
        assert.ok(Math.abs(r.ttEnd) < 2, `back to ${r.ttEnd}°`);
        // The hook hangs on a free pin: as the boom turns up, the pin turns by the boom's turn (the law of cosines'
        // angle) and the hook keeps hanging straight down, through the lift and the slews alike.
        const want = expectedRise(result.mechanism, Math.abs(r.luffTurn) / 360 * LEAD_M);
        assert.ok(Math.abs(Math.abs(r.hookTurn) - want.turn) < 1.5, `the hook's pin turned ${r.hookTurn}°, the boom ${want.turn}°`);
        assert.ok(r.maxLean < 3, `the hook leaned ${r.maxLean}° from hanging straight`);
        // At a tenth of the motor's speed the slew does not drag the hub round on the floor.
        assert.ok(r.baseYaw < 1, `the base turned ${r.baseYaw}°`);
    });

    test('the judge can fail: without the lift the hook does not rise', async t => {
        const still = PROGRAM.replace(/^ {2}run motor B clockwise 1800 degrees\n/m, '');
        assert.notEqual(still, PROGRAM);
        const result = await run(still);
        const load = bodyOf(result.mechanism, 'load');
        const h = result.track.map(p => p.bodies[load].position[1]);
        const rise = Math.max(...h) - h[0];
        t.diagnostic(`no lift: the load rose at most ${(rise * 1000).toFixed(1)} mm`);
        assert.ok(rise < 0.005, `the load still rose ${rise} m`);
    });
}
