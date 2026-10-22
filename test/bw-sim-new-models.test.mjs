// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The 2026-10-22 deliveries as shipped: the gallery entry, its real parser/VM
// program, the passive output it claims to move, and both lessons through the
// production loader. Browser and hardware operation are separate gates.
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

const CASES = Object.freeze({
    'product-plotter': {
        en: 'Product Plotter — a mechanical multiplier',
        de: 'Product Plotter — ein mechanischer Multiplizierer',
        parts: 301,
        ports: ['A', 'B'],
        ranges: {A: 20, B: 100},
        timeLimitMs: 75000,
        output: 'output_marker',
        span: {x: 10, z: 8}
    },
    'sky-courier': {
        en: 'Sky Courier — two-winch suspended gondola',
        de: 'Sky Courier — schwebende Gondel an zwei Winden',
        parts: 251,
        ports: ['A', 'B'],
        ranges: {A: 500, B: 500},
        timeLimitMs: 180000,
        output: 'payload_tie_spine',
        span: {y: 20, z: 30}
    },
    'gimbal-lab': {
        en: 'Gimbal Lab — three-axis gimbal lock',
        de: 'Gimbal Lab — dreiachsige Gimbal-Sperre',
        parts: 245,
        ports: ['A', 'B', 'C'],
        ranges: {A: 15, B: 60, C: 15},
        timeLimitMs: 130000,
        output: 'marker_primary',
        orientationDegrees: 60
    }
});

const quaternionAngle = (a, b) => {
    const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, dot)) * DEG;
};

for (const [id, spec] of Object.entries(CASES)) {
    test(`${id}: shipped title, program and both lessons`, async () => {
        const entry = MODELS.find(model => model.file === `${id}.ldr`);
        assert.ok(entry, `${id}: gallery entry`);
        assert.deepEqual(entry.title, {en: spec.en, de: spec.de});
        assert.equal(entry.example, `${id}.bw`);
        assert.match(read(`${LAB}programs/${id}.bw`).toString(), /^DEVICE SPIKE\s*$/m);

        const fetcher = async path => ({ok: true, json: async () => JSON.parse(read(`overlay/scratch-gui/${path}`))});
        for (const language of ['en', 'de']) {
            const lesson = await loadModelLesson(entry, language, {fetcher});
            assert.equal(lesson.id, id);
            assert.equal(lesson.language, language);
            assert.ok(lesson.answer.length > 200, `${id} ${language}: substantive explanation`);
            assert.ok(lesson.try.length >= 3 && lesson.further.length >= 3, `${id} ${language}: practical steps`);
        }
    });

    test(`${id}: the real program moves its outputs and returns home`, async () => {
        const modelText = read(`${LAB}models/${id}.ldr`).toString();
        assert.equal(parseModel(modelText).model.parts.length, spec.parts);
        const result = await runRobotLabProgram(read(`${LAB}programs/${id}.bw`).toString(), {
            modelText,
            timeLimitMs: spec.timeLimitMs
        });
        assert.ok(result.finishedAt, `${id}: program reaches its end`);
        assert.deepEqual(result.issues.filter(issue => issue.severity === 'error'), []);
        assert.deepEqual(result.mechanism.actuators.map(actuator => actuator.port).sort(), spec.ports);

        const track = result.track;
        for (const actuator of result.mechanism.actuators) {
            const angles = track.map(frame => frame.joints[actuator.joint].angle);
            const range = (Math.max(...angles) - Math.min(...angles)) * DEG;
            assert.ok(range >= spec.ranges[actuator.port], `${id} ${actuator.port}: ${range.toFixed(1)}°`);
            assert.ok(Math.abs(angles.at(-1) * DEG) < 3, `${id} ${actuator.port} returns home`);
        }

        const body = result.mechanism.bodies.find(candidate => candidate.parts.includes(spec.output));
        assert.ok(body, `${id}: output body`);
        const poses = track.map(frame => frame.bodies[body.id]);
        if (spec.orientationDegrees) {
            const maximum = Math.max(...poses.map(pose => quaternionAngle(poses[0].rotation, pose.rotation)));
            assert.ok(maximum >= spec.orientationDegrees, `${id}: output turns ${maximum.toFixed(1)}°`);
            assert.ok(quaternionAngle(poses[0].rotation, poses.at(-1).rotation) < 3, `${id}: output returns home`);
        } else {
            const positions = poses.map(pose => pose.position);
            for (const [axis, index] of [['x', 0], ['y', 1], ['z', 2]]) {
                if (!spec.span[axis]) continue;
                const values = positions.map(position => position[index]);
                const span = (Math.max(...values) - Math.min(...values)) * 1000;
                assert.ok(span >= spec.span[axis], `${id}: output travels ${span.toFixed(1)} mm in ${axis}`);
            }
            const home = Math.hypot(...positions.at(-1).map((value, index) => value - positions[0][index])) * 1000;
            assert.ok(home < 3, `${id}: output returns home`);
        }
    });
}
