import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';

// The bundled Creator supplies genuine stock prototypes/formal IDs and caller
// sockets. Until the supplier is adopted, add only the visible zero-input
// declaration to that actual project, then load its generated SB3 normally.
// This is native boundary coverage, not qualification of the new Code grammar.
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,variable.value]));
const finish=run=>{run.vm.stopAll();run.vm.quit();clearStrayTimers();};
async function fixture({route='stock',type='Number',physical='math_number',writer=false,unused=false,transport=null,protocol=true}={}){
 const invoke=route==='stock'?'CALL: (hold (20))':'set ignored to arcade call function "hold %s" arguments (arcade function argument (20) rest ("[]"))';
 const run=await runProgram(`DEVICE ARCADE\nGLOBAL entered\nGLOBAL observed\nGLOBAL after\nGLOBAL independent\nGLOBAL ignored\nSPRITE Game:\nWHEN flag clicked:\n  ${unused?'set ignored to 0':invoke}\n  change after by 1\nWHEN flag clicked:\n  change independent by 1\nDEFINE hold (value):\n  change entered by 1\n  set observed to value\n`,{frames:0});
 run.vm.stopAll();
 const project=run.creator.project,target=project.targets.find(target=>Object.values(target.blocks||{}).some(block=>block.opcode==='procedures_definition'));
 const blocks=target.blocks,definitions=Object.entries(blocks).filter(([,block])=>block.opcode==='procedures_definition');assert.equal(definitions.length,1);
 const [definitionId,definition]=definitions[0],prototype=blocks[definition.inputs.custom_block[1]],names=JSON.parse(prototype.mutation.argumentnames),ids=JSON.parse(prototype.mutation.argumentids),code=prototype.mutation.proccode;
 assert.equal(names.length,1);assert.equal(ids.length,1);assert.equal(blocks[prototype.inputs[ids[0]][1]].fields.VALUE[0],names[0]);
 const first=definition.next;assert.ok(first);blocks[first].parent='constraint';definition.next='constraint';
 blocks.constraint={opcode:'arcade_declareParameterConstraint',parent:definitionId,next:first,topLevel:false,shadow:false,inputs:{},fields:{PROCEDURE:[code,null],PARAMETER:[names[0],null],TYPE:[type,null]}};
 if(!unused){
  const callers=Object.entries(blocks).filter(([,block])=>block.opcode===(route==='stock'?'procedures_call':'arcade_functionArgument'));assert.equal(callers.length,1);
  const [callerId,caller]=callers[0],slot=route==='stock'?ids[0]:'VALUE';
  // Only the old expression owned by this exact input may be replaced.
  const old=caller.inputs[slot]?.[1];if(typeof old==='string'){assert.equal(blocks[old].parent,callerId);delete blocks[old];}
  blocks.actualInput={opcode:physical,parent:callerId,next:null,topLevel:false,shadow:physical!=='operator_equals',inputs:physical==='operator_equals'?{OPERAND1:[1,[10,'1']],OPERAND2:[1,[10,'1']]}:{},fields:physical==='math_number'?{NUM:['20',null]}:physical==='text'?{TEXT:['20',null]}:{}};
  caller.inputs[slot]=[physical==='operator_equals'?2:1,'actualInput'];
 }
 if(writer){
  blocks.constraint.next='badWriter';blocks[first].parent='badWriter';
  blocks.badWriter={opcode:'arcade_setLocal',parent:'constraint',next:first,fields:{},inputs:{NAME:[1,[10,names[0]]],VALUE:[1,[10,'20']]}};
 }
 if(transport!==null){
  assert.equal(route,'managed');const [id,call]=Object.entries(blocks).find(([,block])=>block.opcode==='arcade_callFunction');
  const remove=id=>{if(typeof id!=='string'||!blocks[id])return;const node=blocks[id];for(const input of Object.values(node.inputs||{}))remove(input[1]);delete blocks[id];};
  remove(call.inputs.ARGS[1]);blocks.transport={opcode:'text',parent:id,topLevel:false,shadow:true,next:null,inputs:{},fields:{TEXT:[transport,null]}};call.inputs.ARGS=[1,'transport'];
 }
 if(!protocol){definition.next=first;blocks[first].parent=definitionId;delete blocks.constraint;}
 const bytes=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());
 await run.vm.loadProject(bytes);run.errors.length=0;run.vm.greenFlag();
 run.binding={route,type,physical,definitionId,code,name:names[0],id:ids[0]};return run;
}

