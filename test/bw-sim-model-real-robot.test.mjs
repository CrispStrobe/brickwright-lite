// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A real robot from the LDraw model library: the NXT Tri-bot (8527-1, CC BY 2.0, test/fixtures/model-files/
// SOURCES.md), as LDCad saved it — its NXT cables as a thousand stretched segments, two parts of its own
// embedded, its motors and sensors on no port. Before: 996 lines refused as bad matrices, the cables gone,
// nothing to drive. Now the cables are decoration (drawn, not simulated), the embedded parts are kept and
// saved back, the motors and sensors are plugged into the brick's free ports, and the motors turn.
// (Its tyres and a few other parts are not in the shipped catalogue: the app derives them from the LDraw
// library when it opens the file, which this test, offline, does not.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {serializeMpd} from '../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js';
import {prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'test/fixtures/model-files');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));
const bytes = readFileSync(path.join(DIR, '8527-1.mpd'));
const text = bytes.toString('latin1');

test('the Tri-bot file is the one SOURCES.md names, licence lines kept', () => {
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.match(readFileSync(path.join(DIR, 'SOURCES.md'), 'utf8'), new RegExp(sha));
    assert.equal((text.match(/^0 !LICENSE Redistributable under CCAL version 2\.0/gm) || []).length, 31);
});

test('its cables open as decoration and its own parts are kept, through an MPD save and back', () => {
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.deepEqual(refusals.filter(r => r.code === 'bad-matrix'), [], 'no stretched segment refused');
    assert.ok(model.decor.length > 900, `the cables' segments: ${model.decor.length}`);
    assert.deepEqual(Object.keys(model.files).sort(), ['8527 - ldcconring-2-4.dat', '8527 - ldcnxtwireseg.dat']);
    const back = parseModel(serializeMpd(model, {name: 'tri-bot.ldr'}), {catalog: CATALOG});
    assert.deepEqual([back.model.parts.length, back.model.decor.length, Object.keys(back.model.files).length],
        [model.parts.length, model.decor.length, 2]);
});

test('its three motors are plugged into A, B and C and turn; its sensors into 1, 2, 3', async t => {
    const prep = prepareModel(text, CATALOG);
    const note = prep.issues.find(i => i.code === 'ports-plugged');
    assert.ok(note, JSON.stringify(prep.issues.map(i => i.code)));
    const ports = prep.runModel.parts.filter(p => p.port).map(p => p.port).sort();
    assert.deepEqual(ports, ['1', '2', '3', 'A', 'B', 'C']);
    const m = prep.mechanism;
    assert.deepEqual(m.joints.filter(j => j.motor).map(j => j.motor.port).sort(), ['A', 'B', 'C']);
    const J = await loadJolt();
    const core = createPhysicsCore(J, m, {stepHz: 200});
    for (let i = 0; i < 100; i++) core.step(1 / 200);
    for (const j of m.joints.filter(x => x.motor)) core.setMotor(j.id, {mode: 'velocity', radPerSec: 8});
    for (let i = 0; i < 300; i++) core.step(1 / 200);
    const turned = m.joints.filter(x => x.motor).map(j => core.jointState(j.id).angle * 180 / Math.PI);
    const floor = m.bodies.find(b => b.id === 'ground');
    const lowest = Math.min(...m.bodies.filter(b => b.motion !== 'static' && b.id !== 'ground').map(b => core.bodyPose(b.id).position[1]));
    core.destroy();
    t.diagnostic(`turned ${turned.map(a => a.toFixed(0)).join(', ')}°; lowest body ${lowest.toFixed(3)} m`);
    for (const a of turned) assert.ok(a > 400, `each motor turns: ${turned}`);
    assert.ok(lowest > floor.position[1] - 0.05, 'nothing falls through the floor');
});

test('a file\'s own renamed copy of a catalogue part, and another print of one, are the catalogue part', () => {
    const mpd = [
        '0 FILE main.ldr', '0 main', '0 Author: someone',
        '1 71 0 0 0 1 0 0 0 1 0 0 0 1 42099 - 22169.dat',
        '1 71 100 0 0 1 0 0 0 1 0 0 0 1 54696p02.dat',
        '0 NOFILE',
        '0 FILE 42099 - 22169.dat', '0 A copy of the Technic L motor', '0 !LDRAW_ORG Unofficial_Shortcut', '1 16 0 0 0 1 0 0 0 1 0 0 0 1 22169.dat', '0 NOFILE'
    ].join('\n');
    const {model, refusals} = parseModel(mpd, {catalog: CATALOG});
    assert.deepEqual(refusals, []);
    assert.deepEqual(model.parts.map(p => p.part), ['22169.dat', '54696p01.dat']);
});

test('with two hubs, each motor the file left unplugged goes into the nearer hub\'s free port', () => {
    const I = '1 0 0 0 1 0 0 0 1';
    const text = [
        '0 two hubs', `1 71 0 0 0 ${I} 22127.dat`, `1 71 1000 0 0 ${I} 22127.dat`,
        `1 71 100 0 0 ${I} 22169.dat`, `1 71 900 0 0 ${I} 22169.dat`, `1 71 1100 0 0 ${I} 22172.dat`].join('\n');
    const prep = prepareModel(text, CATALOG);
    const [h1, h2] = prep.model.parts.filter(p => p.part === '22127.dat').map(p => p.id);
    const portOf = x => prep.model.parts.find(p => p.position[0] === x).port;
    assert.deepEqual([portOf(100), portOf(900), portOf(1100)], [{hub: h1, port: 'A'}, {hub: h2, port: 'A'}, {hub: h2, port: 'B'}]);
});

test('auto ports: a hub\'s built-in motors keep their ports (BOOST Move hub A and B); an external motor goes to a free one', () => {
    // Frankie the Cat (17101) would not open: its external motor went to B, beside the hub's own motor B.
    const boost = ['0 BOOST', '1 71 0 0 0 1 0 0 0 1 0 0 0 1 26910.dat', '1 71 0 -100 0 1 0 0 0 1 0 0 0 1 26913.dat'].join('\n');
    const {issues, mechanism} = prepareModel(boost, CATALOG);
    const plugged = issues.find(i => i.code === 'ports-plugged');
    assert.ok(plugged, 'the external motor is plugged in');
    assert.doesNotMatch(plugged.message, /→ [AB]\b/, plugged.message);
    const ports = mechanism.joints.filter(j => j.motor).map(j => j.motor.port);
    assert.equal(new Set(ports).size, ports.length, `one motor per port: ${ports}`);
});
