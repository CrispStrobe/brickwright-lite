// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LeoCAD .lcd projects (lib/bw-sim/model/lcd-model.js) opened as LDraw. The projects are written
// here, byte by byte, in the layout the module's header describes — no third-party model: a beam
// standing on a brick, turned and coloured as worked out by hand, in two steps, with a hidden piece,
// in both piece formats (8: the keys after their parameters; 9: a key version byte, time first).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openModelFile, ModelFileError} from '../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js';
import {parseLeoCad, LEOCAD_COLOURS} from '../overlay/scratch-gui/src/lib/bw-sim/model/lcd-model.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));

/** Little-endian bytes of a LeoCAD project (file format 1.3) holding `pieces`. */
const project = (pieces, {author = 'A. Builder', description = 'Test project', pv = 8, id = 'LeoCAD 0.7 Project'} = {}) => {
    const out = [];
    const u8 = v => out.push(v & 255);
    const u16 = v => { u8(v); u8(v >> 8); };
    const u32 = v => { for (let i = 0; i < 4; i++) u8(v >>> (8 * i)); };
    const f32 = v => { const b = new Uint8Array(new Float32Array([v]).buffer); out.push(...b); };
    const str = s => { u8(s.length); for (const c of s) u8(c.charCodeAt(0)); };
    const fixed = (s, n) => { for (let i = 0; i < n; i++) u8(i < s.length ? s.charCodeAt(i) : 0); };
    fixed(id, 32);
    f32(1.3); // file format
    u32(0xffffff); // background
    u32(30); u32(0x103c); f32(2); u32(256); u32(0); u32(9); u32(0); u32(2); // snap, flags, line width, detail, group, colour, action, step
    u32(0); // scene
    u32(pieces.length);
    for (const p of pieces) {
        u8(pv);
        if (pv >= 9) u8(1);
        const keys = [[...p.pos, 0, 0], [...p.axis, p.angle, 1]];
        for (let list = 0; list < 2; list++) {
            // The animation keys (the second list) are elsewhere on purpose: the instruction keys count.
            u32(keys.length);
            for (const [x, y, z, w, type] of keys) {
                const params = list ? [x + 100, y, z, w] : [x, y, z, w];
                if (pv >= 9) u16(1);
                for (const v of params) f32(v);
                if (pv < 9) u16(1);
                u8(type);
            }
        }
        fixed(p.name, 9);
        u8(p.colour);
        u8(p.step); u8(p.hide ?? 255);
        u16(1); u16(65535);
        u8(p.hidden ? 1 : 0);
        str(`${p.name} #1`);
        u32(0xffffffff);
    }
    str(author); str(description); str('');
    u32(0); // groups
    return new Uint8Array(out);
};

// LeoCAD units are 25 LDU, z up: a 1 × 2 Technic brick (3700) on the floor, and on top of it, one
// brick (24 LDU = 0.96 units) up, a 7-hole beam (32524) turned 90° about LeoCAD's up axis.
const PIECES = [
    {name: '3700', colour: 9, pos: [0, 0, 0.96], axis: [0, 0, 1], angle: 0, step: 1},
    {name: '32524', colour: 0, pos: [0.8, -1.6, 1.92], axis: [0, 0, 1], angle: 90, step: 2},
    {name: '3001', colour: 4, pos: [4, 4, 0.96], axis: [0, 0, 1], angle: 0, step: 1, hidden: true}
];

test('a LeoCAD project opens as LDraw: parts, poses, colours and steps as worked out by hand', async () => {
    for (const pv of [8, 9]) {
        const opened = await openModelFile('tower.lcd', project(PIECES, {pv}));
        assert.equal(opened.name, 'tower.ldr');
        const lines = opened.text.split(/\r?\n/);
        assert.equal(lines[0], '0 Test project');
        assert.ok(lines.includes('0 Author: A. Builder'), 'the project\'s author, not Brickwright: a model from elsewhere');
        const parts = lines.filter(l => l.startsWith('1 '));
        // LDraw = (25·x, −25·z, 25·y); black is LeoCAD's colour 9, red 0.
        assert.deepEqual(parts, [
            '1 0 0 -24 0 1 0 0 0 1 0 0 0 1 3700.dat',
            // R_LDraw = T·Rz(90°)·Tᵀ: a turn about LDraw −y.
            '1 4 20 -48 -40 0 0 -1 0 1 0 1 0 0 32524.dat'
        ], `piece format ${pv}`);
        assert.ok(lines.indexOf(parts[1]) > lines.indexOf('0 STEP'), 'step 2 comes after a STEP line');
        assert.deepEqual(opened.refusals.map(r => [r.code, r.design]), [['lcd-hidden-piece', '3001']]);
        const {model, refusals} = parseModel(opened.text, {catalog: CATALOG});
        assert.deepEqual(refusals, []);
        assert.equal(model.parts.length, 2);
    }
});

test('LeoCAD\'s colour table is LDraw\'s colours of the same names', () => {
    assert.equal(LEOCAD_COLOURS.length, 28);
    // red, black, light grey, yellow, trans-clear: the colours of Philo's models
    assert.deepEqual([0, 9, 22, 6, 21].map(i => LEOCAD_COLOURS[i]), [4, 0, 7, 14, 47]);
});

test('the converted model is a model from elsewhere: it compiles, its motor is plugged in', () => {
    const lcd = project([{name: '2838C01', colour: 22, pos: [0, 0, 0], axis: [0, 0, 1], angle: 0, step: 1}]);
    const {pieces} = parseLeoCad(lcd);
    assert.equal(pieces[0].part, '2838C01');
    return openModelFile('motor.lcd', lcd).then(({text}) => {
        const prepared = prepareModel(text, CATALOG);
        assert.ok(prepared.mechanism.joints.some(j => j.motor), 'the 9 V Technic motor turns');
        assert.ok(prepared.issues.some(i => i.code === 'ports-plugged'), 'plugged in for us');
    });
});

test('a file that is no LeoCAD project, or one too old or cut short, is refused as a whole', async () => {
    const refused = async (bytes, code) => assert.rejects(openModelFile('x.lcd', bytes), e => e instanceof ModelFileError && e.code === code, code);
    await refused(new TextEncoder().encode('0 an LDraw file\n'), 'lcd-unreadable');
    await refused(project(PIECES, {id: 'LeoCAD 0.3 Project'}), 'lcd-version');
    await refused(project(PIECES, {pv: 5}), 'lcd-version');
    await refused(project(PIECES).subarray(0, 120), 'lcd-unreadable');
});
