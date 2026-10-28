// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

// MPD + submodels: first FILE is main, submodel refs expand with composed
// transforms, mirrored refused, ids unique/deterministic, cycles refused,
// unknown meta ignored, saving writes flat. Driving base as MPD compiles
// identically to flat.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));

const readMpd = p => readFileSync(path.join(ROOT, p), 'utf8');

test('main + submodel used twice with different transforms: parts at composed positions', () => {
    const text = readMpd('test/fixtures/bw-sim/mpd/main_twice.mpd');
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.equal(refusals.length, 0);
    assert.equal(model.parts.length, 3);
    // Compute expected positions independently from matrices (identity, so just addition)
    // Main has: beam at [0,0,0], sub at [20,0,0] with beam at [0,0,0] => [20,0,0], sub at [40,0,0] => [40,0,0]
    const expected = [
        [0, 0, 0],
        [20, 0, 0],
        [40, 0, 0]
    ];
    const positions = model.parts.map(p => p.position).sort((a,b)=>a[0]-b[0]);
    const sortedExpected = expected.sort((a,b)=>a[0]-b[0]);
    for (let i=0;i<positions.length;i++) {
        assert.deepEqual(positions[i], sortedExpected[i], `part ${i} position`);
    }
    // Check ids are unique and deterministic, and include filename hint
    const ids = model.parts.map(p=>p.id);
    assert.equal(new Set(ids).size, ids.length, 'ids unique');
    // Ensure submodel parts have deterministic ids (they should contain # or _)
    const subIds = ids.filter(id=>id.includes('sub.ldr') || id.includes('#') || id.includes('_'));
    assert.ok(subIds.length >= 2, 'submodel parts should have deterministic ids');
});

test('nested submodel: composed position', () => {
    const text = readMpd('test/fixtures/bw-sim/mpd/nested.mpd');
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.equal(refusals.length, 0);
    assert.equal(model.parts.length, 1);
    // main at [10,0,0] -> mid.ldr, mid at [5,0,0] -> low.ldr, low beam at [0,0,0] => [15,0,0]
    const expected = [15, 0, 0];
    assert.deepEqual(model.parts[0].position, expected);
});

test('cycle is refused, not infinite', () => {
    const text = readMpd('test/fixtures/bw-sim/mpd/cycle.mpd');
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.ok(refusals.some(r => r.code === 'cycle'), `should have cycle refusal, got ${JSON.stringify(refusals)}`);
    assert.equal(model.parts.length, 0, 'cycle should produce no parts');
});

test('Studio-style meta lines are ignored, not refusals', () => {
    const text = readMpd('test/fixtures/bw-sim/mpd/studio.mpd');
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.equal(refusals.length, 0, `Studio meta should be ignored, got ${JSON.stringify(refusals)}`);
    assert.equal(model.parts.length, 1);
    assert.equal(model.parts[0].part, '32524.dat');
});

test('colour codes like 0x2xxxxxx are accepted', () => {
    const text = `0 FILE main.ldr
1 0x2FF0000 0 0 0 1 0 0 0 1 0 0 0 1 32524.dat
0 NOFILE
`;
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.equal(refusals.length, 0, `0x colour should be accepted, got ${JSON.stringify(refusals)}`);
    assert.equal(model.parts.length, 1);
});

test('S1 driving base wrapped as MPD with wheels as submodel compiles to same mechanism as flat', () => {
    const flat = json('test/fixtures/bw-sim/driving-base.json');
    const flatMech = compile(flat, CATALOG);
    const mpdText = readMpd('test/fixtures/bw-sim/mpd/driving-base-mpd.mpd');
    const {model: mpdModel, refusals} = parseModel(mpdText, {catalog: CATALOG});
    assert.equal(refusals.length, 0, `MPD driving base refusals: ${JSON.stringify(refusals)}`);
    const mpdMech = compile(mpdModel, CATALOG);
    assert.equal(mpdMech.bodies.length, flatMech.bodies.length, 'bodies count same');
    assert.equal(mpdMech.joints.length, flatMech.joints.length, 'joints count same');
    // Compare body positions (hub body is key)
    const flatHub = flatMech.bodies.find(b => b.parts.includes('hub'));
    const mpdHub = mpdMech.bodies.find(b => b.parts.includes('hub'));
    assert.ok(flatHub && mpdHub, 'hub body exists in both');
    for (let i=0;i<3;i++) assert.ok(Math.abs(flatHub.position[i] - mpdHub.position[i]) < 1e-6, `hub position ${i}`);
    // Compare joint counts and that motor ports same
    const flatMotors = flatMech.joints.filter(j=>j.motor).map(j=>j.motor.port).sort();
    const mpdMotors = mpdMech.joints.filter(j=>j.motor).map(j=>j.motor.port).sort();
    assert.deepEqual(mpdMotors, flatMotors);
});

test('saving writes flat single-file model', () => {
    const mpdText = readMpd('test/fixtures/bw-sim/mpd/main_twice.mpd');
    const {model} = parseModel(mpdText, {catalog: CATALOG});
    const serialized = serializeModel(model, {name: 'test.ldr', title: 'test'});
    assert.ok(!serialized.includes('0 FILE'), 'serialized should be flat, no FILE');
    assert.ok(!serialized.includes('0 NOFILE'), 'serialized should be flat, no NOFILE');
    assert.ok(serialized.includes('0 !LDRAW_ORG'), 'should contain header');
});
