import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveArrayMapValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-array-map-values.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {readFileSync} from 'node:fs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers,stepFrames} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
test('actual primitive Array.map creates a fresh reference result and calls ordered inline values',async()=>{
 const imported=arcadeToPseudocode('let input=[1,2];let result=input.map((value,index)=>value+index+1);let first=result[0];let second=result[1];let same=input===result;');
 assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:30});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));const get=name=>BW.decode(vars.find(v=>v.name===name)?.value);assert.equal(get('first'),2);assert.equal(get('second'),4);assert.equal(get('same'),false);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

const matrix=readFileSync(new URL('./fixtures/arcade/array-map-semantic-matrix.ts',import.meta.url),'utf8');
const expected=JSON.parse(readFileSync(new URL('./fixtures/arcade/array-map-semantic-matrix.json',import.meta.url),'utf8'));
assert.equal(Object.keys(expected).length,69,'retain the complete measured primitive matrix');
const snapshot=run=>{const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));return Object.fromEntries(Object.keys(expected).map(name=>[name,BW.decode(vars.find(v=>v.name===name)?.value)]));};
test('twelve selected primitive Map cases preserve current indexed reads and identity through portable routes',async()=>{
 const imported=arcadeToPseudocode(matrix);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(snapshot(run),expected);};
 try{
  const first=await runProgram(imported.code,{frames:200});runs.push(first);check(first);
  const project=JSON.parse(first.vm.toJSON());
  const code=await runProgram(first.creator.decompile(project),{frames:200});runs.push(code);check(code);
  const saved=Buffer.from(await first.vm.saveProjectSb3().then(blob=>blob.arrayBuffer()));
  await first.vm.loadProject(saved);first.vm.greenFlag();await stepFrames(first.vm,200);check(first);
  const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:1});runs.push(fresh);
  await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,200);check(fresh);
  const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);
  const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);
  const replay=await runProgram(reimport.code,{frames:200});runs.push(replay);check(replay);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('Map requires actual Array producers, complete primitive results and compatible current lexical writers',()=>{
 const negatives=[
  'let input:any[];let output=input.map(value=>value);input=[1];',
  'let input:any=[1];input="bad";let output=input.map(value=>value);',
  'let input=[1];let alias=input;alias=image.create(1,1);let output=alias.map(value=>value);',
  'function get(input:any[]){return input.map(value=>value)}let output=get();',
  'function get(input:any[],input:any[]){return input.map(value=>value)}let output=get([1],[2]);',
  'function get(){return [1]}get=other;let output=get().map(value=>value);',
  'function get(){return [1]}function get(){return [2]}let output=get().map(value=>value);',
  'let input=[1];let input=[2];let output=input.map(value=>value);',
  'let input=[1];input[0]=image.create(1,1);let output=input.map(value=>value);',
  'function pass(input:number[]){return input}let output=pass(["bad"]).map(()=>1);',
  'let input:number[]=["bad"];let output=input.map(()=>1);',
  'let input:number[]=[1];let alias=input;alias[0]="bad";let output=input.map(()=>1);',
  'let input=[1];foreign(input);let output=input.map(value=>value);',
  'let input=[1];foreign(input);let output=input.map(()=>1);',
  'let input:any=[1];input.map=other;let output=input.map(()=>1);',
  'let input:any=[1];let key=unknown;input[key]=other;let output=input.map(()=>1);',
  'let input=[1];input.unknown();let output=input.map(value=>value);',
  'let input=[1];let output=input.map(value=>[value]);',
  'let input=[1];let output=input.map(()=>typeof unknownValue);',
  'let input=[1];let output=input.map(value=>image.create(1,1));',
  'let input=[1];let output=input.map((value,value)=>value);',
  'let input=[1];let output=input.map((value=1)=>value);',
  'let input=[1];let output=input.map((value:string)=>value);',
  'let input=[1];let output=input.map(function(value):number{return "bad"});',
  'let input=[1];let output=input.map(value=>{if(value)return 1;return 2});',
  'let input=[1];let handler=value=>value;let output=input.map(handler);',
  'let input=[1];let output=input.map(value=>{let local=1;let local=2;return local});',
  'let input=[1];let output=input.map(value=>{let before=local;let local:number=1;return before});',
  'let input=[1];let output=input.map((value:number)=>{value="bad";return 1});'
 ];
 assert.ok(negatives.length>=20);
 for(const source of negatives){const imported=arcadeToPseudocode(source);assert.ok(imported.unsupported.some(text=>text.startsWith('Array.map:')),source+JSON.stringify(imported.unsupported));}
 for(const source of [
  'let input=[1];let alias=input;let output=alias.map(value=>value+1);',
  'function get(input:any[]){return input}let output=get([1]).map(value=>value+1);',
  'let output=[].map(()=>7);',
  'let input=[1];let output=input.map((value,index)=>{input[index]=value;return value});',
  'let output=[1].map(()=>undefined);',
  'let output=[1].map(function(value:number,index:number):number{return value+index});'
 ])assert.deepEqual(arcadeToPseudocode(source).unsupported,[],source);
});

