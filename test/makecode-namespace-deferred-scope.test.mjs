import test from 'node:test';import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const lower=source=>lowerNamespaceBindings(parseMakeCodeTs(source));
test('dotted namespaces implicitly export inner segments; explicit private namespaces stay private',()=>{
 for(const source of ['namespace N.util {export function f(){return 3}}let value=N.util.f()','namespace N {namespace util {export function f(){return 3}}export function read(){return util.f()}}let value=N.read()'])assert.deepEqual(lower(source).unsupported,[],source);
 for(const source of ['namespace N {namespace util {export function f(){return 3}}export function read(){return N.util.f()}}','namespace N {namespace util {export function f(){return 3}}}let value=N.util.f()'])assert.match(lower(source).unsupported.join('\n'),/private/);
});
test('forward procedures are hoisted, while eager scalar reads and early executed bodies retain diagnostics',()=>{
 assert.deepEqual(lower('let value=N.f();namespace N {export function f(){return 7}}').unsupported,[]);
 assert.deepEqual(lower('function read(){return N.value}namespace N {export let value=7}let value=read()').unsupported,[]);
 for(const source of ['let value=N.value;namespace N {export let value=7}','function read(){return N.value}let value=read();namespace N {export let value=7}','namespace N {export function read(){let value=0;return N.value}export let early=read();export let value=7}'])assert.match(lower(source).unsupported.join('\n'),/before initialization/);
});
test('class methods defer reads but known earlier constructions and calls remain checked',()=>{
 assert.deepEqual(lower('class Reader {read(){return N.value}}namespace N {export let value=7}let reader=new Reader();let value=reader.read()').unsupported,[]);
 assert.deepEqual(lower('class Reader {constructor(){this.read()}read(){return N.value}}namespace N {export let value=7}let reader=new Reader()').unsupported,[]);
 for(const source of ['class Reader {read(){return N.value}}let reader=new Reader();let value=reader.read();namespace N {export let value=7}','class Reader {constructor(){this.read()}read(){return N.value}}let reader=new Reader();namespace N {export let value=7}','class Reader {static value=N.value}namespace N {export let value=7}'])assert.match(lower(source).unsupported.join('\n'),/before initialization/);
 const dynamic=lower('class Reader {read(){return N.value}}let unknown:any=null;unknown.read();namespace N {export let value=7}');assert.deepEqual(dynamic.unsupported,[]);assert.match(dynamic.warnings.join('\n'),/unproved.*dynamic receiver/);
});

test('class accessors, aliases and reassignment retain eager call checks',()=>{
 for(const source of [
  'class Reader {get value(){return N.value}}let reader=new Reader();let value=reader.value;namespace N {export let value=7}',
  'class Reader {set value(v:number){N.value+=v}}let reader=new Reader();reader.value=2;namespace N {export let value=7}',
  'class Reader {read(){return N.value}}let reader=new Reader();let fn=reader.read;fn();namespace N {export let value=7}',
  'class Reader {read(){return N.value}}let reader:any=null;reader=new Reader();reader.read();namespace N {export let value=7}',
  'class Reader {constructor(){this.read()}read(){return N.value}}let C=Reader;let reader=new C();namespace N {export let value=7}',
  'let read=()=>N.value;let value=read();namespace N {export let value=7}'
 ])assert.match(lower(source).unsupported.join('\n'),/before initialization/,source);
 const unknownConstructor=lower('class Reader {constructor(){this.read()}read(){return N.value}}let C:any=null;let value=new C();namespace N {export let value=7}');assert.deepEqual(unknownConstructor.unsupported,[]);assert.match(unknownConstructor.warnings.join('\n'),/dynamic constructor/);
 const changed=lower('class Reader {read(){return N.value}}let reader:any=new Reader();reader=null;reader.read();namespace N {export let value=7}');assert.deepEqual(changed.unsupported,[]);assert.match(changed.warnings.join('\n'),/dynamic receiver/);
});

test('literal constants hoist their actual initializer; dynamic initializer reads keep order',()=>{
 for(const source of ['let value=N.answer;namespace N {export const answer=7}','let value=N.read();namespace N {export const answer=7;export function read(){return answer}}'])assert.deepEqual(lower(source).unsupported,[],source);
 for(const source of ['function initialize(){return 7};let value=N.answer;namespace N {export const answer=initialize()}','namespace N {export const answer=7};N.answer=3'])assert.match(lower(source).unsupported.join('\n'),/before initialization|readonly/);
});

import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
for(const [name,source,names]of [
 ['dotted namespace','namespace N.util {export function read(){return 3}}let value=N.util.read();value+=0',['value']],
 ['private lexical namespace','namespace N {namespace helper {export function read(){return 3}}export function read(){return helper.read()}}let value=N.read();value+=0',['value']],
 ['forward procedure','let value=N.read();namespace N {export function read(){return 7}}value+=0',['value']],
 ['forward literal constant','let value=-N.answer;namespace N {export const answer=7}value+=0',['value']],
 ['deferred function and initializer effects','let calls=0;function initialize(){calls++;return calls+6};function read(){return N.answer};namespace N {export const answer=initialize()};let value=read();value+=0',['value','calls']]
])test(name+' retains original values through Code/export/reimport and fresh SB3',async()=>{
 const expected=await runPxtArcade(source,{fakeClock:true});const runs=[];
 const check=run=>{for(const n of names)assert.equal(values(run)[n],expected[n],n);assert.deepEqual(run.errors,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:50,storage:true});runs.push(run);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files,{fakeClock:true});for(const n of names)assert.equal(original[`Game_${n}`],expected[n],n+' exported');await execute(arcadeToPseudocode(exported.files));
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,50);check(fresh);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
