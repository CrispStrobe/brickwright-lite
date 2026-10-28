import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {callableDefaultBody} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-defaults.js';
import {lowerCallableValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-callable-values.js';
const expression = source => parseMakeCodeTs(source, {retainCallableMetadata: true}).body[0].decls[0].init;
const withoutMetadata = node => {
    if (Array.isArray(node)) return node.map(withoutMetadata);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).filter(([key]) =>
        !['functionKind', 'parameterDefaults', 'parameterDefaultPrologue'].includes(key))
        .map(([key, value]) => [key, withoutMetadata(value)]));
};
test('callable syntax metadata is opt-in and records both arrow forms and ordinary function syntax', () => {
    for (const [source, kind] of [['let f = n => n', 'arrow'], ['let f = (n: number) => n', 'arrow'],
        ['let f = function(n: number): number { return n }', 'function']]) {
        const plain = parseMakeCodeTs(source);
        assert.equal(plain.body[0].decls[0].init.functionKind, undefined);
        const opted = parseMakeCodeTs(source, {retainCallableMetadata: true});
        assert.equal(opted.body[0].decls[0].init.functionKind, kind);
        assert.deepEqual(withoutMetadata(opted), plain);
    }
});
test('actual literal defaults and generated prologue ownership survive separately', () => {
    const source = 'let f = (n: number = 2) => { return n }';
    for (const parameterDefaults of [false, true]) {
        const fn = parseMakeCodeTs(source, {retainCallableMetadata: true, parameterDefaults}).body[0].decls[0].init;
        assert.deepEqual(fn.parameterDefaults, [{name: 'n', value: {type: 'Number', value: '2'}}]);
        assert.equal(fn.parameterDefaultPrologue, parameterDefaults);
        assert.equal(fn.body.length, parameterDefaults ? 2 : 1);
        const defaults = callableDefaultBody(fn);
        assert.deepEqual(defaults.unsupported, []);
        assert.deepEqual(defaults.defaults, [{name: 'n', value: 2}]);
        assert.deepEqual(defaults.body, [{type: 'Return', value: {type: 'Identifier', name: 'n'}}]);
    }
    const fn = parseMakeCodeTs('function outer(n: number = 2): number { return n }', {retainCallableMetadata: true}).body[0];
    assert.equal(fn.functionKind, 'declaration');
    assert.equal(fn.parameterDefaults[0].name, 'n');
});
test('syntax metadata does not rewrite either receiver expression or infer JavaScript this semantics', () => {
    for (const [source, kind] of [['let f = () => this.value', 'arrow'], ['let f = function() { return this.value }', 'function']]) {
        const fn = expression(source);
        assert.equal(fn.functionKind, kind);
        assert.deepEqual(fn.body[0].value, {type: 'Member', object: {type: 'Identifier', name: 'this'}, name: 'value'});
    }
});
test('callable lowering refuses missing syntax provenance instead of inventing an arrow', () => {
    const source = 'function make(start: number): () => number { let n = start; return () => { n += 1; return n } } let f = make(2)';
    const missing = lowerCallableValues(parseMakeCodeTs(source));
    assert.ok(missing.unsupported.includes('Source callable requires retained actual arrow or function syntax metadata'));
    assert.deepEqual(lowerCallableValues(parseMakeCodeTs(source, {retainCallableMetadata: true})).unsupported, []);
});