for(const route of ['stock','managed'])for(const [type,physical,expected]of [['Number','math_number',20],['String','text','20'],['Boolean','operator_equals',true],['Any','math_number',20]]){
 test(`registered ${route} entry preserves ${type} from actual ${physical}`,async t=>{
  let run;try{run=await fixture({route,type,physical});await stepFrames(run.vm,8);const actual=values(run);t.diagnostic(JSON.stringify({binding:run.binding,actual,errors:run.errors}));assert.deepEqual(run.errors,[]);assert.equal(actual.entered,1);assert.equal(actual.observed,expected);assert.equal(typeof actual.observed,typeof expected);assert.equal(actual.after,1);assert.equal(actual.independent,1);}
  finally{if(run)finish(run);}
 });
}
for(const route of ['stock','managed'])for(const [type,physical]of [['Number','text'],['String','math_number']]){
 test(`registered ${route} ${type} rejects ${physical} before body effects`,async t=>{
  let run;try{run=await fixture({route,type,physical});await stepFrames(run.vm,8);const actual=values(run);t.diagnostic(JSON.stringify({binding:run.binding,actual,errors:run.errors}));assert.equal(actual.entered,0);assert.equal(actual.after,0);assert.equal(actual.independent,1);assert.equal(run.errors.length,1);assert.match(run.errors[0],/Procedure parameter constraint/);assert.doesNotMatch(run.errors[0],/rejectConstraint.*not a function/);}
  finally{if(run)finish(run);}
 });
}
for(const route of ['stock','managed'])test(`registered ${route} checks an unused formal writer before entry`,async t=>{
 let run;try{run=await fixture({route,writer:true});await stepFrames(run.vm,8);const actual=values(run);t.diagnostic(JSON.stringify({binding:run.binding,actual,errors:run.errors}));assert.equal(actual.entered,0);assert.equal(actual.after,0);assert.equal(actual.independent,1);assert.equal(run.errors.length,1);assert.match(run.errors[0],/requires Number/);}
 finally{if(run)finish(run);}
});
test('unused constrained ordinary helper stays in the actual project without invented callers',async()=>{
 let run;try{run=await fixture({type:'String',unused:true});await stepFrames(run.vm,5);assert.deepEqual(run.errors,[]);assert.equal(values(run).entered,0);assert.equal(values(run).after,1);const current=JSON.parse(run.vm.toJSON());const declarations=current.targets.flatMap(target=>Object.values(target.blocks)).filter(block=>block.opcode==='arcade_declareParameterConstraint');assert.equal(declarations.length,1);assert.equal(declarations[0].fields.TYPE[0],'String');}
 finally{if(run)finish(run);}
});
test('no-protocol class constructors and methods retain their trusted synthetic dispatch',async()=>{
 let run;try{const imported=arcadeToPseudocode('class Box{value:number;constructor(){this.value=20}read(){return this.value}}let result=new Box().read();');assert.deepEqual(imported.unsupported,[]);run=await runProgram(imported.code,{frames:30});assert.deepEqual(run.errors,[]);assert.equal(values(run).result,20);}
 finally{if(run)finish(run);}
});

