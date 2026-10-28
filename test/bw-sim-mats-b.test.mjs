// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The two Robot Lab mats from the sumo/maze contract: the sumo ring
// (bw-sim/world/mats.js `sumo`) and the maze (`maze`, walls as static boxes on
// a 0.3 m grid). Patterns follow test/bw-sim-mats.test.mjs: hand-picked
// colorAt points whose expectations are derived from the published dimensions,
// paint-vs-colorAt agreement at seeded random points, start-pose sanity, plus
// a BFS solved from the wall list alone, the S1 driving base's footprint
// against the walls, and one physics run (Jolt, so this file runs through the
// gui-scope loader and is on jolt-physics/wasm-compat's allow list).
//
// Coordinates: mats.js colorAt(x, z), place.js startPose and the obstacle
// positions share one plane (sensors.js reads colorAt at the physics hit
// point); heading is degrees from world +x toward +z (place.js), so heading 90
// faces +z and heading 0 faces +x.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MATS, createMat} from '../overlay/scratch-gui/src/lib/bw-sim/world/mats.js';
import {placeOnStart, driveAnchor} from '../overlay/scratch-gui/src/lib/bw-sim/world/place.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {vecAdd, quatMul, quatConj} from '../overlay/scratch-gui/src/lib/bw-sim/mech/vec.js';
import {SimSession} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
/** The S1 reference driving base: authored parts (json) and its LDraw text. */
const MODEL = json('test/fixtures/bw-sim/driving-base.json');
const BASE_TEXT = readFileSync(path.join(ROOT, 'test/fixtures/bw-sim/driving-base.ldr'), 'utf8');

/** A wall's footprint on the mat, from its box size and position. */
const rectOf = o => {
    const [sx, , sz] = o.size;
    const [px, , pz] = o.position;
    return {x0: px - sx / 2, x1: px + sx / 2, z0: pz - sz / 2, z1: pz + sz / 2};
};
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Rotates v by unit quaternion q (xyzw), as mech/vec.js does for compile. */
const quatRotateVec = (q, v) => {
    const qv = [v[0], v[1], v[2], 0];
    let r = quatMul(q, qv);
    r = quatMul(r, quatConj(q));
    return [r[0], r[1], r[2]];
};

/**
 * World-space axis-aligned bounding box of a compiled body: its position plus
 * every collider, transformed by the body pose (colliders live in body space,
 * the same chain jolt-core builds shapes with). `extent` is each primitive's
 * world reach along one axis, the same formula makeGround uses for y.
 */
const bodyAABB = body => {
    const out = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity};
    const grow = (x, y, z) => {
        out.x0 = Math.min(out.x0, x); out.x1 = Math.max(out.x1, x);
        out.y0 = Math.min(out.y0, y); out.y1 = Math.max(out.y1, y);
        out.z0 = Math.min(out.z0, z); out.z1 = Math.max(out.z1, z);
    };
    for (const col of body.colliders) {
        const cpos = col.position ? col.position : [0, 0, 0];
        const crot = col.rotation ? col.rotation : [0, 0, 0, 1];
        const rot = quatMul(body.rotation, crot);
        const pos = vecAdd(body.position, quatRotateVec(body.rotation, cpos));
        if (col.shape === 'sphere') {
            grow(pos[0] - col.radius, pos[1] - col.radius, pos[2] - col.radius);
            grow(pos[0] + col.radius, pos[1] + col.radius, pos[2] + col.radius);
        } else if (col.shape === 'cylinder') {
            // World extent along axis i: halfHeight along the cylinder's world
            // axis + the radius of the circular cross-section projected on i.
            const a = quatRotateVec(rot, [0, 1, 0]);
            const reach = i => col.halfHeight * Math.abs(a[i]) +
                col.radius * Math.sqrt(Math.max(0, 1 - a[i] * a[i]));
            grow(pos[0] - reach(0), pos[1] - reach(1), pos[2] - reach(2));
            grow(pos[0] + reach(0), pos[1] + reach(1), pos[2] + reach(2));
        } else {
            // Box: sum each local half-extent's contribution along the axis.
            const he = col.halfExtents;
            const ext = axis => Math.abs(he[0] * axis[0]) + Math.abs(he[1] * axis[1]) + Math.abs(he[2] * axis[2]);
            const ax = quatRotateVec(rot, [1, 0, 0]);
            const ay = quatRotateVec(rot, [0, 1, 0]);
            const az = quatRotateVec(rot, [0, 0, 1]);
            grow(pos[0] - ext(ax), pos[1] - ext(ay), pos[2] - ext(az));
            grow(pos[0] + ext(ax), pos[1] + ext(ay), pos[2] + ext(az));
        }
    }
    return out;
};

