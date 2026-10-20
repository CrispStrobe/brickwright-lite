// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Building instructions for Robot Lab models (bw-sim/instructions/steps.js),
// headless. For the S1 driving base and every model the Model list ships:
//   - every part is placed exactly once;
//   - every step is buildable: each new part touches a part built in an
//     earlier step, directly or through other new parts of the same step —
//     judged on the connector graph (mech/graph.js buildGraph), read here
//     independently of the module under test;
//   - a pin or axle goes on in the step where the second part it joins does
//     (so a pin with the beam it holds, an axle with the wheel on it);
//   - the bill of materials counts what the model holds.
// Plus: `0 STEP` lines are followed when a file has them (fixture
// test/fixtures/bw-sim/driving-base-steps.ldr) and survive a save; an editor
// group is built as a sub-assembly before the step that attaches it; a part
// that touches nothing starts a step marked loose.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {MODELS, MODELS_BASE, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {buildGraph} from '../overlay/scratch-gui/src/lib/bw-sim/mech/graph.js';
import {WRAPPED_GEARS, linksJoin, pivotsOnGear} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/chain.js';
import {placedSpur, placedTooth} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/tooth-parts.js';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {buildSteps, stepView, partsList, partLength, STEP_MAX, mirrorPairs, partAdjacency} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(GUI, 'src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

const load = text => {
    const {model, refusals} = parseModel(text, {catalog: CATALOG});
    assert.deepEqual(refusals, []);
    return model;
};
const MODELS_UNDER_TEST = [
    {name: 'S1 driving base (test fixture)', text: read('test/fixtures/bw-sim/driving-base.ldr')},
    // One entry per model FILE: a robot listed twice in MODELS (e.g. the Colour explorer again as
    // the Sumo example, keyed by its id) has one set of building instructions.
    ...[...new Set(MODELS.map(m => m.file))].map(file => ({name: file, text: readFileSync(path.join(GUI, MODELS_BASE, file), 'utf8')}))
];

/** Which parts touch which: the connector graph's edges, a motor's two nodes as one part. */
const touching = model => {
    const {nodes, edges} = buildGraph(model, CATALOG, []);
    const out = new Map(model.parts.map(p => [p.id, new Set()]));
    for (const e of edges) {
        const a = nodes.get(e.a.part).partId;
        const b = nodes.get(e.b.part).partId;
        if (a !== b) { out.get(a).add(b); out.get(b).add(a); }
    }
    // A chain or tread link holds on by its pivots, not by a connector edge: it touches the next link
    // on its pivot and the sprocket it rides on (kinds/chain.js).
    const links = model.parts.flatMap(p => placedTooth(p, CATALOG.get(p.part), 'chain-link', ['along']).map(l => ({id: p.id, l})));
    const gears = model.parts.map(p => ({id: p.id, g: placedSpur(p, CATALOG.get(p.part), WRAPPED_GEARS)})).filter(x => x.g);
    const join = (a, b) => { out.get(a).add(b); out.get(b).add(a); };
    links.forEach((a, i) => {
        for (const b of links.slice(i + 1)) if (linksJoin(a.l, b.l)) join(a.id, b.id);
        for (const g of gears) if (pivotsOnGear(a.l, g.g) > 0) join(a.id, g.id);
    });
    return out;
};
const category = (model, id) => CATALOG.get(model.parts.find(p => p.id === id).part).category;

/**
 * Asserts each step can be built: every new part reaches a part built before
 * (in the same assembly) through new parts of this step. The first step of an
 * assembly has nothing built yet: its new parts must hold together.
 */
const assertBuildable = (label, model, plan) => {
    const adj = touching(model);
    plan.steps.forEach((step, n) => {
        const {built, fresh} = stepView(plan, n);
        assert.ok(fresh.length > 0, `${label} step ${n + 1}: places something`);
        const done = new Set(built);
        const freshSet = new Set(fresh);
        const reached = new Set();
        const queue = done.size ? fresh.filter(id => [...adj.get(id)].some(x => done.has(x))) : [fresh[0]];
        for (const id of queue) reached.add(id);
        while (queue.length) {
            for (const x of adj.get(queue.shift())) {
                if (freshSet.has(x) && !reached.has(x)) { reached.add(x); queue.push(x); }
            }
        }
        assert.deepEqual(fresh.filter(id => !reached.has(id)), [],
            `${label} step ${n + 1}: these new parts touch nothing built: ${JSON.stringify({built, fresh})}`);
        assert.equal(step.loose, false, `${label} step ${n + 1} is not loose`);
    });
};

