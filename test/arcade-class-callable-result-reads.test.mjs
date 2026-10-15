import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import createReads from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-result-reads.js';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';
import createFrames from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-frames.js';
import createProvider from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-provider.js';
import primitive from '../overlay/scratch-vm/src/util/bw-primitive-owner.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const named=name=>({kind:'named',name});
// Real heap, immutable method descriptors, private frame issuer and cached
// primitive loan. Body verification is modeled here; installed proof is a
// separate gate and must supply the actual connected branch certificate.
const fixture=()=>{
 const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];runtime.sequencer={activeThread:null};
 let provider,current=true;
 const heap=createHeap(runtime,BW,{callableMethod:method=>provider.methodSignature(method)});
 const frames=createFrames(runtime,heap,{currentGraph:()=>current});
 provider=createProvider(runtime,BW,heap,frames,{currentGraph:()=>current});
 heap.register({name:'State',fields:[],methods:[],initializer:'',constructor:'',parameters:[]});
 const callback={kind:'callable',parameters:[{name:'state',optional:false,type:named('State')}],result:named('T')};
 heap.register({name:'Holder',fields:[{name:'state',type:'State',readonly:false}],initializer:'',constructor:'',parameters:[],methods:[
  {name:'apply',procedure:'Holder_apply %s %s',parameters:[{name:'action',type:'callable',optional:false,callableSignature:callback}],returnType:'T',
   typeParameters:[{name:'T',constraint:'',defaultType:''}],callableSignature:{kind:'callable',parameters:[{name:'action',optional:false,type:callback}],result:named('T')},
   resultFlow:{schema:'bw-class-result-flow/v1',presenceField:'state',absent:'undefined',present:'callback'}}]});
 const allocation=heap.allocate('Holder'),ref=heap.finish(allocation.ref,allocation.token),method=heap.definition('Holder').methods.get('apply');
 const block={id:'read',opcode:'arcade_objectField'},args={OBJECT:ref,FIELD:'state'},operation={id:'read',opcode:block.opcode,_argValues:args,_blockFunction:()=>0};
 const container={getBlock:id=>id==='read'?block:null,getProcedureDefinition:()=> 'definition',getProcedureParamNamesIdsAndDefaults:()=>[['self','action'],[],[]],_cache:{_executeCached:{root:{_ops:[operation]}}}};
 const target={blocks:container},params={self:ref,action:null},thread={target,topBlock:'definition',blockContainer:container,status:0,constructor:{STATUS_DONE:4},peekStack:()=> 'root',stackFrames:[{params,waitingReporter:method.procedure}]};
 runtime.targets.push(target);runtime.threads.push(thread);runtime.sequencer.activeThread=thread;
 runtime.isActiveThread=t=>runtime.threads.includes(t);runtime.getOpcodeFunction=()=>operation._blockFunction;
 frames.bind(thread,target,method.procedure,params);
 const proof={fieldReadBlock:block,procedure:method.procedure,receiverParameter:'self',className:'Holder',memberName:'apply'};
 const reads=createReads(runtime,BW,heap,frames,{currentGraph:()=>current,validateBody:()=>proof});
 const ticket=reads.prepare(thread,target,method,ref),util={runtime,thread,target};
 const observe=(input=args,value=heap.get(ref,'state'))=>primitive.invoke(runtime,thread,container,operation,args,util,()=>reads.observe(util,input,value));
 return {runtime,heap,frames,reads,ref,thread,ticket,util,args,operation,block,params,proof,observe,invalidate:()=>{current=false;},finish:()=>{thread.status=4;}};
};
test('Undefined completion needs the actual once-only saved field read',()=>{
 const f=fixture();assert.equal(f.observe(),true);f.finish();assert.equal(f.reads.complete(f.ticket,BW.UNDEFINED),true);
 assert.throws(()=>f.reads.complete(f.ticket,BW.UNDEFINED),/unknown or retired/);
 const noRead=fixture();noRead.finish();assert.throws(()=>noRead.reads.complete(noRead.ticket,BW.UNDEFINED),/never performed/);
 const early=fixture();early.observe();assert.throws(()=>early.reads.complete(early.ticket,BW.UNDEFINED),/outlived/);
});
test('present fields cannot grant Undefined, and later changes cannot replace the actual snapshot',()=>{
 const f=fixture(),state=f.heap.allocate('State');f.heap.finish(state.ref,state.token);f.heap.set(f.ref,'state',state.ref);
 assert.equal(f.observe(),true);f.heap.set(f.ref,'state',BW.UNDEFINED);f.finish();assert.equal(f.reads.complete(f.ticket,BW.UNDEFINED),false);
 const absent=fixture();absent.observe();const later=absent.heap.allocate('State');absent.heap.finish(later.ref,later.token);absent.heap.set(absent.ref,'state',later.ref);absent.finish();assert.equal(absent.reads.complete(absent.ticket,BW.UNDEFINED),true);
});
test('copied operands, observer calls, forged result and repeat reads cannot mint absence',()=>{
 const f=fixture();assert.equal(f.reads.observe(f.util,f.args,BW.UNDEFINED),false);
 assert.equal(f.observe({...f.args}),false);
 assert.throws(()=>f.observe(f.args,'fake'),/read result differs/);
 assert.equal(f.observe(),true);assert.throws(()=>f.observe(),/repeated/);
});
test('Stop, reload, graph edits and changed method read proof retire pending results',()=>{
 for(const change of [f=>f.runtime.emit('PROJECT_STOP_ALL'),f=>f.runtime.emit('PROJECT_LOADED'),f=>f.invalidate(),f=>{f.proof.fieldReadBlock={...f.block};},f=>{f.params.self=f.heap.allocate('Holder').ref;}]){
  const f=fixture();f.observe();change(f);f.finish();assert.throws(()=>f.reads.complete(f.ticket,BW.UNDEFINED),/unknown or retired|outlived|body differs/);
 }
});

test('disposal cannot be revived by Start and old tickets cannot survive a loaded generation',()=>{
 const f=fixture();f.observe();f.runtime.emit('RUNTIME_DISPOSED');f.runtime.emit('PROJECT_START');
 assert.throws(()=>f.reads.prepare(f.thread,f.util.target,f.heap.definition('Holder').methods.get('apply'),f.ref));
 f.runtime.emit('PROJECT_LOADED');f.finish();
 assert.throws(()=>f.reads.complete(f.ticket,BW.UNDEFINED),/unknown or retired/);
});
test('foreign runtime cannot use the current cached read loan',()=>{
 const f=fixture(),foreign=new EventEmitter();foreign.targets=f.runtime.targets;foreign.threads=f.runtime.threads;
 const util={...f.util,runtime:foreign};
 assert.throws(()=>primitive.invoke(f.runtime,f.thread,f.util.target.blocks,f.operation,f.args,util,()=>f.reads.observe(util,f.args,BW.UNDEFINED)),/actual cached caller/);
});
