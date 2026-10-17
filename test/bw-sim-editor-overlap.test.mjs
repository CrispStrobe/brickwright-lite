// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab build editor's collision rules, headless (editor/overlap.js and
// transform-math.js `gizmoSize`): which solid parts a pose pushes into, when a
// move is refused, what a pointer ray aimed into a hole hits, where a part rests
// on another, which side the magnet then picks, and how big the gizmo is.
// The reference driving base (test/fixtures/bw-sim/driving-base.json) is the
// robot the learner starts from.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {moveVerdict, partOverlaps, rayHitParts, restingPosition, sitsInside, solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {snapCandidates} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';
import {GIZMO_SIZE, IDENTITY, gizmoSize} from '../overlay/scratch-gui/src/lib/bw-sim/editor/transform-math.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const ROBOT = json('test/fixtures/bw-sim/driving-base.json');
const I = [...IDENTITY];
const BEAM7 = '32524.dat';
const PIN = '2780.dat';
/** The editor's magnet reach (editor-view3d.js MAGNET_RADIUS; that module needs three). */
const MAGNET_RADIUS = 32;

/** The robot plus a beam 7 lying well behind it. */
const withBeam = position => ({...ROBOT, parts: [...ROBOT.parts, {id: 'beam', part: BEAM7, position, rotation: I}]});
const BEHIND = [0, -10, 400];

test('a beam pushed into the hub is reported; pins in holes and the castor ball in its socket are not', () => {
    const model = withBeam(BEHIND);
    assert.deepEqual(solidOverlaps(model, CATALOG, model.parts.at(-1)), [], 'behind the robot the beam touches nothing');
    const inside = {...model.parts.at(-1), position: [0, -40, 0]};
    const pushed = {...model, parts: [...ROBOT.parts, inside]};
    assert.deepEqual(solidOverlaps(pushed, CATALOG, inside).map(o => o.part), ['hub']);

    for (const id of ['pinR', 'frontPin1', 'ball']) {
        const p = ROBOT.parts.find(x => x.id === id);
        // They really are inside another part's volume...
        assert.ok(partOverlaps(ROBOT, CATALOG, p).length > 0, `${id} shares volume with the part it sits in`);
        // ...and that is allowed, both ways round.
        assert.ok(sitsInside(CATALOG.get(p.part)), `${id} is a shaft or a ball`);
        assert.deepEqual(solidOverlaps(ROBOT, CATALOG, p), [], `${id} is not reported`);
    }
    for (const id of ['hub', 'castor', 'frontBeam']) {
        assert.deepEqual(solidOverlaps(ROBOT, CATALOG, ROBOT.parts.find(x => x.id === id)), [], `${id} ignores the pins and the ball in it`);
    }
});

test('moveVerdict refuses a move into the hub, allows a free one, a move out of an old overlap, and a snapped connection', () => {
    const model = withBeam(BEHIND);
    const into = moveVerdict({model, catalog: CATALOG, moves: [{id: 'beam', position: [0, -40, 60], rotation: I}]});
    assert.deepEqual(into, {ok: false, part: 'beam', into: 'hub'});
    // Turned 90° about the vertical, still behind the robot: fine.
    const turned = [0, 0, 1, 0, 1, 0, -1, 0, 0];
    assert.deepEqual(moveVerdict({model, catalog: CATALOG, moves: [{id: 'beam', position: [0, -10, 300], rotation: turned}]}), {ok: true});

    // A beam already stuck in the hub (an old model) may be moved deeper or out: it is not a NEW overlap.
    const stuck = withBeam([0, -40, 60]);
    assert.deepEqual(moveVerdict({model: stuck, catalog: CATALOG, moves: [{id: 'beam', position: [0, -10, 400], rotation: I}]}), {ok: true});
    assert.deepEqual(moveVerdict({model: stuck, catalog: CATALOG, moves: [{id: 'beam', position: [0, -40, 0], rotation: I}]}), {ok: true});
    // ...but not into ANOTHER solid part it was not in before.
    const castor = moveVerdict({model: stuck, catalog: CATALOG, moves: [{id: 'beam', position: [0, 10, -140], rotation: I}]});
    assert.equal(castor.ok, false);
    assert.equal(castor.into, 'castor');

    // Moving the whole robot together (a group) never collides with itself.
    const all = ROBOT.parts.map(p => ({id: p.id, position: [p.position[0] + 20, p.position[1], p.position[2]], rotation: p.rotation}));
    assert.deepEqual(moveVerdict({model: ROBOT, catalog: CATALOG, moves: all}), {ok: true});

    // A part a magnet snap connects the moved part to is a connection, not a collision.
    assert.deepEqual(moveVerdict({model, catalog: CATALOG, moves: [{id: 'beam', position: [0, -40, 60], rotation: I}], connected: ['hub']}), {ok: true});
});

