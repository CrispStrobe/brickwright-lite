import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runProgram,SB3Creator,VM,stepFrames,quitStrandedVMs,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values.js'),dispatch=require(VM_SRC+'/dispatch/central-dispatch.js');
const code=`DEVICE ARCADE
GLOBAL alias
GLOBAL result
GLOBAL after
GLOBAL ticks
SPRITE Game:
WHEN flag clicked:
  new array "only"
  set alias to (reference to named array ("only"))
  set result to (calculate value (alias) op "+" with ("!"))
  set after to (0 + 1)
WHEN flag clicked:
  set ticks to 0
  forever:
    change ticks by 1`;
const cell=(run,name)=>run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name===name)?.value;
const close=run=>{run?.vm.stopAll();run?.vm.quit();quitStrandedVMs();clearStrayTimers();};
function observations(run){return {errors:[...run.errors],calls:Object.fromEntries(run.calls),alias:cell(run,'alias'),body:BW.arrayValue(run.vm.runtime,cell(run,'alias')),result:cell(run,'result'),after:cell(run,'after'),ticks:cell(run,'ticks'),project:JSON.parse(run.vm.toJSON())};}

test('actual named constructor discards stale accessor bodies across Start and genuine reload while publishing fresh bodies',async t=>{
 let run,reads=0;
 try{
  run=await runProgram(code,{frames:8});assert.deepEqual(run.errors,[]);
  let old=BW.arrayValue(run.vm.runtime,cell(run,'alias'));assert.deepEqual(old,[]);
  Object.defineProperty(old,'discarded',{configurable:true,enumerable:true,get(){reads++;throw Error('old binding must not be read');}});
  run.vm.greenFlag();await stepFrames(run.vm,8);t.diagnostic(JSON.stringify({phase:'restart',...observations(run)}));
  assert.deepEqual(run.errors,[]);let body=BW.arrayValue(run.vm.runtime,cell(run,'alias'));
  assert.deepEqual(body,[]);assert.notEqual(body,old);assert.equal(reads,0);assert.equal(BW.decode(cell(run,'after')),1);
  old=body;Object.defineProperty(old,'discarded',{configurable:true,enumerable:true,get(){reads++;throw Error('old reload binding must not be read');}});
  run.vm.stopAll();await run.vm.loadProject(run.buffer);run.vm.greenFlag();await stepFrames(run.vm,8);
  t.diagnostic(JSON.stringify({phase:'reload',...observations(run)}));
  assert.deepEqual(run.errors,[]);body=BW.arrayValue(run.vm.runtime,cell(run,'alias'));
  assert.deepEqual(body,[]);assert.notEqual(body,old);assert.equal(reads,0);
  assert.equal(BW.decode(cell(run,'result')),'!');assert.equal(BW.decode(cell(run,'after')),1);assert.ok(BW.decode(cell(run,'ticks'))>0);
 }finally{close(run);}
});

test('a genuine reload read of the same stale named body still rejects only its dependent fiber',async t=>{
 let run;
 try{
  run=await runProgram(code,{frames:8});assert.deepEqual(run.errors,[]);
  const creator=new SB3Creator();creator.parse(code.replace('  new array "only"\n',''));
  assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.unparsed,[]);
  const archive=Buffer.from(await(await creator.generateSB3()).arrayBuffer());
  run.vm.stopAll();await run.vm.loadProject(archive);run.vm.greenFlag();await stepFrames(run.vm,8);
  t.diagnostic(JSON.stringify({phase:'stale-read',...observations(run)}));
  assert.equal(run.errors.length,1);assert.match(run.errors[0],/foreign or stale Array body/);
  assert.equal(cell(run,'alias'),0);assert.equal(cell(run,'result'),0);assert.equal(cell(run,'after'),0);
  assert.ok(BW.decode(cell(run,'ticks'))>0);const ticks=BW.decode(cell(run,'ticks'));
  await stepFrames(run.vm,2);assert.ok(BW.decode(cell(run,'ticks'))>ticks);assert.equal(run.errors.length,1);
 }finally{close(run);}
});

