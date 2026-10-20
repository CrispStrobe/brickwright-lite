import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import {lowerObjectClasses} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-object-classes.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const scalar=`let trace="";function mark(t:string){trace+=t;return t}
//% whenUsed
const dead=mark("D")
//% whenUsed
const live=mark("L")
function unused(){return dead}
let value=live;trace+=""`;
const accessor=`let trace="";function mark(t:string){trace+=t;return t}
//% whenUsed
const dead=mark("D")
//% whenUsed
const readData=mark("R")
//% whenUsed
const writeData=mark("W")
class Box {get text():string{return readData} set text(value:string){trace+=writeData+value}}
let box=new Box();let value=box.text;box.text="!";trace+=""`;
const virtualHeader=`let trace="";function mark(t:string){trace+=t;return t}
//% whenUsed
const baseUsed=mark("B")
//% whenUsed
const derivedUsed=mark("D")
//% whenUsed
const dead=mark("X")`;
const method=virtualHeader+`
class Base {read():string{return baseUsed}}
class Derived extends Base {read():string{return derivedUsed}}
let box:Base=new Derived();let value=box.read();trace+=""`;
const getter=virtualHeader+`
class Base {get text():string{return baseUsed}}
class Derived extends Base {get text():string{return derivedUsed}}
let box:Base=new Derived();let value=box.text;trace+=""`;
const cases=[{source:scalar,expected:{trace:'L',value:'L'}},{source:accessor,expected:{trace:'RWW!',value:'R'}},
 // These unchanged initial source traces were separately observed in selected
 // PXT; current source changes need a fresh exported-original comparison.
 {source:method,expected:{trace:'BD',value:'D'},retainedOriginal:true},
 {source:getter,expected:{trace:'BD',value:'D'},retainedOriginal:true}];
let compilation=0;
const observeCompilation=process.env.BW_ARCADE_TEST_EVIDENCE_DIR?value=>{
 const dir=process.env.BW_ARCADE_TEST_EVIDENCE_DIR;fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,`whenused-compilation-${++compilation}.json`),JSON.stringify(value)+'\n',{flag:'wx'});
}:null;
const values=vm=>Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function exercise(imported,expected){
 assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const[k,v]of Object.entries(expected))assert.equal(values(run.vm)[k],v,k);};
 try{
  const run=await runProgram(imported.code,{frames:3,storage:true});runs.push(run);check(run);
  const code=await runProgram(run.creator.decompile(),{frames:3,storage:true});runs.push(code);check(code);
  const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,3);check(run);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,3);check(fresh);
  return projectToArcade(run.creator.project);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
}
test('whenUsed emitted prefixes share a unique scalar group and unused constructors have no effects',()=>{
 const source=`class Box {constructor(public n:number){}}
//% whenUsed
const dead=new Box(1)
//% whenUsed
const live=new Box(2)
let value=live.n`;
 const ast=parseMakeCodeTs(source,{retainWhenUsed:true,retainClassHeritage:true}),before=structuredClone(ast),staged=lowerPxtStagedValues(ast);
 assert.deepEqual(ast,before);const declarations=staged.body.filter(n=>n.type==='Declaration').flatMap(n=>n.decls).filter(d=>d.whenUsed);
 assert.equal(declarations.length,2);assert.notEqual(declarations[0].bwPxtWhenUsedGroup,declarations[1].bwPxtWhenUsedGroup);
 const lowered=lowerObjectClasses(staged);assert.deepEqual(lowered.unsupported,[]);
 assert.equal(lowered.program.body.some(n=>n.bwPxtWhenUsedGroup===declarations[0].bwPxtWhenUsedGroup),false);
 assert.equal(lowered.program.body.some(n=>n.bwPxtWhenUsedGroup===declarations[1].bwPxtWhenUsedGroup),true);
 assert.ok(declarations.every(d=>typeof d.bwPxtWhenUsedGroup==='string'));
});
test('whenUsed scalar and accessor dependencies retain native Code and saved-project order',async()=>{
 for(const item of cases)assert.deepEqual((await exercise(arcadeToPseudocode(item.source),item.expected)).unsupported,[]);
});
test('whenUsed reachability respects lexical call shadows and unused override tables',()=>{
 const shadow=`let trace="";function mark(t:string){trace+=t;return t}
//% whenUsed
const dead=mark("D")
function read(){return dead}
function call(read:number){return read+1}
let value=call(2)`;
 const unusedOverride=virtualHeader+`
class Base {read():string{return baseUsed}}
class Derived extends Base {read():string{return derivedUsed}}
let box=new Base();let value=box.read()`;
 for(const [source,expected]of [[shadow,[]],[unusedOverride,['baseUsed']]]){
  const parsed=parseMakeCodeTs(source,{retainWhenUsed:true,retainClassHeritage:true});
  const lowered=lowerObjectClasses(lowerPxtStagedValues(parsed));
  assert.deepEqual(lowered.unsupported,[]);
  const retained=lowered.program.body.filter(n=>n.type==='Declaration').flatMap(n=>n.decls)
   .filter(d=>d.whenUsed).map(d=>d.name);
  assert.deepEqual(retained,expected);
 }
});
test('whenUsed scalar and accessor dependencies match selected original source and exported execution',async()=>{
 for(const item of cases){
  if(!item.retainedOriginal){const original=await runPxtArcade(item.source,{fakeClock:true,onCompilation:observeCompilation});for(const[k,v]of Object.entries(item.expected))assert.equal(original[k],v,'original source '+k);}
  const exported=await exercise(arcadeToPseudocode(item.source),item.expected);assert.deepEqual(exported.unsupported,[]);
  const result=await runPxtArcade(exported.files,{fakeClock:true,onCompilation:observeCompilation});const normalized=Object.fromEntries(Object.entries(result).map(([k,v])=>[k.replace(/^(?:Game_)+/,''),v]));
  for(const[k,v]of Object.entries(item.expected))assert.equal(normalized[k],v,'original export '+k);
  await exercise(arcadeToPseudocode(exported.files),item.expected);
 }
});
