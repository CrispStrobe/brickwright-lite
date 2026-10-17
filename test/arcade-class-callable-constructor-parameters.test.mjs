import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import referenceTypes from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-reference-types.js';
import createMetadata from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-metadata.js';
import createProvider from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-provider.js';
import createFrames from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-frames.js';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';
import createHost from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-host.js';
import CallableValues from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/callable-values.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const named=name=>({kind:'named',name});
const signature=result=>({kind:'callable',parameters:[],result:named(result)});
const parameter=(result='number')=>({name:'action',type:'callable',optional:false,callableSignature:signature(result)});
const spec=(name,parameters)=>({name,fields:[],initializer:'',constructor:'Constructor %s %s',parameters,methods:[]});
const source=`class Counter {trace:number;constructor(public readonly seed:number,private step:(value:number)=>number,public tick:()=>void){this.trace=this.seed;}read(){return this.step(this.seed);}bump(){this.trace+=1;this.tick();}}let seen=0;let box=new Counter(2,(value:number)=>value+3,()=>{seen+=1;});let first=box.read();box.bump();`;
const clean=(value,required)=>{
 for(const name of required){const d=Object.getOwnPropertyDescriptor(value,name);assert.ok(d&&Object.hasOwn(d,'value')&&Array.isArray(d.value),name);assert.deepEqual(d.value,[],name);}
 for(const name of Object.getOwnPropertyNames(value))if(/unsupported|warn|error|unparsed|diagnostic|refus|netAttempts/i.test(name)){const d=Object.getOwnPropertyDescriptor(value,name);assert.ok(Object.hasOwn(d,'value')&&Array.isArray(d.value),name);assert.deepEqual(d.value,[],name);}
};
const project=()=>{const imported=arcadeToPseudocode({'main.ts':source});clean(imported,['unsupported','warnings']);const creator=new Creator();creator.parse(imported.code);clean(creator,['errors','warnings','unparsed']);return creator.project;};
const metadataSlot=(project,name)=>{const rows=project.targets.flatMap(target=>Object.values(target.blocks).filter(block=>block.opcode==='arcade_declareClass').map(block=>({target,block})));assert.equal(rows.length,1);const {target,block}=rows[0],slot=block.inputs[name][1];assert.equal(typeof slot,'string');const child=target.blocks[slot];assert.equal(child.opcode,'text');return {get:()=>JSON.parse(child.fields.TEXT[0]),set:value=>{child.fields.TEXT[0]=JSON.stringify(value);}};};
// Real heap/callable/provider services with a modeled managed dispatcher. No
// native VM is imported or allocated by this focused source/control module.
const fixture=()=>{
 const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];runtime.sequencer={activeThread:null};let provider,service;
 const heap=createHeap(runtime,BW,{callableSignature:type=>provider.fieldSignature(type),constructorParameterSignature:type=>provider.constructorParameterSignature(type),callableField:(type,value)=>provider.fieldValue(type,value),callableMethod:method=>provider.methodSignature(method)});
 const definitions=new Map([['HolderMake %s',{id:'method'}],['ReadHolder',{id:'arrow'}]]),parameters=new Map([['HolderMake %s',['actualSelf']],['ReadHolder',[]]]);
 const target={blocks:{getProcedureDefinition:code=>definitions.get(code),getProcedureParamNamesIdsAndDefaults:code=>[parameters.get(code),[],[]]}};runtime.targets.push(target);let current=true;
 const frames=createFrames(runtime,heap,{currentGraph:()=>current});provider=createProvider(runtime,BW,heap,frames,{currentGraph:()=>current,currentCall:()=>true,signatureOf:ref=>service.signature(ref)});
 heap.register({name:'Holder',fields:[],initializer:'',constructor:'',parameters:[],methods:[{name:'make',procedure:'HolderMake %s',parameters:[],returnType:'callable',typeParameters:[],callableSignature:{kind:'callable',parameters:[],result:signature('number')}}]});
 service=new CallableValues(runtime,BW,provider);const allocation=heap.allocate('Holder'),params={actualSelf:allocation.ref};const thread={target,topBlock:definitions.get('HolderMake %s'),status:0,constructor:{STATUS_DONE:4},stackFrames:[{params,waitingReporter:'HolderMake %s'}]};runtime.threads.push(thread);runtime.sequencer.activeThread=thread;frames.bind(thread,target,'HolderMake %s',params);
 const plan={schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Holder',parent:null}],owners:[{id:'module',kind:'module',parent:null},{id:'method',kind:'method',parent:'module',sourceName:'make',procedure:'HolderMake %s',signature:{kind:'callable',parameters:[],result:signature('number')},parameters:[],defaults:[],className:'Holder',memberName:'make',receiver:'self',receiverParameter:'actualSelf',typeParameters:[]},{id:'arrow',kind:'arrow',parent:'method',sourceName:null,procedure:'ReadHolder',signature:signature('number'),parameters:[],defaults:[]}],bindings:[{id:'self',owner:'method',sourceName:'this',nativeName:'capturedSelf',kind:'receiver',type:named('Holder'),written:false}],sites:[{id:'site',owner:'arrow',createdIn:'method',captures:[],defaults:[]}]};
 service.declare(target,{schema:'bw-callable-declaration',version:2,site:'site',procedure:'ReadHolder',plan});const context={util:{thread,target},locals:{},ownerProcedure:'HolderMake %s'};
 const host=createHost(runtime,BW,()=>heap,{},()=>service);
 return {runtime,heap,provider,service,target,thread,host,context,ref:()=>service.create(target,'ReadHolder',context),invalidate:()=>{current=false;}};
};

