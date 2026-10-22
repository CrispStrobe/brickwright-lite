// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Circle Splitter as shipped: the gallery entry, both lessons through the
// production loader, and the real VM program measured from the recorded
// bodies — two perpendicular straight strokes, a rigid 40 mm bar and the
// planet's counterrotation. Browser and hardware operation are separate gates.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {loadModelLesson} from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
import {judgeCircleSplitter} from '../scripts/lib/sim-lab-circle-splitter-judge.mjs';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';

const ROOT = new URL('../', import.meta.url);
const LAB = 'overlay/scratch-gui/static/sim-lab/';
const read = path => readFileSync(new URL(path, ROOT));

test('Circle Splitter: source identity and gallery-owned reset are reproducible',()=>{
    const base='test/fixtures/model-files/circle-splitter-source/';
    const provenance=JSON.parse(read(base+'provenance.json'));
    for(const [file,hash]of Object.entries(provenance.files))assert.equal(createHash('sha256').update(read(base+file)).digest('hex'),hash);
    assert.equal(read(LAB+'models/circle-splitter.ldr').toString(),read(base+'models/circle-splitter.ldr').toString());
    assert.equal(read(LAB+'programs/circle-splitter.bw').toString(),read(base+'programs/circle-splitter.bw').toString().replace('  lab reset\n',''));
});

test('circle-splitter: shipped title, program and both lessons', async () => {
    const entry = MODELS.find(model => model.file === 'circle-splitter.ldr');
    assert.ok(entry, 'circle-splitter: gallery entry');
    assert.deepEqual(entry.title, {
        en: 'Circle Splitter — circles into straight strokes',
        de: 'Circle Splitter — Kreise werden gerade Hübe'
    });
    assert.equal(entry.example, 'circle-splitter.bw');
    assert.match(read(`${LAB}programs/circle-splitter.bw`).toString(), /^DEVICE SPIKE\s*$/m);

    const fetcher = async path => ({ok: true, json: async () => JSON.parse(read(`overlay/scratch-gui/${path}`))});
    for (const language of ['en', 'de']) {
        const lesson = await loadModelLesson(entry, language, {fetcher});
        assert.equal(lesson.id, 'circle-splitter');
        assert.equal(lesson.language, language);
        assert.ok(lesson.answer.length > 200, `${language}: substantive explanation`);
        assert.ok(lesson.try.length >= 3 && lesson.further.length >= 3, `${language}: practical steps`);
    }
});

// One 80-second native run serves both measurements below.
let runPromise = null;
const nativeRun = () => {
    if (!runPromise) {
        const modelText = read(`${LAB}models/circle-splitter.ldr`).toString();
        runPromise = runRobotLabProgram(read(`${LAB}programs/circle-splitter.bw`).toString(), {
            modelText,
            timeLimitMs: 240000
        });
    }
    return runPromise;
};

test('circle-splitter: the real program turns the carrier and the two tiles stroke straight lines', async () => {
    const modelText = read(`${LAB}models/circle-splitter.ldr`).toString();
    assert.equal(parseModel(modelText).model.parts.length, 136);
    const result = await nativeRun();
    assert.ok(result.finishedAt, 'the program reaches its end');
    assert.deepEqual(result.issues.filter(issue => issue.severity === 'error'), []);
    assert.deepEqual(result.mechanism.actuators.map(actuator => actuator.port), ['A']);
    for (const frame of result.track) {
        for (const pose of Object.values(frame.bodies)) {
            assert.ok([...pose.position, ...pose.rotation].every(Number.isFinite));
        }
    }
    const measured = judgeCircleSplitter('circle-splitter', result);
    assert.ok(measured.strokesMm.every(stroke => Math.abs(stroke - 80) < 0.5), 'both strokes are 80 mm');
    assert.ok(measured.lineDeviationMm < 0.2, 'each tile centre stays on its line');
    assert.ok(measured.linesAngleDegrees < 1, 'the two lines are perpendicular');
    assert.ok(Math.abs(measured.separationMm - 40) < 0.2, 'the bar keeps its 40 mm length');
    assert.ok(Math.abs(measured.planetRelativeRatio + 2) < 0.01, 'the planet counterrotates at twice the rate');
});

test('circle-splitter: a frozen output body fails the measurement', async () => {
    const result = await nativeRun();
    const body = result.mechanism.bodies.find(candidate => candidate.parts.includes('output_bar'));
    assert.ok(body, 'the output bar has a body');
    const frozen = structuredClone(result);
    for (const frame of frozen.track) frame.bodies[body.id] = structuredClone(frozen.track[0].bodies[body.id]);
    assert.throws(() => judgeCircleSplitter('circle-splitter', frozen), 'a frozen output must fail');
});


test('Circle: removing only the stationary sun gear destroys the actual straight-line law',async()=>{
 const text=read(`${LAB}models/circle-splitter.ldr`).toString();
 const removed=text.replace(/0 !BW ID sun_gear\n1 [^\n]*\n/,'');
 assert.notEqual(removed,text);assert.equal(parseModel(text).model.parts.length-parseModel(removed).model.parts.length,1);
 const r=await runRobotLabProgram(read(`${LAB}programs/circle-splitter.bw`).toString(),{modelText:removed,timeLimitMs:100000});
 assert.ok(r.finishedAt);const motor=r.mechanism.joints.find(j=>j.motor);
 const angles=r.track.map(f=>f.joints[motor.id].angle);
 assert.ok(Math.max(...angles)-Math.min(...angles)>6,'The physical input still completes its turn');
 assert.throws(()=>judgeCircleSplitter('circle-splitter',r),'Real sun-gear loss must fail the identical motion judge');
});
