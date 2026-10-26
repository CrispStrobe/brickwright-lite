#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Writes the Robot Lab's Crane (overlay/scratch-gui/static/sim-lab/models/crane.ldr) from its
// geometry, so every placement follows from the few numbers that define the build:
//   node scripts/gen-crane-model.mjs [out.ldr]
// A slewing, luffing crane on a SPIKE Prime hub with four pinned floor outriggers (docs/ROBOT-LAB-ARCHITECTURE.md
// T1). The base and the slewing upper are the Excavator's (scripts/gen-excavator-model.mjs), proven
// buildable there: a 28-tooth turntable on the hub's back top holes (two 42003 connectors on axle pins),
// slewed by an 8-tooth gear on motor A behind the hub (8:28); on the turntable a small frame and two 9L
// posts. The crane's own part is the boom: a 15L beam on a pivot axle through the posts, luffed by a small
// linear actuator whose motor (B, on the right post) turns the actuator's pivot axle through two 16T gears
// and the axle its spindle through two 12T bevel gears (1:1:1). The actuator's eye sits 3 holes up the boom
// and its body pivots 5 holes under the boom pivot, so its 120..180 LDU travel swings the boom from about
// 4° to past 70°. A free rope-hung load uses a counterweighted V-frame tied at its mass centre. Motor C drives a retained winch shaft on the left post;
// the rope runs from its drum over a guide at the boom tip to the independent hanging load.
// LDraw frame: x lateral, y down, z backwards; the boom works in the y-z plane, (u, v) = (-z, -y).
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {upgradePartMeta} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {ropeTie, partTop} from '../overlay/scratch-gui/src/lib/bw-sim/editor/rope-path.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';

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
    '0 // with a small linear actuator. Motor C winds a rope over the tip guide. scripts/gen-crane-model.mjs writes this file.'];
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

// ---- base: the SPIKE hub on four pinned floor outriggers ------------------------------------------------------
place('hub', '45601.dat', 71, [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
// Four pinned diagonal feet widen the support polygon against motor reaction
// torque. Their tops touch the hub's underside; no body is fixed to the world.
const diagonal = 1 / Math.sqrt(2);
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const k = `${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'F' : 'B'}`;
    const along = [sx * diagonal, 0, sz * diagonal];
    beam(`outrigger${k}`, '32278.dat', 72,
        [sx * (60 + 140 * diagonal), 10, sz * (100 + 140 * diagonal)], Y, along);
    pinAlong(`outriggerPin${k}`, '2780.dat', 0, [sx * 60, 0, sz * 100], Y);
}


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

// ---- winch: the spare left post carries C and a 1:1 16T pair on a retained 12L shaft ------------------
const hoistOut = [60 - ZT, 190];
const hoistAt = [60 - ZT, 230];
sideMotor('hoist', 'C', hoistOut, -90, [0, 1], [-1, 0], -1);
pinAlong('hoistAxle', '3708.dat', 0, W(hoistAt, -80), X);
gearOn('hoistGear16', '94925.dat', 71, W(hoistAt, -180), X);
// A friction-pin mounted inner bearing supports the shaft opposite the existing left post.
// Its lower mount at v=190 avoids C's mounting pins at v=170/210 and the boom axle at v=250.
beam('hoistBearing', '32523.dat', 71, W([60 - ZT, 210], -40), X, Y);
pinAlong('hoistBearingPin', '6558.dat', 0, W(hoistOut, -60), X);
gearOn('hoistDrum', '3713.dat', 4, W(hoistAt, -60), X);
gearOn('hoistStopOuter', '4265c.dat', 71, W(hoistAt, -195), X);
gearOn('hoistStopInner', '4265c.dat', 71, W(hoistAt, -25), X);

// ---- tip guide and independent suspended load: no fixed boom-to-hook hinge -------------------------
pinAlong('tipGuideAxle', '3705.dat', 0, W(Q, 50), X);
gearOn('tipGuide', '3713.dat', 71, W(Q, 30), X);
gearOn('tipStopInner', '4265c.dat', 71, W(Q, 15), X);
gearOn('tipStopOuter', '4265c.dat', 71, W(Q, 65), X);
// Balance a free V-frame about the central pin's rope tie. Catalogue masses
// determine the beam angle; no orientation joint, damping or artificial mass
// is added. The upper bushes sit outside the open vertical rope channel.
const sim = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'overlay/scratch-gui/src/lib/bw-sim');
const rawCatalog = JSON.parse(readFileSync(path.join(sim, 'part-meta/parts.json'), 'utf8'));
const catalog = new Map(rawCatalog.parts.map(p => [p.part, upgradePartMeta(p)]));
// Longer suspension reduces vertical sway during the existing hold and leaves
// more paid-out line on the floor, without changing any motor target or timing.
const H = W(uvAdd(Q, [0, -230]), 30);
const massOf = part => catalog.get(part).massGrams;
const loadBaseMass = massOf('6558.dat') + 2 * massOf('32316.dat');
const loadUpperMass = 2 * (massOf('43093.dat') + massOf('3713.dat'));
const tieDrop = -partTop({position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}, catalog.get('6558.dat'))[1];
const loadCos = tieDrop * (loadBaseMass + loadUpperMass) / (40 * loadUpperMass);
if (!(loadUpperMass > 0 && loadCos > 0 && loadCos < 1)) throw new Error('crane counterweight geometry cannot balance this catalogue');
const loadSin = Math.sqrt(1 - loadCos * loadCos);
pinAlong('hookLink', '6558.dat', 0, H, X);
for (const sx of [-1, 1]) {
    const id = sx < 0 ? 'load' : 'loadCounterweight';
    const centre = add(H, [sx * 20, 0, 0]);
    const along = [0, loadCos, -sx * loadSin];
    beam(id, '32316.dat', 4, centre, X, along);
    const upper = add(centre, along, -40);
    pinAlong(`${id}AxlePin`, '43093.dat', 0, add(upper, [sx * 10, 0, 0]), [sx, 0, 0]);
    gearOn(`${id}Bush`, '3713.dat', 4, add(upper, [sx * 20, 0, 0]), [sx, 0, 0]);
}