test('actual Code and Creator constructor callback metadata enters the inert source catalogue unchanged',()=>{
 const actual=project(),parameters=metadataSlot(actual,'PARAMETERS').get();assert.deepEqual(parameters.map(row=>row.type),['number','callable','callable']);
 const catalogue=referenceTypes.catalogue(actual.targets);assert.ok(catalogue.has('Counter'));assert.equal(parameters[1].callableSignature.result.name,'number');assert.equal(parameters[2].callableSignature.result.name,'void');
 const fields=metadataSlot(actual,'FIELDS').get();assert.deepEqual(fields.filter(row=>row.parameterProperty).map(row=>row.name),['seed','step','tick']);assert.equal(fields.find(row=>row.name==='seed').readonly,true);
});

test('constructor catalogue refuses missing, malformed, disguised, optional and SDK-mixed callback metadata',()=>{
 const baseline=project();const edits=[row=>{delete row.callableSignature;},row=>{row.callableSignature={kind:'named',name:'number'};},row=>{row.type='number';},row=>{row.optional=true;},row=>{row.default=null;},row=>{row.sdkType={kind:'sdk',name:'Image'};},row=>{row.callableSignature.result={kind:'sdk',name:'Image'};},row=>{row.callableSignature.result={kind:'named',name:'any'};},row=>{row.callableSignature.result={kind:'named',name:'Missing'};},row=>{row.extra=true;}];
 for(const edit of edits){const actual=structuredClone(baseline),slot=metadataSlot(actual,'PARAMETERS'),parameters=slot.get();edit(parameters[1]);slot.set(parameters);assert.throws(()=>referenceTypes.catalogue(actual.targets),/constructor|parameter|signature|callable|SDK/i);}
});

test('an actual ordinary class named callable does not acquire a function parameter domain',()=>{
 const metadata=createMetadata(new Map([['callable',{name:'callable',parent:null,intrinsic:false}]]));assert.equal(metadata.parameter({name:'ordinary',type:'callable',optional:false}),undefined);
 const runtime=new EventEmitter(),heap=createHeap(runtime,BW);heap.register(spec('callable',[]));heap.register(spec('Container',[{name:'ordinary',type:'callable',optional:false}]));assert.equal(heap.definition('Container').parameters[0].callableSignature,undefined);
 assert.throws(()=>createMetadata(new Map()).parameter({name:'action',type:'callable',optional:false}),/explicit signature|ordinary class/);
});

test('heap constructor callback signatures require the owned service and freeze canonical copies',()=>{
 const raw=parameter();assert.throws(()=>createHeap(new EventEmitter(),BW).register(spec('Unwired',[raw])),/explicit owned signature service/);
 const f=fixture();f.heap.register(spec('Receiver',[raw]));raw.callableSignature.result.name='string';const held=f.heap.definition('Receiver').parameters[0];assert.equal(held.callableSignature.result.name,'number');assert.ok(Object.isFrozen(held)&&Object.isFrozen(held.callableSignature)&&Object.isFrozen(held.callableSignature.result));
 let index=0;for(const edit of [row=>{row.type='number';},row=>{row.sdkType={kind:'sdk',name:'Image'};},row=>{row.optional=true;},row=>{row.default=null;},row=>{row.callableSignature=undefined;},row=>{row.callableSignature.result={kind:'sdk',name:'Image'};}]){const row=parameter();edit(row);assert.throws(()=>f.heap.register(spec('Bad'+index++,[row])),/constructor|signature|SDK|callable/i);}
});