/** Step index of every part (sub-assembly parts in their own step). */
const stepIndex = plan => {
    const at = new Map();
    plan.steps.forEach((s, n) => s.parts.forEach(id => {
        assert.ok(!at.has(id), `${id} is placed twice`);
        at.set(id, n);
    }));
    return at;
};

for (const {name, text} of MODELS_UNDER_TEST) {
    test(`${name}: derived steps place every part once, each step buildable, fasteners with what they join`, () => {
        const model = load(text);
        const plan = buildSteps(model, CATALOG);
        assert.equal(plan.source, 'auto');
        const at = stepIndex(plan);
        assert.deepEqual([...at.keys()].sort(), model.parts.map(p => p.id).sort(), 'every part exactly once');
        assertBuildable(name, model, plan);
        // The hub comes first, as on page 1 of a SPIKE manual; a model with no hub (the motor bench,
        // driven by the Robot Lab itself) starts from its motor.
        const first = model.parts.some(p => p.id === 'hub') ? 'hub' : 'motor';
        assert.ok(plan.steps[0].parts.includes(first), `${name}: the ${first} is in step 1`);
        // Steps like a manual's: a few parts each.
        for (const s of plan.steps) assert.ok(s.parts.length <= STEP_MAX, `${name}: step of ${s.parts.length} parts`);
        const mean = model.parts.length / plan.steps.length;
        assert.ok(mean >= 3 && mean <= STEP_MAX, `${name}: ${mean} parts per step`);
        // A pin or axle goes on with the later of the two parts it joins; one joining one part, with it.
        const adj = touching(model);
        let checked = 0;
        let fasteners = 0;
        for (const p of model.parts) {
            if (!['pin', 'axle'].includes(category(model, p.id))) continue;
            fasteners++;
            const joins = [...adj.get(p.id)];
            assert.ok(joins.length >= 1, `${name}: ${p.id} holds something`);
            if (joins.length > 2) continue;
            assert.equal(at.get(p.id), Math.max(...joins.map(id => at.get(id))), `${name}: ${p.id} joins ${joins.join(', ')}`);
            checked++;
        }
        // Four at least where a model has them; the RCX bumper car is a studded build whose three pins
        // are all it has (two join three parts), and the hubless motor bench has a single axle.
        assert.ok(checked >= (fasteners >= 4 ? 4 : 1), `${name}: ${checked} of ${fasteners} pins and axles checked`);
        // Each wheel shares its step with the axle it sits on.
        for (const wheel of model.parts.filter(p => category(model, p.id) === 'wheel')) {
            const axles = [...adj.get(wheel.id)].filter(id => category(model, id) === 'axle');
            // A wheel straight on a motor's output stub (the RCX bumper car's mini-motors) needs no axle
            // of its own: it sits on one motor, and may go on in a later step.
            const motors = [...adj.get(wheel.id)].filter(id => category(model, id) === 'motor');
            if (axles.length === 0 && motors.length === 1) continue;
            assert.equal(axles.length, 1, `${name}: ${wheel.id} sits on one axle`);
            assert.equal(at.get(axles[0]), at.get(wheel.id), `${name}: ${wheel.id} with ${axles[0]}`);
        }
    });

    test(`${name}: the bill of materials counts what the model holds`, () => {
        const model = load(text);
        const bom = partsList(model, CATALOG);
        assert.equal(bom.reduce((n, row) => n + row.count, 0), model.parts.length);
        const counted = new Map();
        for (const p of model.parts) counted.set(`${p.part}@${p.color}`, (counted.get(`${p.part}@${p.color}`) || 0) + 1);
        assert.deepEqual(new Map(bom.map(row => [`${row.part}@${row.color}`, row.count])), counted);
        for (const row of bom) {
            assert.ok(row.name.en && row.name.de, `${row.part}: EN and DE names`);
            assert.equal(row.name.en, CATALOG.get(row.part).name);
            assert.equal(row.name.de, CATALOG.get(row.part).nameDe);
        }
        // Each step's callout counts that step's new parts.
        const plan = buildSteps(model, CATALOG);
        const sum = plan.steps.reduce((n, s) => n + partsList(model, CATALOG, s.parts).reduce((k, row) => k + row.count, 0), 0);
        assert.equal(sum, model.parts.length);
    });
}

