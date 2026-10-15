import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers,stepFrames} from './helpers/bw-vm.mjs';
import {createRequire} from 'node:module';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values.js'),exceptions=require(VM_SRC+'/util/bw-arcade-exceptions.js');
const options={procedureConstraintsPrototype:true},value=(run,name)=>BW.decode(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name===name)?.value);
const prefixCount=run=>run.vm.runtime.targets.flatMap(target=>Object.values(target.blocks._blocks)).filter(block=>block.opcode==='arcade_declareParameterConstraint').length;
test('unused String helper retains declaration and exported source annotation through portable routes',async()=>{
 const source='function holdText(thisText:string){game.showLongText(thisText,DialogLayout.Full)}let ready=1;';const imported=arcadeToPseudocode(source,options);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);assert.equal(value(run,'ready'),1);assert.equal(prefixCount(run),1);const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);const owner=run.vm.runtime.targets.find(target=>Object.values(target.blocks._blocks).some(block=>block.opcode==='arcade_declareParameterConstraint'));const declaration=Object.values(owner.blocks._blocks).find(block=>block.opcode==='arcade_declareParameterConstraint');const proccode=declaration.fields.PROCEDURE.value;assert.ok(proccode.endsWith('holdText %s'));const emitted=owner.getName()+'_'+proccode.slice(0,-3);assert.match(exported.ts,new RegExp('function '+emitted+'\\s*\\(thisText:\\s*string\\)'));const reimport=arcadeToPseudocode(exported.files,options);assert.deepEqual(reimport.unsupported,[]);assert.ok(reimport.code.includes('declare arcade procedure '+JSON.stringify(emitted+' %s')+' parameter "thisText" as String'));return reimport;};
 try{
  const first=await runProgram(imported.code,{frames:8});runs.push(first);check(first);
  const code=await runProgram(first.creator.decompile(JSON.parse(first.vm.toJSON())),{frames:8});runs.push(code);check(code);
  const bytes=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());first.vm.stopAll();await first.vm.loadProject(bytes);first.vm.greenFlag();await stepFrames(first.vm,8);check(first);
  const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,8);const reimport=check(fresh);
  const replay=await runProgram(reimport.code,{frames:8});runs.push(replay);check(replay);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('actual primitive argument domains survive source constraint declarations',async()=>{
 const imported=arcadeToPseudocode('function keepNumber(value:number){return value}function keepString(value:string){return value}function keepBoolean(value:boolean){return value}function keepAny(value:any){return value}let n=keepNumber(20);let s=keepString("20");let b=keepBoolean(false);let a=keepAny(20);',options);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:30});assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);assert.equal(prefixCount(run),4);assert.equal(value(run,'n'),20);assert.equal(value(run,'s'),'20');assert.equal(value(run,'b'),false);assert.equal(value(run,'a'),20);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('namespace and translated parameter names bind actual ordered prototype formals',async()=>{
 const imported=arcadeToPseudocode('namespace TextHelpers{export function hold(answer:string){return answer}}let result=TextHelpers.hold("20");',options);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:20});assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);assert.equal(prefixCount(run),1);assert.equal(value(run,'result'),'20');const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);const reimport=arcadeToPseudocode(exported.files,options);assert.deepEqual(reimport.unsupported,[]);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('ordinary required Number constraint and actual Throw preserve primitive failure and earlier effects',async()=>{
 const imported=arcadeToPseudocode('let entered=0;let after=0;function fail(value:number){entered=1;throw value}fail(20);after=1;',{...options,throwPrototype:true});assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:0});const signals=[];run.vm.runtime.on('BLOCKS_ERROR',error=>signals.push(error));await stepFrames(run.vm,10);assert.deepEqual(run.creator.warnings,[]);assert.equal(prefixCount(run),1);assert.equal(value(run,'entered'),1);assert.equal(value(run,'after'),0);assert.equal(signals.length,1);assert.equal(exceptions.diagnostic(run.vm.runtime,signals[0]).value,20);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('current Text writer into a retained Number formal is a named export constraint refusal',async()=>{
 const imported=arcadeToPseudocode('function keep(value:number){return value}let result=keep(20);',options);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:0});run.vm.stopAll();const project=JSON.parse(run.vm.toJSON());const target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_callFunction'));const call=Object.values(target.blocks).find(block=>block.opcode==='arcade_callFunction');const argument=target.blocks[call.inputs.ARGS[1]];assert.equal(argument.opcode,'arcade_functionArgument');const old=argument.inputs.VALUE[1];if(typeof old==='string'){target.blocks[old].parent=null;target.blocks[old].topLevel=true;}argument.inputs.VALUE=[1,[10,'20']];const exported=projectToArcade(project);assert.ok(exported.unsupported.some(message=>/Procedure parameter constraint/.test(message)),JSON.stringify(exported.unsupported));}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('handle-based source renderer preserves actual primitive procedure metadata',async()=>{
 const imported=arcadeToPseudocode('function keep(value:number){return value+1}let sprite=sprites.create(img`1`,SpriteKind.Player);let result=keep(20);',options);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/declare arcade procedure "keep %s" parameter "value" as Number/);let run;
 try{run=await runProgram(imported.code,{frames:30});assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);assert.equal(prefixCount(run),1);assert.equal(value(run,'result'),21);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