test('current constructor creator parameters must match the complete actual heap signature',()=>{
 const f=fixture();f.heap.register(spec('Receiver',[parameter()]));const callback=signature('number');
 const plan={schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Receiver',parent:null}],owners:[{id:'module',kind:'module',parent:null},{id:'ctor',kind:'constructor',parent:'module',sourceName:'constructor',procedure:'Constructor %s %s',signature:{kind:'callable',parameters:[{name:'action',optional:false,type:callback}],result:named('void')},parameters:['input'],defaults:[],className:'Receiver',memberName:null,receiver:'self',receiverParameter:'actualSelf',typeParameters:[]},{id:'arrow',kind:'arrow',parent:'ctor',sourceName:null,procedure:'ReadConstructor',signature:signature('number'),parameters:[],defaults:[]}],bindings:[{id:'self',owner:'ctor',sourceName:'this',nativeName:'capturedSelf',kind:'receiver',type:named('Receiver'),written:false},{id:'input',owner:'ctor',sourceName:'action',nativeName:'actualAction',kind:'parameter',type:callback,written:false}],sites:[{id:'site',owner:'arrow',createdIn:'ctor',captures:[],defaults:[]}]};
 const descriptor={schema:'bw-callable-declaration',version:2,site:'site',procedure:'ReadConstructor',plan};const proof=f.provider.prepareDeclaration(f.target,descriptor);assert.equal(f.provider.signature(proof).result.name,'number');
 const mismatch=structuredClone(descriptor);mismatch.plan.owners[1].signature.parameters[0].type.result.name='string';mismatch.plan.bindings[1].type.result.name='string';assert.throws(()=>f.provider.prepareDeclaration(f.target,mismatch),/actual heap signature/);
 f.invalidate();assert.throws(()=>f.provider.assertCurrent(proof,f.target),/current canonical class block graph/);
});

test('actual constructor arguments require owned matching callable resources rather than typed cells or tokens',()=>{
 const f=fixture();f.heap.register(spec('Receiver',[parameter()]));const definition=f.heap.definition('Receiver'),ref=f.ref();assert.doesNotThrow(()=>f.host.validateConstructor(definition,[ref]));
 const foreign=BW.reference(new EventEmitter(),'callable',ref.bwReference.id),forged=BW.reference(f.runtime,'callable','forged');
 for(const value of [undefined,null,BW.UNDEFINED,'ReadHolder',1,foreign,forged,f.heap.allocate('Holder').ref])assert.throws(()=>f.host.validateConstructor(definition,[value]),/argument|reference|signature|callable|owned/i);
 assert.throws(()=>f.host.validateConstructor(definition,[]),/argument|type/i);f.heap.register(spec('WrongResult',[parameter('string')]));assert.throws(()=>f.host.validateConstructor(f.heap.definition('WrongResult'),[ref]),/type differs/);
});

test('constructor argument validation preserves actual Stop, reload and disposed callable expiry',()=>{
 for(const event of ['PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED']){const f=fixture();f.heap.register(spec('Receiver',[parameter()]));const definition=f.heap.definition('Receiver'),ref=f.ref();f.host.validateConstructor(definition,[ref]);f.runtime.emit(event);assert.throws(()=>f.host.validateConstructor(definition,[ref]),/Stale|foreign|current canonical|disposed|reference/i);}
});

test('constructor-only explicit callbacks require the managed graph while ordinary constructors retain their route',()=>{
 const f=fixture();f.heap.register(spec('Receiver',[parameter()]));const allocation=f.heap.allocate('Receiver');assert.throws(()=>f.host.bind(f.thread,f.target,allocation.def.constructor,{},allocation.token,[allocation.ref,f.ref()]),/current project graph/);
 f.heap.register(spec('Ordinary',[{name:'value',type:'number',optional:false}]));const ordinary=f.heap.allocate('Ordinary');assert.equal(f.host.bind(f.thread,f.target,ordinary.def.constructor,{},ordinary.token,[ordinary.ref,1]),null);
});
