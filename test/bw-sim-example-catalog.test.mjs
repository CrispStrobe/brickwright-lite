// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REPO} from './helpers/bw-integrated.mjs';
import {MODELS, prepareModel, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {MODEL_LESSONS} from '../overlay/scratch-gui/src/lib/bw-sim/model/example-catalog.js';
import {filterModelExamples, EXAMPLE_TOPICS} from '../overlay/scratch-gui/src/lib/bw-sim/model/example-browser.js';
const catalog = catalogFrom(JSON.parse(readFileSync(`${REPO}/overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json`)));
test('gallery metadata counts the actual models, motors and hubs and covers every menu entry', () => {
    assert.deepEqual(Object.keys(MODEL_LESSONS).sort(), MODELS.map(m => m.id || m.file).sort());
    for (const m of MODELS) {
        const d = MODEL_LESSONS[m.id || m.file];
        const p = prepareModel(readFileSync(`${REPO}/overlay/scratch-gui/static/sim-lab/models/${m.file}`, 'utf8'), catalog);
        assert.equal(d.pieces, p.model.parts.length + (p.model.belts || []).length, m.file);
        assert.equal(d.motors, p.mechanism.actuators.length, m.file);
        assert.deepEqual(d.hubs, [...new Set(p.mechanism.hubs.map(h => h.profile))]);
        assert.ok(d.description.en && d.description.de && EXAMPLE_TOPICS[d.topic]);
        assert.equal(d.license, 'BSD-3-Clause');
    }
});
test('filter physics, translated descriptions, hubs, and genuinely larger models', () => {
    const large = filterModelExamples(MODELS, MODEL_LESSONS, {size: 'large'});
    assert.deepEqual(large.map(m => m.id || m.file).sort(), ['amplify.ldr', 'atlas-arm.ldr', 'axis-plotter.ldr', 'bloom-gate.ldr', 'butterfly.ldr', 'chain-transmission.ldr', 'crossglide.ldr', 'crossline.ldr', 'differential-car.ldr', 'echo-bridge.ldr', 'ellipsa.ldr', 'ellipse-engine.ldr', 'excavator.ldr', 'flywheel-differential.ldr', 'linger.ldr', 'magnetic-chess.ldr', 'mean-machine.ldr', 'momentum-twins.ldr', 'offset-orbit.ldr', 'orbit-mixer.ldr', 'orbital-loom-eightfold', 'orbital-loom-elevenfold', 'orbital-loom-sevenfold', 'orbital-loom.ldr', 'pantograph-doubler.ldr', 'pendulum-array.ldr', 'phase-bridge-misphased.ldr', 'phase-bridge.ldr', 'pulse-percussion.ldr', 'quickstroke.ldr', 'ratio-workbench.ldr', 'ripple-relay.ldr', 'sarrus-lift.ldr', 'scale-echo.ldr', 'scale-studio.ldr', 'stepworks.ldr', 'straight-eight.ldr', 'stride-lab.ldr', 'switchback-lift.ldr', 'tempo-loop.ldr', 'tidal-trio-alternating', 'tidal-trio-reverse', 'tidal-trio-together', 'tidal-trio.ldr', 'tilt-lab.ldr', 'turnwise.ldr', 'twinpoint.ldr']);
    assert.deepEqual(filterModelExamples(MODELS, MODEL_LESSONS, {query: 'Schwungrad', locale: 'de'}).map(m => m.file), ['flywheel-differential.ldr']);
    assert.deepEqual(filterModelExamples(MODELS, MODEL_LESSONS, {topic: 'chains', size: 'large'}).map(m => m.file), ['chain-transmission.ldr']);
    assert.equal(filterModelExamples(MODELS, MODEL_LESSONS, {query: 'no-such-model-123'}).length, 0);
    assert.ok(filterModelExamples(MODELS, MODEL_LESSONS, {query: 'ev3'}).length > 0);
    const fake = [{file: 'boundary.ldr', title: {en: 'Boundary'}}];
    assert.equal(filterModelExamples(fake, {'boundary.ldr': {pieces: 50, description: {en: ''}, hubs: [], author: ''}}, {size: 'large'}).length, 0);
});
