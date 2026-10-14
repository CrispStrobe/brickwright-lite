import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const create = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-scalar-cells.js');
const undefinedValue = Object.freeze({undefined: true});
const values = {encode: value => value === undefined ? undefinedValue : value};
function fixture() {
    const variable = {id: 'cell', name: 'before', type: '', value: 0};
    const stock = {id: 'stock', type: '', value: 17};
    const blocks = {
        hat: {id: 'hat', opcode: 'arcade_whenSourceStarts', topLevel: true, next: 'declare'},
        declare: {id: 'declare', opcode: 'arcade_declareSourceScalar', next: 'init',
            inputs: {VARIABLE: {block: 'reporter'}}, fields: {TYPE: {value: 'Boolean'}}},
        reporter: {id: 'reporter', opcode: 'data_variable', fields: {VARIABLE: {id: 'cell', value: 'before'}}},
        init: {id: 'init', opcode: 'data_setvariableto'}
    };
    const target = {id: 'stage', isOriginal: true, variables: {cell: variable, stock},
        blocks: {_blocks: blocks, getBlock: id => blocks[id]}, lookupVariableById: id => target.variables[id]};
    const runtime = {targets: [target]};
    const host = create(runtime, values);
    const util = {target, thread: {peekStack: () => 'declare'}};
    return {variable, stock, blocks, target, runtime, host, util};
}
test('source prelude uses undefined and actual ID while preserving ordinary saved values and renames', () => {
    const f = fixture(); f.host.initialize();
    assert.equal(f.variable.value, undefinedValue); assert.equal(f.stock.value, 17);
    f.variable.name = 'renamed'; f.blocks.reporter.fields.VARIABLE.value = 'renamed';
    f.variable.value = false; f.host.declare({}, f.util);
    assert.equal(f.variable.value, false); assert.equal(f.host.typeOf(f.target, 'cell'), 'Boolean');
    f.host.invalidate(); assert.throws(() => f.host.declare({}, f.util), /current prelude/);
    f.host.initialize(); assert.equal(f.variable.value, undefinedValue);
});
test('prelude refuses late, computed, list, duplicate, foreign and conflicting declarations atomically', () => {
    const changes = [
        f => {f.blocks.hat.next = 'init'; f.blocks.init.next = 'declare';},
        f => {f.blocks.reporter.opcode = 'operator_join';},
        f => {f.variable.type = 'list';},
        f => {f.blocks.declare.next = 'duplicate'; f.blocks.duplicate = {...f.blocks.declare, id: 'duplicate', next: 'init'};},
        f => {f.target.variables = {};},
        f => {f.blocks.declare.fields.TYPE.value = 'Sprite';},
        f => {f.blocks.hat.opcode = 'event_whenflagclicked';}
    ];
    for (const change of changes) {
        const f = fixture(); change(f); assert.throws(() => f.host.initialize());
        assert.equal(f.variable.value, 0); assert.equal(f.stock.value, 17);
        assert.throws(() => f.host.declare({}, f.util), /current prelude/);
    }
});
test('binding changes, removed targets and replacement variable objects cannot reuse a prelude', () => {
    for (const change of [f => {f.target.variables.cell = {...f.variable};},
        f => {f.blocks.declare.fields.TYPE.value = 'Number';},
        f => {f.runtime.targets = [];},
        f => {f.blocks.declare = {...f.blocks.declare};}]) {
        const f = fixture(); f.host.initialize(); change(f);
        assert.throws(() => f.host.declare({}, f.util));
    }
});
