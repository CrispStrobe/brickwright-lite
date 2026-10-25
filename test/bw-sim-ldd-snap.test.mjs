// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// "Snap to connections" (lib/bw-sim/model/ldd-snap.js): a design with no recorded LDD frame is placed
// where its connectors meet the model's. The model is made here, no third-party file: two 7-hole beams
// (recorded rows) with three pins (recorded) standing out of them, and an L-shaped beam (32526, no
// recorded row) on the pins. Its LXFML bone is written for an LDD frame the importer cannot know (an
// origin at one of its holes, turned a quarter about x): the import must still put the L-beam where
// the pins hold it — the pose worked out by hand in LDraw's terms.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {axisAngle, parseLxfml, lddCataloguePart} from '../overlay/scratch-gui/src/lib/bw-sim/model/lxf-model.js';
import {rowOfFrame, importFrame, technicShape} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldd-frame.js';
import {AXIS_TURNS, candidateFrames} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldd-snap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts;
const CATALOG = new Map(PARTS.map(p => [p.part, p]));
const F = [1, 0, 0, 0, -1, 0, 0, 0, -1];
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul = (a, b) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const T = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/**
 * The LXFML bone that puts a part at LDraw pose (R, p) through frame row `row`: lddToLdraw inverted
 * (R = F·B·Rn·F, p = 25·F·(b − B·Rn·t)), written as LDD writes it (B's columns, then b).
 */
const boneFor = (row, R, p) => {
    const Rn = row.rotation || axisAngle(row.axis, -row.angle);
    const B = mul(mul(mul(F, R), F), T(Rn));
    const t = mulVec(mul(B, Rn), row.translation);
    const b = mulVec(F, p).map((v, i) => v / 25 + t[i]);
    return [B[0], B[3], B[6], B[1], B[4], B[7], B[2], B[5], B[8], ...b].map(v => +v.toFixed(6)).join(',');
};
const lxfml = parts => `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<LXFML versionMajor="5" versionMinor="0" name="snap"><Bricks>
${parts.map(([design, bone], i) => `<Brick refID="${i}" designID="${design}"><Part refID="${i}" designID="${design}" materials="21"><Bone refID="${i}" transformation="${bone}"/></Part></Brick>`).join('\n')}
</Bricks></LXFML>`;

// LDraw's terms (−y up, LDU). Beam A (32524) at the origin: its holes along z at x = 0, axis y, y −10…10.
// Beam B (32524) a quarter turn about y, its end hole at (40, 0, 20). Pins (2780: a 40-long pin along its x)
// turned onto y, centred 10 above the beams: half in a beam's hole, half standing out (y −30…−10).
const ROT_Y = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const PIN_UP = [0, -1, 0, 1, 0, 0, 0, 0, 1];
const BEAM = rowOfFrame(importFrame(CATALOG.get('32524.dat')));
const PIN = rowOfFrame(importFrame(CATALOG.get('2780.dat')));
const PINS = [[0, -20, -60], [0, -20, -20], [40, -20, 20]];
// The L-beam (32526: holes at local (0,0,0…80) and (20|40,0,80), axis y) on the pins: unturned, 20 up,
// its hole (0,0,0) on the first pin, (0,0,40) on the second, (40,0,80) on the third.
const L_POSE = {rotation: I, position: [0, -20, -60]};

test('a design with no recorded frame is placed where its connectors meet the model\'s', () => {
    assert.equal(technicShape(CATALOG.get('32526.dat')), null, 'the test needs a design not placed by its shape');
    assert.equal(importFrame(CATALOG.get('32526.dat')), null);
    // The L-beam's LDD frame, as far as the importer is concerned unknown: its origin at the hole (40, 0, 80),
    // its axes LDraw's turned a quarter about x.
    const secret = rowOfFrame({o: [40, 0, 80], M: mul(F, [1, 0, 0, 0, 0, -1, 0, 1, 0])});
    const xml = lxfml([
        ['32524', boneFor(BEAM, I, [0, 0, 0])],
        ['32524', boneFor(BEAM, ROT_Y, [100, 0, 20])],
        ...PINS.map(p => ['2780', boneFor(PIN, PIN_UP, [p[0], -10, p[2]])]),
        ['32526', boneFor(secret, L_POSE.rotation, L_POSE.position)]
    ]);
    const {model, refusals} = parseLxfml(xml, {colours: new Map([[21, 4]]), catalog: CATALOG});
    assert.deepEqual(model.parts.map(p => p.part), ['32524.dat', '32524.dat', '2780.dat', '2780.dat', '2780.dat', '32526.dat']);
    // The recorded parts are where they were written.
    assert.deepEqual(model.parts[3].position, [0, -10, -20]);
    const l = model.parts[5];
    assert.deepEqual(l.rotation, L_POSE.rotation, 'the L-beam unturned');
    assert.deepEqual(l.position, L_POSE.position, 'the L-beam on the pins');
    assert.deepEqual(refusals.filter(r => r.code !== 'lxf-derived-frame').map(r => [r.code, r.design]), [['lxf-snapped-frame', '32526']]);
    assert.match(refusals.find(r => r.code === 'lxf-snapped-frame').message, /3 connections over 1 part/);
});

