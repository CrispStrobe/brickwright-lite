#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Writes the Robot Lab's Excavator (overlay/scratch-gui/static/sim-lab/models/excavator.ldr) from
// its geometry, so every placement follows from the few numbers that define the build:
//   node scripts/gen-excavator-model.mjs [out.ldr]
// The base is the SPIKE driving base (hub, wheels on A/B, the front castor) with a 28-tooth turntable
// on the hub's back top holes and the slew motor (C) behind the hub; on the turntable a frame, two
// posts and an arm of a 15L boom and a 13L stick, each moved by a small linear actuator (D boom,
// E stick, F bucket) whose motor turns the actuator's pivot axle through 16T gears, the axle its
// spindle through 12T bevel gears (1:1:1). The actuators are built half extended (their lengths below,
// pin to pin, LDU), so they can move both ways. LDraw frame: x lateral, y down, z backwards; the arm
// works in the y-z plane, (u, v) = (-z, -y). docs/SIM-LAB.md describes the model.
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const OUT = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'overlay/scratch-gui/static/sim-lab/models/excavator.ldr');
/** Pin-to-pin lengths of the boom and stick actuators at build (120 contracted .. 180 extended). */
const P_ = {LD: 160, LE: 135};

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, s = 1) => a.map((v, i) => v + s * b[i]);
const scale = (a, s) => a.map(v => v * s);
const norm = a => scale(a, 1 / Math.hypot(...a));
const r4 = x => (Math.abs(x) < 1e-9 ? 0 : +x.toFixed(4));
/** LDraw point from arm-plane (u, v) and lateral x. */
const W = (uv, x = 0) => [x, -uv[1], -uv[0]];
/** LDraw direction of an arm-plane direction. */
const D = uv => [0, -uv[1], -uv[0]];
const uvAdd = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1]];
const X = [1, 0, 0];

const lines = [];
const head = ['0 Excavator (Brickwright Robot Lab reference model)', '0 Name: excavator.ldr', '0 Author: Brickwright', '0 !LDRAW_ORG Unofficial_Model'];
/** Place a part: R given as images of local x, y, z (columns). */
const place = (id, part, color, pos, ex, ey, ez, port = null) => {
    if (!ez) ez = cross(ex, ey);
    const m = [ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]].map(r4);
    lines.push(`0 !BW ID ${id}`);
    if (port) lines.push(`0 !BW PORT ${port}`);
    lines.push(`1 ${color} ${pos.map(r4).join(' ')} ${m.join(' ')} ${part}`);
};
// Common orientations.
const pinAlong = (id, part, color, pos, axis) => {
    // A pin or axle: local x along `axis`.
    const a = norm(axis);
    const t = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    const ey = norm(cross(cross(a, t), a));
    place(id, part, color, pos, a, ey);
};
/** A gear (local z = its axis) at pos on an axle along axis. */
const gearOn = (id, part, color, pos, axis) => {
    const a = norm(axis);
    const t = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const ex = norm(cross(t, a));
    place(id, part, color, pos, ex, cross(a, ex), a);
};
/** A beam (holes along local y, length along local z) with holes along `holes`, running along `along`. */
const beam = (id, part, color, centre, holes, along) => place(id, part, color, centre, cross(holes, along), holes, along);

