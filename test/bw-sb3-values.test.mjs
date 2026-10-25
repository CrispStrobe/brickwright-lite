// SPDX-License-Identifier: BSD-3-Clause
/**
 * Saving and loading variable and list values stock sb3 cannot write (task E3b
 * of docs/OPEN-TASKS-2026-09-29.md): BWValues.UNDEFINED, each BWValues
 * reference kind, NaN/±Infinity/-0, null, raw undefined, other objects — plus
 * the plain values, which must come back unchanged.
 *
 * Measured on main before E3b (d430def27): every UNDEFINED/reference/null value
 * produced a project scratch-parser refused, reported as the Scratch 1
 * converter's "Non-ascii character in FixedAsciiString"; NaN/±Infinity/-0
 * saved as 0. The rules: overlay/scratch-vm/src/serialization/bw-sb3-values.js;
 * the hooks: scripts/apply-vm-overlay.mjs (sb3.js save/restore, the Scratch 1
 * fallback in virtual-machine.js).
 *
 * Every round trip here goes through the REAL VM: values set on a loaded
 * project's variables, vm.toJSON() (the same serialize saveProjectSb3 zips),
 * scratch-parser (the validator stock Scratch and the VM's loadProject use),
 * then loadProject into a fresh VM.
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

// ---- plumbing: the installed VM runs these rules, from the overlay's bytes ----

const installed = rel => {
    assert.equal(readFileSync(path.join(VM_SRC, rel), 'utf8'), readFileSync(path.join(OVERLAY_VM, rel), 'utf8'),
        `installed scratch-vm/src/${rel} differs from the overlay — run \`node scripts/apply-vm-overlay.mjs\``);
    return nodeRequire(path.join(VM_SRC, rel));
};
const BW = installed('util/bw-values.js');
installed('serialization/bw-sb3-values.js');

test('plumbing: the installed sb3.js and virtual-machine.js carry the E3b hooks, each once', () => {
    const sb3 = readFileSync(path.join(VM_SRC, 'serialization', 'sb3.js'), 'utf8');
    for (const hook of [`const bwSb3Values = require('./bw-sb3-values');`,
        'bwSb3Values.save(target.variables, obj);', 'bwSb3Values.restore(object, target.variables);']) {
        assert.equal(sb3.split(hook).length, 2, `sb3.js must contain \`${hook}\` exactly once`);
    }
    const vm = readFileSync(path.join(VM_SRC, 'virtual-machine.js'), 'utf8');
    assert.equal(vm.split('if (!bwLooksLikeSb1(input)) return Promise.reject(error);').length, 2);
});

// ---- the real VM ----

const VM = (await importGuiDependency('scratch-vm/src/index.js')).default;
const validate = nodeRequire(path.join(INTEGRATED, 'node_modules', 'scratch-parser'));
const parserVerdict = (json, isSprite = false) =>
    new Promise(resolve => validate(json, isSprite, error => resolve(error)));

const STAGE_COSTUME = {assetId: 'cd21514d0531fdffb22204e0ec5ed84a', name: 'backdrop', dataFormat: 'svg',
    md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', rotationCenterX: 240, rotationCenterY: 180};
const SPRITE = {isStage: false, name: 'Sprite1', currentCostume: 0, costumes: [{...STAGE_COSTUME, name: 'c'}], sounds: [],
    volume: 100, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false,
    rotationStyle: 'all around', variables: {sv: ['sv', 0]}, lists: {sl: ['sl', []]}, broadcasts: {}, comments: {}, blocks: {}};
const BASE = JSON.stringify({targets: [{isStage: true, name: 'Stage', currentCostume: 0, costumes: [STAGE_COSTUME], sounds: [],
    volume: 100, layerOrder: 0, variables: {v: ['v', 0]}, lists: {l: ['l', []]}, broadcasts: {}, comments: {}, blocks: {}}, SPRITE],
monitors: [], extensions: [], meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}});

const freshVm = async () => {
    const vm = new VM();
    await vm.loadProject(BASE);
    return vm;
};

const REFERENCE_KINDS = ['array', 'image', 'tile', 'animation', 'scene', 'physics-engine'];
// [name, make(runtime) -> value, the field stock Scratch sees, check(loaded, runtime)]
const same = expected => loaded => assert.ok(Object.is(loaded, expected), `got ${String(loaded)}`);
const KINDS = [
    ['UNDEFINED', () => BW.UNDEFINED, 'undefined', loaded => assert.equal(loaded, BW.UNDEFINED)],
    ['raw undefined', () => undefined, 'undefined', loaded => assert.equal(loaded, BW.UNDEFINED, 'restored as UNDEFINED')],
    ['null', () => null, 'null', same(null)],
    ...REFERENCE_KINDS.map(kind => [`${kind} reference`,
        rt => (kind === 'array' ? BW.arrayReference(rt, [1, 2]) : BW.reference(rt, kind, 'r1')),
        `[${kind} reference ${kind === 'array' ? 'array-reference:1' : 'r1'}]`,
        (loaded, rt) => {
            assert.ok(BW.isReference(loaded), 'restored as a reference');
            assert.equal(loaded.bwReference.kind, kind);
            assert.equal(loaded.bwReference.id, kind === 'array' ? 'array-reference:1' : 'r1');
            assert.equal(BW.referenceId(rt, loaded, kind), null, 'a per-run reference resolves to nothing after load');
        }]),
    ['NaN', () => NaN, 'NaN', same(NaN)],
    ['Infinity', () => Infinity, 'Infinity', same(Infinity)],
    ['-Infinity', () => -Infinity, '-Infinity', same(-Infinity)],
    ['-0', () => -0, 0, same(-0)],
    ['a plain object', () => ({a: [1, 'x']}), '{"a":[1,"x"]}', loaded => assert.deepEqual(loaded, {a: [1, 'x']})],
    // Plain values: written as they are, read back as they are, no sidecar.
    ['number 7', () => 7, 7, same(7)],
    ['number 0', () => 0, 0, same(0)],
    ['string "hi"', () => 'hi', 'hi', same('hi')],
    ['string "undefined"', () => 'undefined', 'undefined', same('undefined')],
    ['string "NaN"', () => 'NaN', 'NaN', same('NaN')],
    ['string "[image reference r1]"', () => '[image reference r1]', '[image reference r1]', same('[image reference r1]')],
    ['string ""', () => '', '', same('')],
    ['true', () => true, true, same(true)]
];
const PLAIN = new Set(['number 7', 'number 0', 'string "hi"', 'string "undefined"', 'string "NaN"',
    'string "[image reference r1]"', 'string ""', 'true']);

for (const [name, make, field, check] of KINDS) {
    for (const where of ['variable', 'list item']) {
        test(`round trip, ${where}: ${name}`, async () => {
            const vm = await freshVm();
            const stage = vm.runtime.getTargetForStage();
            const value = make(vm.runtime);
            const items = ['first', value, 3];
            if (where === 'variable') stage.variables.v.value = value;
            else stage.variables.l.value = items;
            const json = vm.toJSON();
            if (where === 'list item') {
                assert.equal(stage.variables.l.value, items, 'save leaves the runtime list array in place');
                assert.ok(Object.is(items[1], value), 'and does not write placeholders into it');
            } else {
                assert.ok(Object.is(stage.variables.v.value, value), 'save leaves the runtime value');
            }
            const target = JSON.parse(json).targets[0];
            const onDisk = where === 'variable' ? target.variables.v[1] : target.lists.l[1];
            if (where === 'variable') assert.ok(Object.is(onDisk, field), `on disk: ${JSON.stringify(onDisk)}`);
            else assert.deepEqual(onDisk, ['first', field, 3]);
            assert.equal(Boolean(target.bwValues), !PLAIN.has(name), 'a sidecar exactly when a value needs one');
            assert.equal(await parserVerdict(json), null, 'stock scratch-parser accepts the saved project');
            const reopened = new VM();
            await reopened.loadProject(json);
            const s = reopened.runtime.getTargetForStage();
            if (where === 'variable') {
                check(s.variables.v.value, reopened.runtime);
            } else {
                assert.equal(s.variables.l.value.length, 3);
                assert.equal(s.variables.l.value[0], 'first');
                check(s.variables.l.value[1], reopened.runtime);
                assert.equal(s.variables.l.value[2], 3);
            }
            // What stock Scratch keeps: drop the sidecar (a stock re-save does)
            // and the plain field is what loads.
            const stock = JSON.parse(json);
            delete stock.targets[0].bwValues;
            const plain = new VM();
            await plain.loadProject(JSON.stringify(stock));
            const p = plain.runtime.getTargetForStage();
            const got = where === 'variable' ? p.variables.v.value : p.variables.l.value[1];
            assert.ok(Object.is(got, field), `without the sidecar the field loads as written: ${String(got)}`);
        });
    }
}

test('a reference held twice comes back as ONE interned reference; two kinds stay apart', async () => {
    const vm = await freshVm();
    const stage = vm.runtime.getTargetForStage();
    const a = BW.reference(vm.runtime, 'image', 'a');
    stage.variables.v.value = a;
    stage.variables.l.value = [a, BW.reference(vm.runtime, 'tile', 'a'), a];
    const reopened = new VM();
    await reopened.loadProject(vm.toJSON());
    const s = reopened.runtime.getTargetForStage();
    const [x, y, z] = s.variables.l.value;
    assert.equal(s.variables.v.value, x);
    assert.equal(x, z);
    assert.equal(BW.compare(x, '===', y), false, 'image a and tile a are different references');
});

test('the sidecar never overrides a plain value another tool wrote', async () => {
    const vm = await freshVm();
    const stage = vm.runtime.getTargetForStage();
    stage.variables.v.value = BW.UNDEFINED;
    stage.variables.l.value = [NaN, BW.reference(vm.runtime, 'image', 'a')];
    const project = JSON.parse(vm.toJSON());
    const target = project.targets[0];
    assert.ok(target.bwValues);
    target.variables.v[1] = 'edited elsewhere';
    target.lists.l[1][0] = 5;
    const edited = new VM();
    await edited.loadProject(JSON.stringify(project));
    let s = edited.runtime.getTargetForStage();
    assert.equal(s.variables.v.value, 'edited elsewhere');
    assert.equal(s.variables.l.value[0], 5);
    assert.ok(BW.isReference(s.variables.l.value[1]), 'the untouched item is still restored');
    // A list whose length changed is read as plain: its indexes no longer name the saved items.
    target.lists.l[1] = ['NaN', '[image reference a]', 'appended'];
    const grown = new VM();
    await grown.loadProject(JSON.stringify(project));
    s = grown.runtime.getTargetForStage();
    assert.deepEqual(s.variables.l.value, ['NaN', '[image reference a]', 'appended']);
    // An unknown sidecar version or tag is ignored, not guessed at.
    target.lists.l[1] = ['NaN', '[image reference a]'];
    target.variables.v[1] = 'undefined';
    target.bwValues.variables.v = {bwSomethingNew: 1};
    const unknown = new VM();
    await unknown.loadProject(JSON.stringify(project));
    assert.equal(unknown.runtime.getTargetForStage().variables.v.value, 'undefined');
    target.bwValues.version = 2;
    const later = new VM();
    await later.loadProject(JSON.stringify(project));
    assert.equal(later.runtime.getTargetForStage().variables.l.value[0], 'NaN');
});

test('sprite export and import (sprite3) carry the values too', async () => {
    const vm = await freshVm();
    const sprite = vm.runtime.targets.find(t => !t.isStage);
    sprite.variables.sv.value = BW.UNDEFINED;
    sprite.variables.sl.value = [BW.reference(vm.runtime, 'scene', 's'), -Infinity];
    const json = vm.toJSON(sprite.id);
    assert.equal(await parserVerdict(json, true), null, 'scratch-parser accepts the exported sprite');
    const into = await freshVm();
    await into.addSprite(json);
    const added = into.runtime.targets.filter(t => !t.isStage).at(-1);
    const sv = Object.values(added.variables).find(v => v.name === 'sv');
    const sl = Object.values(added.variables).find(v => v.name === 'sl');
    assert.equal(sv.value, BW.UNDEFINED);
    assert.equal(sl.value[0].bwReference.kind, 'scene');
    assert.ok(Object.is(sl.value[1], -Infinity));
});

test('a project scratch-parser still refuses is reported with ITS reason, not the Scratch 1 converter\'s', async () => {
    // Written by hand: an object no save of ours writes.
    const project = JSON.parse(BASE);
    project.targets[0].variables.v = ['v', {hand: 'written'}];
    const reason = async input => {
        try {
            await new VM().loadProject(input);
        } catch (error) {
            return String(error && error.message || error);
        }
        return 'loaded';
    };
    const fromText = await reason(JSON.stringify(project));
    assert.doesNotMatch(fromText, /FixedAsciiString/);
    assert.match(fromText, /Could not parse as a valid SB2 or SB3 project/);
    assert.match(fromText, /variables\['v'\]\[1\]/, 'names the failing value');
    const JSZip = nodeRequire(path.join(INTEGRATED, 'node_modules', 'jszip'));
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    const fromZip = await reason(await zip.generateAsync({type: 'nodebuffer'}));
    assert.doesNotMatch(fromZip, /FixedAsciiString/);
    assert.match(fromZip, /variables\['v'\]\[1\]/);
    // Bytes that DO start like a Scratch 1 file still go to the converter.
    const sb1 = Buffer.concat([Buffer.from('ScratchV02'), Buffer.alloc(64, 0xff)]);
    const fromSb1 = await reason(sb1);
    assert.doesNotMatch(fromSb1, /Could not parse as a valid SB2 or SB3 project/, 'a Scratch 1 signature reaches the SB1 converter');
});