test('1. sumo ring: colorAt at hand-picked points (radii hand-derived)', () => {
    // Outer diameter 0.77 m, band 0.05 m wide: inner radius = 0.77/2 - 0.05 = 0.335,
    // outer radius = 0.77/2 = 0.385.
    const mat = createMat('sumo');
    assert.deepEqual(mat.sizeM, [1, 1]);
    assert.equal(MATS.find(m => m.id === 'sumo').title.en, 'Sumo ring', 'EN title, both required');
    assert.equal(MATS.find(m => m.id === 'sumo').title.de, 'Sumo-Ring', 'DE title');
    assert.equal(mat.colorAt(0, 0).color, 10, 'centre: inside the ring is white');
    assert.equal(mat.colorAt(0.36, 0).color, 0, 'r = 0.36 in [0.335, 0.385]: the band, black');
    assert.equal(mat.colorAt(0.36, 0).reflection, 5, 'black reflects ~5 %');
    assert.equal(mat.colorAt(-0.36, 0).color, 0, 'same band, -x');
    assert.equal(mat.colorAt(0, 0.36).color, 0, 'and +z: the band is circular');
    assert.equal(mat.colorAt(0, -0.36).color, 0, 'and -z');
    assert.equal(mat.colorAt(0.33, 0).color, 10, 'r = 0.33 < 0.335: just inside is white');
    // Outside the band would be grey; mats.js COLORS has no grey id, so the mat
    // reads white there (said in the mat's comment and REPORT.md).
    assert.equal(mat.colorAt(0.39, 0).color, 10, 'r = 0.39 > 0.385: just outside is white (no grey id)');
    assert.equal(mat.colorAt(0.4, 0).color, 10, 'clearly outside the band');
    assert.equal(mat.colorAt(10, 10).color, 10, 'outside the mat is white');
    // Diagonal of the band: r = 0.36/sqrt(2) each way, still on the band.
    assert.equal(mat.colorAt(0.36 / Math.sqrt(2), 0.36 / Math.sqrt(2)).color, 0, 'r = 0.36 on the diagonal');
    assert.equal(mat.colorAt(0.272, 0.272).color, 0, 'r = 0.385 on the diagonal: outer edge inside the band');
    assert.equal(mat.colorAt(0.335 / Math.SQRT2 + 1e-6, 0.335 / Math.SQRT2).color, 0, 'r = 0.335 on the diagonal: inner edge inside the band');
    assert.equal(mat.colorAt(0.3 / Math.SQRT2, 0.3 / Math.SQRT2).color, 10, 'r = 0.3 on the diagonal: white inside');
});

