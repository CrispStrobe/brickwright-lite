import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers,quitStrandedVMs} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values'),dispatch=require(VM_SRC+'/dispatch/central-dispatch');
// Wait for a later real frame so a constant-zero replacement cannot pass.
const source='let ticks=0;let entered=0;let seen=0;let after=0;function receive(value:number){entered+=1;seen=value;}game.onPaint(function(){ticks++;if(ticks===3){receive(game.eventContext().deltaTime);after=1;}});';
const convert=input=>{const result=arcadeToPseudocode(input);assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);return result.code;};
const child=(blocks,node,name)=>{const value=node.inputs?.[name]?.[1];return typeof value==='string'?blocks[value]:value;};
const literal=(blocks,node)=>{
 if(Array.isArray(node))return [4,5,6,7,8,10].includes(node[0])?node[1]:undefined;
 if(node?.opcode==='math_number')return node.fields.NUM[0];
 if(node?.opcode==='operator_add'&&Number(literal(blocks,child(blocks,node,'NUM1')))===0)return literal(blocks,child(blocks,node,'NUM2'));
 return undefined;
};
const only=(rows,label)=>{assert.equal(rows.length,1,label);return rows[0];};
// Identify the effect cells from actual writer/formal edges. Renamed variables
// after export/reimport cannot change the oracle by merely keeping a name.
const roles=project=>{
 const target=only(project.targets.filter(t=>Object.values(t.blocks||{}).some(n=>n.opcode==='procedures_definition')),'one procedure target'),blocks=target.blocks,all=Object.values(blocks);
 const definition=only(all.filter(n=>n.opcode==='procedures_definition'),'one definition'),body=[];let node=blocks[definition.next];const seen=new Set();
 while(node){assert.equal(seen.has(node),false);seen.add(node);body.push(node);node=blocks[node.next];}
 const contract=only(body.filter(n=>n.opcode==='arcade_declareParameterConstraint'),'actual formal contract');assert.equal(contract.fields.TYPE[0],'Number');
 const assignment=only(body.filter(n=>n.opcode==='data_setvariableto'&&child(blocks,n,'VALUE')?.opcode==='arcade_getLocal'),'actual formal result writer');
 const increment=only(body.filter(n=>{
  const value=child(blocks,n,'VALUE'),left=value?.opcode==='arrays_valueBinary'&&child(blocks,value,'LEFT');
  return n.opcode==='data_setvariableto'&&value?.fields?.OP?.[0]==='+'&&Array.isArray(left)&&left[0]===12&&left[2]===n.fields.VARIABLE[1]&&Number(literal(blocks,child(blocks,value,'RIGHT')))===1;
 }),'actual constrained effect increment');
 assert.deepEqual(body,[contract,increment,assignment]);
 const after=only(all.filter(n=>n.opcode==='data_setvariableto'&&Number(literal(blocks,child(blocks,n,'VALUE')))===1),'actual continuation effect');
 assert.equal(all.filter(n=>n.opcode==='arcade_frameDeltaTime').length,1);
 return {entered:increment.fields.VARIABLE[1],seen:assignment.fields.VARIABLE[1],after:after.fields.VARIABLE[1]};
};
const values=run=>{
 const ids=roles(JSON.parse(run.vm.toJSON())),out={};
 for(const [role,id]of Object.entries(ids)){const variable=only(run.vm.runtime.targets.flatMap(target=>Object.hasOwn(target.variables,id)?[target.variables[id]]:[]),'actual '+role+' variable');out[role]=BW.decode(variable.value);}
 return out;
};
const accepted=run=>{
 for(const name of ['errors','warnings','unparsed'])assert.deepEqual(run.creator[name],[]);
 assert.deepEqual(run.errors,[]);const actual=values(run);assert.equal(actual.entered,1);assert.equal(actual.after,1);assert.equal(typeof actual.seen,'number');assert.equal(Number.isFinite(actual.seen),true);assert.ok(actual.seen>0,'a later actual frame supplies a nonzero delta');assert.equal(run.calls.get('arcade_frameDeltaTime'),1);
 const frames=run.vm.runtime.targets.flatMap(target=>Object.values(target.blocks._blocks).filter(node=>node.opcode==='arcade_frameDeltaTime').map(node=>({target,node}))),frame=only(frames,'one actual frame expression');
 const cached=frame.target.blocks._cache._executeCached[frame.node.id];assert.ok(cached);assert.equal(cached._blockFunction,run.vm.runtime.getOpcodeFunction('arcade_frameDeltaTime'));assert.ok(cached._parentValues);const completed=Object.getOwnPropertyDescriptor(cached._parentValues,cached._parentKey);assert.ok(completed&&Object.hasOwn(completed,'value'));assert.equal(Object.is(actual.seen,completed.value),true,'the callee stores the actual completed frame expression, unchanged');
};
const instance=run=>{const service=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[service];assert.equal(adapter._inst._runtime,run.vm.runtime);return {adapter,ext:adapter._inst};};
const finish=(run,expected=[],primary=null)=>{
 const failures=[];
 for(const [name,action]of [...(run?[['stop',()=>run.vm.stopAll()],['clear',()=>run.vm.clear()],['quit',()=>run.vm.quit()]]:[]),['stranded',quitStrandedVMs],['timers',clearStrayTimers]])try{action();}catch(error){failures.push({name,message:error.message});}
 if(run)try{assert.deepEqual(run.errors,expected,'cleanup preserves the actual error channel');}catch(error){failures.push({name:'error channel',message:error.message});}
 if(failures.length){if(primary)process.stderr.write(JSON.stringify({kind:'secondary frame cleanup failure',failures})+'\n');else assert.deepEqual(failures,[]);}
};
test('a real later-frame Number caller survives current Code, same/fresh SB3 and saved export/reimport',async()=>{
 let run,primary=null;
 try{
  run=await runProgram(convert(source),{frames:12});accepted(run);
  const project=JSON.parse(run.vm.toJSON()),code=run.creator.decompile(project),bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  run.vm.stopAll();await run.vm.loadProject(bytes);run.calls.clear();run.vm.greenFlag();await stepFrames(run.vm,12);accepted(run);finish(run);run=null;
  run=await runProgram(code,{frames:12});accepted(run);finish(run);run=null;
  run=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});run.vm.stopAll();await run.vm.loadProject(bytes);run.calls.clear();run.vm.greenFlag();await stepFrames(run.vm,12);accepted(run);finish(run);run=null;
  const exported=projectJsonToArcade(JSON.stringify(project));assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.match(exported.ts,/game\.eventContext\(\)\.deltaTime/);
  run=await runProgram(convert(exported.files),{frames:12});accepted(run);
 }catch(error){primary=error;throw error;}finally{finish(run,[],primary);}
});
for(const mode of ['registered function','source method','adapter delegate','metadata function','metadata arguments'])test('actual frame Number execution refuses '+mode+' before constrained effects',async()=>{
 let run,restore=()=>{},expected=[],primary=null;
 try{
  run=await runProgram(convert(source),{frames:12});accepted(run);run.vm.stopAll();run.calls.clear();run.vm.greenFlag();const runtime=run.vm.runtime,{adapter,ext}=instance(run);
  if(mode==='registered function'){const old=runtime._primitives.arcade_frameDeltaTime;runtime._primitives.arcade_frameDeltaTime=()=>42;restore=()=>{runtime._primitives.arcade_frameDeltaTime=old;};}
  if(mode==='source method'){const old=Object.getOwnPropertyDescriptor(ext,'frameDeltaTime');assert.equal(old,undefined);Object.defineProperty(ext,'frameDeltaTime',{value:()=>42,configurable:true});restore=()=>{delete ext.frameDeltaTime;};}
  if(mode==='adapter delegate'){const old=adapter.frameDeltaTime;adapter.frameDeltaTime=()=>42;restore=()=>{adapter.frameDeltaTime=old;};}
  if(mode==='metadata function'||mode==='metadata arguments'){
   const entry=only(runtime._blockInfo.find(row=>row.id==='arcade').blocks.filter(row=>row.json?.type==='arcade_frameDeltaTime'),'actual registered frame row'),name=mode==='metadata function'?'func':'arguments',old=Object.getOwnPropertyDescriptor(entry.info,name);
   assert.ok(old);Object.defineProperty(entry.info,name,{...old,value:mode==='metadata function'?()=>42:{EXTRA:{type:'number'}}});restore=()=>{Object.defineProperty(entry.info,name,old);};
  }
  let rejected=null;try{await stepFrames(run.vm,12);}catch(error){rejected=error;}
  expected=run.errors.slice();const actual=values(run);assert.equal(actual.entered,0);assert.equal(actual.after,0);
  assert.ok([...run.errors,...(rejected?[rejected.message]:[])].some(message=>/Frame delta Number:|primitive producer|actual producer|current graph/i.test(message)),'actual owned result refusal is observable');
 }catch(error){primary=error;throw error;}finally{try{restore();}catch(error){if(!primary)throw error;process.stderr.write(JSON.stringify({kind:'secondary frame restore failure',message:error.message})+'\n');}finally{finish(run,expected,primary);}}
});