test('statement Map preserves its qualified callback effects without emitting an unsupported result read',async()=>{
 const imported=arcadeToPseudocode('let values=[1,2];let count=0;values.map(value=>{count+=value;values.push(9)});');
 assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:40});assert.deepEqual(run.errors,[]);const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));assert.equal(BW.decode(vars.find(v=>v.name==='count').value),3);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('current physical callback edit controls Code and exported source instead of restoring original Map text',async()=>{
 const imported=arcadeToPseudocode('let input=[1,2];let output=input.map(value=>value+10);let first=output[0];let second=output[1];');
 assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));assert.equal(BW.decode(vars.find(v=>v.name==='first').value),21);assert.equal(BW.decode(vars.find(v=>v.name==='second').value),22);};
 try{
  const original=await runProgram(imported.code,{frames:40});runs.push(original);const project=JSON.parse(original.vm.toJSON());
  const leaves=[];const visit=value=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){if(value[0]===4&&String(value[1])==='10')leaves.push(value);else value.forEach(visit);}else Object.values(value).forEach(visit);};for(const target of project.targets)for(const block of Object.values(target.blocks))visit(block.inputs);assert.equal(leaves.length,1);leaves[0][1]='20';
  const code=await runProgram(original.creator.decompile(project),{frames:40});runs.push(code);check(code);
  const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);
  const replay=await runProgram(reimport.code,{frames:40});runs.push(replay);check(replay);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('Map result aliases retain live array identity while restart and foreign runtimes reject old references',async()=>{
 const imported=arcadeToPseudocode('let source=[1];let output=source.map(value=>value+1);let alias=output;alias[0]=9;');
 assert.deepEqual(imported.unsupported,[]);const runs=[];
 try{
  const run=await runProgram(imported.code,{frames:30});runs.push(run);
  const variable=name=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name);
  const old=variable('output').value,alias=variable('alias').value;
  assert.equal(BW.equal(old,alias),true);assert.deepEqual(BW.arrayValue(run.vm.runtime,old),[9]);
  const foreign=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:1});runs.push(foreign);
  assert.equal(BW.arrayValue(foreign.vm.runtime,old),undefined);
  run.vm.stopAll();run.vm.greenFlag();await stepFrames(run.vm,30);
  assert.deepEqual(run.errors,[]);assert.equal(BW.arrayValue(run.vm.runtime,old),undefined);
  assert.deepEqual(BW.arrayValue(run.vm.runtime,variable('output').value),[9]);
  assert.equal(BW.equal(old,variable('output').value),false);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('primitive null, Undefined, text and declared local defaults remain real values',async()=>{
 const imported=arcadeToPseudocode('let numbers=[1];let texts=numbers.map(value=>"value:"+value);let nulls=numbers.map(()=>null);let missings=numbers.map(()=>undefined);let locals=numbers.map(value=>{let local:number;return local});let text=texts[0];let nil=nulls[0]===null;let missing=missings[0]===undefined;let localMissing=locals[0]===undefined;let notText=missings[0]!=="undefined";');
 assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:40});assert.deepEqual(run.errors,[]);const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));const get=name=>BW.decode(vars.find(v=>v.name===name)?.value);assert.equal(get('text'),'value:1');for(const name of ['nil','missing','localMissing','notText'])assert.equal(get(name),true,name);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('Map callback control proof refuses actual structured controls and future exceptional AST spellings',()=>{
 for(const source of [
  'let input=[1];let output=input.map(value=>{switch(value){case 1:value=2;break;default:value=3;}return value});',
  'let input=[1];let output=input.map(value=>{do{value+=1}while(value<2);return value});'
 ])assert.ok(arcadeToPseudocode(source).unsupported.some(text=>text.startsWith('Array.map:')),source);
 const kinds=['ThrowStatement','Throw','ForIn','DoWhile','Switch','Break','Continue','Try','TryStatement'];
 assert.equal(kinds.length,9);
 for(const type of kinds){
  const program=parseMakeCodeTs('let input=[1];let output=input.map(value=>value+1);');
  const callback=program.body[1].decls[0].init.args[0];
  callback.body.unshift({type,argument:{type:'String',value:'actual exceptional operand'},body:[]});
  const before=JSON.stringify(program),proof=proveArrayMapValues(program);
  assert.ok(proof.unsupported.some(text=>/complete body/.test(text)),type);
  assert.equal(JSON.stringify(program),before,'analysis must not rewrite '+type);
 }
});

test('actual Array method and unproved computed updates poison Map authority, while numeric element updates remain supported',()=>{
 for(const source of [
  'let a:any=[1];a.map++;let b=a.map(()=>1);',
  'let a:any=[1];let key=unknown;a[key]++;let b=a.map(()=>1);',
  'let a:any=[1];a["map"]++;let b=a.map(()=>1);',
  'let a:any=["1"];a[0]++;let b=a.map((value:string)=>value);',
  'let a:string[]=["1"];a[0]++;let b=a.map(value=>value);',
  'let a:any=[image.create(1,1)];a[0]++;let b=a.map(()=>1);'
 ])assert.ok(arcadeToPseudocode(source).unsupported.some(text=>text.startsWith('Array.map:')),source);
 assert.deepEqual(arcadeToPseudocode('let a=[1];a[0]++;let b=a.map(value=>value);').unsupported,[]);
});
