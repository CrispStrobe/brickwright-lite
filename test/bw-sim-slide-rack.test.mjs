// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The R4 compiler kinds besides the worm (test/bw-sim-worm.test.mjs): the slide-bore
 * (kinds/slide.js → a slider joint whose travel is measured from the connectors, mech/joints.js),
 * the rack (kinds/rack.js → rackAndPinion with the slider's travel narrowed to the teeth), the
 * world loads (world/objects.js → dynamic bodies with role 'load'), and the registries holding them.
 * Every expected number is derived here by hand from the parts' connectors, never read back.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {BUILTIN_KINDS} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js';
import {LDU_M} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {palletLoad, PALLET} from '../overlay/scratch-gui/src/lib/bw-sim/world/objects.js';
import {createMat} from '../overlay/scratch-gui/src/lib/bw-sim/world/mats.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const FORKLIFT = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models/forklift.ldr'), 'utf8');
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rows = (c1, c2, c3) => [c1[0], c2[0], c3[0], c1[1], c2[1], c3[1], c1[2], c2[2], c3[2]];
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('the built-in registries hold the R4 kinds: slide-bore, worm and rack-teeth connectors; worm and rack detectors', () => {
    for (const k of ['slide-bore', 'worm', 'rack-teeth']) assert.ok(BUILTIN_KINDS.connectors.has(k), k);
    // Later kinds come after them (kinds/screw.js, kinds/turntable.js).
    assert.deepEqual(BUILTIN_KINDS.couplings.detectors().map(m => m.id).slice(0, 2), ['worm', 'rack']);
    assert.equal(BUILTIN_KINDS.couplings.ofKind('rackAndPinion').id, 'rack');
    // A connector kind checks its data.
    assert.ok(BUILTIN_KINDS.connectors.get('rack-teeth').validate({type: 'rack-teeth', position: [0, 0, 0], axis: [1, 0, 0], length: 10, data: {normal: [1, 0, 0], widthLdu: 20}}).length > 0,
        'a rack normal along the rack is refused');
    assert.ok(BUILTIN_KINDS.connectors.get('worm').validate({type: 'worm', position: [0, 0, 0], axis: [1, 0, 0], length: 40, data: {pitchRadiusLdu: 10}}).length > 0,
        'a worm without its hand is refused');
});

/**
 * A 6536 holds an 8L axle along x by its axle hole (x −10..10); the axle runs to x = 150. A smooth
 * toggle joint rides it by its two eyes (each 10 long, at x 30..40 and 80..90). Travel, by hand:
 *   down: the lower eye meets the 6536's axle hole: 30 − 10 = 20 LDU;
 *   up:   an eye stays on the axle while 8 of its 10 LDU are on it, so its end may pass the
 *         axle's end (150) by 2: the lower eye's end 40 → 152, 112 LDU (the upper one leaves
 *         first, at 62: one eye on is enough).
 */
const slideRig = (extra = []) => ({version: 1, parts: [
    {id: 'holder', part: '6536.dat', position: [0, 0, 0], rotation: I},
    {id: 'guide', part: '3707.dat', position: [70, 0, 0], rotation: I},
    {id: 'toggle', part: '48496.dat', position: [60, -30, 0], rotation: rows([0, 0, 1], [0, -1, 0], [1, 0, 0])},
    ...extra
]});

test('an axle through a slide-bore is a slider whose travel is measured from the axle and what sits on it', () => {
    const m = compile(slideRig(), CATALOG, {version: 2, ground: false});
    const [j, ...rest] = m.joints;
    assert.deepEqual(rest, []);
    assert.equal(j.type, 'slider');
    assert.deepEqual(j.axis, [1, 0, 0]);
    const toggleBody = m.bodies.find(b => b.parts.includes('toggle')).id;
    assert.equal(j.body2, toggleBody, 'body2 is the part that slides');
    assert.ok(close(j.limits[0], -20 * LDU_M) && close(j.limits[1], 112 * LDU_M), `limits ${j.limits.map(v => v / LDU_M)} LDU`);
});

