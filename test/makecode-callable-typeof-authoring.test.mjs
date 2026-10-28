import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveClassCallableSource,classCallableReflectionSource} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {source as classSource} from './fixtures/arcade-class-callable-source.mjs';
const counter='function make(initial:number):()=>number{let n=initial;return()=>{n+=1;return n}}let first=make(2);let alias=first;let a=first();';
const nested='class Reader {next:()=>number;read:()=>string;constructor(){this.next=()=>3;this.read=()=>typeof this.next}}let reader=new Reader();let reflected=reader.read();';
const label='class Holder {read:()=>number;constructor(){this.read=()=>3}}let holder=new Holder();let n=holder.read();';
const read=(run,name)=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name)?.value;
const check=(run,expected)=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.equal(read(run,'reflected'),expected);};
test('owned callable typeof retains action and label results across Code fresh SB3 export and reimport',async()=>{
 for(const [source,expected]of [[counter+'let reflected=typeof first;','object'],[classSource+'let reflected=typeof holder.read;','object'],[label+'let reflected=typeof holder.read;','function'],[nested,'function']]){
  const runs=[];try{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:30});runs.push(run);check(run,expected);
   const project=JSON.parse(run.vm.toJSON());const code=run.creator.decompile(project);const replay=await runProgram(code,{frames:30});runs.push(replay);check(replay,expected);
   const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,30);check(run,expected);
   const fresh=await runProgram(imported.code,{frames:0});runs.push(fresh);await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,30);check(fresh,expected);
   const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.files['main.ts'],/typeof/);const back=arcadeToPseudocode(exported.files);assert.deepEqual(back.unsupported,[]);const native=await runProgram(back.code,{frames:30});runs.push(native);check(native,expected);
  }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
 }
});
test('callable reflection source refuses every wrong writer missing producer and named reference',()=>{
 for(const tail of ['first=5;let reflected=typeof first;','let reflected=typeof first;first=5;','first=unknown;let reflected=typeof first;','let other:()=>number;let reflected=typeof other;','let reflected=typeof make;','make=unknown;let reflected=typeof first;','let other=first;other=unknown;let reflected=typeof other;'])assert.ok(arcadeToPseudocode(counter+tail).unsupported.length,tail);
 for(const tail of ['let input=2;input="bad";let chosen=make(input);let reflected=typeof chosen;','let input:number;let chosen=make(input);let reflected=typeof chosen;','let later:()=>number;let reflected=typeof later;later=make(2);','let later:()=>number;let copy=later;later=make(2);let reflected=typeof copy;','let later:()=>number;later=make(2);later=undefined;let reflected=typeof later;'])assert.ok(arcadeToPseudocode(counter+tail).unsupported.length,tail);
 assert.deepEqual(arcadeToPseudocode(counter+'let later:()=>number;later=make(2);let reflected=typeof later;').unsupported,[]);
 assert.ok(arcadeToPseudocode(classSource+'holder.read=unknown;let reflected=typeof holder.read;').unsupported.length);
 assert.ok(arcadeToPseudocode(classSource+'let reflected=typeof holder.apply;').unsupported.length);
});
test('current callable typeof export proves all writers and concrete alias anchors',async()=>{
 const imported=arcadeToPseudocode(counter+'let reflected=typeof first;');assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:20});
 try{const project=JSON.parse(run.vm.toJSON());const target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_sourceTypeOf'));const reporter=Object.values(target.blocks).find(b=>b.opcode==='arcade_sourceTypeOf');
 const first=project.targets.flatMap(t=>Object.entries(t.variables)).find(([,v])=>v[0]==='first')[0],alias=project.targets.flatMap(t=>Object.entries(t.variables)).find(([,v])=>v[0]==='alias')[0];
 const writer=Object.values(target.blocks).find(b=>b.opcode==='data_setvariableto'&&b.fields.VARIABLE[1]===first);
 const bad=structuredClone(project),badTarget=bad.targets.find(t=>t.name===target.name),badWriter=Object.values(badTarget.blocks).find(b=>b.opcode==='data_setvariableto'&&b.fields.VARIABLE[1]===first);badWriter.inputs.VALUE=[1,[10,'not a callback']];assert.ok(projectToArcade(bad).unsupported.length);
 const cyclic=structuredClone(project),cycleTarget=cyclic.targets.find(t=>t.name===target.name),cycleWriter=Object.values(cycleTarget.blocks).find(b=>b.opcode==='data_setvariableto'&&b.fields.VARIABLE[1]===first);cycleWriter.inputs.VALUE=[3,[12,'alias',alias],[10,'']];assert.ok(projectToArcade(cyclic).unsupported.length);
 const loose=structuredClone(project),looseTarget=loose.targets.find(t=>t.name===target.name);looseTarget.blocks.foreign={opcode:'data_setvariableto',parent:null,next:null,topLevel:true,inputs:{VALUE:[1,[10,'bad']]},fields:{VARIABLE:['first',first]}};assert.ok(projectToArcade(loose).unsupported.length);
 const unused=structuredClone(project),unusedTarget=unused.targets.find(t=>t.name===target.name);const setter=Object.values(unusedTarget.blocks).find(b=>b.opcode==='arcade_setCaptured');const definition=unusedTarget.blocks[setter.parent];const returned=unusedTarget.blocks[setter.next];definition.next=setter.next;returned.parent=setter.parent;returned.inputs.VALUE=[1,[4,'3']];assert.ok(projectToArcade(unused).unsupported.length,'dropping the last capture use cannot export an action as a label');
 const extra=structuredClone(project),extraTarget=extra.targets.find(t=>t.name===target.name);Object.values(extraTarget.blocks).find(b=>b.opcode==='arcade_sourceTypeOf').inputs.FOREIGN=[1,[4,'1']];assert.ok(projectToArcade(extra).unsupported.length);
 const editedBody=structuredClone(project),bodyTarget=editedBody.targets.find(t=>t.name===target.name);const bodySetter=Object.values(bodyTarget.blocks).find(b=>b.opcode==='arcade_setCaptured');const replace=id=>{const block=bodyTarget.blocks[id];for(const input of Object.values(block.inputs||{}))for(const value of input.slice(1)){if(typeof value==='string')replace(value);else if(Array.isArray(value)&&value[0]===4&&value[1]==='1')value[1]='7';}};replace(bodySetter.inputs.VALUE[1]);const bodyExport=projectToArcade(editedBody);assert.deepEqual(bodyExport.unsupported,[]);const bodyBack=arcadeToPseudocode(bodyExport.files);assert.deepEqual(bodyBack.unsupported,[]);const bodyRun=await runProgram(bodyBack.code,{frames:20});try{check(bodyRun,'object');assert.equal(read(bodyRun,'a'),9);}finally{bodyRun.vm.stopAll();bodyRun.vm.quit();}
 const primitive=structuredClone(project),primitiveTarget=primitive.targets.find(t=>t.name===target.name),primitiveReporter=Object.values(primitiveTarget.blocks).find(b=>b.opcode==='arcade_sourceTypeOf');primitiveReporter.inputs.VALUE=[1,[10,'first']];const exp=projectToArcade(primitive);assert.deepEqual(exp.unsupported,[]);const back=arcadeToPseudocode(exp.files);assert.deepEqual(back.unsupported,[]);const edited=await runProgram(back.code,{frames:20});try{check(edited,'string');}finally{edited.vm.stopAll();edited.vm.quit();}
 }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('class reflection proof is private current source authority and never invokes an unvisited body',()=>{
 const source='class Holder {read:()=>number;constructor(){this.read=()=>3}}let holder=new Holder();let reflected=typeof holder.read;';
 const parsed=parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});const proof=proveClassCallableSource(parsed);assert.equal(proof.eligible,true);const expression=parsed.body.at(-1).decls[0].init;assert.equal(classCallableReflectionSource(proof,parsed,expression),true);assert.throws(()=>classCallableReflectionSource({eligible:true},parsed,expression),/actual unchanged source proof/);
 parsed.body.at(-1).decls[0].name='changed';assert.throws(()=>classCallableReflectionSource(proof,parsed,expression),/actual unchanged source proof/);
 assert.ok(arcadeToPseudocode(source.replace('()=>3','()=>{this.read=()=>4;return 3}')).unsupported.length,'an effectful uninvoked callback cannot be qualified by running its body');
});
