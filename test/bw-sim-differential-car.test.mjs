// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Differential car (static/sim-lab/models/differential-car.ldr, scripts/gen-differential-car-model.mjs):
 * a SPIKE Prime car whose motor A drives the rear axle through the Technic differential (the Differential
 * example's gear set: casing, 28T cover, three 12T satellites, two 12T side gears, a 12T pinion), and whose
 * motor B steers the front wheels: B's output holds the left kingpin, a tie rod on two steering arms takes
 * the right wheel along (an Ackermann trapezoid). Its example program (static/sim-lab/programs/
 * differential-car.bw) drives ahead, goes once round a circle and backs up.
 *
 * Expectations come from the geometry, never from what the code set:
 *   - the pinion's ratio from the tooth counts (parts.json);
 *   - the wheelbase L, the rear track t and the kingpins' spacing from where the parts are placed;
 *   - in a steady turn of the rear axle's middle on a circle of radius R (fitted to its path), the outer
 *     rear wheel turns (R + t/2)/(R − t/2) times as fast as the inner one, and the differential's casing
 *     at the mean of the two (Willis);
 *   - R from the front wheels' steering angles (their kingpins' hinge angles) and L: the bicycle model,
 *     R = L·cot δ, with cot δ the mean of the two wheels' cotangents;
 *   - the Ackermann trapezoid: the arms' lines meet on the rear axle's middle, so the inner wheel turns
 *     further (cot δ_out − cot δ_in = w/L for kingpins w apart, at small angles).
 * The steering is held by position and never reaches the end of its travel (where a wheel meets the tie rod);
 * a car standing still does not turn or roll while it steers (the kingpins meet the wheels' axles: no trail);
 * the whole run stays on the 2 m floor. Without the differential (a single axle through both side gears:
 * the casing cannot turn on it) the car scrubs its rear tyres and turns wider.
 * That it is a real build (no two solid parts overlap, no pin past its hole) is test/bw-sim-models-solid.test.mjs
 * and test/bw-sim-models.test.mjs, which check every MODELS entry.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS, MODELS_BASE, PROGRAMS_BASE, prepareModel, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {LDU_M, lduToWorld} = await import(path.join(SIM, 'contracts.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const ENTRY = MODELS.find(m => m.file === 'differential-car.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');
const DEG = 180 / Math.PI;

const prepared = (text = MODEL_TEXT) => prepareModel(text, CATALOG, {mat: ENTRY.mat});
const bodyOf = (m, part) => m.bodies.find(b => b.parts.includes(part)).id;
/** The joint between the bodies carrying parts a and b. */
const jointBetween = (m, a, b) => {
    const A = bodyOf(m, a);
    const B = bodyOf(m, b);
    return m.joints.find(j => (j.body1 === A && j.body2 === B) || (j.body1 === B && j.body2 === A));
};
const partOf = (model, id) => model.parts.find(p => p.id === id);
const teeth = (model, id) => CATALOG.get(partOf(model, id).part).gear.teeth;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(...a);
/** A part's connector in model space (LDU). */
const connectorAt = (model, id, cid) => {
    const p = partOf(model, id);
    const c = CATALOG.get(p.part).connectors.find(k => k.id === cid);
    const r = p.rotation;
    const rot = v => [0, 1, 2].map(i => r[i * 3] * v[0] + r[i * 3 + 1] * v[1] + r[i * 3 + 2] * v[2]);
    return {position: rot(c.position).map((v, i) => v + p.position[i]), axis: rot(c.axis)};
};

/**
 * The build's own numbers (LDU, LDraw frame: x across, z backwards): the wheelbase from the rear wheels' axle
 * to the front wheels' axle, the rear track between the rear wheels' middles, the kingpins' spacing.
 */
const geometry = model => {
    const at = id => partOf(model, id).position;
    return {
        L: at('wheelRearR')[2] - at('wheelFrontR')[2],
        t: at('wheelRearR')[0] - at('wheelRearL')[0],
        w: at('knuckleR')[0] - at('knuckleL')[0]
    };
};

/** The positions the program steers to (motor B's degrees: the left wheel's angle, B holds its kingpin). */
const steerTargets = source => [...source.matchAll(/^\s*run motor B to position (-?\d+)\s*$/gm)].map(m => Number(m[1]));

test('the Differential car is a shipped example with its program, titled and introduced in English and German', () => {
    assert.ok(ENTRY, 'MODELS lists differential-car.ldr');
    assert.deepEqual(ENTRY.title, {en: 'Differential car', de: 'Differenzial-Auto'});
    assert.equal(ENTRY.mat, 'plain');
    for (const lang of ['en', 'de']) assert.ok(ENTRY.intro[lang].length > 80, `an intro in ${lang}`);
    assert.notEqual(ENTRY.intro.en, ENTRY.intro.de);
    assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
    assert.match(PROGRAM, /start motor A forward/);
    assert.match(PROGRAM, /start motor A backward/);
    assert.ok(steerTargets(PROGRAM).length >= 2, 'it steers B by position');
    assert.doesNotMatch(PROGRAM, /start motor B/, 'B is never run open-ended (it would push the steering into its end)');
});

test('it compiles to the differential\'s gears, a pinion of the tooth ratio and an Ackermann steering without trail', () => {
    const {mechanism: m, model, issues} = prepared();
    // Two pairs of frictionless pins 3/4 (the spacer under the hub) lock: the compiler says so and merges them.
    assert.deepEqual(issues.filter(i => i.code !== 'locked-hinges'), []);
    assert.deepEqual(issues.map(i => i.code), ['locked-hinges', 'locked-hinges']);
    assert.deepEqual(m.actuators.map(a => a.port).sort(), ['A', 'B']);
    const chassis = bodyOf(m, 'hub');
    // (A motor is two bodies, its housing and its output: the housing's pins name it here.)
    for (const id of ['postPinLF80', 'steerPin-20', 'beamFrontL', 'beamFrontR', 'railL', 'railR', 'spacer']) assert.equal(bodyOf(m, id), chassis, `${id} is the chassis`);
    // The pinion drives the 28T on the casing: 12/28, relative to the chassis.
    const drive = m.couplings.find(c => c.parts.includes('pinion'));
    assert.deepEqual([...drive.parts].sort(), ['cover', 'pinion']);
    assert.ok(Math.abs(Math.abs(drive.ratio) - teeth(model, 'cover') / teeth(model, 'pinion')) < 1e-9 ||
        Math.abs(Math.abs(drive.ratio) - teeth(model, 'pinion') / teeth(model, 'cover')) < 1e-9, `pinion ratio ${drive.ratio}`);
    // Each satellite meshes both side gears, 1:1 relative to the casing.
    const sats = m.couplings.filter(c => c.kind === 'relativeGear' && c.parts.some(p => p.startsWith('planet')));
    assert.equal(sats.length, 6);
    for (const c of sats) assert.ok(Math.abs(Math.abs(c.ratio) - 1) < 1e-9, `${c.parts} ${c.ratio}`);
    // The half axles turn in the chassis and in the casing: each wheel on its own.
    assert.notEqual(bodyOf(m, 'wheelRearL'), bodyOf(m, 'wheelRearR'));
    for (const w of ['wheelRearL', 'wheelRearR']) assert.equal(jointBetween(m, 'hub', w).type, 'hinge');
    // The steering: motor B's own hinge is the left kingpin; the right kingpin turns in the chassis; the tie rod
    // is its own body, hinged to both arms.
    const kingL = jointBetween(m, 'hub', 'knuckleL');
    assert.equal(kingL.motor && kingL.motor.port, 'B');
    const kingR = jointBetween(m, 'hub', 'knuckleR');
    assert.equal(kingR.type, 'hinge');
    assert.ok(!kingR.motor);
    for (const k of ['knuckleL', 'knuckleR']) assert.equal(jointBetween(m, 'tieRod', k).type, 'hinge');
    // No trail: each kingpin's axis meets its wheel's axle (the wheel turns about where it stands).
    for (const s of ['L', 'R']) {
        const kp = jointBetween(m, 'hub', `knuckle${s}`);
        const wheel = jointBetween(m, `knuckle${s}`, `wheelFront${s}`);
        const n = cross(kp.axis, wheel.axis);
        const miss = Math.abs(dot(sub(wheel.point, kp.point), n)) / len(n);
        assert.ok(miss < 0.5 * LDU_M, `${s}: the kingpin passes ${(miss / LDU_M).toFixed(2)} LDU from the wheel's axle`);
    }
    // Ackermann: each arm's line from its kingpin through its tie-rod hole meets the middle of the rear axle.
    const {L, w} = geometry(model);
    const rearMid = [(partOf(model, 'wheelRearL').position[0] + partOf(model, 'wheelRearR').position[0]) / 2, 0, partOf(model, 'wheelRearR').position[2]];
    for (const s of ['L', 'R']) {
        const king = connectorAt(model, `arm${s}`, 'x1').position;
        const end = connectorAt(model, `arm${s}`, 'h3').position;
        const along = (rearMid[2] - king[2]) / (end[2] - king[2]);
        const x = king[0] + along * (end[0] - king[0]);
        assert.ok(Math.abs(x - 0) < 1e-6, `${s}: the arm's line crosses the rear axle at x = ${x} (the car's middle 0)`);
    }
    assert.equal(L, 240);
    assert.equal(w, 120);
});

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the Robot Lab program run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab} = await import('./helpers/sim-lab-vm.mjs');
    const run = async (source, {modelText = MODEL_TEXT, timeLimitMs = 26000} = {}) =>
        ({...await runOnSimLab(source, {modelText, mat: ENTRY.mat, timeLimitMs}), modelText});

    /** Rotate v by the unit quaternion q = [x, y, z, w]. */
    const qrot = ([x, y, z, w], v) => {
        const ix = w * v[0] + y * v[2] - z * v[1];
        const iy = w * v[1] + z * v[0] - x * v[2];
        const iz = w * v[2] + x * v[1] - y * v[0];
        const iw = -x * v[0] - y * v[1] - z * v[2];
        return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
    };
    /** Least-squares circle through points [x, z] (Kåsa): {cx, cz, r}. */
    const fitCircle = pts => {
        let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sxr = 0, szr = 0, sr = 0;
        for (const [x, z] of pts) {
            const r2 = x * x + z * z;
            sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; sxr += x * r2; szr += z * r2; sr += r2;
        }
        const n = pts.length;
        // Solve [sxx sxz sx; sxz szz sz; sx sz n] [a b c] = [sxr szr sr] for x² + z² = a x + b z + c.
        const M = [[sxx, sxz, sx, sxr], [sxz, szz, sz, szr], [sx, sz, n, sr]];
        for (let i = 0; i < 3; i++) {
            for (let k = i + 1; k < 3; k++) {
                const f = M[k][i] / M[i][i];
                for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
            }
        }
        const s = [0, 0, 0];
        for (let i = 2; i >= 0; i--) {
            let acc = M[i][3];
            for (let j = i + 1; j < 3; j++) acc -= M[i][j] * s[j];
            s[i] = acc / M[i][i];
        }
        const cx = s[0] / 2;
        const cz = s[1] / 2;
        return {cx, cz, r: Math.sqrt(s[2] + cx * cx + cz * cz)};
    };

    /**
     * The run, measured. Bodies: the chassis (the hub's), the rear wheels; joints: the rear wheels' hinges in the
     * chassis, the left half axle's hinge in the casing, the kingpins. The rear axle's middle is carried with the
     * chassis from where the model puts it (between the rear wheels, on their axle).
     */
    const measure = result => {
        const {track, mechanism: m, model} = result;
        const chassis = bodyOf(m, 'hub');
        const wl = jointBetween(m, 'hub', 'wheelRearL');
        const wr = jointBetween(m, 'hub', 'wheelRearR');
        const inCasing = jointBetween(m, 'casing', 'wheelRearL');
        const kl = jointBetween(m, 'hub', 'knuckleL');
        const kr = jointBetween(m, 'hub', 'knuckleR');
        // The rear axle's middle at t = 0 (world): halfway between the rear wheels' middles where the model
        // stands on the mat (prepareModel's runModel, the pose the physics starts from).
        const {runModel} = prepared(result.modelText);
        const wheelAt = id => lduToWorld(runModel.parts.find(q => q.id === id).position);
        const p0 = track[0].bodies[chassis];
        const axleMid0 = [0, 1, 2].map(i => (wheelAt('wheelRearL')[i] + wheelAt('wheelRearR')[i]) / 2);
        const local = sub(axleMid0, p0.position);
        const axleMid = f => {
            const b = f.bodies[chassis];
            return qrot(b.rotation, local).map((v, i) => v + b.position[i]);
        };
        const yaw = f => {
            const fwd = qrot(f.bodies[chassis].rotation, [1, 0, 0]);
            return Math.atan2(-fwd[2], fwd[0]);
        };
        const tilt = f => Math.acos(Math.min(1, qrot(f.bodies[chassis].rotation, [0, 1, 0])[1])) * DEG;
        const rate = (id, a, b) => (b.joints[id].angle - a.joints[id].angle) / ((b.t - a.t) / 1000);
        return {track, m, chassis, wl, wr, inCasing, kl, kr, axleMid, yaw, tilt, rate};
    };

    let shared = null;
    const programRun = () => (shared = shared || run(PROGRAM));

    test('the example program: ahead in a straight line, once round, back to where it started, all on the floor', async t => {
        const result = await programRun();
        assert.deepEqual(result.issues.filter(i => i.severity === 'error'), []);
        assert.deepEqual(result.run.unsupported, [], 'every command was understood by the hub');
        const r = measure(result);
        const {track} = r;
        // The straight: from 1 s (up to speed) to the frame before the steering moves.
        const steerStart = track.findIndex(f => Math.abs(f.joints[r.kl.id].angle) > 0.5 / DEG);
        assert.ok(steerStart > 0, 'the steering moves');
        const a = track.find(f => f.t >= 1000);
        const b = track[steerStart - 1];
        const heading = [Math.cos(r.yaw(a)), 0, -Math.sin(r.yaw(a))];
        const run1 = sub(r.axleMid(b), r.axleMid(a));
        const along = dot(run1, heading);
        const drift = len(sub(run1, heading.map(v => v * along)));
        const turned = Math.abs(r.yaw(b) - r.yaw(a)) * DEG;
        t.diagnostic(`straight: ${(along * 1000).toFixed(0)} mm ahead, ${(drift * 1000).toFixed(2)} mm sideways, heading ${turned.toFixed(2)}°`);
        assert.ok(along > 0.08, `it drove ahead ${along} m`);
        assert.ok(drift < 0.002 && turned < 0.3, 'a straight line stays straight');
        // Round once and back: the path closes near its start, the chassis upright, on the floor all along.
        const start = r.axleMid(track[0]);
        const end = r.axleMid(track.at(-1));
        const gap = len(sub(end, start));
        let far = 0;
        let lowest = Infinity;
        for (const f of track) {
            for (const id of Object.keys(f.bodies)) {
                const p = f.bodies[id].position;
                far = Math.max(far, Math.abs(p[0]), Math.abs(p[2]));
                lowest = Math.min(lowest, p[1]);
            }
        }
        const maxTilt = Math.max(...track.map(r.tilt));
        const turnedTotal = (r.yaw(track.at(-1)) - r.yaw(track[0])) * DEG;
        t.diagnostic(`ends ${(gap * 100).toFixed(1)} cm from its start; furthest part ${far.toFixed(3)} m from the floor's middle (its edge at 1 m); ` +
            `tilted at most ${maxTilt.toFixed(2)}°; heading at the end ${turnedTotal.toFixed(1)}° (mod 360)`);
        assert.ok(gap < 0.08, `it backed up to ${gap} m from where it started`);
        assert.ok(far < 0.9, `every part stays on the 2 m floor (${far} m from its middle)`);
        assert.ok(lowest > -0.01, 'nothing fell off');
        assert.ok(maxTilt < 2, `the chassis stays upright (${maxTilt}°)`);
    });

    test('in the steady turn the differential lets the outer wheel run faster, by (R + t/2)/(R − t/2)', async t => {
        const result = await programRun();
        const r = measure(result);
        const {track} = r;
        const {L, t: trackLdu, w} = geometry(prepared().model);
        // The steady turn: from 1 s after the steering settled to 1 s before it moves back.
        const held = track.filter(f => Math.abs(f.joints[r.kl.id].angle) > 19 / DEG);
        const t0 = held[0].t + 1000;
        const t1 = held.at(-1).t - 1000;
        const span = track.filter(f => f.t >= t0 && f.t <= t1);
        assert.ok(t1 - t0 > 8000, `a steady turn of ${(t1 - t0) / 1000} s`);
        const {r: R} = fitCircle(span.map(f => [r.axleMid(f)[0], r.axleMid(f)[2]]));
        const a = span[0];
        const b = span.at(-1);
        const left = r.rate(r.wl.id, a, b);
        const right = r.rate(r.wr.id, a, b);
        const casing = left - r.rate(r.inCasing.id, a, b);
        const tr = trackLdu * LDU_M;
        const want = (R + tr / 2) / (R - tr / 2);
        const got = Math.max(Math.abs(left), Math.abs(right)) / Math.min(Math.abs(left), Math.abs(right));
        t.diagnostic(`R ${(R * 1000).toFixed(1)} mm, track ${(tr * 1000).toFixed(1)} mm: outer/inner ${got.toFixed(4)} (geometry ${want.toFixed(4)}); ` +
            `casing ${casing.toFixed(3)} rad/s, mean of the wheels ${((left + right) / 2).toFixed(3)} rad/s`);
        assert.ok(Math.abs(got / want - 1) < 0.01, `outer/inner ${got} vs ${want}`);
        assert.ok(Math.abs(casing / ((left + right) / 2) - 1) < 0.005, 'the casing turns at the mean of the two wheels');
        // The bicycle model: R from the two front wheels' angles and the wheelbase.
        const dl = Math.abs(a.joints[r.kl.id].angle);
        const dr = Math.abs(a.joints[r.kr.id].angle);
        const inner = Math.max(dl, dr);
        const outer = Math.min(dl, dr);
        const cotMean = (1 / Math.tan(dl) + 1 / Math.tan(dr)) / 2;
        const Rbike = L * LDU_M * cotMean;
        // Ackermann, exact: cot δ_out − cot δ_in = w/L; the trapezoid gets close.
        const ackOuter = Math.atan(1 / (1 / Math.tan(inner) + w / L));
        t.diagnostic(`front wheels: inner ${(inner * DEG).toFixed(2)}°, outer ${(outer * DEG).toFixed(2)}° (exact Ackermann for that inner angle: ${(ackOuter * DEG).toFixed(2)}°); ` +
            `bicycle model R = L·cot δ = ${(Rbike * 1000).toFixed(1)} mm, measured ${(R * 1000).toFixed(1)} mm (${((R / Rbike - 1) * 100).toFixed(1)} %)`);
        assert.ok(inner > outer + 1 / DEG, 'the inner wheel turns further');
        assert.ok(Math.abs(outer - ackOuter) < 1 / DEG, 'within 1° of exact Ackermann');
        // 3 %: the tyres' small slip angles; the model has no tyre stiffness beyond the contact's friction.
        assert.ok(Math.abs(R / Rbike - 1) < 0.03, `R ${R} vs the bicycle model's ${Rbike}`);
    });

    test('the program steers by position, inside the steering\'s travel, and a parked car neither turns nor rolls as it steers', async t => {
        const targets = steerTargets(PROGRAM);
        const most = Math.max(...targets.map(Math.abs));
        const result = await programRun();
        const r = measure(result);
        const reached = Math.max(...result.track.map(f => Math.abs(f.joints[r.kl.id].angle))) * DEG;
        // The end of the travel: B pushed slowly each way until it stalls (the inner front wheel meets the tie rod).
        const ends = [];
        let endYaw = 0;
        for (const way of ['forward', 'backward']) {
            const push = await run(['DEVICE SPIKE', 'WHEN flag clicked:', '  set motor speed B 15', `  start motor B ${way}`, '  wait 2.5 seconds', ''].join('\n'),
                {timeLimitMs: 2600});
            const p = measure(push);
            const angles = push.track.map(f => f.joints[p.kl.id].angle * DEG);
            ends.push(way === 'forward' ? Math.max(...angles) : Math.min(...angles));
            endYaw = Math.max(endYaw, ...push.track.map(f => Math.abs(p.yaw(f) - p.yaw(push.track[0])) * DEG));
        }
        t.diagnostic(`program: B to ±${most}°, the left wheel at most ${reached.toFixed(2)}°; travel ends at ${ends[0].toFixed(1)}° and ${ends[1].toFixed(1)}° ` +
            `(B pushing into an end turned the parked car ${endYaw.toFixed(2)}°)`);
        assert.ok(Math.abs(reached - most) < 1, `B holds the wheel at the position it was told (${reached}°)`);
        assert.ok(most <= Math.min(ends[0], -ends[1]) - 5, `${most}° stays at least 5° inside the travel (${ends})`);
        // Parked: B swings the wheels to the program's angles both ways and back; the chassis does not turn or tip.
        const parked = await run(['DEVICE SPIKE', 'WHEN flag clicked:', '  set motor stop action B hold', '  set motor speed B 20',
            ...[...new Set(targets.filter(d => d !== 0).map(Math.abs))].flatMap(d => [`  run motor B to position ${d}`, '  wait 1.5 seconds', `  run motor B to position ${-d}`, '  wait 1.5 seconds']),
            '  run motor B to position 0', '  wait 1.5 seconds', ''].join('\n'),
        {timeLimitMs: 9000});
        const q = measure(parked);
        const swung = Math.max(...parked.track.map(f => Math.abs(f.joints[q.kl.id].angle))) * DEG;
        const turned = Math.max(...parked.track.map(f => Math.abs(q.yaw(f) - q.yaw(parked.track[0])))) * DEG;
        const tipped = Math.max(...parked.track.map(q.tilt));
        const moved = Math.max(...parked.track.map(f => len(sub(q.axleMid(f), q.axleMid(parked.track[0])))));
        t.diagnostic(`parked: wheels swung to ${swung.toFixed(1)}°, the chassis turned ${turned.toFixed(3)}°, tipped ${tipped.toFixed(3)}°, its rear axle moved ${(moved * 1000).toFixed(2)} mm`);
        assert.ok(swung > most - 1, 'the wheels swung');
        assert.ok(turned < 0.2 && tipped < 0.2 && moved < 0.001, 'steering alone does not move the car');
    });

    /**
     * The steady turn of a run: the rear axle middle's circle (radius R) and each rear tyre's slip, its rolling
     * speed (hinge rate × the wheel's radius from its collider) over its middle's speed on the floor, less one.
     */
    const steadyTurn = result => {
        const r = measure(result);
        const held = r.track.filter(f => Math.abs(f.joints[r.kl.id].angle) > 19 / DEG);
        const span = held.filter(f => f.t >= held[0].t + 1000 && f.t <= held.at(-1).t - 1000);
        const {r: R} = fitCircle(span.map(f => [r.axleMid(f)[0], r.axleMid(f)[2]]));
        const {runModel, mechanism} = prepared(result.modelText);
        const radius = CATALOG.get('39367p01.dat').colliders[0].radius * LDU_M;
        const chassis0 = result.track[0].bodies[r.chassis];
        const a = span[0];
        const b = span.at(-1);
        const slip = (wheel, joint) => {
            const local = sub(lduToWorld(runModel.parts.find(q => q.id === wheel).position), chassis0.position);
            const at = f => qrot(f.bodies[r.chassis].rotation, local).map((v, i) => v + f.bodies[r.chassis].position[i]);
            let ground = 0;
            for (let i = span.indexOf(a) + 1; i <= span.indexOf(b); i++) ground += len(sub(at(span[i]), at(span[i - 1])));
            const rolled = Math.abs(b.joints[joint].angle - a.joints[joint].angle) * radius;
            return rolled / ground - 1;
        };
        assert.ok(mechanism);
        return {R, slipL: slip('wheelRearL', r.wl.id), slipR: slip('wheelRearR', r.wr.id)};
    };

    test('without the differential (one axle through both side gears) the rear tyres scrub', async t => {
        // The spool: the two half axles become one 12L axle, so the side gears (and the casing) turn as one;
        // the rear wheels move in onto its ends.
        const lines = MODEL_TEXT.split('\n');
        const placeOf = id => lines.findIndex((l, i) => i > 0 && lines[i - 1] === `0 !BW ID ${id}`);
        const set = (id, fn) => { const i = placeOf(id); lines[i] = fn(lines[i].split(' ')).join(' '); };
        set('axleRearL', f => { f[2] = '0'; f[14] = '3708.dat'; return f; });
        for (const id of ['axleRearR', 'bushRearL', 'bushRearR']) lines.splice(placeOf(id) - 1, 2);
        set('wheelRearL', f => { f[2] = '-111'; return f; });
        set('wheelRearR', f => { f[2] = '111'; return f; });
        const spool = lines.join('\n');
        const {mechanism: sm} = prepared(spool);
        assert.equal(bodyOf(sm, 'wheelRearL'), bodyOf(sm, 'wheelRearR'), 'one axle carries both wheels');
        const open = steadyTurn(await programRun());
        const locked = steadyTurn(await run(PROGRAM, {modelText: spool}));
        const pc = v => `${(v * 100).toFixed(2)} %`;
        t.diagnostic(`with the differential: R ${(open.R * 1000).toFixed(1)} mm, rear tyres slip ${pc(open.slipL)} / ${pc(open.slipR)}; ` +
            `one axle: R ${(locked.R * 1000).toFixed(1)} mm, slip ${pc(locked.slipL)} / ${pc(locked.slipR)}`);
        // Rolling with the differential: each tyre's speed is its ground speed (1 %).
        assert.ok(Math.abs(open.slipL) < 0.01 && Math.abs(open.slipR) < 0.01, 'the differential lets both rear tyres roll');
        // One axle: both tyres turn at one speed but travel two circles, so the inner one spins and the outer one
        // drags — by about t/(2R) each (the spool's track 88.8 mm on R ≈ 288 mm: 15 %).
        assert.ok(Math.min(Math.abs(locked.slipL), Math.abs(locked.slipR)) > 0.05, 'locked, the rear tyres scrub');
        assert.ok(Math.sign(locked.slipL) !== Math.sign(locked.slipR), 'one spins, the other drags');
        assert.ok(locked.R >= open.R * 0.99, `and the car does not turn tighter (${locked.R} vs ${open.R})`);
    });
}
