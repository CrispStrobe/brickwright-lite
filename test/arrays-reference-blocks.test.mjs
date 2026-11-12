/**
 * Arrays & Tensors — array REFERENCES and MakeCode values (task E0).
 *
 * An imported MakeCode Arcade program shares arrays by identity (two variables,
 * one array; a function that pushes onto its argument) and computes with
 * JavaScript's values (undefined, null, ===, + that joins text). The named
 * arrays of this extension are values copied by name, so the importer's
 * arrays are references: CrispStrobe/extensions arrays.js gained 18 blocks
 * for them, and the dialect's array-reference words (sb3-creator
 * arcadeDialect.js) map to those blocks. This holds the vendored bundle to
 * the behaviour the words promise, block by block and then through the
 * dialect and a running VM.
 *
 * The bundle runs here through Lite's adapter, which since E3a provides
 * Scratch.BWValues (overlay/scratch-vm/src/util/bw-values.js), so these are
 * the SHARED value rules, not the bundle's built-in copy; test/bw-values.test.mjs
 * holds the two to the same results.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {runProgram} from './helpers/bw-vm.mjs';
import {arrayFixture} from './helpers/arrays-current-operation.mjs';

const require = createRequire(import.meta.url);
const ArraysExtension = require(
    path.join(INTEGRATED, 'node_modules/scratch-vm/src/extensions/crispstrobe/arrays'));

function makeExt () {
    const runtime = new EventEmitter();
    const errors = [];
    runtime.on('BLOCKS_ERROR', message => errors.push(String(message)));
    return {ext: new ArraysExtension(runtime), runtime, errors};
}

const REFERENCE_BLOCKS = {
    namedReference: 'reporter', parseLegacyValue: 'reporter', jsonValue: 'reporter',
    referenceValues: 'reporter', createReference: 'reporter', specialValue: 'reporter',
    valueBinary: 'reporter', valueUnary: 'reporter', valueTruthy: 'Boolean', valueCompare: 'Boolean',
    referenceTruthy: 'Boolean', referenceItem: 'reporter', referenceRemove: 'Boolean',
    referenceRandom: 'reporter', referenceLength: 'reporter', referenceTake: 'reporter',
    referenceIndexOf: 'reporter', mutateReference: 'command'
};

test('the blocks here compute with the shared Scratch.BWValues, as the header says', async t => {
    const BWValues = require(path.join(INTEGRATED, 'node_modules/scratch-vm/src/util/bw-values.js'));
    const {ext, runtime, instance} = await arrayFixture(t);
    // Only the shared module's heap can resolve a reference the bundle made.
    const ref = await ext.createReference({VALUES: '[1, 2]'});
    assert.deepEqual(BWValues.arrayValue(runtime, ref), [1, 2]);
    assert.throws(() => instance.referenceLength({ARRAY: ref}), /current operation/,
        'the same tracked reference cannot authorize an off-thread public call');
    assert.equal(await ext.referenceLength({ARRAY: ref}), 2);
});

test('the 18 reference blocks are declared, with the shapes the dialect words build', () => {
    const {ext} = makeExt();
    const byOpcode = new Map(ext.getInfo().blocks.filter(b => b && b.opcode).map(b => [b.opcode, b]));
    for (const [opcode, blockType] of Object.entries(REFERENCE_BLOCKS)) {
        assert.ok(byOpcode.get(opcode), `${opcode} is not declared`);
        assert.equal(byOpcode.get(opcode).blockType, blockType, opcode);
        assert.equal(typeof ext[opcode], 'function', `${opcode} has no method`);
    }
});

test('a reference is shared by identity, and its blocks act on the array it names', async t => {
    const {ext} = await arrayFixture(t);
    const ref = (await ext.createReference({VALUES: '[1,2,3]'}));
    const alias = ref;
    (await ext.mutateReference({ARRAY: alias, OP: 'push', INDEX: 0, VALUE: 4}));
    assert.equal((await ext.referenceLength({ARRAY: ref})), 4, 'a push through the alias is seen through the original');
    assert.equal((await ext.referenceItem({ARRAY: ref, INDEX: 3})), 4);
    assert.equal((await ext.jsonValue({VALUE: ref})), '[1,2,3,4]');
    assert.equal((await ext.referenceRemove({ARRAY: ref, VALUE: 2})), true);
    assert.equal((await ext.referenceRemove({ARRAY: ref, VALUE: 99})), false);
    assert.equal((await ext.referenceIndexOf({ARRAY: ref, VALUE: 4, INDEX: 0})), 2);
    assert.equal((await ext.referenceTake({ARRAY: ref, OP: 'shift', INDEX: 0})), 1);
    assert.equal((await ext.referenceTake({ARRAY: ref, OP: 'removeAt', INDEX: 1})), 4);
    assert.equal((await ext.jsonValue({VALUE: ref})), '[3]');
    (await ext.mutateReference({ARRAY: ref, OP: 'insertAt', INDEX: 0, VALUE: 'a'}));
    (await ext.mutateReference({ARRAY: ref, OP: 'reverse', INDEX: 0, VALUE: ''}));
    assert.equal((await ext.jsonValue({VALUE: ref})), '[3,"a"]');
    // A nested array comes back as a reference to the SAME inner array.
    const outer = (await ext.createReference({VALUES: (await ext.referenceValues({VALUE: ref, REST: '[]'}))}));
    const inner = (await ext.referenceItem({ARRAY: outer, INDEX: 0}));
    (await ext.mutateReference({ARRAY: inner, OP: 'push', INDEX: 0, VALUE: 7}));
    assert.equal((await ext.referenceLength({ARRAY: ref})), 3);
});

test('MakeCode values: undefined, + that joins text, === against ==, NaN', async t => {
    const {ext} = await arrayFixture(t);
    const ref = (await ext.createReference({VALUES: '[1]'}));
    const missing = (await ext.referenceItem({ARRAY: ref, INDEX: 5}));
    assert.equal(String(missing), 'undefined', 'an index past the end is undefined, not ""');
    assert.equal((await ext.valueTruthy({VALUE: missing})), false);
    assert.equal((await ext.valueCompare({LEFT: missing, OP: '==', RIGHT: (await ext.specialValue({KIND: 'null'}))})), true);
    assert.equal((await ext.valueCompare({LEFT: missing, OP: '===', RIGHT: (await ext.specialValue({KIND: 'null'}))})), false);
    assert.equal((await ext.valueBinary({LEFT: 'a', OP: '+', RIGHT: 1})), 'a1');
    assert.equal((await ext.valueBinary({LEFT: 7, OP: '%', RIGHT: 4})), 3);
    assert.equal((await ext.valueUnary({OP: '-', VALUE: '5'})), -5);
    assert.equal((await ext.valueCompare({LEFT: 1, OP: '===', RIGHT: '1'})), false);
    assert.equal((await ext.valueCompare({LEFT: 1, OP: '==', RIGHT: '1'})), true);
    const nan = (await ext.createReference({VALUES: (await ext.referenceValues({VALUE: NaN, REST: '[]'}))}));
    assert.ok(Number.isNaN((await ext.referenceItem({ARRAY: nan, INDEX: 0}))), 'NaN survives the value chain');
    assert.equal((await ext.referenceIndexOf({ARRAY: nan, VALUE: NaN, INDEX: 0})), -1, 'indexOf is ===, as in MakeCode');
});

test('a named array is reachable by reference, and a reference expires with the project run', async t => {
    const {ext, runtime, errors, vm} = await arrayFixture(t);
    (await ext.create1D({NAME: 'xs', JSON: '[7,8]'}));
    const named = (await ext.namedReference({NAME: 'xs'}));
    (await ext.mutateReference({ARRAY: named, OP: 'push', INDEX: 0, VALUE: 9}));
    assert.equal((await ext.toJSON({NAME: 'xs'})), '[7,8,9]');
    const ref = (await ext.createReference({VALUES: '[1]'}));
    const BWValues = require(path.join(INTEGRATED, 'node_modules/scratch-vm/src/util/bw-values.js'));
    const oldBody = BWValues.arrayValue(runtime, named);
    vm.greenFlag();
    const refused = async call => {
        const before = errors.length;
        let issued;
        await assert.rejects(call, error => {
            issued = error;
            return error instanceof Error &&
                error.message === 'Array operation ownership: foreign or stale Array body';
        });
        assert.equal(errors.length, before + 1, 'one issued refusal per stale operation');
        assert.equal(errors[before], issued, 'the actual issued Error reaches the observer unchanged');
        assert.deepEqual(oldBody, [7,8,9], 'stale access cannot change the old named backing');
    };
    await refused(() => ext.referenceLength({ARRAY: ref}));
    await refused(() => ext.mutateReference({ARRAY: named, OP: 'push', INDEX: 0, VALUE: 1}));
    await refused(() => ext.toJSON({NAME: 'xs'}));

});

test('the dialect words run: parse -> blocks -> VM', async t => {
    const run = await runProgram([
        'GLOBAL r', 'GLOBAL alias', 'GLOBAL n', 'GLOBAL last', 'GLOBAL joined', 'GLOBAL same', 'GLOBAL text',
        'SPRITE Game:', 'WHEN flag clicked:',
        // A literal in a Scratch input is TEXT; the importer writes a MakeCode
        // number as `(0 + n)` so the block receives a number.
        '  set r to new array reference from (array value ((0 + 1)) rest (array value ("two") rest ("[]")))',
        '  set alias to r',
        '  mutate array reference (alias) op "push" index (0) value (3)',
        '  set n to length of array reference (r)',
        '  set last to pop from array reference (r) index (0)',
        '  set joined to calculate value (item (1) of array reference (r)) op "+" with (1)',
        '  IF compare value (r) op "===" with (alias) THEN:',
        '    set same to 1',
        '  set text to JSON text of value (r)'
    ].join('\n') + '\n', {frames: 4});
    assert.deepEqual(run.errors, []);
    for (const op of ['arrays_createReference', 'arrays_referenceValues', 'arrays_mutateReference',
        'arrays_referenceLength', 'arrays_referenceTake', 'arrays_valueBinary', 'arrays_referenceItem',
        'arrays_valueCompare', 'arrays_jsonValue']) assert.ok(run.loadedOpcodes.has(op), op);
    const value = name => run.vm.runtime.targets.flatMap(t => Object.values(t.variables || {}))
        .find(v => v.name === name)?.value;
    // A variable holds what the VM's set block stores (text for a reported number).
    assert.equal(String(value('n')), '3', 'the push through the alias is seen through r');
    assert.equal(String(value('last')), '3');
    assert.equal(value('joined'), 'two1', '+ joins text, as in MakeCode');
    assert.equal(String(value('same')), '1', 'two variables holding one reference are ===');
    assert.equal(value('text'), '[1,"two"]');
});


test('named item reporters preserve plaintext through the actual shared Lite codec', async t => {
    const values = require(path.join(INTEGRATED, 'node_modules/scratch-vm/src/util/bw-values.js'));
    const {ext, runtime, errors, vm} = await arrayFixture(t);
    const texts = ['abc', '', 'null', 'true', '[1,2]', '{"value":2}', '"quoted"', 'é雪😀', 'line\nnext'];
    (await ext.create1D({NAME: 'items', JSON: JSON.stringify(texts)}));
    (await ext.create2D({NAME: 'grid', JSON: JSON.stringify([texts])}));
    for (let index = 0; index < texts.length; index++) {
        assert.equal(values.decode((await ext.get({NAME: 'items', INDEX: index}))), texts[index]);
        assert.equal(values.decode((await ext.get2D({NAME: 'grid', ROW: 0, COL: index}))), texts[index]);
        assert.equal(values.decode((await ext.getMulti({NAME: 'grid', INDICES: JSON.stringify([0, index])}))), texts[index]);
    }
    for (const text of [...texts].reverse()) assert.equal(values.decode((await ext.pop({NAME: 'items'}))), text);
    (await ext.create1D({NAME: 'aggregates', JSON: '[3,null,[1,2]]'}));
    assert.equal(values.decode((await ext.get({NAME: 'aggregates', INDEX: 0}))), 3);
    assert.equal(values.decode((await ext.get({NAME: 'aggregates', INDEX: 1}))), null);
    assert.equal((await ext.get({NAME: 'aggregates', INDEX: 2})), '[1,2]');
    const image = values.reference(runtime, 'image', 'item-owner');
    (await ext.set({NAME: 'aggregates', INDEX: 3, VALUE: image}));
    const read = (await ext.get({NAME: 'aggregates', INDEX: 3}));
    assert.equal(values.referenceId(runtime, read, 'image'), 'item-owner');
    assert.equal(values.referenceId({}, read, 'image'), null);
    assert.deepEqual(errors, []);
});
