import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compactConversionObservationGraph} from '../scripts/lib/conversion-audit-core.mjs';
import {runProgram,clearStrayTimers,quitStrandedVMs} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;

// Optional persisted evidence belongs to the bounded test controller. Captures
// are made before assertions; observer failures are never product diagnostics.
function journal(caseName){
 const records=[];let sequence=0;
 const save=(label,value)=>{
  const graph=compactConversionObservationGraph(value);records.push({label,graph});
  if(process.env.BW_NAMED_EMPTY_PIPELINE_EVIDENCE){
   const directory=process.env.BW_NAMED_EMPTY_PIPELINE_EVIDENCE;
   fs.mkdirSync(directory,{recursive:true});
   fs.writeFileSync(path.join(directory,caseName+'-'+String(sequence++).padStart(2,'0')+'-'+label+'.json'),JSON.stringify(graph)+'\n',{flag:'wx'});
  }
  return value;
 };
 const failed=(label,error)=>{
  try{save(label,{status:'THREW',error});}
  catch(observerError){process.stderr.write('NAMED_EMPTY_OBSERVATION_FAILURE:'+String(observerError)+'\n');}
 };
 return {save,failed,records};
}
const creatorState=creator=>({project:creator.project,assets:creator.assets,errors:creator.errors,warnings:creator.warnings,unparsed:creator.unparsed});
const cleanCreator=creator=>{assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.unparsed,[]);};
const cleanConversion=value=>{
 assert.deepEqual(value.unsupported,[]);
 // Missing optional channels remain unprovided in the full return capture.
 for(const name of ['warnings','errors','unparsed','diagnostics'])if(Object.hasOwn(value,name))assert.deepEqual(value[name],[],name);
};
const authored=getter=>`DEVICE ARCADE
GLOBAL alias
GLOBAL aliasCopy
GLOBAL leftText
GLOBAL rightText
GLOBAL item
GLOBAL after
GLOBAL ticks
SPRITE Game:
WHEN flag clicked:
  new array "named"
  set alias to (reference to named array ("named"))
  set aliasCopy to alias
${getter?'  push 5 to array "named"\n  set item to item 0 of array "named"\n':''}  set leftText to (calculate value (alias) op "+" with ("!"))
  set rightText to (calculate value ("!") op "+" with (aliasCopy))
  set after to 1
WHEN flag clicked:
  set ticks to 0
  forever:
    change ticks by 1`;
