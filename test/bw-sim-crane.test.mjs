// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Crane (static/sim-lab/models/crane.ldr, scripts/gen-crane-model.mjs): a SPIKE Prime hub standing on
 * the floor with a 28-tooth turntable slewed by an 8T on motor A, and a 15L boom luffed by a small linear
 * actuator that motor B turns 1:1 through 16T gears and 12T bevel gears. A hook (a 5L link and matched Technic
 * bricks 1 x 4) hangs on a rope over the boom tip, free to swing. Its example program
 * (static/sim-lab/programs/crane.bw) lifts the boom, swings a quarter turn, lets the hook down and swings back.
 *
 * Expectations are derived, never read back from what the code set:
 *   - the couplings' ratios from the parts: tooth counts (parts.json), the actuator's lead from LDraw's
 *     contracted/extended assemblies and the measured turns of a full stroke (as
 *     test/bw-sim-linear-actuator.test.mjs derives it);
 *   - how high the hook rises from the actuator's length change (the luff motor's own encoder × the lead):
 *     the boom turns about its pivot P by the angle that makes |C − B| that length (the law of cosines on
 *     the hinge points the compiler found: the actuator's pivot B, its eye on the boom C), and the hook's
 *     guide Q turns with it; the hook rise also includes the changing drum-to-guide rope path;
 *   - the slew from the slew motor's encoder × 8/28.
 * That it is a real build (no two solid parts overlap, no pin past its hole, every part connected) is
 * test/bw-sim-models-solid.test.mjs and test/bw-sim-models.test.mjs, which check every MODELS entry.
 * The independent rope-hung load also follows its measured drum radius and moving guide path.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {judgeMechanicsRun} from '../scripts/lib/sim-lab-mechanics-judge.mjs';
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
    assert.deepEqual(ENTRY.title, {en: 'Crane — linear-actuator boom and geared slew', de: 'Kran — Spindelausleger und Zahnkranz-Schwenkung'});
    assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
    for (const port of 'ABC') assert.match(PROGRAM, new RegExp(`run motor ${port} `), `the program drives ${port}`);
    assert.match(PROGRAM, /set motor stop action C hold\s+stop motor C/, 'the idle winch is held before the boom moves');
});

test('it compiles to the original slew/luff ratios and a retained, geared drum with an independent rope-hung load', () => {
    const {mechanism: m, model, issues} = prepared();
    assert.deepEqual(issues, []);
    assert.deepEqual(m.actuators.map(a => a.port).sort(), ['A', 'B', 'C']);
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
    const rope = m.couplings.find(c => c.kind === 'rope');
    assert.deepEqual(rope.parts, ['hoistDrum', 'tipGuide', 'hookLink']);
    assert.equal(m.couplings.filter(c => c.kind === 'rope').length, 1);
    assert.equal(jointBetween(m, 'hookLink', 'boom'), undefined, 'the rope replaces the fixed boom-to-hook hinge');
    assert.equal(bodyOf(m, 'load'), bodyOf(m, 'hookLink'), 'the load is pinned to the link');
    assert.notEqual(bodyOf(m, 'hookLink'), bodyOf(m, 'boom'));
    assert.equal(bodyOf(m, 'hoistBearing'), bodyOf(m, 'ttTop'), 'the inner shaft bearing is pinned into the upper frame');
    assert.notEqual(bodyOf(m, 'hoistDrum'), bodyOf(m, 'ttTop'), 'the retained shaft can spin');
    const drive = m.couplings.find(c => c.kind === 'gear' && c.parts.includes('hoistMotorGear'));
    assert.deepEqual([...drive.parts].sort(), ['hoistGear16', 'hoistMotorGear']);
    assert.equal(Math.abs(drive.ratio), 1);
    const motor = m.actuators.find(a => a.port === 'C');
    const drumPerMotor = drive.joint1 === motor.joint ? drive.ratio : 1 / drive.ratio;
    assert.ok(rope.drumSign * drumPerMotor * motor.sign < 0, 'counterclockwise C winds the drum');
    assert.ok(Math.abs(rope.radiusM - 0.0028) < 1e-12);
    assert.ok(Math.hypot(rope.hook.local[0], rope.hook.local[2]) < 1e-9,
        'the balanced payload COM lies directly below its rope tie');
    const point = p => m.bodies.find(b => b.id === p.body).position.map((x, i) => x + p.local[i]);
    const points = [...rope.points, rope.hook].map(point);
    const length = points.slice(1).reduce((sum, p, i) => sum + len(sub(p, points[i])), 0);
    assert.ok(Math.abs(rope.lengthM - length) <= 0.05 * LDU_M, 'the generated rope starts taut to the editor rounding bound');
});