test('without the third pin the L-beam could lie either way round: its long arm is on the pins all the same', () => {
    const secret = rowOfFrame({o: [40, 0, 80], M: mul(F, [1, 0, 0, 0, 0, -1, 0, 1, 0])});
    const xml = lxfml([
        ['32524', boneFor(BEAM, I, [0, 0, 0])],
        ...PINS.slice(0, 2).map(p => ['2780', boneFor(PIN, PIN_UP, [p[0], -10, p[2]])]),
        ['32526', boneFor(secret, L_POSE.rotation, L_POSE.position)]
    ]);
    const {model, refusals} = parseLxfml(xml, {colours: new Map([[21, 4]]), catalog: CATALOG});
    const l = model.parts.find(p => p.part === '32526.dat');
    // Its long arm is on the pins either way; which side the short arm points the pins do not say (a tie goes
    // to LDD's habits, ldd-snap.js candidateFrames).
    const holes = CATALOG.get('32526.dat').connectors.slice(0, 5).map(c => mulVec(l.rotation, c.position).map((v, i) => v + l.position[i]));
    for (const p of [[0, -20, -60], [0, -20, -20]]) assert.ok(holes.some(h => h.every((v, i) => Math.abs(v - p[i]) < 1e-6)), `a hole on the pin at ${p}`);
    assert.deepEqual(refusals.filter(r => r.code !== 'lxf-derived-frame').map(r => [r.code, r.design]), [['lxf-snapped-frame', '32526']]);
});

test('the candidates: 24 turns, origins where LDD puts them; a design number no part has is refused', () => {
    assert.equal(AXIS_TURNS.length, 24);
    const frames = candidateFrames(CATALOG.get('2780.dat'));
    // LDraw's own frame first (a tie goes to it), then 24 turns of: the origin, the pin's centre, its two ends.
    assert.equal(frames.length, 1 + 24 * 3);
    assert.deepEqual(frames[0], {o: [0, 0, 0], M: F, prior: 1});
    assert.equal(lddCataloguePart('32526', CATALOG), '32526.dat');
    assert.equal(lddCataloguePart('60410', CATALOG), null);
    const {refusals} = parseLxfml(lxfml([['60410', boneFor(PIN, I, [0, 0, 0])]]), {colours: new Map([[21, 4]]), catalog: CATALOG});
    assert.deepEqual(refusals.map(r => [r.code, r.severity || 'error']), [['lxf-unknown-design', 'error']]);
});

test('an imported LDD model is a model from elsewhere: not written as ours, so its motors are plugged in', async () => {
    const {openModelFile} = await import('../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js');
    const xml = lxfml([['32524', boneFor(BEAM, I, [0, 0, 0])]]);
    const ldconfig = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/ldraw/LDConfig.ldr'), 'utf8');
    const {text} = await openModelFile('robot.lxf', new TextEncoder().encode(xml), {ldconfig, catalog: CATALOG});
    assert.doesNotMatch(text, /^0 Author: Brickwright\s*$/m);
    assert.match(text, /^0 Author: LEGO Digital Designer model \(imported\)\r?$/m);
});

test('an element LDD builds of several parts is placed whole, as the element\'s design (an EV3 motor: body and hub)', () => {
    // LDD writes an EV3 motor as one <Brick> (the element, LDraw's part) holding two <Part>s, a body and a hub,
    // whose design numbers LDraw does not have. Here: the L-beam's element 32526 made of two made-up parts.
    const secret = rowOfFrame({o: [40, 0, 80], M: mul(F, [1, 0, 0, 0, 0, -1, 0, 1, 0])});
    const parts = [
        ['32524', boneFor(BEAM, I, [0, 0, 0])],
        ['32524', boneFor(BEAM, ROT_Y, [100, 0, 20])],
        ...PINS.map(p => ['2780', boneFor(PIN, PIN_UP, [p[0], -10, p[2]])])
    ];
    const bricks = parts.map(([design, bone], i) => `<Brick refID="${i}" designID="${design}"><Part refID="${i}" designID="${design}" materials="21"><Bone refID="${i}" transformation="${bone}"/></Part></Brick>`);
    bricks.push(`<Brick refID="9" designID="32526"><Part refID="9" designID="90001" materials="21"><Bone refID="9" transformation="${
        boneFor(secret, L_POSE.rotation, L_POSE.position)}"/></Part><Part refID="10" designID="90002" materials="21"><Bone refID="10" transformation="${
        boneFor(secret, L_POSE.rotation, L_POSE.position)}"/></Part></Brick>`);
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<LXFML versionMajor="5" versionMinor="0" name="el"><Bricks>\n${bricks.join('\n')}\n</Bricks></LXFML>`;
    const {model, refusals} = parseLxfml(xml, {colours: new Map([[21, 4]]), catalog: CATALOG});
    const l = model.parts.find(p => p.part === '32526.dat');
    assert.ok(l, 'the element is placed as its own design');
    assert.deepEqual([l.rotation, l.position], [L_POSE.rotation, L_POSE.position]);
    assert.deepEqual(refusals.filter(r => r.code !== 'lxf-derived-frame').map(r => [r.code, r.design]),
        [['lxf-part-of-element', '90002'], ['lxf-snapped-frame', '32526']]);
});