const name=value=>String(value).replace(/^Game_/,'');
function authoredConnections(project,getter){
 const target=project.targets.find(t=>Object.values(t.blocks||{}).some(b=>b.opcode==='arrays_createEmpty'));
 assert.ok(target,'actual authored factory exists before execution');const blocks=target.blocks;
 const rows=Object.entries(blocks),factories=rows.filter(([,b])=>b.opcode==='arrays_createEmpty');assert.equal(factories.length,1);
 const [factoryId,factory]=factories[0],hat=blocks[factory.parent];assert.equal(hat.opcode,'event_whenflagclicked');
 const chain=[];let next=hat.next,previous=factory.parent;
 while(next){assert.ok(!chain.includes(next),'finite connected authored stack');const b=blocks[next];assert.ok(b);assert.equal(b.parent,previous);chain.push(next);previous=next;next=b.next;}
 assert.equal(chain[0],factoryId);
 const assignment=variable=>{const found=rows.filter(([,b])=>b.opcode==='data_setvariableto'&&name(b.fields.VARIABLE[0])===variable);assert.equal(found.length,1,variable);assert.ok(chain.includes(found[0][0]),variable+' remains in factory stack');return found[0];};
 const reporter=input=>typeof input?.[1]==='string'?blocks[input[1]]:null;
 const text=input=>{const value=input?.[1];return Array.isArray(value)&&value[0]===10?value[1]:reporter(input)?.fields.TEXT?.[0];};
 const variable=input=>{const value=input?.[1];return Array.isArray(value)&&value[0]===12?value[2]:reporter(input)?.fields.VARIABLE?.[1];};
 assert.equal(text(factory.inputs.NAME),'named');
 const [aliasId,alias]=assignment('alias'),[copyId,copy]=assignment('aliasCopy');
 const reference=reporter(alias.inputs.VALUE);assert.equal(reference?.opcode,'arrays_namedReference');assert.equal(text(reference.inputs.NAME),'named');
 assert.equal(variable(copy.inputs.VALUE),alias.fields.VARIABLE[1]);
 const [leftId,left]=assignment('leftText'),[rightId,right]=assignment('rightText'),[afterId]=assignment('after');
 const a=reporter(left.inputs.VALUE),b=reporter(right.inputs.VALUE);
 for(const value of [a,b]){assert.equal(value?.opcode,'arrays_valueBinary');assert.equal(value.fields.OP[0],'+');}
 assert.equal(variable(a.inputs.LEFT),alias.fields.VARIABLE[1]);assert.equal(text(a.inputs.RIGHT),'!');
 assert.equal(text(b.inputs.LEFT),'!');assert.equal(variable(b.inputs.RIGHT),copy.fields.VARIABLE[1]);
 const ordered=[factoryId,aliasId,copyId,leftId,rightId,afterId].map(id=>chain.indexOf(id));assert.deepEqual(ordered,[...ordered].sort((x,y)=>x-y));
 assert.equal(rows.filter(([,b])=>b.opcode==='arrays_push').length,getter?1:0);
 assert.equal(rows.filter(([,b])=>b.opcode==='arrays_get').length,getter?1:0);
 assert.ok(rows.some(([,b])=>b.opcode==='control_forever'),'independent ticking stack is authored');
}
async function journey(t,getter){
 const caseName=getter?'getter':'empty',evidence=journal(caseName),runs=[],reached=[];
 const save=evidence.save,source=authored(getter);let failedAt=null,active=null,primaryError=null;
 const stage=async(label,operation,observation=value=>value,after=null)=>{
  active=label;reached.push(label);let operationError=null;
  try{const value=await operation();save(label,{status:'RETURNED',value:observation(value)});return value;}
  catch(error){operationError=error;failedAt=label;evidence.failed(label+'-throw',error);throw error;}
  finally{if(after)try{after();}catch(observerError){process.stderr.write('NAMED_EMPTY_OBSERVATION_FAILURE:'+String(observerError)+'\n');if(!operationError)throw observerError;}}
 };
 const execute=async(label,code,uploads=[],verify=false)=>{
  save(label+'-input',{code,uploads});
  let run;
  try{run=await runProgram(code,{frames:60,storage:true,uploads,observeCreator(creator,error){
   save(label+'-creator',{...creatorState(creator),parseError:error});
   if(error===null){cleanCreator(creator);if(verify)authoredConnections(creator.project,getter);}
  }});}catch(error){evidence.failed(label+'-runtime-throw',error);throw error;}
  runs.push(run);
  const values=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables||{}).map(variable=>({name:variable.name,value:variable.value})));
  const named=key=>{const found=values.filter(v=>name(v.name)===key);assert.equal(found.length,1,key);return found[0].value;};
  const {vm,creator,...provided}=run;
  save(label+'-runtime',{...provided,creator:creatorState(creator),projectJSON:vm.toJSON(),values});
  cleanCreator(run.creator);assert.deepEqual(run.errors,[]);
  const backing=BW.arrayValue(run.vm.runtime,named('alias')),copy=BW.arrayValue(run.vm.runtime,named('aliasCopy'));
  save(label+'-backing',{backing,copy,sameBacking:backing===copy});
  assert.ok(Array.isArray(backing),'actual current Array backing');assert.equal(copy,backing,'physical runtime alias identity');
  assert.deepEqual(backing,getter?[5]:[]);assert.equal(named('leftText'),getter?'5!':'!');assert.equal(named('rightText'),getter?'!5':'!');
  if(getter)assert.equal(named('item'),5);
  assert.equal(named('after'),1);assert.ok(named('ticks')>0,'independent fiber actually ran');
  return run;
 };
 try{
  const runObservation=run=>{const {vm,creator,...provided}=run;return {...provided,creator:creatorState(creator),runtimeProjectJSON:vm.toJSON()};};
  const first=await stage('original',()=>execute('original',source,[],true),runObservation);
  // Clone preparation is outside product exception handling. Decompile receives
  // the actual Creator graph; the next context reparses its actual returned Code.
  const codeProject=structuredClone(first.creator.project);save('code-project',codeProject);
  const code=await stage('code-return',()=>first.creator.decompile(codeProject));assert.equal(typeof code,'string');
  const second=await stage('code',()=>execute('code',code),runObservation);
  const exportInput=structuredClone(second.creator.project),before=structuredClone(exportInput);save('export-input',exportInput);
  const exported=await stage('export',()=>projectToArcade(exportInput,{costumeSvg:(_target,costume)=>second.creator.assets.get(costume.assetId)?.data}),value=>value,()=>save('export-input-after',exportInput));
  assert.deepEqual(exportInput,before,'export must not mutate authored input');cleanConversion(exported);
  assert.ok(exported.files&&typeof exported.files['main.ts']==='string');assert.equal(exported.files['main.ts'],exported.ts);
  const imported=await stage('reimport',()=>arcadeToPseudocode(exported.files));cleanConversion(imported);assert.equal(typeof imported.code,'string');
  await stage('reimport-runtime',()=>execute('reimport-runtime',imported.code,imported.costumes),runObservation);
 }catch(error){primaryError=error;failedAt??=active;evidence.failed('first-failure',error);throw error;}finally{
  const cleanup=[];
  for(const [index,run]of runs.entries()){
   const record={index};cleanup.push(record);
   try{run.vm.stopAll();record.stop='RETURNED';}catch(error){record.stopError=error;}
   try{run.vm.quit();record.quit='RETURNED';}catch(error){record.quitError=error;}
  }
  try{quitStrandedVMs();clearStrayTimers();}catch(error){cleanup.push({strandedCleanupError:error});}
  try{save('completion',{reached,failedAt,unattempted:['original','code-return','code','export','reimport','reimport-runtime'].filter(label=>!reached.includes(label)),cleanup});}
  catch(observerError){if(!primaryError)throw observerError;process.stderr.write('NAMED_EMPTY_OBSERVATION_FAILURE:'+String(observerError)+'\n');}
  const cleanupFailed=cleanup.some(record=>record.stopError||record.quitError||record.strandedCleanupError);
  if(cleanupFailed&&primaryError)process.stderr.write('NAMED_EMPTY_CLEANUP_FAILURE:see captured completion\n');
  else assert.equal(cleanupFailed,false,'actual cleanup must complete');
 }
}

test('public named empty Array aliases and both text operand orders survive actual Code export and reimport',async t=>journey(t,false));
test('public named item getter retains its separate actual export and reimport coercion route',async t=>journey(t,true));
