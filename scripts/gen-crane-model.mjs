#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Writes the Robot Lab's Crane (overlay/scratch-gui/static/sim-lab/models/crane.ldr) from its
// geometry, so every placement follows from the few numbers that define the build:
//   node scripts/gen-crane-model.mjs [out.ldr]
// A slewing, luffing crane on a SPIKE Prime hub that stands on the floor (docs/ROBOT-LAB-ARCHITECTURE.md
// T1). The base and the slewing upper are the Excavator's (scripts/gen-excavator-model.mjs), proven
// buildable there: a 28-tooth turntable on the hub's back top holes (two 42003 connectors on axle pins),
// slewed by an 8-tooth gear on motor A behind the hub (8:28); on the turntable a small frame and two 9L
// posts. The crane's own part is the boom: a 15L beam on a pivot axle through the posts, luffed by a small
// linear actuator whose motor (B, on the right post) turns the actuator's pivot axle through two 16T gears
// and the axle its spindle through two 12T bevel gears (1:1:1). The actuator's eye sits 3 holes up the boom
// and its body pivots 5 holes under the boom pivot, so its 120..180 LDU travel swings the boom from about
// 4° to past 70°. A hook hangs from the boom tip on a pin, free to swing: a 5L link and a Technic brick
// 1 x 4 pinned to its lower end as the load.
// No winch: ropes (lego-8f, PR #1123) are not on main yet; when they are, a hoist drum on the upper and
// a rope over the boom tip replace the fixed link.
// LDraw frame: x lateral, y down, z backwards; the boom works in the y-z plane, (u, v) = (-z, -y).
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const OUT = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'overlay/scratch-gui/static/sim-lab/models/crane.ldr');
/** The boom's elevation at build, degrees: the luffing actuator is then 140 LDU pin to pin (half out). */
const THETA_DEG = 30;
/** Boom pivot P to the actuator's pivot B (straight below P) and to its eye C on the boom, LDU. */
const BP = 100;
const PC = 60;
/** Boom pivot to the tip hole (the 15L beam's last hole), LDU. */
const PQ = 280;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, s = 1) => a.map((v, i) => v + s * b[i]);
const scale = (a, s) => a.map(v => v * s);
const norm = a => scale(a, 1 / Math.hypot(...a));
const r4 = x => (Math.abs(x) < 1e-9 ? 0 : +x.toFixed(4));
/** LDraw point from boom-plane (u, v) and lateral x. */
const W = (uv, x = 0) => [x, -uv[1], -uv[0]];
/** LDraw direction of a boom-plane direction. */
const D = uv => [0, -uv[1], -uv[0]];
const uvAdd = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1]];
const X = [1, 0, 0];
const Y = [0, 1, 0];

const lines = [];
const head = ['0 Crane (Brickwright Robot Lab reference model)', '0 Name: crane.ldr', '0 Author: Brickwright', '0 !LDRAW_ORG Unofficial_Model',
    '0 // A slewing crane on a SPIKE Prime hub: motor A turns the turntable (8 teeth into 28), motor B luffs the boom',
    '0 // with a small linear actuator. The hook hangs from the boom tip. scripts/gen-crane-model.mjs writes this file.'];