test('2. maze: colors, the green goal square and the wall list', () => {
    // 1.2 m = 4 cells x 0.3 m; cell (i, j) centre = (-0.6 + 0.3*i + 0.15, -0.6 + 0.3*j + 0.15).
    const mat = createMat('maze');
    assert.deepEqual(mat.sizeM, [1.2, 1.2]);
    assert.equal(MATS.find(m => m.id === 'maze').title.en, 'Maze', 'EN title, both required');
    assert.equal(MATS.find(m => m.id === 'maze').title.de, 'Labyrinth', 'DE title');
    assert.equal(mat.colorAt(-0.45, -0.45).color, 10, 'start cell (0,0) centre is white');
    assert.equal(mat.colorAt(0.45, -0.45).color, 6, 'goal cell (3,0) centre is green');
    const goal = mat.colorAt(0.45, -0.45);
    assert.deepEqual(goal.rgb, createMat('colour-zones').colorAt(-0.35, 0.35).rgb, 'the green square is the Colour Zones green');
    assert.equal(goal.reflection, 50);
    // Wall across the corridor north of the start cell: on the line z = -0.6 + 2*0.3 = 0,
    // spanning x in [-0.6, -0.3]. Its floor footprint reads dark grey.
    assert.equal(mat.colorAt(-0.45, 0).color, 0, 'the first wall ahead of the start pose');
    assert.deepEqual(mat.colorAt(-0.45, 0).rgb, [60, 60, 60], 'dark grey rgb');
    assert.equal(mat.colorAt(0, -0.59).color, 0, 'the south boundary wall floor (inset 0.01)');
    assert.equal(mat.colorAt(0, 0).color, 0, 'grid crossing (0, -0.6+2*0.3) x (0, 0): walls meet there');
    assert.equal(mat.colorAt(-0.45, -0.33).color, 10, 'open corridor between (0,0) and (0,1): white');
    assert.equal(mat.colorAt(10, 10).color, 10, 'outside the mat is white');
    // 9 interior walls + 16 boundary walls, each spanning one 0.3 m grid edge.
    assert.equal(mat.obstacles.length, 9 + 16);
    for (const o of mat.obstacles) {
        assert.equal(o.shape, 'box');
        assert.deepEqual(o.size.sort((a, b) => a - b), [0.02, 0.04, 0.3], `${o.id}: thickness 0.02, height 0.04, one cell long`);
        const r = rectOf(o);
        assert.ok(Math.abs(r.x1 - r.x0 - 0.02) < 1e-9 || Math.abs(r.z1 - r.z0 - 0.02) < 1e-9, `${o.id} lies on a grid line`);
    }
});

test('3. paint agrees with colorAt at 200 seeded random points', () => {
    const pxPerM = 100;
    for (const matId of ['sumo', 'maze']) {
        const mat = createMat(matId);
        const [w, d] = mat.sizeM;
        const width = Math.round(w * pxPerM) + 40; // extra for outside
        const height = Math.round(d * pxPerM) + 40;
        const imageData = {width, height, data: new Uint8ClampedArray(width * height * 4)};
        mat.paint(imageData, pxPerM);
        // Seeded PRNG, the same one test/bw-sim-mats.test.mjs uses.
        let seed = 12345;
        const rand = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        for (let i = 0; i < 200; i++) {
            const x = (rand() - 0.5) * (w + 0.4);
            const z = (rand() - 0.5) * (d + 0.4);
            const c1 = mat.colorAt(x, z);
            const px = Math.round(x * pxPerM + width / 2 - 0.5);
            const py = Math.round(z * pxPerM + height / 2 - 0.5);
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            const idx = (py * width + px) * 4;
            const r = imageData.data[idx] * 4;
            const g = imageData.data[idx + 1] * 4;
            const b = imageData.data[idx + 2] * 4;
            if (Math.abs(r - c1.rgb[0]) > 10 || Math.abs(g - c1.rgb[1]) > 10 || Math.abs(b - c1.rgb[2]) > 10) {
                // One pixel of edge allowance: check the neighbouring pixels.
                let found = false;
                for (let dx = -1; dx <= 1 && !found; dx++) for (let dy = -1; dy <= 1 && !found; dy++) {
                    const nx = px + dx, ny = py + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    const nIdx = (ny * width + nx) * 4;
                    const nr = imageData.data[nIdx] * 4, ng = imageData.data[nIdx + 1] * 4, nb = imageData.data[nIdx + 2] * 4;
                    if (Math.abs(nr - c1.rgb[0]) <= 10 && Math.abs(ng - c1.rgb[1]) <= 10 && Math.abs(nb - c1.rgb[2]) <= 10) found = true;
                }
                assert.ok(found, `paint vs colorAt mismatch at ${x.toFixed(3)},${z.toFixed(3)} for ${matId}: paint ${r},${g},${b} vs colorAt ${c1.rgb}`);
            }
        }
    }
});

