import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {INTEGRATED,importGuiDependency} from './helpers/bw-integrated.mjs';
const require=createRequire(import.meta.url),root=INTEGRATED+'/node_modules/scratch-vm/src';
const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
const ArraysCtor=require(root+'/extensions/crispstrobe/arrays');
const BW=require(root+'/util/bw-values.js'),exceptions=require(root+'/util/bw-arcade-exceptions.js');
assert.equal(readFileSync(root+'/util/bw-array-operations.js','utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/bw-array-operations.js',import.meta.url),'utf8'));

async function fixture(mode,factory='create1D'){
 const vm=new VM(),runtime=vm.runtime,errors=[],events=[];
 const nativeJSON=JSON,nativeParse=JSON.parse;
 const jsonKeys=Reflect.ownKeys(nativeJSON),jsonDescriptors=Object.getOwnPropertyDescriptors(nativeJSON);
 const globalDescriptor=Object.getOwnPropertyDescriptor(globalThis,'JSON'),stringifyDescriptor=jsonDescriptors.stringify;
 const jsonPrototype=Object.getPrototypeOf(nativeJSON);let restored=false;
 const restore=()=>{
  Object.defineProperty(globalThis,'JSON',globalDescriptor);
  Object.setPrototypeOf(nativeJSON,jsonPrototype);
  // Restore the entire native surface, including engine-specific methods
  // and symbols. Readding only parse/stringify changes native key order.
  for(const key of Reflect.ownKeys(nativeJSON)){
   assert.equal(Reflect.deleteProperty(nativeJSON,key),true,'fixture JSON keys must be configurable');
  }
  for(const key of jsonKeys)Object.defineProperty(nativeJSON,key,jsonDescriptors[key]);
  delete Object.prototype.arrayParserControl;
  assert.deepEqual(Reflect.ownKeys(nativeJSON),jsonKeys,'fixture restores exact native JSON key order');
  assert.deepEqual(Object.getOwnPropertyDescriptors(nativeJSON),jsonDescriptors,'fixture restores exact native JSON descriptors');
  assert.equal(Object.getPrototypeOf(nativeJSON),jsonPrototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'JSON'),globalDescriptor);
  restored=true;
 };
 runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 const arrays=new ArraysCtor(runtime),original=arrays[factory];
 // Restore even when a nonfunction/missing parser never gets called. This is
 // outside the real supplier call, after its original catch/finish has run.
 arrays[factory]=function(...args){try{return Reflect.apply(original,this,args);}finally{restore();}};
 const arrayID=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',arrayID);
 const custom=function(value){
  events.push({kind:'call',receiver:this,value});
  restore();
  if(mode==='throw')throw new TypeError('actual custom parser failure');
  return Reflect.apply(nativeParse,nativeJSON,[value]);
 };
 const probe={getInfo:()=>({id:'parserprobe',name:'Parser ingress control',blocks:[{opcode:'json',blockType:'reporter',text:'JSON'}]}),json(){
  if(mode==='getter'||mode==='getterThrow')Object.defineProperty(nativeJSON,'parse',{configurable:true,get(){
   events.push({kind:'get',receiver:this});
   if(mode==='getterThrow'){restore();throw new TypeError('actual parse getter failure');}
   return custom;
  }});
  else if(mode==='delete')delete nativeJSON.parse;
  else if(mode==='nonfunction')nativeJSON.parse=0;
  else if(mode!=='native'){
   if(mode==='reinsert')delete nativeJSON.parse;
   nativeJSON.parse=custom;
  }
  if(mode==='stringify')nativeJSON.stringify=function(...args){return Reflect.apply(stringifyDescriptor.value,this,args);};
  else if(mode==='prototype')Object.setPrototypeOf(nativeJSON,null);
  else if(mode==='global')globalThis.JSON={parse:custom,stringify:nativeJSON.stringify};
  else if(mode==='otherJSONKey')Object.defineProperty(nativeJSON,'stringify',{...stringifyDescriptor,enumerable:!stringifyDescriptor.enumerable});
  else if(mode==='objectPrototype')Object.prototype.arrayParserControl=true;
  return '[7,8]';
 }};
 const probeID=vm.extensionManager._registerInternalExtension(probe);vm.extensionManager._loadedExtensions.set('parserprobe',probeID);
 const b=(opcode,parent,next=null,inputs={},fields={})=>({opcode,parent,next,inputs,fields,shadow:false,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})});
 const blocks={
  hat:b('event_whenflagclicked',null,'factory'),
  factory:b('arrays_'+factory,'hat','alias',{NAME:[1,[10,'custom']],JSON:[1,'json']}),
  json:b('parserprobe_json','factory'),
  alias:b('data_setvariableto','factory','result',{VALUE:[1,'named']},{VARIABLE:['alias','alias']}),
  named:b('arrays_namedReference','alias',null,{NAME:[1,[10,'custom']]}),
  result:b('data_setvariableto','alias','after',{VALUE:[1,'plus']},{VARIABLE:['result','result']}),
  plus:b('arrays_valueBinary','result',null,{LEFT:[1,'variable'],RIGHT:[1,[10,'!']]},{OP:['+',null]}),
  variable:b('data_variable','plus',null,{}, {VARIABLE:['alias','alias']}),
  after:b('data_setvariableto','result',null,{VALUE:[1,'number']},{VARIABLE:['after','after']}),
  number:b('operator_add','after',null,{NUM1:[1,[4,'0']],NUM2:[1,[4,'1']]}),
  independent:b('event_whenflagclicked',null,'forever'),
  forever:b('control_forever','independent',null,{SUBSTACK:[2,'tick']}),
  tick:b('data_changevariableby','forever',null,{VALUE:[1,[4,'1']]},{VARIABLE:['ticks','ticks']})
 };
 const project={targets:[{isStage:true,name:'Stage',variables:{alias:['alias',0],result:['result','UNASSIGNED'],after:['after',0],ticks:['ticks',0]},lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays','parserprobe'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 try{
  await vm.loadProject(JSON.stringify(project));exceptions.create(runtime,args=>args.VALUE);runtime.currentStepTime=1000/30;vm.greenFlag();
  for(let i=0;i<4;i++){await runtime._step();await new Promise(resolve=>setImmediate(resolve));}
  const stage=runtime.getTargetForStage();
  return {errors,events,restored,nativeJSON,body:BW.arrayValue(runtime,stage.variables.alias.value),values:Object.fromEntries(Object.entries(stage.variables).map(([id,value])=>[id,value.value])),close(){restore();vm.stopAll();vm.quit();}};
 }catch(error){restore();vm.stopAll();vm.quit();throw error;}
}
const failedOnlyDependent=run=>{
 assert.equal(run.errors.length,1);assert.equal(run.values.result,'UNASSIGNED');assert.equal(run.values.after,0);assert.ok(run.values.ticks>0);
};

test('current named replacement preserves actual custom parser and getter calls without lending restored native birth authority',async()=>{
 for(const factory of ['create1D','create2D'])for(const mode of ['function','getter','reinsert']){
  const run=await fixture(mode,factory);
  try{
   assert.equal(run.restored,true);assert.deepEqual(run.body,[7,8]);
   const calls=run.events.filter(row=>row.kind==='call'),gets=run.events.filter(row=>row.kind==='get');
   assert.equal(calls.length,1);assert.equal(calls[0].receiver,run.nativeJSON);assert.equal(calls[0].value,'[7,8]');
   assert.equal(gets.length,mode==='getter'?1:0);if(gets.length)assert.equal(gets[0].receiver,run.nativeJSON);
   failedOnlyDependent(run);assert.match(run.errors[0].message,/primitive backing proof/);
  }finally{run.close();}
 }
 const fresh=await fixture('native');
 try{assert.deepEqual(fresh.errors,[]);assert.deepEqual(fresh.body,[7,8]);assert.equal(fresh.values.result,'7,8!');assert.equal(fresh.values.after,1);assert.ok(fresh.values.ticks>0);}
 finally{fresh.close();}
});

test('missing nonfunction and throwing live parsers retain each constructor original catch fallback',async()=>{
 for(const factory of ['create1D','create2D'])for(const mode of ['delete','nonfunction','throw','getterThrow']){
  const run=await fixture(mode,factory);
  try{
   assert.equal(run.restored,true);assert.deepEqual(run.body,factory==='create1D'?[]:[[]]);
   assert.equal(run.events.filter(row=>row.kind==='call').length,mode==='throw'?1:0);
   assert.equal(run.events.filter(row=>row.kind==='get').length,mode==='getterThrow'?1:0);
   failedOnlyDependent(run);assert.match(run.errors[0].message,/primitive backing proof/);
  }finally{run.close();}
 }
});

test('prior replacement refuses unrelated JSON global prototype descriptor and realm changes before custom parser effects',async()=>{
 for(const mode of ['stringify','prototype','global','otherJSONKey','objectPrototype']){
  const run=await fixture(mode);
  try{
   assert.equal(run.restored,true);assert.equal(run.events.length,0);assert.equal(run.body,undefined);
   failedOnlyDependent(run);assert.match(run.errors[0].message,/Named replacement declaration differs/);
  }finally{run.close();}
 }
});