test('a ray aimed into a beam hole hits the beam top; a beam dropped there rests ON it', () => {
    const base = {version: 1, parts: [{id: 'a', part: BEAM7, position: [0, 0, 0], rotation: I}]};
    // Straight down (LDraw +y is down) into the middle hole, h3 at (0, 0, 0): colliders are solid.
    const down = rayHitParts(base, CATALOG, [0, -500, 0], [0, 1, 0]);
    assert.equal(down.length, 1);
    assert.equal(down[0].part, 'a');
    assert.deepEqual(down[0].point.map(v => Math.round(v * 1e6) / 1e6), [0, -10, 0], 'the top face, not the floor under the hole');
    assert.deepEqual(down[0].normal.map(v => v + 0), [0, -1, 0], 'facing up');
    // A slanted ray from the camera's side hits the same top face.
    const slanted = rayHitParts(base, CATALOG, [-300, -310, 0], [300, 300, 0])[0];
    assert.ok(Math.abs(slanted.point[1] + 10) < 1e-9 && Math.abs(slanted.point[0]) < 1e-6, `slanted: ${slanted.point}`);
    assert.deepEqual(rayHitParts(base, CATALOG, [0, -500, 0], [0, 1, 0], {exclude: ['a']}), []);

    const position = restingPosition({meta: CATALOG.get(BEAM7), rotation: I, point: down[0].point, grid: 10});
    const dropped = {id: 'b', part: BEAM7, position, rotation: I};
    const stacked = {...base, parts: [...base.parts, dropped]};
    assert.deepEqual(solidOverlaps(stacked, CATALOG, dropped), [], `rests on it: ${position}`);
    // ON it, not floating: a little lower and it is in the beam.
    const lower = {...dropped, position: [position[0], position[1] + 2, position[2]]};
    assert.deepEqual(solidOverlaps({...base, parts: [...base.parts, lower]}, CATALOG, lower).map(o => o.part), ['a']);
    // Its bottom (y + 10, the collider's half height) is the top face the ray hit.
    assert.equal(position[1] + CATALOG.get(BEAM7).colliders[0].halfExtents[1], down[0].point[1]);

    // Turned across the beam and aimed off-grid: still on top, x/z on the 10 LDU grid.
    const across = [0, 0, 1, 0, 1, 0, -1, 0, 0];
    const p2 = restingPosition({meta: CATALOG.get(BEAM7), rotation: across, point: [3, -10, 27], grid: 10});
    assert.deepEqual([p2[0] % 10, p2[2] % 10], [0, 0]);
    const crossed = {id: 'c', part: BEAM7, position: p2, rotation: across};
    assert.deepEqual(solidOverlaps({...base, parts: [...base.parts, crossed]}, CATALOG, crossed), []);
});

test('a pin brought to a hole from above snaps in from the top; from below, from the bottom', () => {
    const base = {version: 1, parts: [{id: 'a', part: BEAM7, position: [0, 0, 0], rotation: I}]};
    const pin = CATALOG.get(PIN);
    const firstSnap = point => {
        const position = restingPosition({meta: pin, rotation: I, point, grid: 10});
        const found = snapCandidates({model: base, catalog: CATALOG, part: PIN, pose: {position, rotation: I}, radius: MAGNET_RADIUS});
        assert.ok(found.length, `a snap near ${point}`);
        return found[0];
    };
    // Aimed into hole h4 (0, 0, 20) from above: the ray hits the top face there.
    const top = rayHitParts(base, CATALOG, [0, -400, 20], [0, 1, 0])[0].point;
    const fromAbove = firstSnap(top);
    assert.ok(fromAbove.position[1] < 0, `the pin's centre is above the beam's mid-plane (LDraw -y up): ${fromAbove.position}`);
    assert.equal(fromAbove.pairs[0].fixed.connector, 'h4');
    // What the floor under the hole (20 LDU below the beam's bottom) gives instead: the bottom side.
    const fromBelow = firstSnap([0, 30, 20]);
    assert.ok(fromBelow.position[1] > 0, `from below it hangs under the beam: ${fromBelow.position}`);
});

test('the gizmo is sized to the selection, within a grabbable minimum and the old maximum', () => {
    const view = {fov: 40, viewHeightPx: 600};
    // A pin (radius ~8 mm) seen from 1 m: it would be dwarfed by a full-size gizmo.
    const pin = gizmoSize({...view, radius: 0.008, distance: 1});
    assert.ok(pin < GIZMO_SIZE.max, `small part, smaller gizmo: ${pin}`);
    // Arrows are then at least ~44 px long on screen: reach = 0.55/4 × size × 1.9 tan(fov/2) d; half height = tan(fov/2) d.
    const px = s => 0.55 / 4 * s * 1.9 * (view.viewHeightPx / 2);
    assert.ok(px(pin) >= 43.9, `arrow ${px(pin).toFixed(1)} px`);
    // Closer up, the arrows reach out of the part: 1.6 × its radius.
    const near = gizmoSize({...view, radius: 0.008, distance: 0.05});
    const reachWorld = 0.55 / 4 * near * 1.9 * Math.tan(20 * Math.PI / 180) * 0.05;
    assert.ok(Math.abs(reachWorld - 0.0128) < 1e-9 || near === GIZMO_SIZE.max, `reach ${reachWorld}`);
    assert.ok(near > pin, 'zooming in on a part makes room for a larger gizmo');
    // A large selection: capped at the old size.
    assert.equal(gizmoSize({...view, radius: 0.2, distance: 0.6}), GIZMO_SIZE.max);
    // Very far out: never below the minimum.
    assert.equal(gizmoSize({...view, radius: 0.001, distance: 1, viewHeightPx: 4000, minPx: 1}), GIZMO_SIZE.min);
});
