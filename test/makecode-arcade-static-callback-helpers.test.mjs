import test from 'node:test';
import assert from 'node:assert/strict';
import {STATIC_CALLBACK_SOURCE} from './fixtures/arcade-static-callback-helpers.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {lowerStaticCallbackHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/static-callback-helpers.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('static callbacks retain helper loops, forwarding, recursion, arguments, results and yields through original PXT and roundtrips',async()=>{
 const expected=await runPxtArcade(STATIC_CALLBACK_SOURCE);
 assert.equal(expected.trace,123);assert.equal(expected.total,12);assert.equal(expected.recursive,20);assert.equal(expected.chosen,12);
 const check=run=>{for(const name of ['trace','total','recursive','chosen','buttonResult'])assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:180,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(STATIC_CALLBACK_SOURCE),run=await execute(imported);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const native=await runPxtArcade(exported.ts);for(const name of ['trace','total','recursive','chosen'])assert.equal(native[name],expected[name],name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,180);check(run);
});

test('callback parameter substitutions respect lexical block and loop shadows',async()=>{
 const source=`function apply(handler:()=>number){let result=handler();{let handler=3;result+=handler}for(let handler=0;handler<2;handler++){result+=handler}return result+handler()}
let observed=apply(function(){return 7})`;
 const expected=await runPxtArcade(source),imported=arcadeToPseudocode(source);
 assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});
 assert.equal(values(run).observed,expected.observed);assert.equal(expected.observed,18);assert.deepEqual(run.errors,[]);
});

test('caller-local closure captures, stored callbacks and dynamic callable values remain named boundaries',()=>{
 for(const [source,reason] of [
  ['function apply(handler:()=>number){return handler()} function caller(x:number){return apply(function(){return x})}let result=caller(7)',/caller-local/],
  ['function apply(handler:()=>number){return handler()} function caller(x:number){return apply(function(){{let x=1}return x})}let result=caller(7)',/caller-local/],
  ['function apply(handler:()=>number){return handler()}function caller(apply:any){return apply(function(){return 7})}let result=0',/shadowed/],
  ['let stored=0;function save(handler:()=>number){stored=handler}save(function(){return 3})',/escapes/],
  ['function apply(handler:()=>number){return handler()}let stored=0;let result=apply(stored)',/statically known/]
 ]){
  const result=lowerStaticCallbackHelpers(parseMakeCodeTs(source));
  assert.ok(result.unsupported.some(message=>reason.test(message)),JSON.stringify(result.unsupported));
  assert.ok(arcadeToPseudocode(source).unsupported.some(message=>reason.test(message)),source);
 }
});


test('recursive helper specialization reuses an inline callback site instead of expanding indefinitely',async()=>{
 const source=`function recur(handler:()=>number,depth:number):number {if(depth<=0){return handler()}return recur(function(){return 3},depth-1)+handler()}
let observed=recur(function(){return 2},2)`;
 const imported=arcadeToPseudocode(source),expected=await runPxtArcade(source);
 assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:120,uploads:imported.costumes,storage:true});
 assert.equal(values(run).observed,8);assert.equal(values(run).observed,expected.observed);assert.deepEqual(run.errors,[]);
});


test('void callbacks yield in procedure frames and ordinary arguments evaluate once in source order',async()=>{
 const source=`let observed=0
function invoke(handler:(value:number)=>void,value:number){handler(value)}
invoke(function(value:number){observed+=value;pause(1);observed+=value},3)
let evaluations=0
function next(){evaluations+=1;return evaluations}
function combine(handler:(a:number,b:number)=>number,a:number,b:number){return handler(a,b)}
let result=combine(function(a:number,b:number){return a*10+b},next(),next())`;
 const expected=await runPxtArcade(source),imported=arcadeToPseudocode(source);
 assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});
 for(const name of ['observed','evaluations','result'])assert.equal(values(run)[name],expected[name],name);
 assert.equal(values(run).observed,6);assert.equal(values(run).evaluations,2);assert.equal(values(run).result,12);assert.deepEqual(run.errors,[]);
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const native=await runPxtArcade(exported.ts);for(const name of ['observed','evaluations','result'])assert.equal(native[name],expected[name],name);
 const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);
 const repeated=await runProgram(again.code,{frames:100,uploads:again.costumes,storage:true});
 for(const name of ['observed','evaluations','result'])assert.equal(values(repeated)[name],expected[name],name);
 assert.deepEqual(repeated.errors,[]);
});
