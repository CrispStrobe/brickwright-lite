/** Test operations run through real blocks, cached inputs and VM threads.
 * No public call, copied util or fabricated lease supplies Array authority.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {INTEGRATED, importGuiDependency} from './bw-integrated.mjs';
const require = createRequire(import.meta.url);
const VM = (await importGuiDependency('scratch-vm/src/index.js')).default;
const Arrays = require(INTEGRATED + '/node_modules/scratch-vm/src/extensions/crispstrobe/arrays');
// Provider modules must be the reviewed checkout's implementation, not an old
// generated copy. This is a scoped source equality check, not a module census.
for (const file of ['extensions/crispstrobe/arrays/index.js', 'extensions/crispstrobe/adapter.js',
    'util/bw-array-operations.js', 'util/bw-primitive-owner.js', 'util/bw-arcade-exceptions.js', 'util/bw-values.js']) {
    assert.equal(readFileSync(INTEGRATED + '/node_modules/scratch-vm/src/' + file, 'utf8'),
        readFileSync(new URL('../../overlay/scratch-vm/src/' + file, import.meta.url), 'utf8'), file);
}
const contexts = new WeakMap();
const commands = new Set(['create1D', 'create2D', 'createEmpty', 'set', 'set2D', 'setMulti',
    'push', 'insert', 'mutateReference', 'showTable', 'hideTable',
    'setTableTitle', 'setTableStyle', 'markCell', 'unmarkCell', 'clearMarks']);

/** Also usable on a runProgram VM without constructing a second Arrays binding. */
export async function arrayOperation(vm, opcode, args = {}, {expectedDiagnostic} = {}) {
    const runtime = vm.runtime, target = runtime.getTargetForStage();
    assert.equal(typeof runtime._primitives['arrays_' + opcode], 'function', `missing arrays_${opcode}`);
    let context = contexts.get(runtime);
    if (!context) {
        context = {serial: 0, slots: new Map(), result: undefined, captured: false, errors: []};
        runtime.on('BLOCKS_ERROR', error => context.errors.push(error));
        const service = vm.extensionManager._registerInternalExtension({
            getInfo: () => ({id: 'arrayunitprobe', name: 'Array unit probe', blocks: [
                {opcode: 'input', blockType: 'reporter', text: '[KEY]', arguments: {KEY: {type: 'string'}}},
                {opcode: 'capture', blockType: 'command', text: '[VALUE]', arguments: {VALUE: {type: 'string'}}}
            ]}),
            input: args => context.slots.get(args.KEY),
            capture: args => { context.result = args.VALUE; context.captured = true; }
        });
        vm.extensionManager._loadedExtensions.set('arrayunitprobe', service);
        contexts.set(runtime, context);
    }
    const container = target.blocks, serial = context.serial++;
    const block = (suffix, operation, parent, inputs = {}, fields = {}) => {
        const id = `array-unit-${serial}-${suffix}`;
        container.createBlock({id, opcode: operation, parent, next: null, inputs, fields,
            shadow: false, topLevel: parent === null});
        return id;
    };
    const command = commands.has(opcode), root = `array-unit-${serial}-${command ? 'operation' : 'capture'}`;
    const operation = block('operation', 'arrays_' + opcode, command ? null : root);
    for (const [key, value] of Object.entries(args)) {
        const slot = `${serial}:${key}`;
        context.slots.set(slot, value);
        const input = block('input-' + key, 'arrayunitprobe_input', operation, {}, {KEY: {name: 'KEY', value: slot}});
        container.getBlock(operation).inputs[key] = {name: key, block: input, shadow: null};
    }
    if (!command) block('capture', 'arrayunitprobe_capture', null,
        {VALUE: {name: 'VALUE', block: operation, shadow: null}});
    container.resetCache();
    context.result = undefined; context.captured = false;
    const before = context.errors.length;
    const thread = runtime._pushThread(root, target, {stackClick: false});
    try {
        for (let frame = 0; frame < 8 && runtime.threads.includes(thread); frame++) {
            await runtime._step();
            await new Promise(resolve => setImmediate(resolve));
        }
        assert.ok(!runtime.threads.includes(thread), `arrays_${opcode} did not finish`);
        const newErrors = context.errors.slice(before);
        if (expectedDiagnostic !== undefined) {
            assert.equal(typeof expectedDiagnostic, 'string', 'diagnostic expectation must be exact text');
            assert.equal(newErrors.length, 1, `arrays_${opcode} must emit exactly one expected diagnostic`);
            assert.equal(String(newErrors[0]), expectedDiagnostic);
            assert.equal(context.captured, true, 'expected diagnostic must retain the actual reporter return');
        } else if (newErrors.length) {
            throw newErrors[0];
        }
        if (!command) assert.equal(context.captured, true, `arrays_${opcode} never returned to its caller`);
        return context.result;
    } finally {
        // Only this operation's completed graph and arguments are retired.
        container.deleteBlock(root);
        for (const key of Object.keys(args)) context.slots.delete(`${serial}:${key}`);
    }
}

export async function arrayFixture(t) {
    const vm = new VM(), runtime = vm.runtime, errors = [];
    t.after(() => { vm.stopAll(); vm.quit(); });
    runtime.on('BLOCKS_ERROR', error => errors.push(error));
    const instance = new Arrays(runtime);
    const service = vm.extensionManager._registerInternalExtension(instance);
    vm.extensionManager._loadedExtensions.set('arrays', service);
    await vm.loadProject(JSON.stringify({targets: [{isStage: true, name: 'Stage', variables: {},
        lists: {}, broadcasts: {}, blocks: {}, comments: {}, costumes: [{
            assetId: 'cd21514d0531fdffb22204e0ec5ed84a', name: 'backdrop', dataFormat: 'svg',
            md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', rotationCenterX: 240, rotationCenterY: 180
        }], sounds: [], currentCostume: 0, volume: 100, layerOrder: 0}], monitors: [],
        extensions: ['arrays'], meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}}));
    runtime.currentStepTime = 1000 / 30;
    vm.greenFlag();
    const ext = new Proxy(instance, {get(object, key) {
        if (typeof object[key] !== 'function' || String(key).startsWith('_') || key === 'getInfo')
            return object[key];
        return (args, options) => arrayOperation(vm, key, args, options);
    }});
    // Inspect the real row selection while an admitted named operation is active.
    // SVG generation remains the original pure function, with the actual state.
    const tableSnapshot = async name => {
        let rows;
        // Adapter delegates are bound to the inner extension. Hook that receiver,
        // not the adapter facade, and restore its exact original own shape.
        const inner = instance._inst;
        const state = inner._tableState(name), original = inner._tableState;
        const ownDescriptor = Object.getOwnPropertyDescriptor(inner, '_tableState');
        Object.defineProperty(inner, '_tableState', {configurable: true, writable: true,
            value: function(key) {
                assert.equal(this, inner, 'table operation must use the actual extension receiver');
                const value = original.call(this, key);
                if (key === name) rows = this._tableRows(key);
                return value;
            }});
        try { await ext.setTableTitle({NAME: name, TITLE: state.title}); }
        finally {
            if (ownDescriptor) Object.defineProperty(inner, '_tableState', ownDescriptor);
            else delete inner._tableState;
        }
        assert.ok(rows, 'actual named operation did not inspect table rows');
        return inner._tableSVG(rows, state);
    };
    return {vm, runtime, ext, instance, errors, tableSnapshot};
}
