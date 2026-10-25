import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {VM,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),exceptions=require(VM_SRC+'/util/bw-arcade-exceptions.js'),loans=require(VM_SRC+'/util/bw-primitive-owner.js');
const block=(opcode,parent,next,inputs={},fields={})=>({opcode,parent,next,inputs,fields,shadow:false,topLevel:parent===null,...(parent===null?{x:0,y:0}:{})});
async function fixture(opcode='setLocal',{nested=false,refusal=null,foreign=null}={}){
 const vm=new VM(),runtime=vm.runtime,signals=[],caught=[],state={cleanup:0,adapterAfter:0};
 runtime.on('BLOCKS_ERROR',signal=>signals.push(signal));
 // A registered test adapter calls the production owner API under actual VM
 // cached primitive execution. It does not create or substitute loan records.
 const adapter={getInfo:()=>({id:'arcade',name:'Constraint boundary probe',blocks:['setLocal','setCaptured','callFunction','probe'].map(opcode=>({opcode,blockType:'command',text:opcode}))})};
 let owner;
 for(const name of ['setLocal','setCaptured','callFunction','probe'])adapter[name]=(args,util)=>{
  state.args=args;state.util=util;state.thread=util.thread;
  const error=foreign||new Error('Procedure parameter constraint: value requires Number');
  if(refusal){try{owner.rejectConstraint(refusal==='copiedArgs'?{...args}:args,refusal==='copiedUtil'?{...util}:util,refusal==='opaqueError'?{message:'not Error'}:error);}catch(error){caught.push(error);}return;}
  if(nested&&name==='callFunction'){
   const child=runtime._pushThread(util.target.blocks.getProcedureDefinition('child'),util.target);
   owner.link(child,util.thread,()=>state.cleanup++);loans.stepNested(util,args,child);
   const failed=owner.failure(util.thread);if(failed)throw failed;
  }else owner.rejectConstraint(args,util,error);
  state.adapterAfter++;
 };
 const service=vm.extensionManager._registerInternalExtension(adapter);vm.extensionManager._loadedExtensions.set('arcade',service);
 const blocks={hat:block('event_whenflagclicked',null,'reject'),reject:block('arcade_'+opcode,'hat','after'),after:block('data_setvariableto','reject',null,{VALUE:[1,[4,'1']]},{VARIABLE:['after','after']}),other:block('event_whenflagclicked',null,'forever'),forever:block('control_forever','other',null,{SUBSTACK:[2,'tick']}),tick:block('data_changevariableby','forever',null,{VALUE:[1,[4,'1']]},{VARIABLE:['independent','independent']})};
 if(nested){blocks.def=block('procedures_definition',null,'childReject',{custom_block:[1,'proto']});blocks.proto={...block('procedures_prototype','def',null),shadow:true,mutation:{tagName:'mutation',children:[],proccode:'child',argumentids:'[]',argumentnames:'[]',argumentdefaults:'[]',warp:'false'}};blocks.childReject=block('arcade_setCaptured','def','childAfter');blocks.childAfter=block('data_setvariableto','childReject',null,{VALUE:[1,[4,'1']]},{VARIABLE:['childAfter','childAfter']});}
 const project={targets:[{isStage:true,name:'Stage',variables:{after:['after',0],independent:['independent',0],childAfter:['childAfter',0]},lists:{},broadcasts:{},blocks,comments:{},costumes:[{assetId:'cd21514d0531fdffb22204e0ec5ed84a',name:'backdrop',dataFormat:'svg',md5ext:'cd21514d0531fdffb22204e0ec5ed84a.svg',rotationCenterX:240,rotationCenterY:180}],sounds:[],currentCostume:0,volume:100,layerOrder:0}],monitors:[],extensions:['arcade'],meta:{semver:'3.0.0',vm:'0.2.0',agent:''}};
 await vm.loadProject(JSON.stringify(project));owner=exceptions.create(runtime,args=>args.VALUE);state.owner=owner;runtime.currentStepTime=1000/30;vm.greenFlag();await stepFrames(vm,3);
 const value=name=>runtime.getTargetForStage().variables[name].value;
 return {vm,runtime,owner,state,signals,caught,value,close(){vm.stopAll();vm.quit();clearStrayTimers();}};
}
for(const opcode of ['setLocal','setCaptured','callFunction'])test('actual '+opcode+' constraint rejection retires only its failing fiber',async()=>{
 const run=await fixture(opcode);
 try{assert.equal(run.value('after'),0);assert.equal(run.state.adapterAfter,0);assert.equal(run.signals.length,1);const signal=run.signals[0];assert.deepEqual(exceptions.diagnostic(run.runtime,signal),{kind:'constraint',message:'Procedure parameter constraint: value requires Number',block:'reject',target:run.runtime.getTargetForStage().id});assert.equal(exceptions.consume(run.runtime,run.state.thread,signal),true);assert.throws(()=>run.owner.rejectConstraint({}, {thread:run.state.thread},signal),error=>error===signal);const before=run.value('independent');await stepFrames(run.vm,3);assert.ok(run.value('independent')>before);assert.throws(()=>run.owner.rejectConstraint(run.state.args,run.state.util,new Error('late')),/actual current primitive/);assert.equal(run.signals.length,1);}
 finally{run.close();}
});
test('linked actual nested rejection retires child and caller before either continuation and cleans once',async()=>{
 const run=await fixture('callFunction',{nested:true});
 try{assert.equal(run.value('after'),0);assert.equal(run.value('childAfter'),0);assert.equal(run.state.adapterAfter,0);assert.equal(run.state.cleanup,1);assert.equal(run.signals.length,1);assert.equal(exceptions.diagnostic(run.runtime,run.signals[0]).block,'childReject');assert.ok(run.value('independent')>0);}
 finally{run.close();}
});
for(const refusal of ['copiedArgs','copiedUtil','opaqueError'])test('actual loan refuses '+refusal+' without adopting an arbitrary error',async()=>{
 const run=await fixture('setLocal',{refusal});try{assert.equal(run.signals.length,0);assert.equal(run.caught.length,1);assert.equal(run.value('after'),'1');assert.equal(exceptions.failed(run.runtime,run.state.thread),false);}finally{run.close();}
});
test('unlisted primitive and foreign-runtime issued signal cannot gain constraint authority',async()=>{
 const unlisted=await fixture('probe',{refusal:'unlisted'});try{assert.equal(unlisted.signals.length,0);assert.match(String(unlisted.caught[0]),/actual current primitive/);}finally{unlisted.close();}
 const first=await fixture();const second=await fixture('setLocal',{refusal:'foreign',foreign:first.signals[0]});
 try{assert.equal(second.caught[0],first.signals[0]);assert.equal(second.signals.length,0);assert.equal(exceptions.diagnostic(second.runtime,first.signals[0]),null);assert.equal(exceptions.failed(second.runtime,second.state.thread),false);assert.equal(second.value('after'),'1');}finally{first.close();second.close();}
});
test('unbound fallback API explicitly refuses constraint rejection',()=>{const owner=exceptions.create(null);assert.throws(()=>owner.rejectConstraint({},null,new Error('missing')),/bound runtime/);});

test('Stop and restart issue a fresh failure without reviving the failed invocation',async()=>{
 const run=await fixture();try{const first=run.signals[0],thread=run.state.thread;run.vm.stopAll();assert.throws(()=>run.owner.rejectConstraint({}, {thread},new Error('stopped')),/actual current primitive/);run.vm.greenFlag();await stepFrames(run.vm,3);assert.equal(run.signals.length,2);assert.notEqual(run.signals[1],first);assert.equal(run.value('after'),0);assert.equal(exceptions.failed(run.runtime,thread),true);assert.ok(run.value('independent')>0);}finally{run.close();}
});