// Derive the taut length from the same placed circles and hook-top rule used by the editor/compiler.
const parsed = parseModel([...head, ...lines].join('\n'), {catalog});
if (parsed.refusals.length) throw new Error(`crane generation refused: ${JSON.stringify(parsed.refusals)}`);
const rope = ropeTie(parsed.model, catalog, ['hoistDrum', 'tipGuide', 'hookLink']);
if (rope.error) throw new Error(`crane rope refused: ${rope.error}`);
// Preserve the small connector-derived insertion pages, but author them in the
// file: the default connector-only manual cannot see the flexible rope joining
// the free hook. The source comment documents threading/tying at its hook stage;
// the existing instruction renderer shows rigid parts, without rope callouts.
const plan = buildSteps(parsed.model, catalog);
// Build the free frame through its actual central rope attachment first.
// Then fit both beams, followed by their axle pins and upper bushes together.
const payloadIds = new Set(['hookLink', 'load', 'loadCounterweight', 'loadAxlePin',
    'loadCounterweightAxlePin', 'loadBush', 'loadCounterweightBush']);
const authoredSteps = [
    ...plan.steps.map(step => ({...step, parts: step.parts.filter(id => !payloadIds.has(id))})).filter(step => step.parts.length),
    {parts: ['hookLink']},
    {parts: ['load', 'loadCounterweight']},
    {parts: ['loadAxlePin', 'loadCounterweightAxlePin', 'loadBush', 'loadCounterweightBush']}
];
const blocks = new Map();
let block = null;
for (const line of lines) {
    if (line.startsWith('0 !BW ID ')) {
        block = [];
        blocks.set(line.slice('0 !BW ID '.length), block);
    }
    if (!block) throw new Error('crane part record has no ID');
    block.push(line);
}
const pages = [];
for (const step of authoredSteps) {
    if (step.parts.includes('hookLink')) pages.push('0 // Thread the rope from the retained drum over the tip guide and tie it to the exposed centre of the hook pin between the beams; add both upper counterweights symmetrically.');
    for (const id of step.parts) pages.push(...blocks.get(id));
    pages.push('0 STEP');
}
pages.push(`0 !BW ROPE hoistCord ${rope.lengthLdu} ${rope.around.join(' ')}`);
writeFileSync(OUT, `${[...head, ...pages].join('\n')}\n`);
process.stdout.write(`crane.ldr: boom ${THETA_DEG}°, actuator ${L.toFixed(2)} LDU pin to pin (law of cosines ${L0.toFixed(2)}), ` +
    `tip ${W(Q).map(v => v.toFixed(1))}\n`);
