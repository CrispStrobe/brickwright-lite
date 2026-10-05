// SPDX-License-Identifier: BSD-3-Clause
/**
 * `Scratch.BWValues` (overlay/scratch-vm/src/util/bw-values.js), the API the
 * Arcade extension (task E1) calls in 38 places, held on its own (task E3a).
 *
 * What is held here:
 *  1. The exposure: every adapter-built extension sees `Scratch.BWValues`, and
 *     it is the SAME module instance the VM's own require resolves (one intern
 *     table, one scope per runtime). The shim gains exactly that one key.
 *  2. The API surface E1 uses: create / identify / compare / stringify a
 *     reference value, UNDEFINED, the array heap, non-finite numbers in JSON.
 *  3. What a real scratch-vm does with these values today: a variable and a
 *     list keep the identical object; Scratch's own `=` and `contains` cannot
 *     tell two references apart; saving one in a variable produces a project
 *     scratch-parser refuses. (3) is a MEASUREMENT of main, not a wish: the
 *     sb3 serialization that makes these values survive is task E3's `sb3.js`
 *     piece, and when it lands the save/load case below must be rewritten
 *     with it — it is meant to go red then.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {REPO, INTEGRATED, importGuiDependency} from './helpers/bw-integrated.mjs';

const VM_SRC = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src');
const OVERLAY_VM = path.join(REPO, 'overlay', 'scratch-vm', 'src');
const nodeRequire = createRequire(import.meta.url);

// Both modules are read from the installed VM (that is what the app bundles and
// what makes one instance), but only when their bytes are the overlay's.
const installed = rel => {
    const theirs = readFileSync(path.join(VM_SRC, rel), 'utf8');
    assert.equal(theirs, readFileSync(path.join(OVERLAY_VM, rel), 'utf8'),
        `installed scratch-vm/src/${rel} differs from the overlay — run \`node scripts/apply-vm-overlay.mjs\``);
    return nodeRequire(path.join(VM_SRC, rel));
};
const BW = installed('util/bw-values.js');
const makeCrispExtension = installed('extensions/crispstrobe/adapter.js');

// A fake runtime with the event surface bw-values subscribes to.
const fakeRuntime = () => {
    const handlers = {};
    return {
        on (event, fn) { (handlers[event] = handlers[event] || []).push(fn); },
        emit (event) { for (const fn of handlers[event] || []) fn(); }
    };
};

// A TurboWarp-shaped extension built by the real adapter. It records the
// Scratch shim it was handed and reports through BWValues, the way E1 does.
const PROBE_SOURCE = `(function (Scratch) {
    class Probe {
        constructor (runtime) { this.runtime = runtime; globalThis.__bwValuesProbeShim = Scratch; }
        getInfo () {
            return {id: 'bwvaluesprobe', name: 'probe', blocks: [
                {opcode: 'image', blockType: 'reporter', text: 'image [ID]', arguments: {ID: {type: 'string', defaultValue: 'a'}}},
                {opcode: 'nothing', blockType: 'reporter', text: 'nothing', arguments: {}},
                {opcode: 'same', blockType: 'Boolean', text: '[A] same as [B]', arguments: {A: {type: 'string'}, B: {type: 'string'}}}
            ]};
        }
        image ({ID}) { return Scratch.BWValues.reference(this.runtime, 'image', String(ID)); }
        nothing () { return Scratch.BWValues.UNDEFINED; }
        same ({A, B}) { return Scratch.BWValues.compare(A, '===', B); }
    }
    Scratch.extensions.register(new Probe(Scratch.runtime));
})(Scratch);`;
const ProbeExtension = makeCrispExtension(PROBE_SOURCE);
const probeShim = runtime => {
    delete globalThis.__bwValuesProbeShim;
    const instance = new ProbeExtension(runtime);
    return {instance, shim: globalThis.__bwValuesProbeShim};
};

test('exposure: an adapter-built extension sees Scratch.BWValues, the VM\'s own instance', () => {
    const {shim} = probeShim(fakeRuntime());
    assert.equal(shim.BWValues, BW, 'Scratch.BWValues must be the module require() resolves in the VM (one intern table)');
    // The shim gains exactly one key; nothing an existing extension reads changes.
    assert.deepEqual(Object.keys(shim).sort(),
        ['ArgumentType', 'BWValues', 'BlockType', 'Cast', 'TargetType', 'extensions', 'runtime', 'translate', 'vm']);
});

test('exposure: the API surface the Arcade extension calls is present', () => {
    // Every BWValues member E1's arcade/index.js calls (lane/e1-arcade-import d33d97c1b), plus the
    // ones its arrays/ tests call. A rename here breaks E1 at its first block, not at load.
    for (const name of ['arrayReference', 'arrayValue', 'decode', 'encode', 'jsonReplacer', 'reference',
        'referenceId', 'truth', 'UNDEFINED', 'isReference', 'equal', 'indexOf', 'compare', 'binary', 'unary']) {
        assert.ok(name in BW, `BWValues.${name} missing`);
    }
});

test('reference: create, identify, intern', () => {
    const runtime = fakeRuntime();
    const image = BW.reference(runtime, 'image', 'img-1');
    assert.equal(BW.isReference(image), true);
    assert.equal(image.bwReference.kind, 'image');
    assert.equal(image.bwReference.id, 'img-1');
    assert.equal(BW.referenceId(runtime, image, 'image'), 'img-1');
    assert.equal(BW.referenceId(runtime, image, 'tile'), null, 'a reference of another kind does not name it');
    assert.equal(BW.reference(runtime, 'image', 'img-1'), image, 'same (scope, kind, id) is one object');
    // A JSON round trip (project JSON, clipboard, a monitor) decodes back to the SAME object.
    assert.equal(BW.decode(JSON.parse(JSON.stringify(image))), image);
    // What is NOT a reference: its id, an object with an extra key, an unknown kind.
    assert.equal(BW.isReference('img-1'), false);
    assert.equal(BW.isReference({bwReference: image.bwReference, extra: 1}), false);
    assert.equal(BW.isReference({bwReference: {kind: 'sprite', id: 'x', scope: 's'}}), false);
    assert.equal(BW.referenceId(runtime, 'img-1', 'image'), null, 'a string id is never a reference');
});

test('reference: compare is identity, scoped to one runtime and one project run', () => {
    const a = fakeRuntime(), b = fakeRuntime();
    const first = BW.reference(a, 'image', 'img-1');
    assert.equal(BW.compare(first, '===', BW.reference(a, 'image', 'img-1')), true);
    assert.equal(BW.compare(first, '===', BW.reference(a, 'image', 'img-2')), false, 'different id');
    assert.equal(BW.compare(first, '===', BW.reference(a, 'tile', 'img-1')), false, 'different kind');
    const foreign = BW.reference(b, 'image', 'img-1');
    assert.equal(BW.compare(first, '===', foreign), false, 'same id in another runtime is another value');
    assert.equal(BW.referenceId(b, first, 'image'), null, 'a runtime does not resolve another runtime\'s reference');
    assert.equal(BW.compare(first, '==', 'img-1'), false, 'a reference is not loosely equal to its id');
    assert.equal(BW.equal(first, first), true);
    assert.equal(BW.indexOf(['img-1', foreign, first], first), 2);
    // A new run (green flag) or a newly loaded project retires every reference of the old one.
    a.emit('PROJECT_START');
    assert.equal(BW.referenceId(a, first, 'image'), null, 'old run\'s reference no longer resolves');
    assert.equal(BW.compare(first, '===', BW.reference(a, 'image', 'img-1')), false);
});

test('stringify: references, UNDEFINED and non-finite numbers', () => {
    const runtime = fakeRuntime();
    const image = BW.reference(runtime, 'image', 'img-1');
    // What Scratch shows for a reference (monitor, join, say): JS object conversion.
    assert.equal(String(image), '[object Object]');
    assert.equal(String(BW.UNDEFINED), 'undefined');
    assert.ok(Number.isNaN(Number(BW.UNDEFINED)));
    assert.equal(JSON.stringify(BW.UNDEFINED), '{"bwUndefined":true}');
    assert.equal(BW.encode(undefined), BW.UNDEFINED);
    assert.equal(BW.decode(BW.UNDEFINED), undefined);
    assert.equal(BW.decode(JSON.parse(JSON.stringify(BW.UNDEFINED))), undefined, 'UNDEFINED survives JSON');
    assert.equal(BW.truth(BW.UNDEFINED), false);
    const text = JSON.stringify([NaN, Infinity, -Infinity, -0, 1], BW.jsonReplacer);
    assert.equal(text, '[{"bwNumber":"NaN"},{"bwNumber":"Infinity"},{"bwNumber":"-Infinity"},{"bwNumber":"-0"},1]');
    const back = JSON.parse(text).map(BW.decode);
    assert.ok(Number.isNaN(back[0]));
    assert.deepEqual(back.slice(1, 3), [Infinity, -Infinity]);
    assert.ok(Object.is(back[3], -0), '-0 keeps its sign');
    assert.equal(BW.binary(2, '+', BW.UNDEFINED), NaN);
    assert.equal(BW.unary('-', 3), -3);
});

test('arrays: one heap per runtime, by identity, cleared with the run', () => {
    const runtime = fakeRuntime();
    const rows = [1, 2];
    const ref = BW.arrayReference(runtime, rows);
    assert.equal(BW.arrayReference(runtime, rows), ref, 'the same array always has the same reference');
    assert.notEqual(BW.arrayReference(runtime, [1, 2]), ref, 'an equal array is a different array');
    assert.equal(BW.arrayValue(runtime, ref), rows, 'the reference reads the live array');
    assert.equal(BW.arrayValue(fakeRuntime(), ref), undefined, 'another runtime cannot read it');
    runtime.emit('PROJECT_START');
    assert.equal(BW.arrayValue(runtime, ref), undefined, 'the old run\'s reference no longer reads the array');
    // The scope check above would hide a heap that is never cleared (it keeps every array of every run
    // alive); the separating state is the same array asked for again: a cleared heap gives it a new id.
    assert.notEqual(BW.arrayReference(runtime, rows).bwReference.id, ref.bwReference.id,
        'a new run starts with an empty heap');
    assert.throws(() => BW.arrayReference(runtime, 'not an array'), TypeError);
});

// ---- a real scratch-vm: variables, lists, Scratch's operators, save/load ----

const STAGE_COSTUME = {assetId: 'cd21514d0531fdffb22204e0ec5ed84a', name: 'backdrop', dataFormat: 'svg',
    md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', rotationCenterX: 240, rotationCenterY: 180};
const block = (opcode, parent, next, inputs = {}, fields = {}) =>
    ({opcode, parent, next, inputs, fields, shadow: false, topLevel: parent === null, ...(parent === null ? {x: 0, y: 0} : {})});
// when flag clicked: set v to (image a); add (image a) to l; set same to <(v) same as (item 1 of l)>;
// set u to (nothing); add (image b) to l
const PROJECT = {
    targets: [{
        isStage: true, name: 'Stage', currentCostume: 0, costumes: [STAGE_COSTUME], sounds: [], volume: 100, layerOrder: 0,
        variables: {vid: ['v', 0], sid: ['same', 0], uid: ['u', 0]}, lists: {lid: ['l', []]}, broadcasts: {}, comments: {},
        blocks: {
            hat: block('event_whenflagclicked', null, 's1'),
            s1: block('data_setvariableto', 'hat', 's2', {VALUE: [3, 'r1', [10, '']]}, {VARIABLE: ['v', 'vid']}),
            r1: block('bwvaluesprobe_image', 's1', null, {ID: [1, [10, 'a']]}),
            s2: block('data_addtolist', 's1', 's3', {ITEM: [3, 'r2', [10, '']]}, {LIST: ['l', 'lid']}),
            r2: block('bwvaluesprobe_image', 's2', null, {ID: [1, [10, 'a']]}),
            s3: block('data_setvariableto', 's2', 's4', {VALUE: [3, 'r3', [10, '']]}, {VARIABLE: ['same', 'sid']}),
            r3: block('bwvaluesprobe_same', 's3', null, {A: [3, 'r4', [10, '']], B: [3, 'r5', [10, '']]}),
            r4: block('data_variable', 'r3', null, {}, {VARIABLE: ['v', 'vid']}),
            r5: block('data_itemoflist', 'r3', null, {INDEX: [1, [7, '1']]}, {LIST: ['l', 'lid']}),
            s4: block('data_setvariableto', 's3', 's5', {VALUE: [3, 'r6', [10, '']]}, {VARIABLE: ['u', 'uid']}),
            r6: block('bwvaluesprobe_nothing', 's4', null),
            s5: block('data_addtolist', 's4', null, {ITEM: [3, 'r7', [10, '']]}, {LIST: ['l', 'lid']}),
            r7: block('bwvaluesprobe_image', 's5', null, {ID: [1, [10, 'b']]})
        }
    }],
    monitors: [], extensions: ['bwvaluesprobe'], meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
};

const VM = (await importGuiDependency('scratch-vm/src/index.js')).default;
const vmWithProbe = () => {
    const vm = new VM();
    const serviceName = vm.extensionManager._registerInternalExtension(new ProbeExtension(vm.runtime));
    vm.extensionManager._loadedExtensions.set('bwvaluesprobe', serviceName);
    return vm;
};
const runFlag = async () => {
    const vm = vmWithProbe();
    await vm.loadProject(JSON.stringify(PROJECT));
    vm.runtime.currentStepTime = 1000 / 30;
    vm.greenFlag();
    for (let i = 0; i < 10 && vm.runtime.threads.length; i++) vm.runtime._step();
    assert.equal(vm.runtime.threads.length, 0, 'the script ran to its end');
    const stage = vm.runtime.getTargetForStage();
    return {vm, stage, value: id => stage.variables[id].value};
};

test('real VM: a variable and a list hold the reference itself', async () => {
    const {vm, value} = await runFlag();
    const a = value('vid');
    assert.equal(BW.referenceId(vm.runtime, a, 'image'), 'a', 'set variable keeps the reporter\'s reference');
    assert.equal(value('lid')[0], a, 'add to list keeps the identical object');
    assert.equal(value('sid'), true, 'BWValues.compare: (v) is (item 1 of l)');
    assert.equal(value('uid'), BW.UNDEFINED, 'UNDEFINED is held as a value');
    assert.equal(BW.referenceId(vm.runtime, value('lid')[1], 'image'), 'b');
});

test('real VM: Scratch\'s own = and contains cannot tell two references apart', async () => {
    const {vm, stage, value} = await runFlag();
    const [a, b] = value('lid');
    const prims = vm.runtime._primitives;
    // Measured, not desired: Cast compares both as '[object Object]'. Only BWValues tells them apart.
    assert.equal(prims.operator_equals({OPERAND1: a, OPERAND2: b}), true);
    assert.equal(BW.compare(a, '===', b), false);
    const other = BW.reference(vm.runtime, 'image', 'never-added');
    const list = {LIST: {id: 'lid', name: 'l'}};
    assert.equal(prims.data_listcontainsitem({...list, ITEM: other}, {target: stage}), true);
    assert.equal(BW.indexOf(value('lid'), other), -1);
    assert.equal(prims.data_itemnumoflist({...list, ITEM: b}, {target: stage}), 1, 'item # of finds the FIRST reference');
});

test('real VM: saving a reference or UNDEFINED in a variable makes a project scratch-parser refuses (E3 sb3.js)', async () => {
    const {vm} = await runFlag();
    const json = vm.toJSON();
    const saved = JSON.parse(json).targets[0];
    assert.deepEqual(Object.keys(saved.variables.vid[1]), ['bwReference'], 'stock sb3 writes the reference object');
    assert.deepEqual(saved.variables.uid[1], {bwUndefined: true});
    const validate = nodeRequire(path.join(INTEGRATED, 'node_modules', 'scratch-parser'));
    // scratch-parser reports the FIRST failing value only, so each kind is validated on its own.
    const refusedAt = async variables => {
        const project = JSON.parse(json);
        project.targets[0].variables = variables;
        const verdict = await new Promise(resolve => validate(JSON.stringify(project), false, error => resolve(error)));
        assert.ok(verdict, 'scratch-parser accepted it — has E3\'s sb3.js serialization landed? rewrite this case with it');
        return [...new Set((verdict.sb3Errors || []).map(e => e.dataPath))];
    };
    const clean = {vid: ['v', 0], sid: ['same', true], uid: ['u', 0]};
    assert.deepEqual(await refusedAt({...clean, vid: saved.variables.vid}), [".targets[0].variables['vid'][1]"]);
    assert.deepEqual(await refusedAt({...clean, uid: saved.variables.uid}), [".targets[0].variables['uid'][1]"]);
    await assert.rejects(vmWithProbe().loadProject(json), 'the saved project does not load');
});
