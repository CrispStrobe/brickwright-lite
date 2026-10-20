#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Writes the Robot Lab's Differential car (overlay/scratch-gui/static/sim-lab/models/differential-car.ldr)
// from its geometry, so every placement follows from the few numbers that define the build:
//   node scripts/gen-differential-car-model.mjs [out.ldr]
// A rear-wheel-drive car with front steering (docs/ROBOT-LAB-ARCHITECTURE.md T6, M7 + M16) on a SPIKE
// Prime hub:
//   - Rear axle: the Differential example's gear set (static/sim-lab/models/differential.ldr: casing 65414,
//     28T cover 65413, three 12T satellites, two 12T side gears on the half axles, a 12T pinion on motor A),
//     turned upside down: motor A lies flat above the rear axle with its output pointing down, the pinion
//     above the casing. Two 7L posts on each side of the motor and a 3L rail under them hold the half
//     axles; the wheels sit on the axles' outer ends.
//   - The hub lies on top of motor A (two pins into the motor's top face) and on two 9L beams that reach
//     forward under it to the front axle.
//   - Front steering: each front wheel turns on a knuckle (axle-and-pin connector 6536) whose vertical axle
//     is its kingpin. Motor B lies under the left front beam with its output pointing down: the left
//     kingpin axle sits in motor B's output, so B turns the left wheel directly; the right kingpin turns in
//     the right front beam. A steering arm (liftarm 3 x 5 bent 90, 32250) on each kingpin reaches 4 holes
//     back and 1 hole in, and a 5L tie rod on frictionless pins joins the two arms' ends. The arms' lines
//     meet at the middle of the rear axle (each reaches 20 in and 80 back; the kingpins are 60 out and
//     240 ahead of the rear axle: 60/240 = 20/80), the classic Ackermann trapezoid: in a turn the inner
//     wheel turns further than the outer one.
// LDraw frame: x lateral (+x right), y down, z backwards (the car drives forward towards -z); the axles
// are at y = 0, the floor at y = 70 (the 56 mm wheels' radius).
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models');
const OUT = process.argv[2] || path.join(MODELS, 'differential-car.ldr');

/** The rear axle's z and the kingpins' z (LDU): the kingpin line is 240 ahead of the rear axle. */
const ZR = 120;
const ZK = ZR - 240;
/** The kingpins' lateral distance from the middle (LDU). */
const KX = 60;

const r5 = x => (Math.abs(x) < 1e-9 ? 0 : +x.toFixed(5));
const lines = [];
const head = ['0 Differential car (Brickwright Robot Lab reference model)', '0 Name: differential-car.ldr', '0 Author: Brickwright',
    '0 !LDRAW_ORG Unofficial_Model',
    '0 // Rear-wheel drive through a differential (motor A) and front steering with an Ackermann tie rod (motor B).',
    '0 // scripts/gen-differential-car-model.mjs writes this file.'];
/** Place a part with its 3 x 3 rotation given row by row (LDraw order). */
const place = (id, part, color, pos, m, port = null) => {
    lines.push(`0 !BW ID ${id}`);
    if (port) lines.push(`0 !BW PORT ${port}`);
    lines.push(`1 ${color} ${pos.map(r5).join(' ')} ${m.map(r5).join(' ')} ${part}`);
};
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Local x along world y (pins, axles standing up). */
const ALONG_Y = [0, 1, 0, 1, 0, 0, 0, 0, -1];
/** Local x along world x (pins, axles lying across). */
const ALONG_X = I;
/** Local z along world x (wheels, bushes: their hole's axis is local z). */
const Z_ALONG_X = [0, 0, 1, 0, -1, 0, 1, 0, 0];
/** Local z along world y (a half bush on a standing axle). */
const Z_ALONG_Y = [1, 0, 0, 0, 0, 1, 0, -1, 0];
/** A beam standing up with its holes across (local y → x, local z → y). */
const POST = [0, 1, 0, 0, 0, 1, 1, 0, 0];
/** A beam lying along z with its holes across (local y → x, local z → z). */
const RAIL = [0, 1, 0, -1, 0, 0, 0, 0, 1];
/** A beam lying across (along x) with its holes standing (local y → y, local z → x). */
const CROSS = [0, 0, 1, 0, 1, 0, -1, 0, 0];

