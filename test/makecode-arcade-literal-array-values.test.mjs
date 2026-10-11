import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {LITERAL_ARRAY_VALUES_SOURCE} from './fixtures/arcade-literal-array-values.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function qualify(source,names){
    const expected=await runPxtArcade(source);
    const check=run=>{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const actual=values(run);for(const name of names)assert.equal(actual[name],expected[name],name);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:30,storage:true});check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    assert.match(imported.code,/new array reference from/);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
    const again=await runPxtArcade(exported.files);for(const name of names)assert.equal(again[name],expected[name],name+' exported');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,30);check(run);
}

test('unused literal array arguments still evaluate elements once in source order through every interchange',async()=>{
    await qualify(`let calls=0
let order=0
function element(n:number){calls++;order=order*10+n;return n}
function ignore(words:number[]){}
ignore([element(1),element(2),element(3)])
ignore([])
let finished=calls===3`,['calls','order','finished']);
});

test('literal strings, fresh return values and mutated aliases remain reference arrays through Code/Blocks/SB3/PXT',async()=>{
    await qualify(`function fresh(){return ["first","second"]}
function edit(words:string[]){words[0]=words[0]+"!";return words}
let a=fresh()
let b=fresh()
let alias=edit(a)
let same=alias===a
let distinct=a!==b
let edited=a[0]
let untouched=b[0]
let count=a.length
function consume(words:string[],separator:string){return words[0]+separator+words[1]}
let literalResult=consume(["Hi","there"],"!")
let finished=a.length===2 && b[0]==="first"`,['same','distinct','edited','untouched','count','literalResult','finished']);
});

test('bare array-returning helpers are translated even when their results are unused',()=>{
    const result=arcadeToPseudocode('function fresh(){return [1,2]}fresh();function ignore(words:string[]){}ignore(["Simple","Test"]);ignore([])');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/new array reference from/);
});

test('native controller input evaluates literal array parameters in the shipped browser fixture',async()=>{
    const imported=arcadeToPseudocode(LITERAL_ARRAY_VALUES_SOURCE);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:8,storage:true});
    assert.equal(values(run).arraysReady,true);assert.equal(values(run).calls,0);
    run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,8);
    run.vm.postIOData('keyboard',{key:' ',isDown:false});
    assert.equal(values(run).calls,2);assert.equal(values(run).order,12);assert.equal(values(run).result,'Hi!there');
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
});
