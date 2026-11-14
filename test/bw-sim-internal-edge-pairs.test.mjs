// SPDX-License-Identifier: BSD-3-Clause
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {validatePlacedModel, validateCompiledMechanism, mechanismV1, upgradeMechanismV1} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {internalEdgeRemovalPlan, requireInternalEdgeRemovalAPI, configureInternalEdgeRemovalPairs, disposeInternalEdgeRemovalSetup} from '../overlay/scratch-gui/src/lib/bw-sim/physics/internal-edge-pairs.js';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const catalog = new Map(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')).parts.map(p => [p.part, p]));
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const model = () => ({version: 1, parts: ['a', 'b', 'c'].map((id, i) => ({id, part: '3001.dat', position: [i * 200, 0, 0], rotation: I}))});
const opted = () => ({...model(), internalEdgeRemovalPairs: [['b', 'a']]});

test('default compile/save bytes stay legacy; empty explicit plan is also legacy', () => {
    const plain = model(), before = JSON.stringify(plain), legacy = compile(plain, catalog, {ground: false});
    const empty = compile({...plain, internalEdgeRemovalPairs: []}, catalog, {ground: false});
    assert.deepEqual(empty, legacy);
    assert.equal(JSON.stringify(plain), before);
    assert(!('internalEdgeRemovalPairs' in legacy));
    assert.doesNotMatch(serializeModel(plain), /INTERNAL_EDGE_PAIR/);
    assert.deepEqual(internalEdgeRemovalPlan(legacy), []);
    requireInternalEdgeRemovalAPI({}, []);
    configureInternalEdgeRemovalPairs({}, new Map(), []);
});

test('malformed unopted models keep the existing diagnostic result instead of throwing', () => {
    for (const parts of [{}, 17, 'not-an-array', false, null, undefined]) {
        const input = {version: 1, parts}, before = JSON.stringify(input);
        const mechanism = compile(input, catalog, {ground: false});
        assert.deepEqual(mechanism.bodies, []);assert.deepEqual(mechanism.joints, []);assert.deepEqual(mechanism.gears, []);
        assert(mechanism.diagnostics.some(d => d.code === 'invalid-model' && d.message === 'model.parts: not an array'));
        assert(!('internalEdgeRemovalPairs' in mechanism));
        assert.equal(JSON.stringify(input), before);
    }
});

test('ordered part references survive save/reopen, edits and undo without aliasing', () => {
    const original = opted(), text = serializeModel(original);
    assert.match(text, /0 !BW INTERNAL_EDGE_PAIR b a/);
    const parsed = parseModel(text, {catalog});assert.deepEqual(parsed.refusals, []);
    assert.deepEqual(parsed.model.internalEdgeRemovalPairs, [['b', 'a']]);
    const editor = createEditor({model: parsed.model, catalog});
    assert(Object.isFrozen(editor.model.internalEdgeRemovalPairs[0]));
    editor.apply({type: 'recolor', id: 'c', color: 4});
    assert.deepEqual(editor.model.internalEdgeRemovalPairs, [['b', 'a']]);
    editor.undo();
    assert.deepEqual(parseModel(serializeModel(editor.model), {catalog}).model.internalEdgeRemovalPairs, [['b', 'a']]);
    original.internalEdgeRemovalPairs[0].reverse();
    assert.deepEqual(editor.model.internalEdgeRemovalPairs, [['b', 'a']]);
    editor.apply({type: 'delete', id: 'b'});
    assert.deepEqual(editor.model.internalEdgeRemovalPairs, []);
    editor.undo();assert.deepEqual(editor.model.internalEdgeRemovalPairs, [['b', 'a']]);
});

test('malformed, duplicate, same and unknown imported references refuse simulation', () => {
    const base = serializeModel(model());
    for (const declaration of ['', 'b missing', 'b b', 'b', 'b a extra', 'b a\n0 !BW INTERNAL_EDGE_PAIR a b', 'b a\n0 !BW INTERNAL_EDGE_PAIR c missing']) {
        const text = `0 !BW INTERNAL_EDGE_PAIR ${declaration}\n${base}`;
        const parsed = parseModel(text, {catalog});assert(parsed.refusals.some(r => r.code === 'bad-internal-edge-pair'));
        const prepared = prepareModel(text, catalog, {autoPorts: false});
        assert.equal(prepared.mechanism, null);assert(prepared.issues.some(i => i.code === 'bad-internal-edge-pair' && i.severity === 'error'));
        assert.deepEqual(validatePlacedModel(prepared.model, catalog), []);
        assert.deepEqual(prepared.model.parts, parsed.model.parts, 'refused collision policy keeps all placed geometry visible');
        assert.equal(prepared.model.internalEdgeRemovalPairs, undefined);
        assert.throws(() => compile(parsed.model, catalog), /internalEdgeRemovalPairs/);
        assert.throws(() => serializeModel(parsed.model), /internalEdgeRemovalPairs/);
    }
    for (const value of [null, 'native', [null], [['a', 'b'], ['b', 'a']]]) {
        assert(validatePlacedModel({...model(), internalEdgeRemovalPairs: value}, catalog).some(p => p.includes('internalEdgeRemovalPairs')));
    }
});

test('embedded submodels cannot opt the receiving model in', () => {
    const text = '0 FILE main.ldr\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr\n0 FILE child.ldr\n' + serializeModel(opted());
    const parsed = parseModel(text, {catalog});assert.deepEqual(parsed.refusals, []);
    assert.equal(parsed.model.internalEdgeRemovalPairs, undefined);
});

test('compiler resolves membership and role order, including v1/v2 conversion', () => {
    for (const version of [1, 2]) {
        const mechanism = compile(opted(), catalog, {ground: false, version});
        const [source, surface] = mechanism.internalEdgeRemovalPairs[0];
        assert(mechanism.bodies.find(b => b.id === source).parts.includes('b'));
        assert(mechanism.bodies.find(b => b.id === surface).parts.includes('a'));
        assert.notEqual(source, surface);assert.deepEqual(validateCompiledMechanism(mechanism), []);
        assert.deepEqual(upgradeMechanismV1(mechanismV1(upgradeMechanismV1(mechanism))).internalEdgeRemovalPairs, [[source, surface]]);
        assert(validateCompiledMechanism({...mechanism, internalEdgeRemovalPairs: [[source, source]]}).some(p => p.includes('internalEdgeRemovalPairs')));
    }
});

test('RimRun LDR and MPD select only both roller bodies against the actual hub frame', () => {
    for (const id of ['rimrun', 'rimrun-swapped']) for (const ext of ['ldr', 'mpd']) {
        const text = read(`overlay/scratch-gui/static/sim-lab/models/${id}.${ext}`);
        const {model: parsed, refusals} = parseModel(text, {catalog});assert.deepEqual(refusals, []);
        assert.deepEqual(parsed.internalEdgeRemovalPairs, [['left_wheel_-1', 'hub'], ['right_wheel_-1', 'hub']]);
        const mechanism = compile(parsed, catalog, {version: 2});
        const hub = mechanism.hubs.find(h => h.id === 'hub');assert(hub);
        const hubBody = hub.body;assert(mechanism.bodies.find(b => b.id === hubBody).parts.includes('hub'));
        assert.equal(mechanism.internalEdgeRemovalPairs.length, 2);
        for (const [i, [source, surface]] of mechanism.internalEdgeRemovalPairs.entries()) {
            assert.equal(surface, hubBody);
            assert(mechanism.bodies.find(b => b.id === source).parts.includes(['left_wheel_-1', 'right_wheel_-1'][i]));
        }
        const plainText = text.replace(/^0 !BW INTERNAL_EDGE_PAIR .*\r?\n/gm, '');
        const legacy = compile(parseModel(plainText, {catalog}).model, catalog, {version: 2});
        const {internalEdgeRemovalPairs, ...physics} = mechanism;
        assert.deepEqual(physics, legacy, 'only selected-pair metadata differs; geometry/mass/inertia/filter unchanged');
    }
    const text = read('overlay/scratch-gui/static/sim-lab/models/rimrun.ldr').replace(/^0 !BW INTERNAL_EDGE_PAIR .*\r?\n/gm, '');
    const invalid = `0 !BW INTERNAL_EDGE_PAIR hub hub_mount_pin_-180_-18\n${text}`;
    const prepared = prepareModel(invalid, catalog, {autoPorts: false});
    assert.equal(prepared.mechanism, null);assert(prepared.issues.some(i => i.code === 'bad-internal-edge-pair'));
});

test('native setup is explicit, selected-only and immutable; old modules fail before setup', () => {
    const mechanism = {internalEdgeRemovalPairs: [['moving', 'frame']]}, plan = internalEdgeRemovalPlan(mechanism);
    mechanism.internalEdgeRemovalPairs[0].reverse();assert.deepEqual(plan, [['moving', 'frame']]);
    assert(Object.isFrozen(plan) && Object.isFrozen(plan[0]));
    assert.deepEqual(internalEdgeRemovalPlan(mechanism, {internalEdgeRemovalPairs: false}), []);
    assert.throws(() => requireInternalEdgeRemovalAPI({}, plan), /needs an engine/);
    const calls = [], bodies = new Map([['moving', {bodyID: {id: 91}}], ['frame', {bodyID: {id: 7}}], ['unselected', {bodyID: {id: 42}}]]);
    const system = {SetSimInternalEdgeRemovalPair: (...args) => {calls.push(args);return true;}, ClearSimInternalEdgeRemovalPairs: () => calls.push('clear')};
    requireInternalEdgeRemovalAPI({PhysicsSystem: {prototype: system}}, plan);
    configureInternalEdgeRemovalPairs(system, bodies, plan);
    assert.deepEqual(calls, [[bodies.get('moving').bodyID, bodies.get('frame').bodyID, true]]);
    system.SetSimInternalEdgeRemovalPair = () => false;
    assert.throws(() => configureInternalEdgeRemovalPairs(system, bodies, plan), /Could not configure/);
    assert.equal(calls.at(-1), 'clear');
});


test('setup failures preserve primary error and dispose the owning world once', () => {
    for (const mode of ['reject', 'throw', 'clear-throw', 'dispose-throw', 'frozen']) {
        const primary = mode === 'frozen' ? Object.freeze(new Error('primary')) : new Error('primary');
        const calls = [], ids = [Object.freeze({id: 1}), Object.freeze({id: 2})];
        const system = {SetSimInternalEdgeRemovalPair: () => {calls.push('set');if (mode === 'reject') return false;throw primary;},
            ClearSimInternalEdgeRemovalPairs: () => {calls.push('clear');if (mode === 'clear-throw' || mode === 'frozen') throw new Error('clear');}};
        let observed;
        try { configureInternalEdgeRemovalPairs(system, new Map([['a', {bodyID: ids[0]}], ['b', {bodyID: ids[1]}]]), [['a', 'b']]); }
        catch (error) { observed = error; }
        assert(observed);if (mode !== 'reject') assert.equal(observed, primary);
        assert.throws(() => disposeInternalEdgeRemovalSetup(observed, {}, () => {calls.push('world');if (mode === 'dispose-throw') throw new Error('world');}), error => error === observed);
        assert.deepEqual(calls, ['set', 'clear', 'world']);
        if (mode === 'clear-throw') assert.equal(observed.cleanupErrors[0].message, 'clear');
        if (mode === 'dispose-throw') assert.equal(observed.cleanupErrors.length, 1);
    }
});


test('current canonical source identity retains its explicitly versioned parent fixture', () => {
    const checkpoint = JSON.parse(read('docs/data/robot-lab-experimental-checkpoint.json'));
    const rows = JSON.stringify(checkpoint);assert(rows.includes('internal-edge-pairs-v1'));
    const find = value => value && typeof value === 'object' ? (value.id === 'rimrun' && value.canonicalLdrawSha256 ? value : Object.values(value).map(find).find(Boolean)) : null;
    const row = find(checkpoint), dir = 'test/fixtures/model-files/rimrun-internal-edge-pairs-v1-source/';assert(row);
    const provenance = JSON.parse(read(dir + 'provenance.json'));
    const digest = text => createHash('sha256').update(text).digest('hex');
    assert.equal(row.canonicalLdrawSha256, digest(read('overlay/scratch-gui/static/sim-lab/models/rimrun.ldr')));
    assert.equal(row.canonicalLdrawSha256, provenance.files['models/rimrun.ldr']);
    assert.equal(row.canonicalLdrawRevision.parentCanonicalLdrawSha256, provenance.parent.modelSha256);
    assert.equal(row.canonicalLdrawRevision.parentCanonicalLdrawSha256, digest(read('test/fixtures/model-files/rimrun-source/models/rimrun.ldr')));
    assert.equal(row.canonicalLdrawRevision.fixture, 'rimrun-internal-edge-pairs-v1-source');
    assert.equal(row.programSha256, digest(read('test/fixtures/model-files/rimrun-source/programs/rimrun.bw')));
});