test('a real finish callback rebinding the named registry cannot publish the earlier host-born body',async t=>{
 let run,restore=()=>{},fault=null;
 try{
  run=await runProgram(code,{frames:8});assert.deepEqual(run.errors,[]);const runtime=run.vm.runtime;
  const service=run.vm.extensionManager._loadedExtensions.get('arrays'),adapter=dispatch.services[service];assert.ok(adapter);
  run.vm.stopAll();await run.vm.loadProject(run.buffer);
  const descriptor=Object.getOwnPropertyDescriptor(runtime,'isActiveThread'),original=runtime.isActiveThread;
  restore=()=>{if(descriptor)Object.defineProperty(runtime,'isActiveThread',descriptor);else delete runtime.isActiveThread;};
  runtime.isActiveThread=function(...args){
   const active=Reflect.apply(original,this,args);
   if(!fault){const frames=new Error().stack.split('\n'),at=frames.findIndex(row=>/\bat graphValid /.test(row));
    if(at>=0&&/\bat Object\.finish /.test(frames[at+1]||'')){
     restore();fault={fired:true};
     // Real registered adapter, no current util/ticket: ordinary unqualified
     // constructor changes its private registry but cannot publish a birth loan.
     adapter.create1D({NAME:'only',JSON:'[]'});
    }
   }
   return active;
  };
  run.vm.greenFlag();await stepFrames(run.vm,8);restore();
  t.diagnostic(JSON.stringify({phase:'rebound-publication',fault,...observations(run)}));
  assert.equal(fault?.fired,true);assert.equal(run.errors.length,1);assert.match(run.errors[0],/Named replacement registry\/body differs at publication/);
  assert.equal(cell(run,'alias'),0);assert.equal(cell(run,'result'),0);assert.equal(cell(run,'after'),0);assert.ok(BW.decode(cell(run,'ticks'))>0);
 }finally{restore();close(run);}
});

