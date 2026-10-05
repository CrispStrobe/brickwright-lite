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

test('the blocks here compute with the shared Scratch.BWValues, as the header says', () => {
    const BWValues = require(path.join(INTEGRATED, 'node_modules/scratch-vm/src/util/bw-values.js'));
    const {ext, runtime} = makeExt();
    // Only the shared module's heap can resolve a reference the bundle made.
    assert.deepEqual(BWValues.arrayValue(runtime, ext.createReference({VALUES: '[1, 2]'})), [1, 2]);
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

test('a reference is shared by identity, and its blocks act on the array it names', () => {
    const {ext} = makeExt();
    const ref = ext.createReference({VALUES: '[1,2,3]'});
    const alias = ref;
    ext.mutateReference({ARRAY: alias, OP: 'push', INDEX: 0, VALUE: 4});
    assert.equal(ext.referenceLength({ARRAY: ref}), 4, 'a push through the alias is seen through the original');
    assert.equal(ext.referenceItem({ARRAY: ref, INDEX: 3}), 4);
    assert.equal(ext.jsonValue({VALUE: ref}), '[1,2,3,4]');
    assert.equal(ext.referenceRemove({ARRAY: ref, VALUE: 2}), true);
    assert.equal(ext.referenceRemove({ARRAY: ref, VALUE: 99}), false);
    assert.equal(ext.referenceIndexOf({ARRAY: ref, VALUE: 4, INDEX: 0}), 2);
    assert.equal(ext.referenceTake({ARRAY: ref, OP: 'shift', INDEX: 0}), 1);
    assert.equal(ext.referenceTake({ARRAY: ref, OP: 'removeAt', INDEX: 1}), 4);
    assert.equal(ext.jsonValue({VALUE: ref}), '[3]');
    ext.mutateReference({ARRAY: ref, OP: 'insertAt', INDEX: 0, VALUE: 'a'});
    ext.mutateReference({ARRAY: ref, OP: 'reverse', INDEX: 0, VALUE: ''});
    assert.equal(ext.jsonValue({VALUE: ref}), '[3,"a"]');
    // A nested array comes back as a reference to the SAME inner array.
    const outer = ext.createReference({VALUES: ext.referenceValues({VALUE: ref, REST: '[]'})});
    const inner = ext.referenceItem({ARRAY: outer, INDEX: 0});
    ext.mutateReference({ARRAY: inner, OP: 'push', INDEX: 0, VALUE: 7});
    assert.equal(ext.referenceLength({ARRAY: ref}), 3);
});

test('MakeCode values: undefined, + that joins text, === against ==, NaN', () => {
    const {ext} = makeExt();
    const ref = ext.createReference({VALUES: '[1]'});
    const missing = ext.referenceItem({ARRAY: ref, INDEX: 5});
    assert.equal(String(missing), 'undefined', 'an index past the end is undefined, not ""');
    assert.equal(ext.valueTruthy({VALUE: missing}), false);
    assert.equal(ext.valueCompare({LEFT: missing, OP: '==', RIGHT: ext.specialValue({KIND: 'null'})}), true);
    assert.equal(ext.valueCompare({LEFT: missing, OP: '===', RIGHT: ext.specialValue({KIND: 'null'})}), false);
    assert.equal(ext.valueBinary({LEFT: 'a', OP: '+', RIGHT: 1}), 'a1');
    assert.equal(ext.valueBinary({LEFT: 7, OP: '%', RIGHT: 4}), 3);
    assert.equal(ext.valueUnary({OP: '-', VALUE: '5'}), -5);
    assert.equal(ext.valueCompare({LEFT: 1, OP: '===', RIGHT: '1'}), false);
    assert.equal(ext.valueCompare({LEFT: 1, OP: '==', RIGHT: '1'}), true);
    const nan = ext.createReference({VALUES: ext.referenceValues({VALUE: NaN, REST: '[]'})});
    assert.ok(Number.isNaN(ext.referenceItem({ARRAY: nan, INDEX: 0})), 'NaN survives the value chain');
    assert.equal(ext.referenceIndexOf({ARRAY: nan, VALUE: NaN, INDEX: 0}), -1, 'indexOf is ===, as in MakeCode');
});

test('a named array is reachable by reference, and a reference expires with the project run', () => {
    const {ext, runtime, errors} = makeExt();
    ext.create1D({NAME: 'xs', JSON: '[7,8]'});
    const named = ext.namedReference({NAME: 'xs'});
    ext.mutateReference({ARRAY: named, OP: 'push', INDEX: 0, VALUE: 9});
    assert.equal(ext.toJSON({NAME: 'xs'}), '[7,8,9]');
    const ref = ext.createReference({VALUES: '[1]'});
    runtime.emit('PROJECT_START');
    assert.equal(ext.referenceLength({ARRAY: ref}), 0);
    assert.deepEqual(errors, ['Array reference is null or expired'],
        'an expired reference is an error, not an empty array that looks real');
    ext.mutateReference({ARRAY: named, OP: 'push', INDEX: 0, VALUE: 1});
    assert.equal(ext.toJSON({NAME: 'xs'}), '[7,8,9]', 'a stale reference cannot write into the named array');
});

test('the dialect words run: parse -> blocks -> VM', async () => {
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