for(const transport of ['{','{}',JSON.stringify([{bwReference:{kind:'object',id:'foreign-object',scope:'foreign-runtime'}}])])test('constrained managed transport rejects once before effects: '+transport,async t=>{
 let run;try{run=await fixture({route:'managed',transport});await stepFrames(run.vm,8);const actual=values(run);t.diagnostic(JSON.stringify({transport,actual,errors:run.errors}));assert.equal(actual.entered,0);assert.equal(actual.after,0);assert.equal(actual.independent,1);assert.equal(run.errors.length,1);assert.match(run.errors[0],/constraint|foreign|reference|scope/i);await stepFrames(run.vm,4);assert.equal(run.errors.length,1,'failed continuation is retired, not retried');}
 finally{if(run)finish(run);}
});
for(const transport of ['{','{}'])test('unconstrained managed malformed transport retains existing fallback: '+transport,async()=>{
 let run;try{run=await fixture({route:'managed',transport,protocol:false});await stepFrames(run.vm,8);assert.deepEqual(run.errors,[]);assert.equal(values(run).entered,0);assert.equal(values(run).after,1);assert.equal(values(run).independent,1);}
 finally{if(run)finish(run);}
});
for(const route of ['stock','managed'])test('registered '+route+' Stop, restart and actual leaf reload renew invocation state',async()=>{
 let run;try{run=await fixture({route});await stepFrames(run.vm,8);assert.equal(values(run).observed,20);run.vm.stopAll();const stopped=values(run);await stepFrames(run.vm,4);assert.deepEqual(values(run),stopped);run.vm.greenFlag();await stepFrames(run.vm,8);assert.equal(values(run).entered,2);assert.equal(values(run).observed,20);assert.deepEqual(run.errors,[]);
 const project=JSON.parse(run.vm.toJSON()),target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_declareParameterConstraint'));assert.ok(target);
 const call=Object.values(target.blocks).find(block=>block.opcode===(route==='stock'?'procedures_call':'arcade_functionArgument'));assert.ok(call);
 const slot=call.inputs[route==='stock'?JSON.parse(call.mutation.argumentids)[0]:'VALUE'];
 if(Array.isArray(slot[1])){assert.equal(slot[1][0],4);assert.equal(slot[1][1],'20');slot[1][1]='30';}
 else{const leaf=target.blocks[slot[1]];assert.equal(leaf.opcode,'math_number');assert.equal(leaf.fields.NUM[0],'20');leaf.fields.NUM[0]='30';}run.creator.project=project;const bytes=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(bytes);run.errors.length=0;run.vm.greenFlag();await stepFrames(run.vm,8);assert.deepEqual(run.errors,[]);assert.equal(values(run).observed,30);assert.equal(values(run).entered,3);}
 finally{if(run)finish(run);}
});

test('registered callback mutates its actual constrained formal after the installer returns',async t=>{
 let run;try{
  const imported=arcadeToPseudocode('let observed=0;let ticks=0;function install(value:number){game.onUpdate(function(){if(ticks<2){value+=1;observed=value;ticks+=1}})}install(20);');assert.deepEqual(imported.unsupported,[]);
  run=await runProgram(imported.code,{frames:0});run.vm.stopAll();
  const target=run.creator.project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='procedures_definition'));assert.ok(target);
  const definitions=Object.entries(target.blocks).filter(([,block])=>block.opcode==='procedures_definition');assert.equal(definitions.length,1);
  const [id,definition]=definitions[0],prototype=target.blocks[definition.inputs.custom_block[1]],names=JSON.parse(prototype.mutation.argumentnames);assert.equal(names.length,1);
  const next=definition.next;definition.next='capturedConstraint';target.blocks[next].parent='capturedConstraint';
  target.blocks.capturedConstraint={opcode:'arcade_declareParameterConstraint',parent:id,next,topLevel:false,shadow:false,inputs:{},fields:{PROCEDURE:[prototype.mutation.proccode,null],PARAMETER:[names[0],null],TYPE:['Number',null]}};
  assert.ok(Object.values(target.blocks).some(block=>block.opcode==='arcade_setCaptured'),'actual captured write exists');
  const bytes=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());await run.vm.loadProject(bytes);run.errors.length=0;run.vm.greenFlag();await stepFrames(run.vm,8);
  const first=values(run);t.diagnostic(JSON.stringify({first,errors:run.errors}));assert.deepEqual(run.errors,[]);assert.equal(first.observed,22);assert.equal(first.ticks,2);
  run.vm.stopAll();await stepFrames(run.vm,4);assert.deepEqual(values(run),first);run.vm.greenFlag();await stepFrames(run.vm,8);assert.deepEqual(run.errors,[]);assert.equal(values(run).observed,22);assert.equal(values(run).ticks,2,'restart allocates and constrains a fresh formal cell');
 }finally{if(run)finish(run);}
});