// ---- the rear axle: the Differential example's gear set, turned upside down --------------------------
// From differential.ldr: p' = A + R (p - A0), R a half turn about x (y → -y, z → -z), A0 its satellites'
// centre (-3, -100, 0) and A the same point here: the gears keep their relative places exactly.
const A0 = [-3, -100, 0];
const A = [-3, 0, ZR];
const R = [1, 0, 0, 0, -1, 0, 0, 0, -1];
const mul = (a, b) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
const apply = (m, v) => [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
const source = readFileSync(path.join(MODELS, 'differential.ldr'), 'utf8').split(/\r?\n/);
const fromDifferential = (id, newId = id, port = null) => {
    const k = source.indexOf(`0 !BW ID ${id}`);
    const line = source.slice(k + 1).find(l => l.startsWith('1 '));
    const f = line.trim().split(/\s+/);
    const pos = f.slice(2, 5).map(Number);
    const m = f.slice(5, 14).map(Number);
    place(newId, f[14], Number(f[1]), A.map((v, i) => v + apply(R, pos.map((p, j) => p - A0[j]))[i]), mul(R, m), port);
};
fromDifferential('driveMotor', 'driveMotor', 'A');
for (const id of ['pinionAxle', 'pinion', 'casing', 'cover', 'sideR', 'sideL', 'planet1', 'planet2', 'planet3']) fromDifferential(id);
// Motor A at (0, -100, ZR): its sides' holes at x = ±20, y = -80 and -120, z = ZR ± 20; its top face at y = -130.

// Half axles: the left one (6L) from the left side gear's bore out to its wheel, the right one (6L) likewise.
place('axleRearL', '3706.dat', 4, [-75, 0, ZR], ALONG_X);
place('axleRearR', '3706.dat', 4, [69, 0, ZR], ALONG_X);
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    // A 7L post on each side of motor A, 10 LDU out from it (clear of the differential's casing), pinned
    // into the motor's side holes at two heights, both ahead of and behind the axle.
    for (const dz of [-20, 20]) {
        const zk = dz < 0 ? 'F' : 'B';
        place(`post${k}${zk}`, '32524.dat', 72, [50 * s, -60, ZR + dz], POST);
        // 3L pins: through the motor's blind hole (x 10..30), the 10 LDU gap and the whole post (40..60),
        // their collar outwards (the pin turned end for end on the left).
        for (const y of [-80, -120]) place(`postPin${k}${zk}${-y}`, '6558.dat', 0, [40 * s, y, ZR + dz], s > 0 ? ALONG_X : [-1, 0, 0, 0, -1, 0, 0, 0, 1]);
        place(`railPin${k}${zk}`, '2780.dat', 0, [60 * s, 0, ZR + dz], ALONG_X);
    }
    // The rail: a 3L beam across the two posts' lowest holes; the half axle turns in its middle hole.
    place(`rail${k}`, '32523.dat', 71, [70 * s, 0, ZR], RAIL);
    place(`bushRear${k}`, '3713.dat', 71, [90 * s, 0, ZR], Z_ALONG_X);
}
place('wheelRearL', '39367p01.dat', 15, [-126, 0, ZR], Z_ALONG_X);
place('wheelRearR', '39367p01.dat', 15, [120, 0, ZR], Z_ALONG_X);

// ---- the hub, raised on two spacer beams over motor A, and the two front beams ---------------------------
// The hub stands 30 LDU above motor A's top face (y -130) so that motor B, under the front beams, clears
// the front wheels at any steering angle (its underside at y -74.5, the wheels' tops at -70). The spacer: a
// 7L beam (y -160..-140) on two 2L pins from the hub's bottom holes (±60, z0 + 100), a 5L half beam under it
// (-140..-130) on two 3/4 pins at x = ±40, and two 3/4 pins at x = ±20 from the half beam into motor A's
// top face holes. The front beams hang on the hub's holes (±60, z0 - 60) and (±60, z0 - 100).
const ZH = ZR - 100;
const YH = -160;
place('hub', '45601.dat', 71, [0, YH, ZH], I);
place('spacer', '32524.dat', 72, [0, -150, ZR], CROSS);
place('spacerThin', '32017.dat', 71, [0, -135, ZR], CROSS);
/** A pin 3/4 standing, filling y yTop..yTop + 30, its short (10 LDU) end down or up. */
const pin34 = (id, x, yTop, shortDown) => place(id, '32002.dat', 0, [x, yTop + (shortDown ? 20 : 10), ZR],
    shortDown ? [0, 1, 0, 1, 0, 0, 0, 0, -1] : [0, -1, 0, -1, 0, 0, 0, 0, -1]);
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    place(`hubPin${k}`, '2780.dat', 0, [60 * s, YH, ZR], ALONG_Y);
    pin34(`spacerPin${k}`, 40 * s, -160, true);
    pin34(`motorPin${k}`, 20 * s, -140, false);
}
// The front beams: 9L lying along z under the hub, holes standing, from z = ZR - 100 to ZR - 260.
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    place(`beamFront${k}`, '40490.dat', 72, [KX * s, YH + 10, ZR - 180], I);
    for (const z of [ZH - 60, ZH - 100]) place(`beamPin${k}${ZH - z}`, '2780.dat', 0, [KX * s, YH, z], ALONG_Y);
}

