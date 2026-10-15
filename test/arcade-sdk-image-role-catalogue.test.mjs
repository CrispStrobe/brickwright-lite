import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import createGraph from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-graph.js';
import createProvider from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-provider.js';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';
import createTypes from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-types.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const sdk=()=>({kind:'sdk',name:'Image'}),number=()=>({kind:'named',name:'number'});
const signature=result=>({kind:'callable',parameters:[],result});
const roles=()=>({fields:[{name:'picture',type:'Image',sdkType:sdk()},{name:'read',type:'callable',callableSignature:signature(sdk())}],constructor:[{index:0,name:'picture',type:'Image',sdkType:sdk()}],methods:[{name:'copy',typeParameters:[],callableSignature:signature(sdk())}]});
function fixture(){
 const runtime=new EventEmitter();runtime.targets=[];
 let provider;
 const heap=createHeap(runtime,BW,{sdkSignature:type=>types.validate(type),sdkField:()=>{throw Error('no live Image owner');},callableSignature:type=>provider.fieldSignature(type),callableField:()=>{throw Error("no live callable owner");},callableMethod:method=>provider.methodSignature(method)});
 const types=createTypes(runtime,BW,heap,null,null,{sdkSchema:true});
 const target={blocks:{}};runtime.targets.push(target);
 provider=createProvider(runtime,BW,heap,null,{currentGraph:()=>true,sdkSchema:true});
 heap.register({name:'Picture',fields:[{name:'picture',type:'Image',valueKind:'sdk',sdkType:sdk(),readonly:false},{name:'read',type:'callable',valueKind:'callable',callableSignature:signature(sdk()),readonly:false}],parameters:[{name:'picture',type:'Image',optional:false,sdkType:sdk()}],constructor:'PictureCtor %s %s',initializer:'',methods:[{name:'copy',procedure:'Copy %s',parameters:[],returnType:'Image',typeParameters:[],callableSignature:signature(sdk())}]});
 const plan={schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Picture',parent:null,sdkRoles:roles()}],owners:[{id:'module',kind:'module',parent:null},{id:'arrow',kind:'arrow',parent:'module',sourceName:null,procedure:'Read',signature:signature(number()),parameters:[],defaults:[]}],bindings:[],sites:[{id:'site',owner:'arrow',createdIn:'module',captures:[],defaults:[]}]};
 const descriptor={schema:'bw-callable-declaration',version:2,site:'site',procedure:'Read',plan};
 return {provider,heap,target,descriptor,types,runtime};
}
test('SDK role catalogue binds every field, constructor slot and existing method signature',()=>{
 const f=fixture();assert.ok(f.provider.prepareDeclaration(f.target,f.descriptor));
 for(const change of [
  roles=>{roles.fields.splice(0,1);},roles=>{roles.fields.splice(1,1);},roles=>{roles.constructor=[];},roles=>{roles.methods=[];},
  roles=>{roles.fields[0].name='other';},roles=>{roles.constructor[0].index=1;},roles=>{roles.constructor[0].name='other';},
  roles=>{roles.methods[0].callableSignature.result=number();},roles=>{roles.fields[1].callableSignature.result=number();}
 ]){
  const bad=fixture();change(bad.descriptor.plan.classes[0].sdkRoles);assert.throws(()=>bad.provider.prepareDeclaration(bad.target,bad.descriptor),/SDK class roles|no SDK type/);
 }
 const absent=fixture();delete absent.descriptor.plan.classes[0].sdkRoles;assert.throws(()=>absent.provider.prepareDeclaration(absent.target,absent.descriptor),/SDK class roles/);
});
test('current SDK catalogue edits revoke a previously prepared proof and schema mode cannot issue an Image',()=>{
 const f=fixture(),proof=f.provider.prepareDeclaration(f.target,f.descriptor);
 f.heap.definition('Picture').fields.delete('picture');assert.throws(()=>f.provider.assertCurrent(proof,f.target),/SDK class roles/);
 assert.throws(()=>f.types.result(signature(sdk()),BW.reference(f.runtime,'image','invented')),/SDK Image owner|unqualified reference domain/);
});

test('dispatch catalogue constraints require current fixed metadata and cannot borrow a foreign or ambiguous plan',()=>{
 const graphFixture=()=>{
  const f=fixture(),blocks={definition:{id:'definition',opcode:'procedures_definition',parent:null,inputs:{},fields:{}},
   declaration:{id:'declaration',opcode:'arcade_declareCallable',parent:null,inputs:{METADATA:{block:'metadata',shadow:'metadata'},NAME:{block:'name',shadow:'name'}},fields:{}},
   metadata:{id:'metadata',opcode:'text',parent:'declaration',shadow:true,inputs:{},fields:{TEXT:{value:JSON.stringify({schema:'bw-callable-declaration',version:2,site:'site',plan:f.descriptor.plan})}}},
   name:{id:'name',opcode:'text',parent:'declaration',shadow:true,inputs:{},fields:{TEXT:{value:'Read'}}}};
  f.target.blocks={_blocks:blocks,getBlock:id=>blocks[id],getProcedureDefinition:()=> 'definition',getProcedureParamNamesIdsAndDefaults:()=>[[],[],[]]};
  const graph=createGraph(f.runtime);f.runtime.emit('PROJECT_START');return {...f,blocks,graph};
 };
 const good=graphFixture();assert.equal(good.graph.sdkPlans(good.target).length,1);
 assert.throws(()=>good.graph.sdkPlans({blocks:good.target.blocks}),/current target graph/);
 for(const change of [
  f=>{f.blocks.metadata.shadow=false;},f=>{f.blocks.metadata.opcode='arcade_getLocal';},f=>{f.blocks.metadata.parent='foreign';},
  f=>{f.blocks.metadata.fields.TEXT.value='{';},f=>{const value=JSON.parse(f.blocks.metadata.fields.TEXT.value);value.version=1;f.blocks.metadata.fields.TEXT.value=JSON.stringify(value);},
  f=>{f.blocks.name.fields.TEXT.value='Foreign';},f=>{f.blocks.declaration.inputs.METADATA.shadow='other';}
 ]){const f=graphFixture();change(f);f.runtime.emit('PROJECT_START');assert.throws(()=>f.graph.sdkPlans(f.target));}
 const stale=graphFixture();stale.blocks.metadata.fields.TEXT.value='{}';assert.throws(()=>stale.graph.sdkPlans(stale.target),/current target graph/);
 const ambiguous=graphFixture(),other=structuredClone(ambiguous.descriptor.plan);other.classes[0].sdkRoles.constructor[0].name='other';
 ambiguous.blocks.second={id:'second',opcode:'arcade_declareCallable',parent:null,fields:{},inputs:{METADATA:{block:'secondMetadata',shadow:'secondMetadata'},NAME:{block:'secondName',shadow:'secondName'}}};
 ambiguous.blocks.secondMetadata={...structuredClone(ambiguous.blocks.metadata),id:'secondMetadata',parent:'second'};
 ambiguous.blocks.secondMetadata.fields.TEXT.value=JSON.stringify({schema:'bw-callable-declaration',version:2,site:'site',plan:other});
 ambiguous.blocks.secondName={...structuredClone(ambiguous.blocks.name),id:'secondName',parent:'second'};
 ambiguous.runtime.emit('PROJECT_START');assert.throws(()=>ambiguous.graph.sdkPlans(ambiguous.target),/ambiguous current class roles/);
});