test('a bush on the guide is a stop: the toggle cannot pass it', () => {
    // A half bush (10 long) on the axle at x 115..125 (axle hole: rigid on the axle, so it is the frame's).
    const m = compile(slideRig([{id: 'bush', part: '4265c.dat', position: [120, 0, 0], rotation: rows([0, 0, 1], [0, 1, 0], [-1, 0, 0])}]), CATALOG, {version: 2, ground: false});
    const j = m.joints.find(x => x.type === 'slider');
    // The upper eye's end (90) meets the bush (115): 25 LDU.
    assert.ok(close(j.limits[1], 25 * LDU_M), `upper limit ${j.limits[1] / LDU_M} LDU`);
});

test('a toggle held by its own two pins is mounted, not a locked hinge: no warning (in the Forklift)', () => {
    const {mechanism, issues} = prepareModel(FORKLIFT, CATALOG, {});
    assert.deepEqual(issues, []);
    assert.ok(mechanism.bodies.some(b => b.parts.includes('slide') && b.parts.includes('upright')), 'the toggle is welded to the upright');
});

test('the rack coupling: ratio = the 8T\'s pitch radius, signed by the geometry; travel narrowed to the teeth', () => {
    const {mechanism} = prepareModel(FORKLIFT, CATALOG, {});
    const rp = mechanism.couplings.find(c => c.kind === 'rackAndPinion');
    const slider = mechanism.joints.find(j => j.id === rp.sliderJoint);
    const hinge = mechanism.joints.find(j => j.id === rp.hingeJoint);
    // Pinion on the motor's output (body2 of its hinge, axis +x world); contact on the rack's side
    // (world +z from the pinion's centre: LDraw −z… the rack is at larger LDraw z = world −z).
    // ω about +x moves the contact point d = (0, 0, −0.004) by ω·(x × d) = ω·(0, 0.004, 0): UP.
    // The slider's axis is world −y (down) with the carriage as body2: ratio = −0.004.
    assert.deepEqual(hinge.axis, [1, 0, 0]);
    assert.deepEqual(slider.axis, [0, -1, 0]);
    assert.ok(close(rp.ratio, -0.004, 1e-15), `ratio ${rp.ratio}`);
    // Teeth: 176 LDU, the contact 12 LDU below their upper end at the start (rack centre y −174, the
    // pinion at −250: contact at −250 − (−174 − 88) = 12). Up (slider −): 176 − 12 = 164; down: 12 —
    // but the toggle's lower eye meets the guide's tee 4 LDU below (the eye's end −84, the tee's hole −80).
    assert.ok(close(slider.limits[0], -164 * LDU_M), `up ${slider.limits[0] / LDU_M}`);
    assert.ok(close(slider.limits[1], 4 * LDU_M), `down ${slider.limits[1] / LDU_M}`);
});

test('a rack that cannot slide is not driven, and says so', () => {
    const {model} = parseModel(FORKLIFT, {catalog: CATALOG});
    const noToggle = {...model, parts: model.parts.filter(p => p.id !== 'slide')};
    const m = compile(noToggle, CATALOG, {version: 2});
    assert.deepEqual(m.couplings.filter(c => c.kind === 'rackAndPinion'), []);
    assert.ok(m.diagnostics.some(d => d.code === 'rack-not-sliding' && d.parts.includes('rack')));
});