test('4. start poses: on white / in the start cell, outside every wall', () => {
    const sumo = createMat('sumo');
    assert.deepEqual(sumo.startPose, {x: 0, z: 0, heading: 0}, 'start pose: the ring centre, heading +x');
    assert.equal(sumo.colorAt(sumo.startPose.x, sumo.startPose.z).color, 10, 'the sumo start is on white');

    const maze = createMat('maze');
    // Cell (0,0) centre: -0.6 + 0.3*0 + 0.15 = -0.45; heading 90 = facing +z (the open corridor).
    assert.equal(maze.startPose.x, -0.45);
    assert.equal(maze.startPose.z, -0.45);
    assert.equal(maze.startPose.heading, 90);
    assert.equal(maze.colorAt(maze.startPose.x, maze.startPose.z).color, 10, 'the maze start is on white start-cell floor');
    for (const o of maze.obstacles) {
        assert.ok(!inRect(rectOf(o), maze.startPose.x, maze.startPose.z), `${o.id} does not cover the start pose`);
    }
});

test('5. maze: BFS from start to goal over the wall list; every wall inside the mat', () => {
    const mat = createMat('maze');
    // Adjacency read from the wall list (independently of how the walls were
    // generated): two cells are joined unless a wall covers the midpoint of
    // their shared grid edge.
    const rects = mat.obstacles.map(rectOf);
    const blocked = (x, z) => rects.some(r => r.x0 < x && x < r.x1 && r.z0 < z && z < r.z1);
    const key = (i, j) => `${i},${j}`;
    const start = [0, 0], goal = [3, 0];
    const seen = new Set([key(...start)]);
    const queue = [start];
    let found = false;
    while (queue.length) {
        const [i, j] = queue.shift();
        if (i === goal[0] && j === goal[1]) { found = true; continue; }
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj;
            if (ni < 0 || ni > 3 || nj < 0 || nj > 3) continue;
            // Shared edge midpoint: vertical edge between (i,j) and (i+1,j) at
            // x = -0.6 + 0.3*(i+1); horizontal edge at z = -0.6 + 0.3*(j+1).
            const ex = di !== 0 ? -0.6 + 0.3 * (di > 0 ? i + 1 : i) : -0.6 + 0.3 * i + 0.15;
            const ez = dj !== 0 ? -0.6 + 0.3 * (dj > 0 ? j + 1 : j) : -0.6 + 0.3 * j + 0.15;
            if (blocked(ex, ez)) continue;
            const k = key(ni, nj);
            if (!seen.has(k)) { seen.add(k); queue.push([ni, nj]); }
        }
    }
    assert.ok(found, 'a path from the start cell to the goal cell exists in the wall list');
    assert.equal(seen.size, 16, 'every cell is reachable (the maze has no walled-off pocket)');
    // Every wall lies inside the mat (-0.6..0.6 both axes): even the boundary
    // walls, inset by 0.01, stay within the mat's extent.
    for (const o of mat.obstacles) {
        const r = rectOf(o);
        assert.ok(r.x0 >= -0.6 - 1e-9 && r.x1 <= 0.6 + 1e-9 && r.z0 >= -0.6 - 1e-9 && r.z1 <= 0.6 + 1e-9, `${o.id} lies inside the mat`);
    }
});

