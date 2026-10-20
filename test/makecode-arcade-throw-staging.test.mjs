import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';

// Parser integration supplies this exact ThrowStatement.argument shape. These
// controls exercise staging alone, with no runtime or canonical word admission.
const operandProgram=expression=>{
    const program=parseMakeCodeTs(`let operand=${expression};after();`);
    program.body[0]={type:'ThrowStatement',argument:program.body[0].decls[0].init};
    return program;
};
const calls=node=>{
    if(!node||typeof node!=='object')return [];
    return [...(node.type==='Call'?[node.callee.name]:[]),
        ...Object.values(node).flatMap(value=>Array.isArray(value)?value.flatMap(calls):calls(value))];
};
test('Throw stages the actual conditional operand before abrupt handoff and retains later statements',()=>{
    const program=operandProgram('choose()?first():second()'),before=JSON.stringify(program);
    const staged=lowerPxtStagedValues(program);
    assert.equal(JSON.stringify(program),before);
    assert.deepEqual(staged.body.map(node=>node.type),['Declaration','If','ThrowStatement','ExpressionStatement']);
    assert.deepEqual(calls(staged.body[1].test),['choose']);
    assert.deepEqual(calls(staged.body[1].consequent),['first']);
    assert.deepEqual(calls(staged.body[1].alternate),['second']);
    assert.equal(staged.body[2].argument.type,'Identifier');
    assert.equal(staged.body[2].argument.name,staged.body[0].decls[0].name);
    assert.deepEqual(calls(staged.body[3]),['after']);
});
test('Throw retains ordered aggregate operand effects and unchanged simple physical values',()=>{
    const simple=operandProgram('20');
    assert.deepEqual(lowerPxtStagedValues(simple),simple);
    const program=operandProgram('[first(),second()][0]'),before=JSON.stringify(program);
    const staged=lowerPxtStagedValues(program),throws=staged.body.filter(node=>node.type==='ThrowStatement');
    assert.equal(JSON.stringify(program),before);
    assert.equal(throws.length,1);
    assert.equal(throws[0].argument.type,'Index');
    assert.deepEqual(calls(staged),['push','first','push','second','after']);
    assert.equal(staged.body.at(-2),throws[0]);
});