test('the crane generator reproduces the shipped geometry and derives its rope from the same part metadata', () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'bw-crane-'));
    try {
        const out = path.join(scratch, 'crane.ldr');
        execFileSync(process.execPath, ['--max-old-space-size=256', path.join(REPO, 'scripts/gen-crane-model.mjs'), out], {stdio: 'pipe'});
        assert.equal(readFileSync(out, 'utf8'), MODEL_TEXT);
    } finally { rmSync(scratch, {recursive: true, force: true}); }
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
    const qmul = ([x, y, z, w], [a, b, c, d]) => [w * a + x * d + y * c - z * b,
        w * b - x * c + y * d + z * a, w * c + x * b - y * a + z * d, w * d - x * a - y * b - z * c];
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
        const boom = bodyOf(m, 'boom');
        const axis = jointBetween(m, 'boom', 'ttTop').axis;
        const relativeHookTurn = f => {
            const q = f.bodies[boom].rotation;
            const relative = qmul([-q[0], -q[1], -q[2], q[3]], f.bodies[link].rotation);
            return 2 * Math.atan2(dot(relative.slice(0, 3), axis), relative[3]) * DEG;
        };
        // Phase boundaries: the frames where a port goes busy.
        const starts = [];
        for (let i = 0; i < track.length; i++) {
            for (const port of ['A', 'B']) if (track[i].busy[port] && (i === 0 || !track[i - 1].busy[port])) starts.push({i, port});
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
        const heldHeights = track.filter(p => p.t >= at.lifted.t - 900 && p.t <= at.lifted.t).map(height);
        assert.ok(heldHeights.length >= 3, 'the boom hold has captured frames');
        return {
            starts: starts.map(s => s.port).join(''),
            luffTurn: (at.lifted.joints[luff].angle - at.start.joints[luff].angle) * DEG,
            slewTurn: (at.slewed.joints[slew].angle - at.lifted.joints[slew].angle) * DEG,
            ttSlewed: (at.slewed.joints[ttJoint].angle - at.start.joints[ttJoint].angle) * DEG,
            ttEnd: (end.joints[ttJoint].angle - at.start.joints[ttJoint].angle) * DEG,
            rise: height(at.lifted) - height(at.start),
            // While B holds (the program's wait after the lift), the actuator's screw holds the boom.
            sink: Math.max(...heldHeights) - Math.min(...heldHeights),
            hookTurn: relativeHookTurn(at.lifted) - relativeHookTurn(at.start),
            maxLean: Math.max(...track.map(lean)),
            lowered: height(at.lowered) - height(at.start),
            baseYaw: Math.max(...track.map(p => Math.abs(yaw(p.bodies[hub].rotation) - yaw(track[0].bodies[hub].rotation)))) * DEG
        };
    };
    const report = r => `phases ${r.starts}; luff motor ${r.luffTurn.toFixed(1)}°: load rose ${(r.rise * 1000).toFixed(1)} mm (sank ${(r.sink * 1000).toFixed(2)} mm while held); ` +
        `slew motor ${r.slewTurn.toFixed(1)}°: turntable ${r.ttSlewed.toFixed(1)}°, back to ${r.ttEnd.toFixed(1)}°; ` +
        `relative hook rotation ${r.hookTurn.toFixed(1)}° in the lift, hook leaning at most ${r.maxLean.toFixed(1)}°; ` +
        `lowered to ${(r.lowered * 1000).toFixed(1)} mm from the start; base yawed ${r.baseYaw.toFixed(2)}°`;

    /** How high the hook's pin rises when the actuator grows by dL (m): the law of cosines on the compiled points. */
    const expectedRise = (m, dL) => {
        const B = jointBetween(m, 'luffLaBody', 'luffLaAxle').point;
        const Pj = jointBetween(m, 'boom', 'ttTop');
        const P = Pj.point;
        const k = Pj.axis.map(v => v / len(Pj.axis));
        const C = jointBetween(m, 'boom', 'luffLaPiston').point;
        const rope = m.couplings.find(c => c.kind === 'rope');
        const point = p => m.bodies.find(b => b.id === p.body).position.map((x, i) => x + p.local[i]);
        const Q = point(rope.points.at(-1));
        const drum = point(rope.points[0]);
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
        // At a fixed drum angle the guide-to-load length also loses the changing drum/guide segment.
        const fixedChange = len(sub(Q1, drum)) - len(sub(Q, drum));
        return {rise: Q1[1] - Q[1] + fixedChange, turn: lo * DEG};
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
        // The load is free on the rope: its relative orientation follows the boom turn while it remains upright.
        const want = expectedRise(result.mechanism, Math.abs(r.luffTurn) / 360 * LEAD_M);
        assert.ok(Math.abs(Math.abs(r.hookTurn) - want.turn) < 1.5, `relative hook turn ${r.hookTurn}°, boom ${want.turn}°`);
        assert.ok(r.maxLean < 3, `the hook leaned ${r.maxLean}° from hanging straight`);
        // At a tenth of the motor's speed the slew does not drag the hub round on the floor.
        assert.ok(r.baseYaw < 1, `the base turned ${r.baseYaw}°`);
    });

    test('the judge can fail: without the boom lift and with the winch held fixed the hook does not rise', async t => {
        const still = PROGRAM.replace(/^ {2}run motor B clockwise 1800 degrees\n/m, '')
            .replace(/^ {2}run motor C (?:counterclockwise|clockwise) 540 degrees\n/gm, '');
        assert.notEqual(still, PROGRAM);
        const result = await run(still);
        const load = bodyOf(result.mechanism, 'load');
        const h = result.track.map(p => p.bodies[load].position[1]);
        const rise = Math.max(...h) - h[0];
        t.diagnostic(`no lift: the load rose at most ${(rise * 1000).toFixed(1)} mm`);
        assert.ok(rise < 0.005, `the load still rose ${rise} m`);
    });

    test('the actual crane program hoists, holds and pays out according to its rope geometry', async t => {
        const result = await lifted();
        const observation = judgeMechanicsRun('crane', {...result, unsupported: result.run.unsupported});
        t.diagnostic(JSON.stringify(observation));
    });

    test('the settled hanging rope supports the compiled payload weight within the finite averaging bound', async t => {
        const result = await lifted();
        const track = result.track;
        const starts = [];
        for (let i = 0; i < track.length; i++) if (track[i].busy.C && (i === 0 || !track[i - 1].busy.C)) starts.push(i);
        assert.equal(starts.length, 2);
        const stop = track.findIndex((f, i) => i > starts[0] && !f.busy.C);
        assert.ok(stop > starts[0] && stop < starts[1]);
        const last = track[starts[1] - 1].t;
        const held = track.slice(stop, starts[1]).filter(f => f.t >= last - 200);
        assert.ok(held.length >= 3 && held.at(-1).t - held[0].t >= 100);
        const load = result.mechanism.bodies.find(b => b.parts.includes('load'));
        const weight = load.massKg * Math.hypot(...result.mechanism.gravity);
        const mean = held.reduce((sum, f) => sum + f.ropes[0].tension, 0) / held.length;
        t.diagnostic(`configured payload ${load.massKg} kg; weight ${weight} N; mean rope tension ${mean} N`);
        // The free payload has no gear/screw solver mass floor. This is a numerical
        // static-force control, not calibration of a physical brick or motor.
        assert.ok(Math.abs(mean - weight) < Math.max(0.001, weight * 0.1), 'the sustained rope load balances gravity within 10% or 1 mN');
    });

    test('without the C winding command the observed hoist judge rejects the run', async () => {
        const still = PROGRAM.replace(/^ {2}run motor C counterclockwise 540 degrees\n/m, '');
        assert.notEqual(still, PROGRAM);
        const result = await run(still);
        assert.throws(() => judgeMechanicsRun('crane', {...result, unsupported: result.run.unsupported}), /lift, slew|hoist|wind/i);
    });

    test('payout to a floor-supported load creates sustained real slack instead of compressive rope force', async t => {
        const slack = 'DEVICE SPIKE\nWHEN flag clicked:\n  set motor stop action A hold\n  stop motor A\n' +
            '  set motor stop action B hold\n  stop motor B\n  set motor stop action C hold\n  stop motor C\n' +
            '  set motor speed C 100\n  run motor C clockwise 1800 degrees\n  wait 1 seconds\n';
        const result = await run(slack);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, []);
        const rope = result.mechanism.couplings.find(c => c.kind === 'rope');
        const point = (f, p) => qrot(f.bodies[p.body].rotation, p.local).map((x, i) => x + f.bodies[p.body].position[i]);
        const end = result.track.at(-1).t;
        const settled = result.track.filter(f => f.t >= end - 500);
        assert.ok(settled.length >= 10, 'a sustained settled interval is retained');
        const gaps = settled.map(f => f.ropes[0].free - len(sub(point(f, rope.points.at(-1)), point(f, rope.hook))));
        const tension = settled.map(f => f.ropes[0].tension);
        t.diagnostic(`slack gap min ${Math.min(...gaps) * 1000} mm; tension max ${Math.max(...tension)} N`);
        assert.ok(Math.min(...gaps) > 0.005, 'the actual rope is at least 5 mm longer than its guide-to-hook span');
        assert.ok(Math.max(...tension) < 0.001, 'a slack rope supplies no compressive force');
    });
}
