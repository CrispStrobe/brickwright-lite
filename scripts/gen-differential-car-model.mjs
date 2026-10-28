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
//   - The hub lies on a thin beam over motor A (3/4 pins into the motor's top face) and carries two 11L
//     beams with alternating holes that reach forward under it to the front axle.
//   - Front steering, rack and pinion: each front wheel turns on a knuckle (axle 3L with a perpendicular pin
//     hole, 5713) whose standing axle is its kingpin, carried up into the front beam. A steering arm (liftarm
//     3 x 5 bent 90, 32250) on each knuckle reaches 4 holes back and 1 hole in: the arms' lines meet at the
//     middle of the rear axle (each reaches 20 in and 80 back; the kingpins are 60 out and 240 ahead of the
//     rear axle: 60/240 = 20/80), the Ackermann trapezoid. A gear rack (1 x 13, 64781) lies across behind
//     the kingpins, teeth up; a 5L tie rod from each of its end holes turns an arm. Motor B stands upright in
//     front of the hub, between the front beams, its output pointing back: a 3L axle carries a 12T pinion
//     onto the rack. The rack slides in a guide: on each side a toggle joint (48496) on the rack's axle
//     runs along an axle fixed to motor B, and the toggle's eyes meeting the axle's holder end the travel
//     (30 LDU each way). In a turn the inner wheel turns further than the outer one, by less than the
//     trapezoid alone would: the rack moves both tie rods' inner ends as one.
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
    '0 // Rear-wheel drive through a differential (motor A) and rack-and-pinion front steering (motor B).',
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
    // The half axle (6L) from its side gear's bore out through the rail, a bush, and the wheel on its end;
    // the rail: a 3L beam across the two posts' lowest holes, the half axle turning in its middle hole.
    // (In this order the derived building steps put each wheel on with its axle.)
    place(`wheelRear${k}`, '39367p01.dat', 15, [s > 0 ? 120 : -126, 0, ZR], Z_ALONG_X);
    place(`axleRear${k}`, '3706.dat', 4, [s > 0 ? 69 : -75, 0, ZR], ALONG_X);
    place(`bushRear${k}`, '3713.dat', 71, [90 * s, 0, ZR], Z_ALONG_X);
    place(`rail${k}`, '32523.dat', 71, [70 * s, 0, ZR], RAIL);
}

// ---- the hub, on a thin beam over motor A, and the two front beams ---------------------------------------
// The hub lies 10 LDU above motor A's top face (y -130), on a 7L thin beam: two 3/4 pins from the hub's bottom
// holes (±60, z0 + 60) into the beam and two from the beam into motor A's top face holes (±20). It sits 40 back
// (its front at z = -50) so that motor B stands in front of it. The front beams (11L with alternating holes,
// x = ±KX) hang on the hub's holes (±60, z0 - 60) and (±60, z0 - 100): every hole of theirs that a pin or the
// kingpin needs standing stands (z ≡ 0 mod 40), the holes across (z ≡ 20 mod 40) take motor B's pins.
const ZH = ZR - 60;
const YH = -140;
place('hub', '45601.dat', 71, [0, YH, ZH], I);
place('spacer', '32065.dat', 72, [0, -135, ZR], CROSS);
/** A pin 3/4 standing, filling y yTop..yTop + 30, its short (10 LDU) end down or up. */
const pin34 = (id, x, yTop, shortDown, z = ZR) => place(id, '32002.dat', 0, [x, yTop + (shortDown ? 20 : 10), z],
    shortDown ? [0, 1, 0, 1, 0, 0, 0, 0, -1] : [0, -1, 0, -1, 0, 0, 0, 0, -1]);
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    pin34(`hubPin${k}`, 60 * s, YH - 20, true);
    pin34(`motorPin${k}`, 20 * s, YH, false);
}
/** The front beams' middle (z): their standing holes at z ≡ 0 (mod 40), the holes across at z ≡ 20. */
const ZB = ZK + 60;
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    place(`beamFront${k}`, '73507.dat', 72, [KX * s, YH + 10, ZB], I);
    for (const z of [ZH - 60, ZH - 100]) place(`beamPin${k}${ZH - z}`, '2780.dat', 0, [KX * s, YH, z], ALONG_Y);
}

