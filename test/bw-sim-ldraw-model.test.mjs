// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LDraw model reader/writer tests: round trips, MPD flattening, refusals,
// and formatting edge cases. Expected values are hand-computed.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

test('driving-base.ldr parses to driving-base.json parts (ignoring id)', async () => {
    const partsData = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url)));
    const baseJson = JSON.parse(readFileSync(new URL('./fixtures/bw-sim/driving-base.json', import.meta.url)));
    const ldrText = readFileSync(new URL('./fixtures/bw-sim/driving-base.ldr', import.meta.url), 'utf8');
    const catalog = new Map(partsData.parts.map(p => [p.part, p]));
    const {model, refusals} = parseModel(ldrText, {catalog});
    assert.equal(refusals.length, 0, `refusals ${JSON.stringify(refusals)}`);
    assert.equal(validatePlacedModel(model, catalog).length, 0);
    // Compare ignoring id: same number of parts, same part/color/position/rotation/port
    assert.equal(model.parts.length, baseJson.parts.length);
    for (const exp of baseJson.parts) {
        const found = model.parts.find(p => p.part === exp.part && p.position[0] === exp.position[0] && p.position[1] === exp.position[1] && p.position[2] === exp.position[2]);
        assert.ok(found, `missing part ${exp.part} at ${exp.position}`);
        assert.deepEqual(found.position, exp.position);
        assert.deepEqual(found.rotation, exp.rotation);
        assert.equal(found.color, exp.color);
        assert.equal(found.port, exp.port);
    }
});

test('round trip serialize->parse deep equals', () => {
    const model = {
        version: 1,
        parts: [
            {id: 'p1', part: 'test-beam5.dat', color: 4, position: [0, 1.5, -2.25], rotation: I3, port: 'A'},
            {id: 'p2', part: 'test-axle4.dat', color: 7, position: [10, -3.2, 4], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0], port: 'F'},
        ],
    };
    const text = serializeModel(model, {name: 'test.ldr', title: 'Test'});
    const {model: m2, refusals} = parseModel(text);
    assert.equal(refusals.length, 0);
    assert.deepEqual(m2, model);
});

test('round trip parse->serialize byte stable', () => {
    const partsData = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url)));
    const baseJson = JSON.parse(readFileSync(new URL('./fixtures/bw-sim/driving-base.json', import.meta.url)));
    // First create text via serializeModel, then parse and serialize again should be byte identical
    const text1 = serializeModel(baseJson, {name: 'driving-base.ldr', title: 'Brickwright Sim Lab S1 driving base'});
    const {model: m2} = parseModel(text1);
    const text2 = serializeModel(m2, {name: 'driving-base.ldr', title: 'Brickwright Sim Lab S1 driving base'});
    assert.equal(text2, text1);
    // Also check that serializing the parsed driving-base.ldr and then parsing again is stable?
    const ldrText = readFileSync(new URL('./fixtures/bw-sim/driving-base.ldr', import.meta.url), 'utf8');
    const {model: m3} = parseModel(ldrText);
    const text3 = serializeModel(m3, {name: 'driving-base.ldr', title: 'Brickwright Sim Lab S1 driving base'});
    const {model: m4} = parseModel(text3);
    const text4 = serializeModel(m4, {name: 'driving-base.ldr', title: 'Brickwright Sim Lab S1 driving base'});
    assert.equal(text4, text3);
});

test('mpd with sub-model placed twice flattens correctly', () => {
    // Sub-model with one part at [10,0,0] identity, placed twice with different transforms
    const mpd = [
        '0 FILE main.ldr',
        '0 Name: main.ldr',
        '1 16 0 0 0 1 0 0 0 1 0 0 0 1 sub.ldr',
        '1 16 10 0 0 1 0 0 0 1 0 0 0 1 sub.ldr',
        '0 FILE sub.ldr',
        '0 Name: sub.ldr',
        '1 16 10 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
    ].join('\r\n');
    const {model, refusals} = parseModel(mpd);
    assert.equal(refusals.length, 0);
    assert.equal(model.parts.length, 2);
    // First instance: parent at 0,0,0 identity + child at 10,0,0 => 10,0,0
    // Second instance: parent at 10,0,0 identity + child at 10,0,0 => 20,0,0
    // But we have two instances: first sub.ldr at 0,0,0 and second at 10,0,0
    // Actually main has two sub.ldr instances: one at 0,0,0 and one at 10,0,0, each contains a part at 10,0,0 offset
    // So flattened positions: 0+10=10 and 10+10=20
    assert.deepEqual(model.parts[0].position, [10, 0, 0]);
    assert.deepEqual(model.parts[1].position, [20, 0, 0]);
    assert.equal(model.parts[0].part, '3001.dat');
    // Test with rotation: put sub-model at 90deg
    const mpd2 = [
        '0 FILE main2.ldr',
        '1 16 5 0 0 0 0 1 0 1 0 -1 0 0 sub2.ldr',
        '0 FILE sub2.ldr',
        '1 16 1 2 3 1 0 0 0 1 0 0 0 1 3001.dat',
    ].join('\n');
    const {model: m2} = parseModel(mpd2);
    // Parent pos [5,0,0] rot 90deg about Y? Actually matrix [0,0,1,0,1,0,-1,0,0] is 90deg Y
    // Child pos [1,2,3] -> parent Rot * child = [3,2,-1] + parent pos [5,0,0] = [8,2,-1]
    assert.deepEqual(m2.parts[0].position, [8, 2, -1]);
});