// ---- base: SPIKE hub, two drive motors and wheels (as the SPIKE driving base) -------------
place('hub', '45601.dat', 71, [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
place('motorR', '54696p01.dat', 71, [100, 10, 80], [0, -1, 0], [-1, 0, 0], [0, 0, -1], 'B');
pinAlong('pinR', '2780.dat', 0, [70, -10, 80], X);
pinAlong('axleR', '3705.dat', 0, [170, 10, 80], X);
place('wheelR', '39367p01.dat', 15, [170, 10, 80], [0, 0, 1], [0, -1, 0], [1, 0, 0]);
place('motorL', '54696p01.dat', 71, [-100, 10, 80], [0, 1, 0], [1, 0, 0], [0, 0, -1], 'A');
pinAlong('pinL', '2780.dat', 0, [-70, -10, 80], X);
pinAlong('axleL', '3705.dat', 0, [-170, 10, 80], X);
place('wheelL', '39367p01.dat', 15, [-170, 10, 80], [0, 0, 1], [0, -1, 0], [1, 0, 0]);

// The front castor, as the SPIKE driving base has it: a 7L beam on the hub's front holes.
place('frontBeam', '32524.dat', 71, [0, -10, -120], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
place('frontPin1', '6558.dat', 1, [40, -10, -120], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
place('frontPin2', '6558.dat', 1, [-40, -10, -120], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
place('castorFront', '39370.dat', 71, [0, 10, -140], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
place('ballFront', '52629.dat', 15, [0, 56, -140], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

// ---- the turntable (28 teeth) on the hub's back top holes ---------------------------------
const ZT = 120;
const TT = [0, -110, ZT];
place('ttBottom', '99009.dat', 72, TT, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
for (const s of [1, -1]) {
    // 42003: its pin hole p1 takes a pin from the turntable's side hole, its axle hole stands on the hub
    // (an axle pin: the axle half in the 42003, the pin half in the hub's top hole).
    place(`ttMount${s > 0 ? 'R' : 'L'}`, '42003.dat', 71, [40 * s, -90, 100], [0, 1, 0], [-s, 0, 0], [0, 0, s]);
    pinAlong(`ttMountPin${s > 0 ? 'R' : 'L'}`, '2780.dat', 0, [20 * s, -90, 110], [0, 0, 1]);
    pinAlong(`ttMountAxlePin${s > 0 ? 'R' : 'L'}`, '43093.dat', 0, [60 * s, -80, 100], [0, -1, 0]);
}
place('ttTop', '99010.dat', 72, TT, [1, 0, 0], [0, 1, 0], [0, 0, 1]);

// ---- slew: SPIKE medium motor (C) behind the hub, an 8T on its output meshing the turntable --
// Output up at (20, ·, 160): 44.7 LDU from the turntable's axis = 35 (28T) + 10 (8T) within 0.5.
place('slewMotor', '54696p01.dat', 71, [20, -30, 160], [0, 0, 1], [0, 1, 0], [-1, 0, 0], 'C');
for (const y of [-50, -10]) pinAlong(`slewPin${y < -20 ? 'Hi' : 'Lo'}`, '6558.dat', 0, [40, y, 120], [0, 0, 1]);
pinAlong('slewAxle', '4519.dat', 0, [20, -90, 160], [0, 1, 0]);
gearOn('slewPinion', '3647.dat', 71, [20, -110, 160], [0, 1, 0]);
// The back castor, on a pin in the slew motor's back side hole.
place('castor', '39370.dat', 71, [0, 10, 200], [0, 0, -1], [0, 1, 0], [1, 0, 0]);
pinAlong('castorPin', '2780.dat', 0, [40, -10, 190], [0, 0, 1]);
place('ball', '52629.dat', 15, [0, 56, 200], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

// ---- upper frame on the turntable ----------------------------------------------------------
beam('frameFront', '32524.dat', 72, [0, -130, ZT - 20], [0, 0, 1], X);
beam('frameBack', '32316.dat', 72, [0, -130, ZT + 20], [0, 0, 1], X);
for (const s of [1, -1]) pinAlong(`framePin${s > 0 ? 'R' : 'L'}`, '6558.dat', 0, [20 * s, -130, ZT], [0, 0, 1]);
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    // A pin with a cross hole 40 LDU in front of the frame, on a 3L pin from the frame's end hole;
    // its own pin points out into a 9L post.
    place(`postMount${k}`, '15100.dat', 71, [60 * s, -130, ZT - 60], [s, 0, 0], [0, 0, 1]);
    pinAlong(`postMountPin${k}`, '6558.dat', 0, [60 * s, -130, ZT - 40], [0, 0, 1]);
    // (Light grey on the left, dark on the right: the right one also carries the boom motor.)
    beam(`post${k}`, '40490.dat', s > 0 ? 72 : 71, [80 * s, -190, ZT - 60], X, [0, 1, 0]);
}

// ---- arm geometry ---------------------------------------------------------------------------
const P = [60 - ZT, 250];
const BD = [60 - ZT, 150];
// Boom elevation from the boom actuator's length (law of cosines; |BP| = 100, C 100 along the boom).
const theta = Math.asin((P_.LD ** 2 - 100 ** 2 - 100 ** 2) / (2 * 100 * 100));
const a = [Math.cos(theta), Math.sin(theta)];
const n = [-Math.sin(theta), Math.cos(theta)];
const onBoom = d => uvAdd(P, a, d);
const C = onBoom(100);
const BE = onBoom(140);
const Q = onBoom(280);
// Stick angle psi (0: straight down from the boom) from the stick actuator's length: S = Q - 60 s.
const psi = Math.asin((140 ** 2 + 60 ** 2 - P_.LE ** 2) / (2 * 140 * 60));
const s = [Math.cos(psi) * -n[0] + Math.sin(psi) * a[0], Math.cos(psi) * -n[1] + Math.sin(psi) * a[1]];
const sn = [-s[1], s[0]]; // the stick's normal (90° anticlockwise from s)
const onStick = d => uvAdd(Q, s, d);
const S = onStick(-60);
const BF = onStick(40);
const T = onStick(180);

/** A small linear actuator from pin line `from` (uv) towards `to` (uv), centred at lateral x. */
const actuator = (k, from, to, x) => {
    const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const dir = norm(D([to[0] - from[0], to[1] - from[1]]));
    const ey = cross(dir, X);
    const at = W(from, x);
    place(`${k}Body`, '92693c01.dat', 25, at, X, ey, dir);
    place(`${k}Spindle`, '92695.dat', 25, add(at, dir, 30), X, ey, dir);
    place(`${k}Piston`, '92696.dat', 72, add(at, dir, L), X, ey, dir);
    // The spindle's 12T bevel on its input stub, meshing the 12T bevel on the pivot axle.
    gearOn(`${k}StubGear`, '6589.dat', 0, add(at, dir, 15), dir);
    gearOn(`${k}AxleGear`, '6589.dat', 0, W(from, x + 15), scale(X, -1));
    return L - 120;
};

/**
 * A SPIKE medium motor with its back face on a beam's face at lateral x = back, its output at uv
 * `out` turning about x (pointing away from the beam), pinned by u0/u1 into the beam's holes at
 * `out` ± 20 along `along` (uv); its body stands out along `body` (uv, perpendicular).
 */
const sideMotor = (k, port, out, back, along, body, sx) => {
    // local y -> -sx * x (output away from the beam), local x -> along, local z -> body.
    const ey = [-sx, 0, 0];
    let ex = D(along);
    let ez = cross(ex, ey);
    if (ez[1] * D(body)[1] + ez[2] * D(body)[2] < 0) { ex = scale(ex, -1); ez = cross(ex, ey); }
    const origin = W(out, back + sx * 30);
    place(`${k}Motor`, '54696p01.dat', 71, origin, ex, ey, ez, port);
    for (const sgn of [1, -1]) pinAlong(`${k}MotorPin${sgn > 0 ? 'A' : 'B'}`, '2780.dat', 0, W(uvAdd(out, along, 20 * sgn), back), X);
    // 16T on a 2L axle in the output, meshing a 16T on the actuator's pivot axle 40 LDU away.
    const face = back + sx * 80;
    // (1 LDU short of the output's bottom, which LDraw draws 19 deep; the axle's cross and the
    // gear's turned with the motor's output.)
    place(`${k}MotorAxle`, '32062.dat', 0, W(out, face + sx), X, ex);
    place(`${k}MotorGear`, '94925.dat', 71, W(out, face + sx * 10), ex, cross(X, ex), X);
};

// Boom: two 15L beams at x ±40 on the boom pivot axle through the posts.
beam('boom', '32278.dat', 72, W(onBoom(140), 50), X, D(a));
pinAlong('boomPivot', '60485.dat', 0, W(P, 0), X);
// Boom actuator D: pivot axle through posts, blocks and its lugs; motor D on the right post.
const extD = actuator('boomLa', BD, C, 0);
pinAlong('boomLaAxle', '3708.dat', 0, W(BD, 80), X);
pinAlong('boomLaEye', '3705.dat', 0, W(C, 20), X);
sideMotor('boom', 'D', [60 - ZT, 190], 90, [0, 1], [-1, 0], 1);
gearOn('boomLaGear16', '94925.dat', 71, W(BD, 180), X);
// Stick: two 13L beams at x ±100 on the boom tip axle.
beam('stick', '41239.dat', 72, W(onStick(60), 100), X, D(s));
pinAlong('stickPivot', '3705.dat', 0, W(Q, 70), X);
// Stick actuator E: on the boom (pivot 140 along it), its eye on the stick 60 above the tip axle.
const extE = actuator('stickLa', BE, S, 0);
pinAlong('stickLaAxle', '3737.dat', 0, W(BE, 65), X);
pinAlong('stickLaEye', '3706.dat', 0, W(S, 50), X);
sideMotor('stick', 'E', onBoom(100), 60, a, n, 1);
gearOn('stickLaGear16', '94925.dat', 71, W(BE, 150), X);
// Bucket on the stick's last hole; bucket actuator F on the stick, its eye on the bucket's other hole.
// The bucket's lug holes run across the stick; its bowl hangs on the side away from the machine.
const lever = uvAdd(T, sn, -40);
{
    // The bowl hangs down the stick (its mesh lies along local -z), the mouth faces the machine (local -y),
    // the lug's holes along local y: the pivot at T, the lever hole 40 LDU towards the machine.
    const ex = scale(X, -1);
    const ez = scale(D(s), -1);
    const ey = cross(ez, ex);
    place('bucket', '24120.dat', 0, W(uvAdd(T, sn, -20), 0), ex, ey, ez);
}
pinAlong('bucketPivot', '3706.dat', 0, W(T, 50), X);
const extF = actuator('bucketLa', BF, lever, 20);
pinAlong('bucketLaAxle', '3737.dat', 0, W(BF, 110), X);
pinAlong('bucketLaEye', '32062.dat', 0, W(lever, 10), X);
sideMotor('bucket', 'F', onStick(80), 110, s, sn, 1);
gearOn('bucketLaGear16', '94925.dat', 71, W(BF, 200), X);

writeFileSync(OUT, `${[...head, ...lines].join('\n')}\n`);
process.stdout.write(`excavator.ldr: boom ${(theta * 180 / Math.PI).toFixed(1)}° psi ${(psi * 180 / Math.PI).toFixed(1)}°  ext D ${extD.toFixed(1)} E ${extE.toFixed(1)} F ${extF.toFixed(1)}  Q ${Q.map(v => v.toFixed(0))} T ${T.map(v => v.toFixed(0))}\n`);