// These registered source variants are admission faults, not candidate feature
// executions. They retain the actual adapter, host, VM cache and body registry.
async function roleFault(method){
 const sourcePath=process.env.BW_ARRAY_PRIOR_BINDING_SOURCE;assert.ok(sourcePath,'exact candidate source input is mandatory');
 const source=readFileSync(sourcePath,'utf8');let variant;
 if(method==='createEmpty'){
  const line='arrays[namedKey(this, args)] = bindingValue(this, body);';assert.equal(source.split(line).length-1,1);
  variant=source.replace(line,'if (allocationIsArray(operation?.body)) body = operation.body;\n      '+line);
 }else{
  assert.equal(source.split('spec[1] === "bind"').length-1,2);
  variant=source.replaceAll('spec[1] === "bind"','(spec[1] === "bind" || opcode === "'+method+'")');
 }
 assert.notEqual(variant,source);
 const vm=new VM(),runtime=vm.runtime,errors=[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 const makeArrays=require(VM_SRC+'/extensions/crispstrobe/adapter.js'),ops=require(VM_SRC+'/util/bw-array-operations.js');
 const arrays=new(makeArrays(variant,null,ops.registerSource(variant)))(runtime);
 const service=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',service);
 function project(setup){
  const blocks={},variables={alias:['alias',0],result:['result',-1],after:['after',0],ticks:['ticks',0]};let serial=0;
  const add=(opcode,parent,next=null,inputs={},fields={},shadow=false)=>{const id='prior'+serial++;blocks[id]={opcode,parent,next,inputs,fields,shadow,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})};return id;};
  const text=(value,parent)=>add('text',parent,null,{}, {TEXT:[value,null]},true);
  const hat=add('event_whenflagclicked',null);
  let operation;
  if(setup){
   operation=add('arrays_create1D',hat);blocks[operation].inputs={NAME:[1,text('only',operation)],JSON:[1,text('[5]',operation)]};
   const assignment=add('data_setvariableto',operation,null,{}, {VARIABLE:['alias','alias']});blocks[operation].next=assignment;
   const alias=add('arrays_namedReference',assignment);blocks[alias].inputs.NAME=[1,text('only',alias)];blocks[assignment].inputs.VALUE=[1,alias];
  }else if(method==='get'){
   operation=add('data_setvariableto',hat,null,{}, {VARIABLE:['result','result']});
   const read=add('arrays_get',operation);blocks[read].inputs={NAME:[1,text('only',read)],INDEX:[1,[4,'0']]};blocks[operation].inputs.VALUE=[1,read];
  }else{
   operation=add('arrays_'+method,hat);blocks[operation].inputs.NAME=[1,text('only',operation)];
   if(method==='push')blocks[operation].inputs.VALUE=[1,[4,'9']];
  }
  blocks[hat].next=operation;
  if(!setup){const after=add('data_setvariableto',operation,null,{VALUE:[1,[10,'done']]},{VARIABLE:['after','after']});blocks[operation].next=after;}
  const other=add('event_whenflagclicked',null),forever=add('control_forever',other);blocks[other].next=forever;
  const tick=add('data_changevariableby',forever,null,{VALUE:[1,[4,'1']]},{VARIABLE:['ticks','ticks']});blocks[forever].inputs.SUBSTACK=[2,tick];
  return {targets:[{isStage:true,name:'Stage',variables,lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 }
 let old,descriptor,getters=0;
 try{
  await vm.loadProject(JSON.stringify(project(true)));runtime.currentStepTime=1000/30;vm.greenFlag();await stepFrames(vm,8);
  assert.deepEqual(errors,[]);old=BW.arrayValue(runtime,runtime.getTargetForStage().variables.alias.value);assert.deepEqual(old,[5]);
  if(method!=='createEmpty'){
   descriptor=Object.getOwnPropertyDescriptor(old,'0');
   Object.defineProperty(old,'0',{configurable:true,enumerable:true,get(){getters++;throw Error('old read/write body was observed');}});
  }
  vm.stopAll();await vm.loadProject(JSON.stringify(project(false)));vm.greenFlag();await stepFrames(vm,8);
  return {vm,runtime,errors,old,getters,get stage(){return runtime.getTargetForStage();},close(){if(descriptor)Object.defineProperty(old,'0',descriptor);vm.stopAll();vm.quit();clearStrayTimers();}};
 }catch(error){if(old&&descriptor)Object.defineProperty(old,'0',descriptor);vm.stopAll();vm.quit();clearStrayTimers();throw error;}
}

test('registered alternate source cannot forge a named replacement role or publish a valid factory stale body',async t=>{
 for(const method of ['get','push','createEmpty']){
  const run=await roleFault(method);
  try{
   t.diagnostic(JSON.stringify({kind:'actual-prior-binding-admission-fault',method,errors:run.errors.map(error=>({name:error.name,message:error.message,cause:error.cause?.message})),oldLength:run.old.length,getters:run.getters,variables:run.stage.variables}));
   assert.equal(run.errors.length,1);
   const messages=run.errors.map(error=>String(error.message)+' '+String(error.cause?.message));
   assert.match(messages[0],method==='createEmpty'?/foreign or stale Array body/:/Named replacement declaration differs/);
   assert.equal(run.getters,0,'role denial occurs before any old-body read');assert.equal(run.old.length,1);
   assert.equal(run.stage.variables.after.value,0);assert.equal(run.stage.variables.result.value,-1);
   assert.ok(run.stage.variables.ticks.value>0);const ticks=run.stage.variables.ticks.value;await stepFrames(run.vm,2);assert.ok(run.stage.variables.ticks.value>ticks);assert.equal(run.errors.length,1);
  }finally{run.close();}
 }
});