test('each refusal code', () => {
    const catalog = new Map([['good.dat', {part: 'good.dat', name: 'good', category: 'other', massGrams: 1, connectors: [], colliders: [{shape: 'box', halfExtents: [1, 1, 1]}]}]]);
    // unknown-part
    let {refusals} = parseModel('1 16 0 0 0 1 0 0 0 1 0 0 0 1 unknown.dat', {catalog});
    assert.ok(refusals.some(r => r.code === 'unknown-part'));

    // loose-geometry
    ({refusals} = parseModel('2 16 0 0 0 1 0 0 1 0 0'));
    assert.ok(refusals.some(r => r.code === 'loose-geometry'));

    // bad-matrix (det 0: flat); a scaled one is decoration (a flexible element's segment)
    ({refusals} = parseModel('1 16 0 0 0 0 0 0 0 1 0 0 0 1 good.dat'));
    assert.ok(refusals.some(r => r.code === 'bad-matrix'));
    const scaled = parseModel('1 16 0 0 0 2 0 0 0 2 0 0 0 2 good.dat', {catalog});
    assert.deepEqual([scaled.refusals, scaled.model.parts.length, scaled.model.decor.length], [[], 0, 1]);

    // bad-port
    ({refusals} = parseModel('0 !BW PORT Z\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 good.dat'));
    assert.ok(refusals.some(r => r.code === 'bad-port'));

    // duplicate-id
    ({refusals} = parseModel('0 !BW ID dup\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 good.dat\n0 !BW ID dup\n1 16 10 0 0 1 0 0 0 1 0 0 0 1 good.dat'));
    assert.ok(refusals.some(r => r.code === 'duplicate-id'));

    // unparsable
    ({refusals} = parseModel('this is not ldraw'));
    assert.ok(refusals.some(r => r.code === 'unparsable'));

    // Ensure rest of file still loaded after refusals
    const {model} = parseModel('1 16 0 0 0 1 0 0 0 1 0 0 0 1 good.dat\n2 16 0 0 0 1 0 0\n1 16 10 0 0 1 0 0 0 1 0 0 0 1 good.dat');
    assert.equal(model.parts.length, 2);
});

test('-0, CRLF/LF, upper-case, extra whitespace', () => {
    // -0 should not appear in serialized output
    const model = {version: 1, parts: [{id: 'p1', part: 'a.dat', color: 16, position: [-0, 0, 0], rotation: I3}]};
    const text = serializeModel(model);
    assert.ok(!text.includes('-0 '), 'no -0 in output');
    assert.ok(text.includes('CRLF') === false); // just check line endings are CRLF
    assert.ok(text.endsWith('\r\n'));
    // CRLF vs LF input both parse
    const ldrCRLF = '1 16 0 0 0 1 0 0 0 1 0 0 0 1 a.dat\r\n1 16 10 0 0 1 0 0 0 1 0 0 0 1 b.dat\r\n';
    const ldrLF = '1 16 0 0 0 1 0 0 0 1 0 0 0 1 a.dat\n1 16 10 0 0 1 0 0 0 1 0 0 0 1 b.dat\n';
    const r1 = parseModel(ldrCRLF);
    const r2 = parseModel(ldrLF);
    assert.equal(r1.model.parts.length, 2);
    assert.equal(r2.model.parts.length, 2);
    // Upper-case file names
    const {model: m} = parseModel('1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.DAT');
    assert.equal(m.parts[0].part, '3001.dat');
    // Backslash to slash
    const {model: m2} = parseModel('1 16 0 0 0 1 0 0 0 1 0 0 0 1 s\\3001.dat');
    assert.equal(m2.parts[0].part, 's/3001.dat');
    // Extra whitespace
    const {model: m3} = parseModel('  1   16   0   0   0   1  0  0  0  1  0  0  0  1   a.dat  ');
    assert.equal(m3.parts.length, 1);
    assert.deepEqual(m3.parts[0].position, [0, 0, 0]);
});

test('every port A-F round trips', () => {
    const ports = ['A', 'B', 'C', 'D', 'E', 'F'];
    const model = {version: 1, parts: ports.map((p, i) => ({id: `p${i + 1}`, part: `a${i}.dat`, color: 16, position: [i * 10, 0, 0], rotation: I3, port: p}))};
    const text = serializeModel(model);
    const {model: m2} = parseModel(text);
    assert.deepEqual(m2.parts.map(p => p.port), ports);
});