test('6. the S1 driving base on the maze start does not intersect any wall', () => {
    // Placed exactly the way prepareModel (sim-session.js) does:
    // placeOnStart(model, mat.startPose, driveAnchor(model, catalog)), then
    // compile with the mat's obstacles.
    const maze = createMat('maze');
    const placed = placeOnStart(MODEL, maze.startPose, driveAnchor(MODEL, CATALOG));
    const mech = compile(placed, CATALOG, {obstacles: maze.obstacles});
    assert.deepEqual(mech.diagnostics.filter(d => d.severity === 'error'), []);
    // Footprint method: for every model body (ground and obstacle:* are not
    // robot parts), the world-space AABB of its colliders (bodyAABB above).
    // The walls stand on the floor from 0 to 0.04 m and the robot is taller
    // (its lowest point rests on the same floor), so a planar x/z overlap of a
    // robot body and a wall box is a real intersection, and no overlap means
    // none. The AABB is conservative - if even it clears a wall, the shape does.
    const robotRects = [];
    for (const b of mech.bodies) {
        if (b.id === 'ground' || b.id.startsWith('obstacle:')) continue;
        const box = bodyAABB(b);
        robotRects.push({id: b.id, x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1});
    }
    assert.equal(robotRects.length, 4, `robot bodies: ${JSON.stringify(robotRects)}`);  // chassis + 2 motorised wheels + castor ball
    for (const rr of robotRects) {
        // Robot width check: the corridors are 0.28 m clear of which the robot
        // uses less than 0.2 m across.
        assert.ok(rr.x1 - rr.x0 < 0.2 && rr.z1 - rr.z0 < 0.2, `body ${rr.id} spans ${(rr.x1 - rr.x0).toFixed(3)} x ${(rr.z1 - rr.z0).toFixed(3)} m`);
        for (const o of maze.obstacles) {
            const wr = rectOf(o);
            const hit = rr.x0 < wr.x1 && wr.x0 < rr.x1 && rr.z0 < wr.z1 && wr.z0 < rr.z1;
            assert.ok(!hit, `body ${rr.id} crosses wall ${o.id} (robot ${rr.x0.toFixed(3)},${rr.x1.toFixed(3)} x ${rr.z0.toFixed(3)},${rr.z1.toFixed(3)} vs wall ${wr.x0.toFixed(3)},${wr.x1.toFixed(3)} x ${wr.z0.toFixed(3)},${wr.z1.toFixed(3)})`);
        }
    }
});

test('7. physics: driving base, both motors forward, cannot pass the maze wall ahead', async () => {
    // The first wall ahead of the start pose (hand-derived from the mat
    // geometry): the corridor north of the start cell (0,0) runs to cell (0,1);
    // the wall across the edge from (0,1) to (0,2) sits on the grid line
    // z = -0.6 + 2*0.3 = 0, so its face toward the robot is z = -0.01.
    const FACE = -0.01;
    const hubState = new VirtualSpikeHubState();
    const {session, issues} = await SimSession.fromText(BASE_TEXT, {hubState, catalog: CATALOG, mat: 'maze'});
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    const hubBody = session.bridge.hubBody;
    const start = session.core.bodyPose(hubBody).position;
    assert.ok(start[2] < FACE - 0.2, `the hub starts face-up ${start[2].toFixed(3)} m south of the wall face`);
    // Both motors forward: the S1 driving-base convention is A negative,
    // B positive (test/bw-sim-s1-driving-base.test.mjs).
    hubState.motors.runAtSpeed('A', -555);
    hubState.motors.runAtSpeed('B', 555);
    let maxZ = start[2];
    for (let t = 0; t < 5000; t += 25) {
        session.tick(25);
        const z = session.core.bodyPose(hubBody).position[2];
        if (z > maxZ) maxZ = z;
    }
    const end = session.core.bodyPose(hubBody).position;
    // It drove north most of the corridor (full speed is about 0.27 m/s at the
    // 56 mm wheels, the run is 5 s, the gap from the hub to the face ~0.46 m):
    // the run ends blocked, not short.
    assert.ok(end[2] - start[2] > 0.3, `the hub drove forward ${(end[2] - start[2]).toFixed(3)} m before the wall stopped it`);
    assert.ok(maxZ < FACE, `the hub body stayed on the start side of the face (max z ${maxZ.toFixed(4)} vs face ${FACE})`);
    assert.ok(Math.abs(end[0] - start[0]) < 0.1, `no sideways escape (dx ${(end[0] - start[0]).toFixed(3)} m)`);
    session.dispose();
});