/**
 * Mirrored sub-assemblies go on together, as in a LEGO manual: the two drive motors in one step,
 * the two wheels in one step, "2x" in the callout. Judged here from the placements alone: two
 * structural parts (not pins or axles) with the same part number and colour, at the same height
 * and depth, on either side of the hub's centre plane x = hub.x.
 */
const mirroredStructural = model => {
    const hub = model.parts.find(p => CATALOG.get(p.part).hubProfile);
    const out = [];
    for (const a of model.parts) {
        if (['pin', 'axle'].includes(category(model, a.id)) || a.position[0] <= hub.position[0]) continue;
        const b = model.parts.find(o => o.part === a.part && o.color === a.color &&
            Math.abs(o.position[0] - (2 * hub.position[0] - a.position[0])) < 1e-6 &&
            o.position[1] === a.position[1] && o.position[2] === a.position[2]);
        if (b) out.push([a.id, b.id]);
    }
    return out;
};

/** The driving bases: a motor and a wheel either side of the hub (the Forklift has one lift motor). */
const DRIVING_BASES = MODELS_UNDER_TEST.filter(m => /!BW ID motorL\b/.test(m.text));
test('the mirrored-pair check covers the fixture and every shipped driving base', () => {
    assert.deepEqual(DRIVING_BASES.map(m => m.name),
        ['S1 driving base (test fixture)', 'driving-base.ldr', 'line-follower.ldr', 'wall-stopper.ldr', 'colour-explorer.ldr', 'maze-runner.ldr', 'drawing-robot.ldr', 'excavator.ldr']);
});

for (const {name, text} of DRIVING_BASES) {
    test(`${name}: mirrored pairs go on in one step, counted 2x in its callout`, () => {
        const model = load(text);
        const plan = buildSteps(model, CATALOG);
        const at = stepIndex(plan);
        const pairs = mirroredStructural(model);
        const ids = pairs.flat();
        for (const want of ['motorL', 'motorR', 'wheelL', 'wheelR']) assert.ok(ids.includes(want), `${name}: ${want} has a mirror image`);
        for (const [a, b] of pairs) {
            assert.equal(at.get(a), at.get(b), `${name}: ${a} and ${b} in one step`);
            const row = partsList(model, CATALOG, plan.steps[at.get(a)].parts)
                .find(r => r.part === model.parts.find(p => p.id === a).part);
            assert.ok(row.count >= 2, `${name}: ${a}'s callout says ${row.count}x`);
        }
        // And what holds them: each wheel's axle and each motor's pin in that same step.
        assert.equal(at.get('axleL'), at.get('wheelL'));
        assert.equal(at.get('axleR'), at.get('wheelR'));
        assert.equal(at.get('pinL'), at.get('motorL'));
        assert.equal(at.get('pinR'), at.get('motorR'));
    });
}

test('a pair is mirrored only when it is held the same way: without its pin, the left motor is not', () => {
    const model = load(read('test/fixtures/bw-sim/driving-base.ldr'));
    const pairs = mirrorPairs(model, CATALOG, partAdjacency(model, CATALOG));
    assert.equal(pairs.get('motorR'), 'motorL');
    assert.equal(pairs.get('wheelL'), 'wheelR');
    assert.ok(!pairs.has('hub') && !pairs.has('frontBeam') && !pairs.has('castor'), 'parts on the plane are their own image');
    const unpinned = {...model, parts: model.parts.filter(p => p.id !== 'pinL')};
    const without = mirrorPairs(unpinned, CATALOG, partAdjacency(unpinned, CATALOG));
    assert.ok(!without.has('motorR') && !without.has('motorL'), 'the right motor is pinned to the hub, the left one to nothing');
    // A wheel with no counterpart (the left one moved off its axle) is not paired either.
    const moved = {...model, parts: model.parts.map(p => (p.id === 'wheelL' ? {...p, position: [-170, 10, 300]} : p))};
    assert.ok(!mirrorPairs(moved, CATALOG, partAdjacency(moved, CATALOG)).has('wheelR'));
});

