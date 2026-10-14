import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerLazyValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-lazy-values.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runArcadeSourceCode as runProgram} from './helpers/arcade-source-program.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const ast = source => parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true});
test('PXT staging keeps deferred earlier calls separate from ordinary JavaScript lowering',()=>{
    const input=ast('let n=f(a(),flag?b():c())');
    const js=lowerLazyValues(input),pxt=lowerPxtStagedValues(input);
    assert.ok(js.body.some(s=>s.decls?.some(d=>d.init?.type==='Call' && d.init.callee.name==='a')));
    assert.equal(pxt.body.some(s=>s.decls?.some(d=>d.init?.type==='Call' && d.init.callee.name==='a')),false);
    assert.equal(pxt.body.at(-1).decls[0].init.args[0].callee.name,'a');
});

const source="let trace=0\nlet yes=true\nlet no=false\nlet list=[0,1,2,3]\nfunction tap(n:number){trace=trace*10+n;return n}\nfunction pair(a:number,b:number){return a*10+b}\nfunction array(){tap(1);return list}\nclass Box {\n    value:number\n    constructor(a:number,b:number){tap(9);this.value=pair(a,b)}\n    method(a:number,b:number){return pair(a,b)}\n}\nlet box=new Box(0,0)\nfunction receiver(){tap(1);return box}\ntrace=0\nlet ordinaryValue=pair(tap(1),tap(2))\nlet ordinaryTrace=trace\ntrace=0\nlet conditionalValue=pair(tap(1),yes?tap(2):tap(8))\nlet conditionalTrace=trace\ntrace=0\nlet reverseValue=pair(yes?tap(1):tap(8),tap(2))\nlet reverseTrace=trace\ntrace=0\nlet twoValue=pair(yes?tap(1):tap(8),yes?tap(2):tap(7))\nlet twoTrace=trace\ntrace=0\nlet nestedValue=pair(tap(1),yes?pair(tap(2),yes?tap(3):tap(8)):tap(7))\nlet nestedTrace=trace\ntrace=0\nlet testValue=pair(tap(3),tap(1)?tap(2):tap(8))\nlet testTrace=trace\ntrace=0\nlet andValue=pair(tap(1),yes&&tap(2))\nlet andTrace=trace\ntrace=0\nlet orValue=pair(tap(1),no||tap(2))\nlet orTrace=trace\ntrace=0\nlet skippedValue=pair(tap(1),<any>(no&&tap(2)))\nlet skippedTrace=trace\ntrace=0\nlet binaryValue=tap(1)+(yes?tap(2):tap(8))\nlet binaryTrace=trace\ntrace=0\nlet elements=[tap(1),yes?tap(2):tap(8)]\nlet elementTrace=trace\ntrace=0\nlet indexedValue=array()[yes?tap(2):tap(8)]\nlet indexedTrace=trace\ntrace=0\nlet propertyValue=(yes?receiver():receiver()).value+tap(2)\nlet propertyTrace=trace\ntrace=0\nlet methodValue=receiver().method(tap(2),yes?tap(3):tap(8))\nlet methodTrace=trace\ntrace=0\nlet created=new Box(tap(1),yes?tap(2):tap(8))\nlet newValue=created.value\nlet newTrace=trace\ntrace=0\narray()[yes?tap(2):tap(8)]=tap(3)\nlet assignedValue=list[2]\nlet assignmentTrace=trace\n\nlet mutable=1\nfunction change(){mutable=2;return 3}\ntrace=0\nlet earlierReadValue=pair(mutable,yes?change():0)\nlet earlierReadTrace=trace\ntrace=0\nlet arrayArgumentValue=pair([tap(1),tap(2)][0],yes?tap(3):tap(8))\nlet arrayArgumentTrace=trace\ntrace=0\nlet newArgumentValue=pair(new Box(tap(1),tap(2)).value,yes?tap(3):tap(8))\nlet newArgumentTrace=trace\n";
const expected={
    "ordinaryValue": 12,
    "ordinaryTrace": 12,
    "conditionalValue": 12,
    "conditionalTrace": 21,
    "reverseValue": 12,
    "reverseTrace": 12,
    "twoValue": 12,
    "twoTrace": 12,
    "nestedValue": 33,
    "nestedTrace": 321,
    "testValue": 32,
    "testTrace": 123,
    "andValue": 12,
    "andTrace": 21,
    "orValue": 12,
    "orTrace": 21,
    "skippedValue": 10,
    "skippedTrace": 1,
    "binaryValue": 3,
    "binaryTrace": 21,
    "elementTrace": 12,
    "indexedValue": 2,
    "indexedTrace": 21,
    "propertyValue": 2,
    "propertyTrace": 12,
    "methodValue": 23,
    "methodTrace": 312,
    "newValue": 12,
    "newTrace": 219,
    "assignedValue": 3,
    "assignmentTrace": 213,
    "earlierReadValue": 23,
    "earlierReadTrace": 0,
    "arrayArgumentValue": 13,
    "arrayArgumentTrace": 123,
    "newArgumentValue": 123,
    "newArgumentTrace": 1293
};

test('selected PXT staging survives actual native, Code, fresh SB3, export and reimport', {timeout:300000}, async()=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const runs=[];
    const check=run=>{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
        for(const [key,value] of Object.entries(expected))assert.equal(values[key],value,key);
    };
    try{
        const direct=await runProgram(imported.code,{frames:12,storage:true});runs.push(direct);check(direct);
        const code=await runProgram(direct.creator.decompile(),{frames:12,storage:true});runs.push(code);check(code);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
        await fresh.vm.loadProject(Buffer.from(await(await direct.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,12);check(fresh);
        const exported=projectToArcade(direct.creator.project);assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
        const original=await runPxtArcade(exported.files,{fakeClock:true});
        for(const [key,value] of Object.entries(expected))assert.equal(original[key] ?? original['Game_'+key],value,key);
        const back=arcadeToPseudocode(exported.files);assert.deepEqual(back.unsupported,[]);
        const reimport=await runProgram(back.code,{frames:12,storage:true});runs.push(reimport);check(reimport);
    }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

test('selected staging preserves callable and generic metadata with independently retained original bodies',()=>{
    const input=ast('let callback=function(value:number){return pair(first(),flag?second():third())}');
    const fn=input.body[0].decls[0].init;
    fn.functionKind='ordinary';fn.typeParameters=['T'];fn.parameterDefaults={value:{type:'Number',value:'3'}};
    fn.originalBody=structuredClone(fn.body);
    const transformed=lowerPxtStagedValues(input).body[0].decls[0].init;
    assert.equal(transformed.functionKind,'ordinary');
    assert.deepEqual(transformed.typeParameters,['T']);
    assert.deepEqual(transformed.parameterDefaults,fn.parameterDefaults);
    assert.notEqual(transformed.originalBody,transformed.body);
    assert.ok(transformed.originalBody.some(node=>node.type==='If'));
    assert.ok(transformed.body.some(node=>node.type==='If'));
    assert.equal(fn.body.length,1,'the original input tree remains untouched');
});