// ---- steering ------------------------------------------------------------------------------------------
// The knuckles: a Technic axle 3L with a perpendicular pin hole (5713) on each side. The wheel's axle turns
// in its pin hole and its axle, standing up, is the kingpin: the kingpin meets the wheel's axle (no trail),
// so the wheel turns about the point where it stands. Motor B lies under the left front beam with its
// output pointing down on the left kingpin (-KX, ZK) and its body reaching back: its top face holes
// (-KX, ZK - 20) and (-KX, ZK + 140) take pins from the beam, and the left kingpin's top sits in its output,
// so motor B turns the left wheel itself. The right kingpin is lengthened with an axle joiner and a 4L axle
// that turns in the right front beam.
place('steerMotor', '54696p01.dat', 71, [-KX, -110, ZK], [-1, 0, 0, 0, -1, 0, 0, 0, 1], 'B');
for (const z of [ZK - 20, ZK + 140]) place(`steerPin${z - ZK}`, '2780.dat', 0, [-KX, -140, z], ALONG_Y);
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    place(`knuckle${k}`, '5713.dat', 71, [KX * s, 0, ZK], [0, 1, 0, -1, 0, 0, 0, 0, 1]);
    place(`kingpinBush${k}`, '3713.dat', 71, [KX * s, -30, ZK], Z_ALONG_Y);
    // The steering arm (thin, y -20..-10): its end hole x1 on the kingpin, the hole h3 20 in and 80 back.
    place(`arm${k}`, '32250.dat', 72, [KX * s, -15, ZK + 80], s < 0 ? [1, 0, 0, 0, -1, 0, 0, 0, -1] : [-1, 0, 0, 0, 1, 0, 0, 0, -1]);
    place(`axleFront${k}`, '3705.dat', 4, [(KX + 30) * s, 0, ZK], ALONG_X);
    place(`bushFront${k}`, '3713.dat', 71, [(KX + 20) * s, 0, ZK], Z_ALONG_X);
    place(`wheelFront${k}`, '39367p01.dat', 15, [(KX + 61) * s, 0, ZK], Z_ALONG_X);
    place(`tiePin${k}`, '3673.dat', 0, [(KX - 20) * s, -20, ZK + 80], ALONG_Y);
}
place('kingpinBushL2', '3713.dat', 71, [-KX, -50, ZK], Z_ALONG_Y);
place('kingpinJoinerR', '6538a.dat', 71, [KX, -79.75, ZK], Z_ALONG_Y);
place('kingpinTopR', '3705.dat', 0, [KX, -119.75, ZK], ALONG_Y);
// The tie rod: a 5L beam lying across above the arms' ends (y -40..-20), on frictionless pins.
place('tieRod', '32316.dat', 72, [0, -30, ZK + 80], CROSS);

writeFileSync(OUT, `${[...head, ...lines].join('\n')}\n`);
process.stdout.write(`differential-car.ldr: ${lines.filter(l => l.startsWith('1 ')).length} parts, wheelbase (kingpins) ${ZR - ZK} LDU, ` +
    `Ackermann arms ${(Math.atan2(20, 80) * 180 / Math.PI).toFixed(2)}° (ideal ${(Math.atan2(KX, ZR - ZK) * 180 / Math.PI).toFixed(2)}°)\n`);