test('lengths a manual prints: an axle 4 in a circle, a 7-hole beam, a 3L pin; none for a hub', () => {
    assert.equal(partLength(CATALOG.get('3705.dat')), 4);
    assert.equal(partLength(CATALOG.get('3707.dat')), 8);
    assert.equal(partLength(CATALOG.get('32062.dat')), 2);
    assert.equal(partLength(CATALOG.get('32524.dat')), 7);
    assert.equal(partLength(CATALOG.get('32278.dat')), 15);
    assert.equal(partLength(CATALOG.get('6632.dat')), 3);
    assert.equal(partLength(CATALOG.get('6558.dat')), 3);
    assert.equal(partLength(CATALOG.get('2780.dat')), null);
    assert.equal(partLength(CATALOG.get('45601.dat')), null);
    assert.equal(partLength(CATALOG.get('39370.dat')), null, 'the H-shaped castor holder has no single length');
    const bom = partsList(load(read('test/fixtures/bw-sim/driving-base.ldr')), CATALOG);
    assert.deepEqual(bom.find(r => r.part === '3705.dat'), {part: '3705.dat', color: 0, count: 2, length: 4, category: 'axle',
        name: {en: 'Technic axle 4', de: 'Technic-Achse 4'}});
});

test('a file with 0 STEP lines is built in its own steps, and they survive a save', () => {
    const text = read('test/fixtures/bw-sim/driving-base-steps.ldr');
    const model = load(text);
    // The fixture's four steps (the second ends with a ROTSTEP line), as written.
    const expected = [['hub'], ['motorR', 'pinR', 'motorL', 'pinL'],
        ['frontBeam', 'frontPin1', 'frontPin2', 'castor', 'ball'], ['axleR', 'wheelR', 'axleL', 'wheelL']];
    assert.deepEqual(model.steps, expected);
    const plan = buildSteps(model, CATALOG);
    assert.equal(plan.source, 'meta');
    assert.deepEqual(plan.steps.map(s => s.parts), expected);
    // Saved again: one STEP line after each step, and the steps come back.
    const saved = serializeModel(model, {name: 'driving-base-steps.ldr', title: 'Driving base with building steps (test fixture)'});
    assert.equal(saved.match(/^0 STEP\r$/gm).length, 4);
    const again = load(saved);
    assert.deepEqual(again.steps, expected);
    assert.equal(serializeModel(again, {name: 'driving-base-steps.ldr', title: 'Driving base with building steps (test fixture)'}), saved);
    // The Build editor keeps them; a part added there follows in a derived step that is buildable.
    const editor = createEditor({model: again, catalog: CATALOG});
    assert.deepEqual(editor.model.steps, expected);
    const wider = {...editor.model, parts: [...editor.model.parts,
        {id: 'extraPin', part: '2780.dat', color: 0, position: [-40, -10, -110], rotation: [0, 0, -1, 0, 1, 0, 1, 0, 0]}]};
    wider.parts = wider.parts.filter(p => p.id !== 'frontPin2');
    const extended = buildSteps(wider, CATALOG);
    assert.equal(extended.steps.length, 5);
    assert.deepEqual(extended.steps[4].parts, ['extraPin']);
    assert.ok(!extended.steps.some(s => s.parts.includes('frontPin2')), 'a deleted part is not in any step');
    // A model without STEP lines has no steps key and is written as before.
    const plain = load(read('test/fixtures/bw-sim/driving-base.ldr'));
    assert.equal('steps' in plain, false);
    assert.doesNotMatch(serializeModel(plain), /0 STEP/);
});

