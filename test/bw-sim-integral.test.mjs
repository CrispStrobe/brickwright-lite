// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Integral as shipped: the catalog entry keeps its explicit import setting,
// both lessons load through the production loader, and the real VM program
// drives the platter and carriage while the free wheel turns and reverses.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {loadModelLesson} from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';

const ROOT = new URL('../', import.meta.url);
const LAB = 'overlay/scratch-gui/static/sim-lab/';
const read = path => readFileSync(new URL(path, ROOT));
const DEG = 180 / Math.PI;

const ENTRY = {
    en: 'Integral — a friction wheel computer',
    de: 'Integral — ein Reibrad-Rechner'
};

const unwrap = values => {
    let total = values[0];
    return values.map((value, i) => {
        if (i === 0) return total;
        const delta = Math.atan2(Math.sin(value - values[i - 1]), Math.cos(value - values[i - 1]));
        total += delta;
        return total;
    });
};

test('integral: shipped title, explicit import setting and both lessons', async () => {
    const entry = MODELS.find(model => model.id === 'integral');
    assert.ok(entry, 'integral: gallery entry');
    assert.deepEqual(entry.title, ENTRY);
    assert.equal(entry.file, 'integral.ldr');
    assert.equal(entry.example, 'integral.bw');
    assert.equal(entry.autoPorts, false, 'integral keeps the validated explicit import setting');
    assert.match(read(`${LAB}programs/integral.bw`).toString(), /^DEVICE SPIKE\s*$/m);

    const fetcher = async path => ({ok: true, json: async () => JSON.parse(read(`overlay/scratch-gui/${path}`))});
    for (const language of ['en', 'de']) {
        const lesson = await loadModelLesson(entry, language, {fetcher});
        assert.equal(lesson.id, 'integral');
        assert.equal(lesson.language, language);
        assert.ok(lesson.answer.length > 200, `${language}: substantive explanation`);
        assert.ok(lesson.try.length >= 3 && lesson.further.length >= 3, `${language}: practical steps`);
    }
});

test('integral: the real program drives both motors and the passive wheel turns and reverses', async () => {
    const modelText = read(`${LAB}models/integral.ldr`).toString();
    assert.equal(parseModel(modelText).model.parts.length, 154);
    const result = await runRobotLabProgram(read(`${LAB}programs/integral.bw`).toString(), {
        modelText,
        timeLimitMs: 60000,
        autoPorts: false
    });
    assert.ok(result.finishedAt, 'the program reaches its end');
    assert.deepEqual(result.issues.filter(issue => issue.severity === 'error'), []);
    assert.deepEqual(result.mechanism.actuators.map(actuator => actuator.port).sort(), ['A', 'B']);

    const anglesFor = port => {
        const actuator = result.mechanism.actuators.find(candidate => candidate.port === port);
        return result.track.map(frame => frame.joints[actuator.joint].angle);
    };
    const a = anglesFor('A');
    const b = anglesFor('B');
    const aSpan = (Math.max(...a) - Math.min(...a)) * DEG;
    const bSpan = (Math.max(...b) - Math.min(...b)) * DEG;
    assert.ok(aSpan >= 3000, `platter motor turns ${aSpan.toFixed(0)}°`);
    assert.ok(bSpan >= 500, `carriage motor crosses ${bSpan.toFixed(0)}°`);
    assert.ok(Math.abs(b.at(-1) * DEG) < 5, 'carriage returns to the centre');

    const wheelJoint = result.mechanism.joints.find(joint => joint.type === 'hinge' && joint.body1 === 'b4' && joint.body2 === 'b5');
    assert.ok(wheelJoint, 'the free wheel has its passive hinge');
    const wheel = unwrap(result.track.map(frame => frame.joints[wheelJoint.id].angle));
    const wheelSpan = (Math.max(...wheel) - Math.min(...wheel)) * DEG;
    assert.ok(wheelSpan >= 360, `the passive wheel turns ${wheelSpan.toFixed(0)}°`);
    const deltas = wheel.slice(1).map((value, i) => value - wheel[i]);
    assert.ok(deltas.some(delta => delta > 0.01), 'the wheel turns forward');
    assert.ok(deltas.some(delta => delta < -0.01), 'the wheel reverses across the centre');
});
