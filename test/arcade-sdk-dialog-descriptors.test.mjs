import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {SDK_DIALOG_CLASS_NODES, sdkDialogBase, sdkDialogPublicBase, sdkDialogExportClasses, SDK_DIALOG_OPAQUE_PARAMETERS} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-dialog-class-descriptors.js';
const require = createRequire(import.meta.url);
const provider = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-dialog-classes.js');
const values = require('../overlay/scratch-vm/src/util/bw-values.js');

test('bounded Dialog declarations and optional arguments are actual selected MIT SDK signatures', async () => {
    const target = JSON.parse(await readFile(new URL('../packages/scratch-gui/static/makecode/arcade/target.json', import.meta.url)));
    assert.equal(target.versions.target, '4.2.1'); assert.equal(target.versions.pxt, '13.2.1');
    const source = target.bundledpkgs.game['textDialogs.ts'];
    const generated = await readFile(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/gameover-pxt.js', import.meta.url), 'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), generated.match(/textDialogs\.ts: ([a-f0-9]{64})/)[1], 'Actual compiled dialog body remains the selected unchanged SDK source');
    const original = parseMakeCodeTs(source,{retainClassHeritage:true}).body.find(node => node.type === 'Namespace' && node.name === 'game').body;
    for (const descriptor of SDK_DIALOG_CLASS_NODES) {
        const name = sdkDialogPublicBase(descriptor.name), cls = original.find(node => node.type === 'Class' && `game.${node.name}` === name);
        assert.ok(cls, name);
        assert.deepEqual(descriptor.ctor.params, cls.ctor.params);
        for(const name of cls.ctor.params){assert.equal(descriptor.ctor.paramTypes[name],cls.ctor.paramTypes[name].text);assert.equal(cls.ctor.paramTypes[name].isArray,false);}
        assert.deepEqual(descriptor.ctor.optionalParams, cls.ctor.optionalParams || []);
        for (const field of descriptor.fields) {
            const actual = cls.fields.find(value => value.name === field.name);
            assert.ok(actual, field.name); assert.equal(field.typeName, actual.typeName); assert.deepEqual(field.modifiers, actual.modifiers || []);
        }
        for (const method of descriptor.methods) {
            const actual = cls.methods.find(value => value.name === method.name);
            assert.ok(actual, method.name); assert.deepEqual(method.params, actual.params);
            for(const name of actual.params){assert.equal(method.paramTypes[name],actual.paramTypes[name].text);assert.equal(actual.paramTypes[name].isArray,false);}
            assert.deepEqual(method.optionalParams, actual.optionalParams || []);
        }
    }
    assert.equal(sdkDialogBase('game.SplashDialog'), '__bwSDK_SplashDialog');
    assert.equal(sdkDialogBase('SplashDialog'), 'SplashDialog', 'Bare names require actual lexical namespace resolution');
    assert.equal(sdkDialogBase('foreign.SplashDialog'), 'foreign.SplashDialog');
    assert.ok(!SDK_DIALOG_CLASS_NODES[0].fields.some(field => field.name === 'font'), 'Unqualified Font records are not advertised as live field values');
    assert.deepEqual(SDK_DIALOG_OPAQUE_PARAMETERS.__bwSDK_BaseDialog.constructor, [3]);
});

test('native and editor declaration mirrors preserve constructor/method signatures and image fields', () => {
    const native = provider.specifications.map(({intrinsic, fields, ...spec}) => ({...spec, intrinsic: true,
        fields: fields.map(({native, ...field}) => field)}));
    assert.deepEqual(JSON.parse(JSON.stringify(native)), JSON.parse(JSON.stringify(sdkDialogExportClasses())), 'Serialized declaration wire metadata agrees exactly');
});

test('actual BWValues references enforce Dialog registry lifetime, foreign ownership and construction guards', () => {
    // Registry controls only. No substitute constructor/image/runtime is supplied
    // and this test does not qualify production class dispatch or rendering.
    const runtime = new EventEmitter(); runtime.threads = [];
    const host = provider.create({_runtime: runtime, _objectHeap: {constructionActive: () => false}}, values);
    try {
        const def = host.heapHooks.definition('__bwSDK_SplashDialog'), ref = host.heapHooks.reserve(def);
        assert.equal(host.heapHooks.external(ref), true);
        const clone = JSON.parse(JSON.stringify(ref));
        assert.equal(host.heapHooks.external(clone), true, 'Codec-equivalent reference keeps its canonical identity');
        assert.equal(host.heapHooks.externalClass(clone), def.name);
        const foreign = new EventEmitter();
        assert.equal(host.heapHooks.external(values.reference(foreign, 'object', 'foreign')), false);
        assert.throws(() => host.heapHooks.reserve({...def, name: 'CustomDialog'}), /subclasses/);
        assert.throws(() => host.invoke(def.constructor, [ref, 160, 35], null, {}), /no longer owns/);
        assert.throws(() => host.heapHooks.get(ref, 'image'), /not completed/);
        assert.throws(() => host.heapHooks.get(ref, 'font'), /unqualified/);
        runtime.emit('PROJECT_START'); assert.equal(host.heapHooks.external(ref), false);
        const next = host.heapHooks.reserve(def); assert.notDeepEqual(next, ref);
        runtime.emit('RUNTIME_DISPOSED'); assert.throws(() => host.heapHooks.reserve(def), /disposed/);
        runtime.emit('PROJECT_LOADED'); assert.equal(host.heapHooks.external(next), false);
        const loaded = host.heapHooks.reserve(def); assert.equal(host.heapHooks.external(loaded), true);
        host.dispose(); runtime.emit('PROJECT_LOADED'); assert.equal(host.heapHooks.external(loaded), false);
        assert.throws(() => host.heapHooks.reserve(def), /disposed/);
    } finally {host.dispose();}
});