test('an editor group is a sub-assembly: built on its own first, then attached in one step', () => {
    const model = load(read('test/fixtures/bw-sim/driving-base.ldr'));
    // The castor and its ball (the 3L pins that hold it also hold the front beam on the hub, so they are
    // not in the group); the wheel assembly is a second group.
    model.groups = [{id: 'g1', name: 'Castor', parts: ['castor', 'ball']}, {id: 'g2', name: 'Right wheel', parts: ['axleR', 'wheelR']}];
    const plan = buildSteps(model, CATALOG);
    assert.deepEqual(plan.groups.map(g => g.id), ['g1', 'g2']);
    const at = stepIndex(plan);
    assert.deepEqual([...at.keys()].sort(), model.parts.map(p => p.id).sort(), 'every part exactly once');
    for (const g of plan.groups) {
        const attachAt = plan.steps.findIndex(s => s.attach.includes(g.id));
        assert.ok(attachAt > 0, `${g.id} is attached`);
        for (const id of g.parts) {
            assert.equal(plan.steps[at.get(id)].subassembly, g.id, `${id} is built in sub-assembly ${g.id}`);
            assert.ok(at.get(id) < attachAt, `${id} is built before ${g.id} is attached`);
        }
        // A sub-assembly's step is drawn alone: nothing of the main model in it.
        const first = plan.steps.findIndex(s => s.subassembly === g.id);
        const view = stepView(plan, first);
        assert.equal(view.scope, g.id);
        assert.deepEqual(view.built, []);
        // The attaching step shows the whole group as new, next to the main model built so far.
        const attaching = stepView(plan, attachAt);
        assert.equal(attaching.scope, null);
        for (const id of g.parts) assert.ok(attaching.fresh.includes(id));
        assert.ok(attaching.built.includes('hub'));
    }
    assertBuildable('grouped driving base', model, plan);
    // The castor slides onto the two 3L pins that already hold the front beam on the hub: its attaching
    // step adds no loose parts, and the pins come before it.
    const attachCastor = plan.steps.findIndex(s => s.attach.includes('g1'));
    assert.deepEqual(plan.steps[attachCastor].parts, []);
    for (const pin of ['frontPin1', 'frontPin2']) assert.ok(at.get(pin) < attachCastor, `${pin} is in before the castor`);
});

test('a group that does not hold together on its own is not a sub-assembly; a part touching nothing is loose', () => {
    const model = load(read('test/fixtures/bw-sim/driving-base.ldr'));
    model.groups = [{id: 'g1', name: 'Apart', parts: ['wheelL', 'wheelR']}];
    model.parts.push({id: 'stray', part: '32524.dat', color: 4, position: [0, -400, 600], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]});
    const plan = buildSteps(model, CATALOG);
    assert.deepEqual(plan.groups, []);
    assert.ok(plan.steps.every(s => s.subassembly === null));
    const at = stepIndex(plan);
    assert.equal(at.size, model.parts.length);
    const strayStep = plan.steps[at.get('stray')];
    assert.equal(strayStep.loose, true);
    assert.deepEqual(strayStep.parts, ['stray']);
    assert.equal(plan.steps.filter(s => s.loose).length, 1);
});

test('the print page has one picture per step, in order, then the parts list; names are escaped', async () => {
    const {instructionsPrintHtml} = await import('../overlay/scratch-gui/src/lib/bw-sim/instructions/print-page.js');
    const model = load(read('test/fixtures/bw-sim/driving-base.ldr'));
    const plan = buildSteps(model, CATALOG);
    const row = r => ({thumb: null, count: r.count, length: r.length, name: r.name.de, part: r.part});
    const html = instructionsPrintHtml({lang: 'de', title: 'Fahrbasis <1>',
        text: {step: 'Schritt {n} / {total}', partsNeeded: 'Teile', partsList: 'Teileliste', total: '{n} Teile', attach: 'Ansetzen: {name}', subassembly: 'Zuerst: {name}'},
        steps: plan.steps.map((s, i) => ({image: `data:image/png;base64,STEP${i}`, parts: partsList(model, CATALOG, s.parts).map(row), attach: [], subassembly: null})),
        bom: partsList(model, CATALOG).map(row)});
    const shots = [...html.matchAll(/<img class="shot" data-step="(\d+)" src="data:image\/png;base64,STEP(\d+)"/g)];
    assert.deepEqual(shots.map(m => [Number(m[1]), Number(m[2])]), plan.steps.map((_, i) => [i + 1, i]));
    assert.match(html, /<html lang="de">/);
    assert.match(html, /<title>Fahrbasis &lt;1&gt;<\/title>/);
    assert.ok(html.indexOf('data-bom') > html.lastIndexOf('class="shot"'), 'the parts list comes after the steps');
    assert.match(html, /14 Teile/);
    assert.match(html, /Technic-Achse 4/);
});
