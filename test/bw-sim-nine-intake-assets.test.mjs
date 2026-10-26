// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {buildSteps, partAdjacency, partsList} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {EXPERIMENTAL_MODELS, EXPERIMENTAL_MODEL_DETAILS} from '../overlay/scratch-gui/src/lib/bw-sim/model/experimental-models.js';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const hash = s => createHash('sha256').update(s).digest('hex');
const catalog = catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const counts = {helixgate: 20, looprelay: 54, paritydial: 31, counterslide: 44,
    'toggle-press': 142, footfall: 120, phasekeeper: 81, vectorsum: 122, pointweaver: 128};

test('the exact supplied nine originals remain independent failure evidence', () => {
    const prefix = 'test/fixtures/model-files/nine-technic-source/';
    const provenance = JSON.parse(read(prefix + 'provenance.json'));
    assert.deepEqual(provenance.models.map(m => m.id).sort(), Object.keys(counts).sort());
    for (const m of provenance.models) {
        assert.equal(hash(read(prefix + m.id + '/original.ldr')), m.modelSha256);
        assert.equal(hash(read(prefix + m.id + '/original.bw')), m.programSha256);
        assert.match(read(prefix + m.id + '/LICENSE.txt'), /BSD|Redistribution and use/);
    }
});

for (const [id, count] of Object.entries(counts)) test(`${id}: coherent source, connected instructions, placement BOM, program and bilingual lesson`, async () => {
    const base = 'overlay/scratch-gui/static/sim-lab/';
    const source = read(base + `models/${id}.ldr`);
    const prepared = prepareModel(source, catalog, {autoPorts: false});
    const wrapped = prepareModel(read(base + `models/${id}.mpd`), catalog, {autoPorts: false});
    assert.equal(prepared.model.parts.length, count);
    assert.deepEqual(wrapped.runModel.parts, prepared.runModel.parts);
    const root = prepared.mechanism.bodies.find(b => b.id === prepared.mechanism.hubs[0].body);
    for (const issue of prepared.issues) {
        assert.ok(id === 'toggle-press' && issue.code === 'locked-hinges' &&
            issue.parts.every(part => root.parts.includes(part)),
        `${id}: only the deliberately fixed two-axis tower may carry an assembly advisory: ${JSON.stringify(issue)}`);
    }
    const entries = EXPERIMENTAL_MODELS.filter(e => e.file === id + '.ldr');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].example, id + '.bw');
    assert.equal(EXPERIMENTAL_MODEL_DETAILS[id + '.ldr'].pieces, count);
    assert.match(read(base + `licenses/${id}.txt`), /CrispStrobe/);

    const plan = buildSteps(prepared.model, catalog);
    assert.equal(new Set(plan.steps.flatMap(s => s.parts)).size, count);
    assert.equal(plan.steps.flatMap(s => s.parts).length, count);
    assert.ok(plan.steps.every(s => !s.loose && s.parts.length > 0 && s.parts.length <= 6));
    assert.equal(partsList(prepared.model, catalog).reduce((n, p) => n + p.count, 0), count);
    // Authored STEP labels themselves do not prove physical attachment. Audit
    // every individual addition against the real connector graph. A Cardan
    // cross physically retains its two forks without making them one body.
    const adjacency = partAdjacency(prepared.model, catalog);
    for (const c of prepared.mechanism.couplings.filter(c => c.kind === 'universalJoint')) {
        const [a, b] = c.parts;
        adjacency.get(a).add(b); adjacency.get(b).add(a);
    }
    const placed = new Set();
    for (const step of plan.steps) for (const part of step.parts) {
        assert.ok(!placed.size || [...adjacency.get(part)].some(n => placed.has(n)), `${id}: ${part} attaches when introduced`);
        placed.add(part);
    }

    const creator = new Creator();
    creator.parse(read(base + `programs/${id}.bw`)); await creator.generateSB3();
    assert.equal(creator.validate().isValid, true);
    assert.deepEqual(creator.warnings || [], []);
    assert.deepEqual(creator.unparsed || [], []);
    for (const language of ['en', 'de']) {
        const lesson = JSON.parse(read(base + `lessons/${id}.${language}.json`));
        assert.equal(lesson.id, id); assert.equal(lesson.language, language);
        assert.ok(lesson.try.length >= 3 && lesson.answer.length > 100);
        if (id === 'phasekeeper') assert.match(lesson.what, /83/);
    }
});
