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
 *  2a. Parity with the Arrays extension's built-in copy of the same rules
 *     (arrays.js `makeValues`), and ONE heap: the Arrays extension takes
 *     Scratch.BWValues when the host provides it, so its references and the
 *     Arcade extension's name the same arrays.
 *  3. What a real scratch-vm does with these values today: a variable and a
 *     list keep the identical object; Scratch's own `=` and `contains` cannot
 *     tell two references apart (a MEASUREMENT of main, not a wish). Saving
 *     them is task E3b (serialization/bw-sb3-values.js): the save/load case
 *     below runs this file's green-flag program, saves, and reopens; the
 *     per-kind round trips and the mutations live in test/bw-sb3-values.test.mjs.
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

// ---- the Arrays extension: same rules as its built-in copy, and ONE heap with everyone ----

// arrays.js (CrispStrobe/extensions, bundled) ships its own `makeValues` and uses Scratch.BWValues
// when the host provides it. Its built-in copy is evaluated here from the bundled source itself.
const ARRAYS_ENTRY = path.join(REPO, 'overlay', 'scratch-vm', 'src', 'extensions', 'crispstrobe', 'arrays', 'index.js');
const arraysSource = () => {
    const bundled = readFileSync(ARRAYS_ENTRY, 'utf8');
    const literal = bundled.match(/makeExt\(("(?:[^"\\]|\\.)*")\)/);
    assert.ok(literal, 'arrays/index.js is no longer makeExt("<source>") — read its source another way');
    return JSON.parse(literal[1]);
};
const builtinValues = () => {
    const source = arraysSource();
    const start = source.indexOf('  const makeValues = () => {');
    const end = source.indexOf('\n  };\n', start);
    assert.ok(start >= 0 && end > start, 'arrays.js no longer has its built-in makeValues — has the fallback moved or gone?');
    // eslint-disable-next-line no-new-func
    return new Function(`${source.slice(start, end + 5)}\nreturn makeValues();`)();
};

// One script of operations, run against an implementation with its own fresh runtimes. Results are
// normalised so the two can be compared: scopes are per-implementation random strings, so a
// reference is described by kind, id and WHICH earlier reference it is identical to.
const paritySession = values => {
    const seen = [];
    const norm = x => {
        if (typeof x === 'number') return Number.isNaN(x) ? 'NaN' : Object.is(x, -0) ? '-0' : x;
        if (x === undefined) return '<undefined>';
        if (x === values.UNDEFINED) return '<UNDEFINED>';
        if (Array.isArray(x)) return x.map(norm);
        if (x && typeof x === 'object' && x.bwReference) {
            let i = seen.indexOf(x);
            if (i < 0) i = seen.push(x) - 1;
            return `ref#${i}(${x.bwReference.kind}:${x.bwReference.id})`;
        }
        return x;
    };
    const out = [];
    const run = (label, fn) => {
        try { out.push([label, norm(fn())]); } catch (error) { out.push([label, `throws ${error.constructor.name}: ${error.message}`]); }
    };
    const a = fakeRuntime(), b = fakeRuntime();
    const imgA = values.reference(a, 'image', 'img-1');
    const refs = {imgA, imgA2: values.reference(a, 'image', 'img-1'), imgB: values.reference(a, 'image', 'img-2'),
        tileA: values.reference(a, 'tile', 'img-1'), foreign: values.reference(b, 'image', 'img-1'),
        noRuntime: values.reference(null, 'scene', 's-1'), json: values.decode(JSON.parse(JSON.stringify(imgA)))};
    for (const [name, ref] of Object.entries(refs)) run(`reference ${name}`, () => ref);
    const samples = [0, 1, '1', '', 'img-1', null, undefined, values.UNDEFINED, NaN, -0, Infinity, true, false, [],
        {}, {bwReference: {kind: 'sprite', id: 'x', scope: 's'}}, {bwReference: imgA.bwReference, extra: 1},
        {bwNumber: 'NaN'}, {bwNumber: '-0'}, {bwNumber: '7'}, {bwUndefined: true}, imgA, refs.imgB, refs.foreign];
    samples.forEach((v, i) => {
        run(`isReference #${i}`, () => values.isReference(v));
        run(`decode #${i}`, () => values.decode(v));
        run(`encode #${i}`, () => values.encode(v));
        run(`truth #${i}`, () => values.truth(v));
        run(`String #${i}`, () => String(values.encode(v)));
        // Scopes are per-implementation random strings: compare the text with them blanked.
        run(`JSON #${i}`, () => JSON.stringify([v], values.jsonReplacer).replace(/"scope":"[^"]*"/g, '"scope":"<scope>"'));
        for (const kind of ['image', 'array']) run(`referenceId ${kind} #${i}`, () => values.referenceId(a, v, kind));
    });
    const operands = [0, 1, '1', '', 'img-1', null, values.UNDEFINED, NaN, true, imgA, refs.imgA2, refs.imgB, refs.foreign];
    operands.forEach((l, i) => operands.forEach((r, j) => {
        for (const op of ['==', '!=', '===', '!==', '<', '>', '<=', '>=']) run(`compare #${i} ${op} #${j}`, () => values.compare(l, op, r));
        for (const op of ['+', '-', '*', '/', '%']) run(`binary #${i} ${op} #${j}`, () => values.binary(l, op, r));
        run(`equal #${i} #${j}`, () => values.equal(l, r));
    }));
    operands.forEach((v, i) => { for (const op of ['+', '-']) run(`unary ${op} #${i}`, () => values.unary(op, v)); });
    run('compare unknown op', () => values.compare(1, '<>', 2));
    run('binary unknown op', () => values.binary(1, '**', 2));
    const list = [1, refs.imgB, undefined, imgA, '1', NaN];
    delete list[2];
    for (const [v, from] of [[imgA, 0], [refs.json, 0], ['1', 0], [1, 0], [undefined, 0], [NaN, 0], [imgA, 4], [imgA, -3], [imgA, Infinity]]) {
        run(`indexOf ${norm(v)} from ${from}`, () => values.indexOf(list, v, from));
    }
    const rows = [1, 2];
    const rowsRef = values.arrayReference(a, rows);
    run('arrayReference', () => rowsRef);
    run('arrayReference again', () => values.arrayReference(a, rows));
    run('arrayValue', () => values.arrayValue(a, rowsRef));
    run('arrayValue foreign', () => values.arrayValue(b, rowsRef));
    run('arrayValue no runtime', () => values.arrayValue(null, values.arrayReference(null, rows)));
    run('arrayReference non-array', () => values.arrayReference(a, 'x'));
    a.emit('PROJECT_START');
    run('after start: referenceId', () => values.referenceId(a, imgA, 'image'));
    run('after start: arrayValue', () => values.arrayValue(a, rowsRef));
    run('after start: same array, new id', () => values.arrayReference(a, rows));
    run('after start: compare old/new', () => values.compare(imgA, '===', values.reference(a, 'image', 'img-1')));
    return out;
};

test('parity: bw-values computes what the Arrays extension\'s built-in copy computes', () => {
    const ours = paritySession(BW);
    const theirs = paritySession(builtinValues());
    assert.ok(ours.length > 2000, `the parity script ran only ${ours.length} operations`);
    const differ = ours.filter(([label, value], i) => label !== theirs[i][0] || !Object.is(JSON.stringify(value), JSON.stringify(theirs[i][1])));
    assert.deepEqual(differ.slice(0, 5).map(([label, value]) => ({label, ours: value, arrays: theirs[ours.findIndex(o => o[0] === label)][1]})), [],
        `${differ.length} of ${ours.length} operations differ between bw-values and arrays.js's built-in copy`);
    assert.equal(theirs.length, ours.length);
});

test('one heap: the Arrays extension uses Scratch.BWValues, so its references and another extension\'s are one', () => {
    const runtime = fakeRuntime();
    const ArraysExtension = makeCrispExtension(arraysSource());
    const arraysExt = new ArraysExtension(runtime);
    // Hand the arrays extension a runtime the way the adapter does (Scratch.vm.runtime).
    assert.equal(arraysExt._inst._runtime, runtime, 'the adapter gave the Arrays extension its runtime');
    // An Arrays reference resolves through Scratch.BWValues (what the Arcade extension calls) ...
    const made = arraysExt.createReference({VALUES: '[1, 2, 3]'});
    assert.deepEqual(BW.arrayValue(runtime, made), [1, 2, 3], 'Arrays wrote into the shared heap');
    // ... and a reference made through Scratch.BWValues is an array the Arrays blocks can read.
    const shared = BW.arrayReference(runtime, ['a', 'b']);
    assert.equal(arraysExt.referenceLength({ARRAY: shared}), 2, 'Arrays read from the shared heap');
    assert.equal(arraysExt.valueCompare({LEFT: shared, OP: '===', RIGHT: BW.arrayReference(runtime, BW.arrayValue(runtime, shared))}), true);
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

test('real VM: a project holding references and UNDEFINED saves valid sb3 and reopens with them (E3b)', async () => {
    const {vm} = await runFlag();
    const json = vm.toJSON();
    const saved = JSON.parse(json).targets[0];
    // The standard fields hold plain scalars; the exact values ride in the sidecar.
    assert.equal(saved.variables.vid[1], '[image reference a]');
    assert.equal(saved.variables.uid[1], 'undefined');
    assert.deepEqual(saved.lists.lid[1], ['[image reference a]', '[image reference b]']);
    assert.deepEqual(saved.bwValues.variables, {vid: {bwReference: {kind: 'image', id: 'a'}}, uid: {bwUndefined: true}});
    const validate = nodeRequire(path.join(INTEGRATED, 'node_modules', 'scratch-parser'));
    const verdict = await new Promise(resolve => validate(json, false, error => resolve(error)));
    assert.equal(verdict, null, `scratch-parser refuses the saved project: ${JSON.stringify(verdict)}`);
    const reopened = vmWithProbe();
    await reopened.loadProject(json);
    const stage = reopened.runtime.getTargetForStage();
    const v = stage.variables.vid.value;
    assert.equal(stage.variables.uid.value, BW.UNDEFINED, 'UNDEFINED comes back as UNDEFINED');
    assert.equal(stage.variables.sid.value, true);
    assert.ok(BW.isReference(v) && v.bwReference.kind === 'image' && v.bwReference.id === 'a', 'the reference keeps its kind and id');
    assert.equal(BW.referenceId(reopened.runtime, v, 'image'), null, 'and, being per-run, resolves to nothing');
    assert.equal(stage.variables.lid.value[0], v, 'variable and list item are one interned reference again');
    assert.equal(stage.variables.lid.value[1].bwReference.id, 'b');
});
