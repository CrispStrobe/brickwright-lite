// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordNineIntake} from './helpers/robot-lab-nine-intake.mjs';
import {NINE_INTAKES, evaluateNineIntake} from '../scripts/lib/sim-lab-nine-intake-judge.mjs';

const selected = process.env.BW_MODEL_QUALIFY_MODELS?.split(',');
for (const id of Object.keys(NINE_INTAKES).filter(id => !selected || selected.includes(id))) {
    for (const frameMs of [25, 1000 / 30]) test(`${id}: ${frameMs === 25 ? 'ordinary' : 'browser'} cadence, passive law, floor support and terminal hold`, async t => {
        const record = await recordNineIntake(id, {frameMs, directory: process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR});
        const result = evaluateNineIntake(id, record);
        t.diagnostic(JSON.stringify(result));
        assert.equal(result.ok, true, JSON.stringify(result.errors));
        assert.ok(record.track.every(f => !f.extra.sessionFailed));

        // Leave motor feedback and code untouched; freeze only actual passive
        // bodies. A completed input route cannot stand in for a moving output.
        const frozen = structuredClone(record);
        const inputBodies = new Set(record.mechanism.joints.filter(j => j.motor).map(j => j.body2));
        const base = record.mechanism.hubs[0].body;
        for (const b of record.mechanism.bodies) if (b.motion === 'dynamic' && b.id !== base && !inputBodies.has(b.id)) {
            for (const f of frozen.track) f.bodies[b.id] = structuredClone(record.track[0].bodies[b.id]);
        }
        const frozenResult = evaluateNineIntake(id, frozen);
        assert.ok(frozenResult.errors.some(e => e.code === 'passive-law'), 'Frozen passive outputs must fail the law');

        const translated = structuredClone(record);
        for (const f of translated.track) if (f.t > 1000) {
            for (const p of Object.values(f.bodies)) p.position[0] += .02;
        }
        assert.ok(evaluateNineIntake(id, translated).errors.some(e => e.code === 'world-foundation-drift-mm'),
            'Relative output agreement cannot conceal a displaced foundation');
    });

    test(`${id}: physical removal breaks the passive law while the original input route still runs`, async t => {
        const record = await recordNineIntake(id, {disconnect: true, directory: process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR});
        const result = evaluateNineIntake(id, record);
        t.diagnostic(JSON.stringify(result));
        assert.ok(result.errors.some(e => e.code === 'passive-law'), 'A real removed transmission part must break the law');
        assert.ok(!result.errors.some(e => e.code.startsWith('route-error-')), 'The same powered input still completes its route');
    });
}