test('a rack fixed to the part its pinion turns in locks the pinion: welded, with the gear-on-frame warning', () => {
    // A test-only part that is both: a pin hole along z (the pinion's axle turns in it) and a toothed
    // strip whose pitch line is one 8T pitch radius (10 LDU) from that hole's axis.
    const catalog = new Map(CATALOG);
    catalog.set('test-rack-frame.dat', {part: 'test-rack-frame.dat', name: 'Test rack frame', category: 'beam', massGrams: 3,
        connectors: [
            {id: 'h', type: 'pinhole', position: [0, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 't', type: 'rack-teeth', position: [0, 10, 20], axis: [1, 0, 0], length: 80, data: {normal: [0, -1, 0], widthLdu: 20}}
        ],
        colliders: [{shape: 'box', halfExtents: [40, 5, 20], position: [0, 18, 10]}]});
    const model = {version: 1, parts: [
        {id: 'frame', part: 'test-rack-frame.dat', position: [0, 0, 0], rotation: I},
        {id: 'axle', part: '4519.dat', position: [0, 0, 0], rotation: rows([0, 0, 1], [0, 1, 0], [-1, 0, 0])},
        {id: 'pinion', part: '3647.dat', position: [0, 0, 20], rotation: I}
    ]};
    const m = compile(model, catalog, {version: 2, ground: false});
    assert.ok(m.diagnostics.some(d => d.code === 'gear-on-frame' && d.parts.includes('pinion') && d.parts.includes('frame')), JSON.stringify(m.diagnostics));
    assert.equal(m.bodies.length, 1, 'the pinion is welded to the rack it cannot turn against');
    assert.deepEqual(m.couplings, []);
});

test('a load: a dynamic body with role load on the floor; a bad one is a refusal, not a crash', () => {
    const pallet = palletLoad({position: [0.3, 0, 0.1], yawDeg: 90});
    const m = compile({version: 1, parts: [{id: 'b', part: '32523.dat', position: [0, -10, 0], rotation: I}]}, CATALOG,
        {version: 2, loads: [pallet, {id: 'junk', position: [0, 0, 0], massKg: -1, boxes: []}]});
    const body = m.bodies.find(b => b.id === 'load:pallet');
    assert.equal(body.role, 'load');
    assert.equal(body.collisionGroup, 'world');
    assert.equal(body.motion, 'dynamic');
    assert.equal(body.massKg, PALLET.massKg);
    // Its bottom on the floor: the ground's top plus the runners' half height minus their centre.
    const ground = m.bodies.find(b => b.id === 'ground');
    const groundTop = ground.position[1] + ground.colliders[0].halfExtents[1];
    assert.ok(close(body.position[1], groundTop), 'the pallet stands on the floor');
    const lowest = Math.min(...body.colliders.map(c => c.position[1] - c.halfExtents[1]));
    assert.ok(close(lowest, 0, 1e-12), 'its runners reach down to its origin, the floor');
    // Pockets: the deck spans the width, the runners leave two 10 mm gaps centred ±8 mm.
    const runners = body.colliders.filter(c => c.halfExtents[1] > PALLET.deckM / 2).map(c => [c.position[0] - c.halfExtents[0], c.position[0] + c.halfExtents[0]]).sort((a, b) => a[0] - b[0]);
    assert.equal(runners.length, 3);
    assert.ok(close(runners[1][0] - runners[0][1], 0.01, 1e-12) && close(runners[2][0] - runners[1][1], 0.01, 1e-12), 'two 10 mm pockets');
    assert.ok(close((runners[0][1] + runners[1][0]) / 2, -0.008, 1e-12) && close((runners[1][1] + runners[2][0]) / 2, 0.008, 1e-12), 'centred ±8 mm');
    assert.ok(m.diagnostics.some(d => d.code === 'bad-load'), 'the junk load is refused by name');
    assert.ok(!m.bodies.some(b => b.id === 'load:junk'));
});

test('the Warehouse mat carries the pallet; the other mats carry no loads', () => {
    const w = createMat('warehouse');
    assert.deepEqual(w.loads.map(l => l.id), ['pallet']);
    for (const id of ['plain', 'line-oval', 'colour-zones', 'wall', 'sumo', 'maze']) assert.deepEqual(createMat(id).loads, [], id);
});
