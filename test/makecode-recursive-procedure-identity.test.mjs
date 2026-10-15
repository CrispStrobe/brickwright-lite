import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {prepareProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
const calls=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(calls):[...(node.type==='Call'?[node]:[]),...Object.values(node).flatMap(calls)];

test('recursive declaration identity is not a recursive result producer',()=>{
    const program=parseMakeCodeTs('function descend(value:number){if(value>0){descend(value-1)}return value};let result=descend(3)');
    const fn=program.body.find(node=>node.type==='FunctionDeclaration'),graph=analyseSourceValueProducers(program);
    assert.equal(graph.unchangedFunctionAt(fn),fn);
    assert.equal(graph.immutableFunctionAt(fn),null);
    for(const call of calls(program))assert.equal(graph.unchangedFunctionAt(call),fn);
    assert.deepEqual(prepareProcedureConstraintSource(program,{mode:'supported-default'}).diagnostics,[]);
});

test('recursive declaration obligations retain incompatible entry writers escapes and replacement refusals',()=>{
    for(const source of [
        'function descend(value:number){if(value>0){descend(value-1)}return value};descend("20" as any)',
        'function descend(value:number){value="20" as any;return descend(value)};descend(3)',
        'function descend(value:number){return descend(value)};let alias=descend;alias(3)',
        'function descend(value:number){return descend(value)};descend=unknown;descend(3)',
        'function descend(value:number){return descend(value)};new descend(3)'
    ])assert.ok(prepareProcedureConstraintSource(parseMakeCodeTs(source),{mode:'supported-default'}).diagnostics.length,source);
});

test('recursive declaration omitted defaults rewrite every actual recursive and external call',()=>{
    const program=parseMakeCodeTs('function descend(value:number,extra:any=2){if(value>0){descend(value-1,extra)}return value};let result=descend(3)');
    const prepared=prepareProcedureConstraintSource(program,{mode:'supported-default'});assert.deepEqual(prepared.diagnostics,[]);
    const fn=prepared.program.body.find(node=>node.type==='FunctionDeclaration');assert.equal(fn.params.length,3);
    const actual=calls(prepared.program);assert.equal(actual.length,2);assert.ok(actual.every(call=>call.args.length===3));
    assert.deepEqual(actual.map(call=>call.args[2].value).sort(),['0','1']);
});