// ---- steering: kingpins, arms and tie rods ------------------------------------------------------------------
// The knuckles: a Technic axle 3L with a perpendicular pin hole (5713) on each side. The wheel's axle turns
// in its pin hole and its axle, standing up, is the kingpin: the kingpin meets the wheel's axle (no trail),
// so the wheel turns about the point where it stands. An axle joiner on the knuckle's axle and a 4L axle from
// it up through the front beam's standing hole carry each kingpin; the steering arm (liftarm 3 x 5 bent 90,
// 32250, thin, y -60..-50) sits on the knuckle's axle under the joiner: its end hole x1 on the kingpin, the
// hole h3 20 in and 80 back. The arms' lines meet at the middle of the rear axle (each reaches 20 in and 80
// back; the kingpins are 60 out and 240 ahead of the rear axle: 60/240 = 20/80), the Ackermann trapezoid.
// A 5L tie rod on each side (y -80..-60) joins the arm's end (a 3/4 pin) to the rack's end hole (a pin).
// (The rack between the tie rods takes some of the trapezoid's effect back; the arm's hole x2, 40 in, would
// give more of it back, but its tie rod's inner end would swing against motor A's front face at z = -30.)
const YA = -55;
const ZT = ZK + 80;
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    place(`knuckle${k}`, '5713.dat', 71, [KX * s, 0, ZK], [0, 1, 0, -1, 0, 0, 0, 0, 1]);
    place(`kingpinBush${k}`, '3713.dat', 71, [KX * s, -30, ZK], Z_ALONG_Y);
    place(`arm${k}`, '32250.dat', 72, [KX * s, YA, ZT], s < 0 ? [1, 0, 0, 0, -1, 0, 0, 0, -1] : [-1, 0, 0, 0, 1, 0, 0, 0, -1]);
    place(`kingpinJoiner${k}`, '6538a.dat', 71, [KX * s, -80, ZK], Z_ALONG_Y);
    place(`kingpinTop${k}`, '3705.dat', 0, [KX * s, -110, ZK], ALONG_Y);
    place(`axleFront${k}`, '3705.dat', 4, [(KX + 30) * s, 0, ZK], ALONG_X);
    place(`bushFront${k}`, '3713.dat', 71, [(KX + 20) * s, 0, ZK], Z_ALONG_X);
    place(`wheelFront${k}`, '39367p01.dat', 15, [(KX + 61) * s, 0, ZK], Z_ALONG_X);
    place(`tieRod${k}`, '32316.dat', 72, [(KX + 20) * s, YA - 15, ZT], CROSS);
    pin34(`armPin${k}`, (KX - 20) * s, YA - 25, true, ZT);
    place(`rackPin${k}`, '3673.dat', 0, [(KX + 60) * s, YA - 25, ZT], ALONG_Y);
}

// ---- the rack, its pinion and motor B -----------------------------------------------------------------------
// The rack (gear rack 1 x 13 with holes, 64781) lies across behind the kingpins, teeth up, its end holes over the
// tie rods' outer holes (x = ±120). A 12T gear on top of it, its axle along the car, is the pinion: motor B stands
// in front of it, upright between the front beams, its output pointing back, and a 3L axle joins the two. Motor
// B's side holes take two 3L pins on each side into the front beams' holes across.
const YR = YA - 35;
place('rack', '64781.dat', 71, [0, YR, ZT], I);
place('steerPinion', '69778.dat', 72, [0, YR - 20, ZT], I);
const AXLE_Z = [0, 0, -1, 0, 1, 0, 1, 0, 0];
place('steerAxle', '4519.dat', 0, [0, YR - 20, ZT - 20], AXLE_Z);
const ZM = ZT - 80;
place('steerMotor', '54696p01.dat', 71, [0, YR - 20, ZM], [-1, 0, 0, 0, 0, -1, 0, -1, 0], 'B');
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    for (const z of [ZM + 20, ZM - 20]) place(`steerPin${k}${ZM - z}`, '6558.dat', 0, [40 * s, YR - 40, z], s > 0 ? ALONG_X : [-1, 0, 0, 0, -1, 0, 0, 0, 1]);
}

// ---- the rack's guide ---------------------------------------------------------------------------------------
// On each side a 2L axle in the rack's axle hole carries a 3L beam with an axle hole (7229) in front of the rack,
// and a smooth toggle joint (48496) on the beam's two pin holes: its two eyes slide along a 6L axle across the
// car. The axle is fixed to motor B: it sits in B's side hole and in a 1 x 4 thin liftarm's axle hole, the
// liftarm held by the motor's lower 3L pin. The rack slides 30 each way: the eyes meet the liftarm going in,
// and on the other side the far toggle's eyes meet its liftarm.
const ZG = ZM + 20;
const T_ROT = [0, 0, 1, 1, 0, 0, 0, 1, 0];
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    place(`rackAxle${k}`, '32062.dat', 0, [100 * s, YR, ZT - 10], AXLE_Z);
    place(`slideBeam${k}`, '7229.dat', 72, [100 * s, YR, ZT - 20], T_ROT);
    place(`slide${k}`, '48496.dat', 72, [100 * s, YR, ZG + 30], T_ROT);
    place(`guide${k}`, '3706.dat', 4, [70 * s, YR, ZG], ALONG_X);
    place(`guideHolder${k}`, '32449.dat', 72, [35 * s, YR - 30, ZG], [0, 1, 0, 0, 0, -1, -1, 0, 0]);
}

writeFileSync(OUT, `${[...head, ...lines].join('\n')}\n`);
process.stdout.write(`differential-car.ldr: ${lines.filter(l => l.startsWith('1 ')).length} parts, wheelbase (kingpins) ${ZR - ZK} LDU, ` +
    `Ackermann arms ${(Math.atan2(20, 80) * 180 / Math.PI).toFixed(2)}° (ideal ${(Math.atan2(KX, ZR - ZK) * 180 / Math.PI).toFixed(2)}°)\n`);
