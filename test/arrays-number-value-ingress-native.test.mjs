import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {INTEGRATED,importGuiDependency} from './helpers/bw-integrated.mjs';
const require=createRequire(import.meta.url),vmSource=INTEGRATED+'/node_modules/scratch-vm/src';
const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
const makeArrays=require(vmSource+'/extensions/crispstrobe/adapter.js'),BW=require(vmSource+'/util/bw-values.js');
const supplier=process.env.BW_ARRAY_NUMBER_VALUE_SOURCE;
assert.ok(supplier,'Explicit frozen candidate supplier source is required; no vendored substitution');
const source=readFileSync(supplier,'utf8');
for(const file of ['bw-primitive-owner.js','bw-current-number-input.js','bw-cached-primitive-owner.js'])assert.equal(readFileSync(vmSource+'/util/'+file,'utf8'),readFileSync(new URL('../overlay/scratch-vm/src/util/'+file,import.meta.url),'utf8'),'installed '+file+' must equal own source');
assert.equal(readFileSync(vmSource+'/extensions/crispstrobe/adapter.js','utf8'),readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/adapter.js',import.meta.url),'utf8'));
const opcodes=['referenceValues','mutateReference','referenceRemove','referenceIndexOf'];
async function fixture(opcode,leaf='number',mode='normal'){
 const vm=new VM(),runtime=vm.runtime,errors=[],calls=[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));
 const arrays=new(makeArrays(source))(runtime),original=arrays[opcode];let saved;
 arrays[opcode]=(args,util)=>{saved={args,util};const raw=args.VALUE;calls.push({raw,util,args});const result=original(mode==='copiedArgs'?{...args}:args,mode==='copiedUtil'?{...util}:util);assert.equal(args.VALUE,raw,'semantic interpretation must not rewrite rawargs');return result;};
 const service=vm.extensionManager._registerInternalExtension(arrays);vm.extensionManager._loadedExtensions.set('arrays',service);
 const blocks={},variables={array:['array',0],result:['result',0],variableNumber:['variableNumber',20]};let serial=0;
 const add=(opcode,parent,next=null,inputs={},fields={},shadow=false)=>{const id='b'+serial++;blocks[id]={opcode,parent,next,inputs,fields,shadow,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})};return id;};
 const text=(value,parent)=>add('text',parent,null,{}, {TEXT:[String(value),null]},true);
 const value=(parent)=>leaf==='variable'?add('data_variable',parent,null,{}, {VARIABLE:['variableNumber','variableNumber']}):leaf==='number'?add('math_number',parent,null,{}, {NUM:['20',null]},true):text('20',parent);
 const variable=(parent)=>add('data_variable',parent,null,{}, {VARIABLE:['array','array']});
 const hat=add('event_whenflagclicked',null),setup=add('data_setvariableto',hat,null,{}, {VARIABLE:['array','array']});blocks[hat].next=setup;
 const create=add('arrays_createReference',setup);blocks[setup].inputs.VALUE=[1,create];
 blocks[create].inputs.VALUES=[1,text(opcode==='referenceRemove'||opcode==='referenceIndexOf'?'[20,"20"]':'[]',create)];
 if(opcode==='referenceValues'){
  const chain=add('arrays_referenceValues',create);blocks[create].inputs.VALUES=[1,chain];blocks[chain].inputs={VALUE:[1,value(chain)],REST:[1,text('[]',chain)]};
 }else{
  const next=add(opcode==='mutateReference'?'arrays_mutateReference':'data_setvariableto',setup,null,{},opcode==='mutateReference'?{}:{VARIABLE:['result','result']});blocks[setup].next=next;
  const call=opcode==='mutateReference'?next:add('arrays_'+opcode,next);if(call!==next)blocks[next].inputs.VALUE=[1,call];
  blocks[call].inputs={ARRAY:[1,variable(call)],VALUE:[1,value(call)]};
  if(opcode!=='referenceRemove')blocks[call].inputs.INDEX=[1,add('math_number',call,null,{}, {NUM:['0',null]},true)];
  if(opcode==='mutateReference')blocks[call].inputs.OP=[1,text('push',call)];
 }
 const project={targets:[{isStage:true,name:'Stage',variables,lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arrays'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 await vm.loadProject(JSON.stringify(project));runtime.currentStepTime=1000/30;vm.greenFlag();for(let i=0;i<4;i++){await runtime._step();await new Promise(resolve=>setImmediate(resolve));}
 const stage=runtime.getTargetForStage(),body=BW.arrayValue(runtime,stage.variables.array.value);
 return{vm,runtime,arrays,original,body,result:stage.variables.result.value,calls,saved,errors,close(){vm.stopAll();vm.quit();}};
}
test('real registered candidate preserves physical Number20 versus identical Text20 at all four reference value boundaries',async()=>{
 for(const opcode of opcodes)for(const leaf of ['number','text','variable']){
  const run=await fixture(opcode,leaf);
  try{assert.deepEqual(run.errors,[]);assert.equal(run.calls.length,1);const numeric=leaf!=='text';
   if(opcode==='referenceValues'||opcode==='mutateReference')assert.deepEqual(run.body,[numeric?20:'20'],opcode+'/'+leaf);
   if(opcode==='referenceRemove'){assert.equal(run.result,true);assert.deepEqual(run.body,[numeric?'20':20],opcode+'/'+leaf);}
   if(opcode==='referenceIndexOf')assert.equal(run.result,numeric?0:1,opcode+'/'+leaf);
   assert.equal(typeof run.calls[0].raw,leaf==='variable'?'number':'string');
  }finally{run.close();}
 }
});
test('real cached execution refuses Number interpretation through copied args or utility at each new role',async()=>{
 for(const opcode of opcodes)for(const mode of ['copiedArgs','copiedUtil']){
  const run=await fixture(opcode,'number',mode);try{assert.deepEqual(run.errors,[]);
   if(opcode==='referenceValues'||opcode==='mutateReference')assert.deepEqual(run.body,['20']);
   if(opcode==='referenceRemove')assert.deepEqual(run.body,[20]);
   if(opcode==='referenceIndexOf')assert.equal(run.result,1);
  }finally{run.close();}
 }
});
test('saved args/util after return or Stop do not retain a Number loan',async()=>{
 const run=await fixture('referenceValues');try{
  assert.deepEqual(run.body,[20]);const {args,util}=run.saved;
  assert.equal(run.original(args,util),'["20"]');run.vm.stopAll();assert.equal(run.original(args,util),'["20"]');
  assert.equal(run.original(args,{...util,runtime:{}}),'["20"]');
 }finally{run.close();}
});