/** Place a part: R given as images of local x, y, z (columns). */
const place = (id, part, color, pos, ex, ey, ez, port = null) => {
    if (!ez) ez = cross(ex, ey);
    const m = [ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]].map(r4);
    lines.push(`0 !BW ID ${id}`);
    if (port) lines.push(`0 !BW PORT ${port}`);
    lines.push(`1 ${color} ${pos.map(r4).join(' ')} ${m.join(' ')} ${part}`);
};
/** A pin or axle: local x along `axis`. */
const pinAlong = (id, part, color, pos, axis) => {
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

// ---- base: the SPIKE hub standing on the floor ------------------------------------------------------
place('hub', '45601.dat', 71, [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

// ---- the turntable (28 teeth) on the hub's back top holes (as the Excavator) -------------------------
const ZT = 120;
const TT = [0, -110, ZT];
place('ttBottom', '99009.dat', 72, TT, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    place(`ttMount${k}`, '42003.dat', 71, [40 * s, -90, 100], [0, 1, 0], [-s, 0, 0], [0, 0, s]);
    pinAlong(`ttMountPin${k}`, '2780.dat', 0, [20 * s, -90, 110], [0, 0, 1]);
    pinAlong(`ttMountAxlePin${k}`, '43093.dat', 0, [60 * s, -80, 100], [0, -1, 0]);
}
place('ttTop', '99010.dat', 72, TT, [1, 0, 0], [0, 1, 0], [0, 0, 1]);

// ---- slew: SPIKE medium motor (A) behind the hub, an 8T on its output meshing the turntable ---------
// Output up at (20, ·, 160): 44.7 LDU from the turntable's axis = 35 (28T) + 10 (8T) within 0.5.
place('slewMotor', '54696p01.dat', 71, [20, -30, 160], [0, 0, 1], [0, 1, 0], [-1, 0, 0], 'A');
for (const y of [-50, -10]) pinAlong(`slewPin${y < -20 ? 'Hi' : 'Lo'}`, '6558.dat', 0, [40, y, 120], [0, 0, 1]);
pinAlong('slewAxle', '4519.dat', 0, [20, -90, 160], [0, 1, 0]);
gearOn('slewPinion', '3647.dat', 71, [20, -110, 160], [0, 1, 0]);

// ---- upper frame on the turntable, two 9L posts -----------------------------------------------------
beam('frameFront', '32524.dat', 72, [0, -130, ZT - 20], [0, 0, 1], X);
beam('frameBack', '32316.dat', 72, [0, -130, ZT + 20], [0, 0, 1], X);
for (const s of [1, -1]) pinAlong(`framePin${s > 0 ? 'R' : 'L'}`, '6558.dat', 0, [20 * s, -130, ZT], [0, 0, 1]);
for (const s of [1, -1]) {
    const k = s > 0 ? 'R' : 'L';
    place(`postMount${k}`, '15100.dat', 71, [60 * s, -130, ZT - 60], [s, 0, 0], [0, 0, 1]);
    pinAlong(`postMountPin${k}`, '6558.dat', 0, [60 * s, -130, ZT - 40], [0, 0, 1]);
    beam(`post${k}`, '40490.dat', s > 0 ? 72 : 71, [80 * s, -190, ZT - 60], X, Y);
}

// ---- boom geometry ----------------------------------------------------------------------------------
const P = [60 - ZT, 250];
const B = [60 - ZT, 250 - BP];
const theta = THETA_DEG * Math.PI / 180;
const a = [Math.cos(theta), Math.sin(theta)];
const onBoom = d => uvAdd(P, a, d);
const C = onBoom(PC);
const Q = onBoom(PQ);
/** The actuator's pin-to-pin length at build: B straight below P, C on the boom (law of cosines). */
const L0 = Math.hypot(C[0] - B[0], C[1] - B[1]);

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
    return L;
};

/**
 * A SPIKE medium motor with its back face on a beam's face at lateral x = back, its output at uv
 * `out` turning about x (pointing away from the beam), pinned into the beam's holes at `out` ± 20
 * along `along` (uv); its body stands out along `body` (uv). A 16T on a 2L axle in its output.
 */
const sideMotor = (k, port, out, back, along, body, sx) => {
    const ey = [-sx, 0, 0];
    let ex = D(along);
    let ez = cross(ex, ey);
    if (ez[1] * D(body)[1] + ez[2] * D(body)[2] < 0) { ex = scale(ex, -1); ez = cross(ex, ey); }
    place(`${k}Motor`, '54696p01.dat', 71, W(out, back + sx * 30), ex, ey, ez, port);
    for (const sgn of [1, -1]) pinAlong(`${k}MotorPin${sgn > 0 ? 'A' : 'B'}`, '2780.dat', 0, W(uvAdd(out, along, 20 * sgn), back), X);
    const face = back + sx * 80;
    place(`${k}MotorAxle`, '32062.dat', 0, W(out, face + sx), X, ex);
    place(`${k}MotorGear`, '94925.dat', 71, W(out, face + sx * 10), ex, cross(X, ex), X);
};

// Boom: a 15L beam at x = 50 on the boom pivot axle through the posts.
beam('boom', '32278.dat', 72, W(onBoom(140), 50), X, D(a));
pinAlong('boomPivot', '60485.dat', 0, W(P, 0), X);
// The luffing actuator: its pivot axle through the posts and its lugs, motor B on the right post.
const L = actuator('luffLa', B, C, 0);
pinAlong('luffLaAxle', '3708.dat', 0, W(B, 80), X);
pinAlong('luffLaEye', '3705.dat', 0, W(C, 20), X);
sideMotor('luff', 'B', [60 - ZT, 190], 90, [0, 1], [-1, 0], 1);
gearOn('luffLaGear16', '94925.dat', 71, W(B, 180), X);

// ---- the hook at the boom tip: a 5L link on a frictionless pin (3673), free to swing; the load pinned to its lower end ---
pinAlong('hookPin', '3673.dat', 0, W(Q, 40), X);
beam('hookLink', '32316.dat', 71, W(uvAdd(Q, [0, -40]), 30), X, Y);
for (const d of [60, 80]) pinAlong(`loadPin${d}`, '2780.dat', 0, W(uvAdd(Q, [0, -d]), 20), X);
// Technic brick 1 x 4 with holes standing on end (its length down, its holes along x, its studs facing
// forward): local x → down, local y → back (+z), local z → +x. Its holes are 10 LDU up its local y.
place('load', '3701.dat', 4, add(W(uvAdd(Q, [0, -80]), 10), [0, 0, -10]), Y, [0, 0, 1], X);

writeFileSync(OUT, `${[...head, ...lines].join('\n')}\n`);
process.stdout.write(`crane.ldr: boom ${THETA_DEG}°, actuator ${L.toFixed(2)} LDU pin to pin (law of cosines ${L0.toFixed(2)}), ` +
    `tip ${W(Q).map(v => v.toFixed(1))}\n`);
