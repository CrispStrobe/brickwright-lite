import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveClassCallableSource,classMethodSourceSignature,classConstructorSourceSignature} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {withClassResultFlowProof} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-result-flow-proof.js';
import {createClassCallableDescriptors} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-class-descriptors.js';
import {validateClassCallablePlan} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-plan.js';
import {classCallableExportTypes} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-export-types.js';
import {createClassCallableExportProvider} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-export-provider.js';
import {ordinaryConstructorParameterProperties} from '../overlay/scratch-gui/src/lib/bw-makecode/class-parameter-property-source.js';
import {lowerStaticCallbackHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/static-callback-helpers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

const source=`class Counter {
 trace:number;
 constructor(public readonly seed:number,private step:(value:number)=>number,public tick:()=>void){this.trace=this.seed;}
 read(){return this.step(this.seed);}
 bump(){this.trace+=1;this.tick();}
}
let seen=0;let box=new Counter(2,(value:number)=>value+3,()=>{seen+=1;});
let first=box.read();box.bump();let last=box.trace;let seed=box.seed;`;
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
const cls=program=>program.body.find(node=>node.type==='Class');
const accepted=()=>{const program=parse(source),proof=proveClassCallableSource(program);assert.equal(proof.eligible,true,proof.unsupported.join('\n'));return {program,proof};};
const record=row=>{if(process.env.BW_SHARED_FRAME_SNAPSHOTS)appendFileSync(process.env.BW_SHARED_FRAME_SNAPSHOTS,JSON.stringify(row)+'\n');};
const clean=(value,required)=>{
 const names=new Set(['unsupported','warnings','errors','unparsed','diagnostics','fetchRefusals','refused','netAttempts',
  ...Object.getOwnPropertyNames(value).filter(name=>/unsupported|warn|error|unparsed|diagnostic|refus|netAttempts/i.test(name))]);
 const observed=Object.fromEntries([...names].map(name=>{const row=Object.getOwnPropertyDescriptor(value,name);
  return [name,!row?{state:'ABSENT'}:!Object.hasOwn(row,'value')?{state:'ACCESSOR_UNOBSERVED'}:{state:'PROVIDED',value:row.value}];}));
 record({stage:'parameter-property-provided-channels',channels:observed,required});
 for(const name of required)assert.ok(Array.isArray(Object.getOwnPropertyDescriptor(value,name)?.value),name);
 for(const [name,row]of Object.entries(observed))if(row.state!=='ABSENT'){
  assert.equal(row.state,'PROVIDED',name);assert.ok(Array.isArray(row.value),name);assert.deepEqual(row.value,[],name);
 }
};

test('ordinary parameter properties retain Number and Void callable constraints and actual ordered writes',()=>{
 const {program}=accepted(),owner=cls(program),ctor=owner.ctor;
 assert.equal(proveClassCallableSource(parse(source.replace('private step:','protected step:'))).eligible,true);
 assert.equal(ordinaryConstructorParameterProperties(owner),true);
 assert.equal(ctor.parameterProperties,ctor.params.parameterProperties);
 assert.deepEqual(ctor.parameterProperties.map(value=>value.name),['seed','step','tick']);
 assert.deepEqual(Object.getOwnPropertyDescriptor(ctor.params,'parameterProperties'),{value:ctor.parameterProperties,writable:false,enumerable:false,configurable:false});
 assert.deepEqual(ctor.body.slice(0,3).map(statement=>[statement.expr.left.name,statement.expr.right.name]),[['seed','seed'],['step','step'],['tick','tick']]);
 assert.equal(ctor.body[3].expr.right.name,'seed');
 assert.equal(proveClassCallableSource(parse(source+'function carry():void{let value:Counter;value=box;value.bump();}carry();')).eligible,true,'bare local still needs its actual class assignment');
});

test('parameter property correspondence refuses independent metadata, fields, modifiers and write order',()=>{
 for(const change of [
  owner=>{owner.ctor.parameterProperties=structuredClone(owner.ctor.parameterProperties);},
  owner=>{owner.ctor.parameterProperties.reverse();},
  owner=>{owner.ctor.params.push('seed');},
  owner=>{owner.fields.find(field=>field.name==='seed').typeName='string';},
  owner=>{owner.fields.find(field=>field.name==='seed').modifiers=['public'];},
  owner=>{owner.fields.find(field=>field.name==='seed').parameterProperty=false;},
  owner=>{owner.ctor.body.splice(0,1);},
  owner=>{[owner.ctor.body[0],owner.ctor.body[1]]=[owner.ctor.body[1],owner.ctor.body[0]];},
  owner=>{owner.ctor.body[0].expr.right.name='trace';},
  owner=>{owner.ctor.body.unshift({type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'unknown'},args:[]}});},
 ]){const program=parse(source);change(cls(program));assert.equal(ordinaryConstructorParameterProperties(cls(program)),false);assert.equal(proveClassCallableSource(program).eligible,false);}
});

test('actual argument producers, readonly, visibility and complete neighboring bodies remain required',()=>{
 for(const text of [
  source.replace('new Counter(2,','new Counter("wrong" as any,'),
  source.replace('value+3','"wrong"'),
  source+'box.seed=9;',source+'let leaked=box.step;',
  source.replace('constructor(public readonly seed:number,','constructor(public readonly seed:number=2,'),
  source+'function unvisited(value:any){return value.missing();}',
  source.replace('this.trace=this.seed;','this.trace=unknown();'),
  source.replace('trace:number;','trace:number=this.seed;'),
  source+'function carry():void{let value:Counter;value.bump();value=box;}carry();',
  source+'function carry():void{let value:Counter;value="wrong";value.bump();}carry();',
  source+'function carry():void{let value:Counter=undefined;value=box;value.bump();}carry();',
 ])assert.equal(proveClassCallableSource(parse(text)).eligible,false,text);
});

test('reflection transfers hidden parser roles and shared metadata without preinitializing fields',()=>{
 const {program,proof}=accepted(),lowered=withClassResultFlowProof(program,proof),owner=cls(lowered);
 assert.notEqual(lowered,program);assert.notEqual(owner.ctor.params,cls(program).ctor.params);
 assert.equal(owner.ctor.parameterProperties,owner.ctor.params.parameterProperties);
 assert.notEqual(owner.ctor.parameterProperties,cls(program).ctor.parameterProperties);
 assert.deepEqual(Object.getOwnPropertyDescriptor(owner.ctor.params,'parameterProperties'),{value:owner.ctor.parameterProperties,writable:false,enumerable:false,configurable:false});
 assert.equal(ordinaryConstructorParameterProperties(owner),true);
 const signature=classConstructorSourceSignature(proof,program,cls(program));
 assert.throws(()=>classConstructorSourceSignature({...proof},program,cls(program)),/actual unchanged source proof/);
 assert.equal(signature.parameters[1].type.kind,'callable');assert.equal(signature.parameters[1].type.result.name,'number');
 assert.deepEqual(owner.ctor.bwClassCallableSignature,signature);signature.parameters[1].type.result.name='string';
 assert.equal(classConstructorSourceSignature(proof,program,cls(program)).parameters[1].type.result.name,'number');
 // An ordinary user class named callable retains its existing named codec;
 // only the explicit signature selects the function resource domain.
 const types=classCallableExportTypes(new Map([['callable',{name:'callable',parent:null}]]));
 assert.equal(types.parameter({name:'value',type:'callable',optional:false}),'callable');
 assert.match(types.parameter({name:'value',type:'callable',optional:false,callableSignature:classConstructorSourceSignature(proof,program,cls(program)).parameters[1].type}),/=>\s*number/);
 assert.deepEqual(owner.ctor.body,cls(program).ctor.body);
 assert.ok(owner.fields.filter(field=>field.parameterProperty).every(field=>field.init===null));
 // Unqualified legacy higher-order helpers still specialize and refuse escapes;
 // retaining the checked class constructor must not exempt these templates.
 const legacy=lowerStaticCallbackHelpers(parse('function apply(handler:()=>number){return handler()}let result=apply(function(){return 3})'));
 assert.deepEqual(legacy.unsupported,[]);assert.ok(!legacy.program.body.some(node=>node.type==='FunctionDeclaration'&&node.name==='apply'));
 assert.ok(legacy.program.loweredStaticCallbacks);
 const escaped=lowerStaticCallbackHelpers(parse('let stored=0;function save(handler:()=>number){stored=handler}save(function(){return 3})'));
 assert.ok(escaped.unsupported.some(message=>/escapes/.test(message)));

 // Exercise the shared statement certificate independently of the whole
 // exporter, so a sink-use mutation cannot pass through an earlier refusal.
 const discarded=()=>{
  const named=name=>({kind:'named',name}),signature={kind:'callable',parameters:[],result:named('void')};
  const target={name:'Game',variables:{},blocks:{
   definition:{opcode:'procedures_definition',next:'sink'},
   sink:{opcode:'arcade_setLocal',parent:'definition',next:null,inputs:{NAME:[1,[10,'unusedResult']],VALUE:[1,'call']}},
   call:{opcode:'arcade_callObjectMethod',parent:'sink',inputs:{OBJECT:[1,'self'],METHOD:[1,[10,'touch']],ARGS:[1,[10,'[]']]}},
   self:{opcode:'arcade_getLocal',parent:'call',inputs:{NAME:[1,[10,'self']]}},
   method:{opcode:'procedures_definition',next:null}
  }},project={targets:[target]};
  const method={name:'touch',procedure:'touch %s',parameters:[],typeParameters:[],callableSignature:structuredClone(signature)};
  const box={name:'Box',parent:null,target,fields:[],methods:[method],constructor:'ctor %s',parameters:[]};
  const owner={id:'ctor',kind:'constructor',parent:'module',sourceName:'constructor',procedure:box.constructor,signature,parameters:[],defaults:[],className:'Box',memberName:null,receiver:'receiver',receiverParameter:'self',typeParameters:[]};
  const plan={schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Box',parent:null}],owners:[{id:'module',kind:'module',parent:null},owner],bindings:[{id:'receiver',owner:'ctor',sourceName:'this',nativeName:'receiverCell',kind:'receiver',type:named('Box'),written:false}],sites:[]};
  const definitions=new Map([[box.constructor,{target,code:box.constructor,block:target.blocks.definition,parameters:['self']}],[method.procedure,{target,code:method.procedure,block:target.blocks.method,parameters:['self']}]]);
  const provider=()=>createClassCallableExportProvider({target,project,classes:new Map([['Box',box]]),definitions,valueTypes:()=>new Set(),literal:(_target,block,name)=>block.inputs?.[name]?.[1]?.[1]??null,key:(_target,code)=>code,builtinNames:new Set()});
  const issue=()=>{const p=provider();assert.equal(p.validateCurrentPlan(plan,target),true);return p;};
  return {target,project,plan,owner,method,definitions,issue};
 };
 const globalDiscarded=()=>{
  const f=discarded(),stage={name:'Stage',isStage:true,variables:{boxID:['box',0]},blocks:{}};
  f.project.targets.unshift(stage);
  const owner={id:'startup',kind:'declaration',parent:'module',sourceName:'initialize',procedure:'initialize',signature:{kind:'callable',parameters:[],result:{kind:'named',name:'void'}},parameters:[],defaults:[]};
  f.plan.owners.push(owner);f.plan.bindings.push({id:'allocated',owner:'startup',sourceName:'allocated',nativeName:'allocated',kind:'local',declarationKind:'let',type:{kind:'named',name:'Box'},written:true});
  Object.assign(f.target.blocks,{
   startup:{opcode:'procedures_definition',next:'allocate'},
   allocate:{opcode:'arcade_setLocal',parent:'startup',next:'publish',inputs:{NAME:[1,[10,'allocated']],VALUE:[1,'newBox']}},
   newBox:{opcode:'arcade_createObject',parent:'allocate',inputs:{CLASS:[1,[10,'Box']],ARGS:[1,[10,'[]']]}},
   publish:{opcode:'data_setvariableto',parent:'allocate',next:'sink',fields:{VARIABLE:['box','boxID']},inputs:{VALUE:[1,'localBox']}},
   localBox:{opcode:'arcade_getLocal',parent:'publish',inputs:{NAME:[1,[10,'allocated']]}}
  });
  f.target.blocks.definition.next=null;f.target.blocks.sink.parent='publish';f.target.blocks.call.inputs.OBJECT=[3,[12,'box','boxID'],[10,'']];
  f.definitions.set('initialize',{target:f.target,code:'initialize',block:f.target.blocks.startup,parameters:[]});
  return {...f,owner,stage};
 };
 {
  const f=globalDiscarded(),p=f.issue(),certificate=p.unusedVoidStatement(f.target.blocks.sink,f.owner);
  assert.equal(f.plan.bindings.some(binding=>binding.nativeName==='box'),false,'ordinary global is outside the callable global catalogue');
  assert.equal(certificate.current(),true,'actual Stage global and Game allocation/writer independently supply statement receiver proof');
  f.target.blocks.publish.inputs.VALUE=[1,[10,'wrong']];assert.equal(certificate.current(),false);
  f.target.blocks.publish.inputs.VALUE=[1,'localBox'];assert.equal(certificate.current(),false);
  assert.equal(f.issue().unusedVoidStatement(f.target.blocks.sink,f.owner).current(),true);
 }
 for(const mode of ['wrong-global-writer','extra-global-writer','foreign-global-writer']){
  const f=globalDiscarded(),p=f.issue();
  if(mode==='wrong-global-writer')f.target.blocks.publish.inputs.VALUE=[1,[10,'wrong']];
  else (mode==='foreign-global-writer'?f.stage:f.target).blocks.otherWriter={opcode:'data_setvariableto',fields:{VARIABLE:['box','boxID']},inputs:{VALUE:[1,[10,'wrong']]}};
  assert.equal(p.unusedVoidStatement(f.target.blocks.sink,f.owner),null,mode);
 }
 const moduleDiscarded=()=>{
  const f=discarded(),owner={id:'work',kind:'declaration',parent:'module',sourceName:'performEffect',procedure:'performEffect',signature:{kind:'callable',parameters:[],result:{kind:'named',name:'void'}},parameters:[],defaults:[]};
  f.plan.owners.push(owner);f.target.blocks.definition.next=null;
  Object.assign(f.target.blocks,{
   root:{opcode:'arcade_whenSourceStarts',topLevel:true,next:'sink'},
   work:{opcode:'procedures_definition',next:null,inputs:{custom_block:[1,'workProto']}},
   workProto:{opcode:'procedures_prototype',parent:'work',mutation:{proccode:'performEffect',argumentnames:'[]'}}
  });
  f.target.blocks.sink.parent='root';f.target.blocks.call={opcode:'arcade_callFunction',parent:'sink',inputs:{NAME:[1,[10,'performEffect']],ARGS:[1,[10,'[]']]}};
  f.definitions.set('performEffect',{target:f.target,code:'performEffect',block:f.target.blocks.work,parameters:[]});
  return {...f,owner,root:f.target.blocks.root};
 };
 {
  const f=moduleDiscarded(),p=f.issue(),context=p.contextForModuleRoot(f.root,{},new Set());
  assert.ok(context,'source root with a current declaration call needs no direct constructor/callable factory');
  assert.equal(context.discardLocal('sink'),true);assert.equal(context.generatedLocal('sink'),null,'Void call is not a value local');
  const certificate=p.unusedVoidStatement(f.target.blocks.sink,{rootBlock:f.root});
  f.target.blocks.work.next='changed';assert.equal(certificate.current(),false);f.target.blocks.work.next=null;
  assert.equal(certificate.current(),false);assert.equal(context.discardLocal('sink'),false);
  assert.equal(f.issue().contextForModuleRoot(f.root,{},new Set()).discardLocal('sink'),true);
 }
 {
  const f=moduleDiscarded();
  f.target.blocks.nameText={opcode:'text',parent:'call',shadow:true,inputs:{},fields:{TEXT:['performEffect']}};
  f.target.blocks.argsText={opcode:'text',parent:'call',shadow:true,inputs:{},fields:{TEXT:['[]']}};
  f.target.blocks.call.inputs.NAME=[1,'nameText'];f.target.blocks.call.inputs.ARGS=[1,'argsText'];
  assert.equal(f.issue().contextForModuleRoot(f.root,{},new Set()).discardLocal('sink'),true,'canonical literal text shadows retain exact declaration/empty-argument codec');
 }
 {
  const f=moduleDiscarded(),p=f.issue();let invoked=0;
  f.target.blocks.call.inputs.NAME=[1,[10,{toString(){invoked++;throw Error('must not coerce');}}]];
  assert.equal(p.unusedVoidStatement(f.target.blocks.sink,{rootBlock:f.root}),null);assert.equal(invoked,0);
 }
 for(const mode of ['procedure','signature','formals','arguments','reader','global-writer']){
  const f=moduleDiscarded(),p=f.issue();
  if(mode==='procedure')f.target.blocks.call.inputs.NAME=[1,[10,'unknown']];
  if(mode==='signature')f.owner.signature.result={kind:'named',name:'number'};
  if(mode==='formals')f.target.blocks.workProto.mutation.argumentnames='["unexpected"]';
  if(mode==='arguments'){f.target.blocks.call.inputs.ARGS=[1,'argument'];f.target.blocks.argument={opcode:'arcade_functionArgument',parent:'call',inputs:{VALUE:[1,[4,'1']],REST:[1,[10,'[]']]}};}
  if(mode==='reader')f.target.blocks.read={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,'unusedResult']]}};
  if(mode==='global-writer')f.target.variables.collision=['unusedResult',0];
  assert.equal(p.unusedVoidStatement(f.target.blocks.sink,{rootBlock:f.root}),null,mode);
  assert.equal(p.contextForModuleRoot(f.root,{},new Set()),null,mode);
 }
 // Observe expiry only through the real context consumers. An early opcode,
 // physical-identity or root-admission refusal must not hide stale evidence.
 for(const mode of ['opcode','replacement','throw','root-admission']){
  const f=moduleDiscarded(),p=f.issue(),context=p.contextForModuleRoot(f.root,{},new Set());assert.equal(context.discardLocal('sink'),true);
  let restore;
  if(mode==='opcode'){f.target.blocks.sink.opcode='text';restore=()=>{f.target.blocks.sink.opcode='arcade_setLocal';};}
  if(mode==='replacement'){const old=f.target.blocks.sink;f.target.blocks.sink={...old};restore=()=>{f.target.blocks.sink=old;};}
  if(mode==='root-admission'){f.root.topLevel=false;restore=()=>{f.root.topLevel=true;};}
  if(mode==='throw'){
   const error=Error('consumer currentness observation');Object.defineProperty(f.target.blocks,'observation',{configurable:true,enumerable:true,get(){throw error;}});
   assert.throws(()=>context.discardLocal('sink'),actual=>actual===error);restore=()=>{delete f.target.blocks.observation;};
  }else if(mode==='root-admission')assert.equal(p.contextForModuleRoot(f.root,{},new Set()),null);
  else assert.equal(context.discardLocal('sink'),false);
  restore();assert.equal(context.discardLocal('sink'),false,mode);assert.equal(p.contextForModuleRoot(f.root,{},new Set()),null,mode);
  assert.equal(f.issue().contextForModuleRoot(f.root,{},new Set()).discardLocal('sink'),true,'fresh provider may reprove restored source');
 }
 {
  const f=discarded();f.target.blocks.definition.next=null;f.target.blocks.method.next='sink';f.target.blocks.sink.parent='method';
  const p=f.issue(),context=p.contextForMethod('touch %s');assert.equal(context.discardLocal('sink'),true);
  f.target.blocks.sink.opcode='text';assert.equal(context.discardLocal('sink'),false);f.target.blocks.sink.opcode='arcade_setLocal';
  assert.equal(context.discardLocal('sink'),false);assert.equal(f.issue().contextForMethod('touch %s').discardLocal('sink'),true);
 }
 {
  const f=discarded(),p=f.issue(),sink=f.target.blocks.sink,certificate=p.unusedVoidStatement(sink,f.owner);
  assert.equal(certificate.current(),true);
  assert.equal(p.unusedVoidStatement({...sink},f.owner),null);
  assert.equal(p.unusedVoidStatement(sink,{id:'foreign'}),null);
  assert.equal(p.unusedVoidStatement(sink,{procedure:'ctor %s'}),certificate,'nonlexical constructor owner remains supported');
  f.target.blocks.read={opcode:'arcade_getCaptured',inputs:{NAME:[1,[10,'unusedResult']]}};
  assert.equal(certificate.current(),false);delete f.target.blocks.read;
  assert.equal(certificate.current(),false);assert.equal(p.unusedVoidStatement(sink,f.owner),null);
  assert.equal(f.issue().unusedVoidStatement(sink,f.owner).current(),true);
 }
 {
  const f=discarded();
  f.target.blocks.root={opcode:'arcade_whenSourceStarts',next:'sink'};
  f.target.blocks.definition.next=null;f.target.blocks.sink.parent='root';
  f.target.blocks.self={opcode:'arcade_createObject',parent:'call',inputs:{CLASS:[1,[10,'Box']],ARGS:[1,[10,'[]']]}};
  const p=f.issue();assert.equal(p.unusedVoidStatement(f.target.blocks.sink,{rootBlock:f.target.blocks.root}).current(),true,'actual ordinary module root needs no lexical id');
 }
 {
  const f=discarded(),p=f.issue(),certificate=p.unusedVoidStatement(f.target.blocks.sink,f.owner);
  f.method.callableSignature.result={kind:'named',name:'number'};
  assert.equal(certificate.current(),false);f.method.callableSignature.result={kind:'named',name:'void'};
  assert.equal(certificate.current(),false,'method metadata restoration cannot revive a consumed Void proof');
 }
 for(const change of [
  f=>{f.target.blocks.read={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,'unusedResult']]}};},
  f=>{f.target.blocks.capture={opcode:'arcade_getCaptured',inputs:{NAME:[1,[10,'unusedResult']]}};},
  f=>{f.target.blocks.writer={opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'unusedResult']],VALUE:[1,[4,'0']]}};},
  f=>{f.target.blocks.declaration={opcode:'arcade_declareLocal',inputs:{NAME:[1,[10,'unusedResult']]}};},
  f=>{f.target.variables.exposed=['unusedResult',0];},
  f=>{f.target.blocks.sink.inputs.VALUE=[1,[4,'2']];},
  f=>{f.target.blocks.call.parent='definition';},
  f=>{f.target.blocks.call.inputs.OBJECT=[1,[10,'not a receiver']];},
  f=>{f.target.blocks.call.inputs.ARGS=[1,'argument'];f.target.blocks.argument={opcode:'arcade_functionArgument',parent:'call',inputs:{VALUE:[1,[4,'1']],REST:[1,[10,'[]']]}};}
 ]){
  const f=discarded(),p=f.issue();change(f);
  let result=null;try{result=p.unusedVoidStatement(f.target.blocks.sink,f.owner);}catch(error){assert.match(error.message,/current|argument|signature/);}
  assert.equal(result,null);
 }
 {
  const f=discarded(),p=f.issue(),certificate=p.unusedVoidStatement(f.target.blocks.sink,f.owner),failure=Error('currentness observation');
  Object.defineProperty(f.target.blocks,'observation',{configurable:true,enumerable:true,get(){throw failure;}});
  assert.throws(()=>certificate.current(),error=>error===failure);delete f.target.blocks.observation;
  assert.equal(certificate.current(),false);assert.equal(p.unusedVoidStatement(f.target.blocks.sink,f.owner),null);
  assert.equal(f.issue().unusedVoidStatement(f.target.blocks.sink,f.owner).current(),true);
 }

 assert.equal(proveClassCallableSource(lowered).eligible,true);
 owner.ctor.bwClassCallableSignature.parameters[1].type.result.name='string';
 assert.ok(createClassCallableDescriptors(lowered).unsupported.length);
});

test('hidden metadata mutation expires a completed proof permanently while fresh source can reprove',()=>{
 for(const mutate of [
  owner=>{const values=owner.ctor.params.parameterProperties;const old=values[0].modifiers;values[0].modifiers=['private'];return()=>{values[0].modifiers=old;};},
  owner=>{const old=owner.ctor.params;owner.ctor.params=[...old];return()=>{owner.ctor.params=old;};},
  owner=>{const old=owner.ctor.parameterProperties;owner.ctor.parameterProperties=[...old];return()=>{owner.ctor.parameterProperties=old;};},
 ]){const {program,proof}=accepted(),owner=cls(program),method=owner.methods[0],restore=mutate(owner);
  assert.throws(()=>classMethodSourceSignature(proof,program,method),/actual unchanged source proof/);restore();
  assert.throws(()=>withClassResultFlowProof(program,proof),/actual unchanged source proof/);
  assert.equal(proveClassCallableSource(program).eligible,true);
 }
});

test('descriptor accessors are observed without invoking them and cannot revive a proof',()=>{
 const {program,proof}=accepted(),owner=cls(program),property=owner.ctor.parameterProperties[0];
 const descriptor=Object.getOwnPropertyDescriptor(property,'typeName');let invoked=0;
 Object.defineProperty(property,'typeName',{configurable:true,enumerable:true,get(){invoked++;throw Error('must not invoke');}});
 assert.throws(()=>withClassResultFlowProof(program,proof),/actual unchanged source proof/);assert.equal(invoked,0);
 Object.defineProperty(property,'typeName',descriptor);
 assert.throws(()=>withClassResultFlowProof(program,proof),/actual unchanged source proof/);assert.equal(invoked,0);
 const fresh=parse(source),ctor=cls(fresh).ctor,top=Object.getOwnPropertyDescriptor(ctor,'parameterProperties');
 Object.defineProperty(ctor,'parameterProperties',{configurable:true,enumerable:true,get(){invoked++;throw Error('must not invoke');}});
 assert.equal(proveClassCallableSource(fresh).eligible,false);assert.equal(invoked,0);
 Object.defineProperty(ctor,'parameterProperties',top);assert.equal(proveClassCallableSource(fresh).eligible,true);
});

test('parameter property public Code and two actual SB3 projects export and reimport full bodies',async()=>{
 const original=parse(source),before=structuredClone(original),imported=arcadeToPseudocode({'main.ts':source});
 record({stage:'parameter-property-import',source,result:imported});clean(imported,['unsupported','warnings']);assert.deepEqual(original,before);
 const first=new Creator();first.parse(imported.code);record({stage:'parameter-property-Creator',project:first.project,errors:first.errors,warnings:first.warnings,unparsed:first.unparsed});clean(first,['errors','warnings','unparsed']);
 const firstBytes=Buffer.from(await(await first.generateSB3()).arrayBuffer()),firstZip=await JSZip.loadAsync(firstBytes),firstProject=JSON.parse(await firstZip.file('project.json').async('string'));
 record({stage:'parameter-property-SB3',bytes:firstBytes.toString('base64'),project:firstProject});assert.deepEqual(firstProject,first.project);
 // Mutations keep the actual declaration/procedure graph and supplied
 // closures. They must fail current export rather than acquire type authority
 // from an edited declaration or repeated lexical-plan payload.
 const literal=(target,block,name)=>{const slot=block.inputs[name][1];return Array.isArray(slot)?slot[1]:target.blocks[slot].fields.TEXT[0];};
 const setLiteral=(target,block,name,value)=>{const slot=block.inputs[name][1];if(Array.isArray(slot))slot[1]=value;else target.blocks[slot].fields.TEXT[0]=value;};
 const declaration=project=>{const found=project.targets.flatMap(target=>Object.values(target.blocks).filter(block=>block.opcode==='arcade_declareClass'&&literal(target,block,'NAME')==='Counter').map(block=>({target,block})));assert.equal(found.length,1);return found[0];};
 const constructorBindings=project=>{
  const {target,block}=declaration(project),code=literal(target,block,'CONSTRUCTOR');
  const prototypes=Object.entries(target.blocks).filter(([,value])=>value.opcode==='procedures_prototype'&&value.mutation.proccode===code);
  assert.equal(prototypes.length,1,'actual declared constructor survives callback lowering');
  const [prototypeID,prototype]=prototypes[0],names=JSON.parse(prototype.mutation.argumentnames),definition=target.blocks[prototype.parent];
  assert.equal(definition.opcode,'procedures_definition');assert.equal(definition.inputs.custom_block[1],prototypeID);
  assert.deepEqual(names.slice(1),['seed','step','tick']);
  let parent=prototype.parent,current=definition.next;
  for(const field of JSON.parse(literal(target,block,'FIELDS')).filter(field=>field.parameterProperty)){
   const write=target.blocks[current];assert.equal(write.opcode,'arcade_setObjectField');assert.equal(write.parent,parent);assert.equal(literal(target,write,'FIELD'),field.name);
   for(const [input,name]of [['OBJECT',names[0]],['VALUE',field.name]]){
    const id=write.inputs[input][1],value=target.blocks[id];assert.equal(value.opcode,'arcade_getLocal');assert.equal(value.parent,current);assert.equal(literal(target,value,'NAME'),name);
   }
   parent=current;current=write.next;
  }
  assert.ok(current,'authored constructor body follows its actual parameter writes');
 };
 constructorBindings(firstProject);
 const exported=projectToArcade(firstProject);record({stage:'parameter-property-export',result:exported});clean(exported,['unsupported','warnings']);
 const unparen=node=>node?.type==='Parenthesized'?unparen(node.expression):node;
 const exportArrowBindings=(program,proof,phase,sourceText)=>{
  const constructionBindings=[];
  for(const owner of [program,...program.body.filter(node=>node.type==='FunctionDeclaration')])for(const statement of owner.body){
   if(statement.type==='Declaration')for(const declaration of statement.decls){const call=unparen(declaration.init);if(call?.type==='Call'&&call.isNew&&call.callee.type==='Identifier'&&call.callee.name==='Counter')constructionBindings.push({kind:'initializer',owner,name:declaration.name,declaration,call});}
   if(statement.type==='ExpressionStatement'){
    const assignment=unparen(statement.expr),call=unparen(assignment?.right);
    if(assignment?.type==='Assignment'&&assignment.op==='='&&call?.type==='Call'&&call.isNew&&call.callee.type==='Identifier'&&call.callee.name==='Counter'){
     const declarations=owner.body.filter(node=>node.type==='Declaration').flatMap(node=>node.decls).filter(row=>assignment.left.type==='Identifier'&&row.name===assignment.left.name);
     constructionBindings.push({kind:'assignment',owner,name:assignment.left.name,declarations,declaration:declarations[0],assignment,call});
    }
   }
  }
  const constructions=constructionBindings.map(row=>row.call);
  const numberArrow=constructions[0]?.args[1],voidArrow=constructions[0]?.args[2],
   numberSignature=numberArrow&&proof.flow.signature(proof.flow.profiles.get(numberArrow)),
   voidSignature=voidArrow&&proof.flow.signature(proof.flow.profiles.get(voidArrow)),
   assignment=unparen(voidArrow?.body?.[0]?.expr),fallback=unparen(assignment?.right),
   helper=fallback?.callee?.type==='Identifier'&&program.body.find(node=>node.type==='FunctionDeclaration'&&node.name===fallback.callee.name);
  record({stage:'parameter-property-export-arrow-bindings',phase,sourceText,program,eligible:proof.eligible,unsupported:proof.unsupported,constructionCount:constructions.length,constructionBindings,numberArrow,numberSignature,voidArrow,voidSignature,helper});
  assert.equal(proof.eligible,true,proof.unsupported.join('\n'));assert.equal(constructions.length,1);
  for(const binding of constructionBindings)if(binding.kind==='assignment'){assert.equal(binding.assignment.left.type,'Identifier');assert.equal(binding.declarations.length,1,'actual constructor assignment has one same-scope local declaration');assert.equal(binding.declaration.typeName,'Counter');assert.equal(binding.declaration.init,null);}
  assert.equal(numberArrow.type,'FunctionExpression');assert.equal(numberArrow.functionKind,'arrow');assert.deepEqual(numberArrow.params,['value']);
  assert.equal(numberSignature.parameters[0].type.name,'number');assert.equal(numberSignature.result.kind,'named');assert.equal(numberSignature.result.name,'number');
  assert.equal(numberArrow.body.length,1);assert.equal(numberArrow.body[0].type,'Return');
  const returned=unparen(numberArrow.body[0].value);assert.equal(returned.type,'Binary');assert.equal(returned.op,'+');
  assert.equal(unparen(returned.left).type,'Identifier');assert.equal(unparen(returned.left).name,numberArrow.params[0]);
  const increment=unparen(returned.right);assert.equal(increment.type,'Binary');assert.equal(increment.op,'+');assert.equal(unparen(increment.left).type,'Number');assert.equal(unparen(increment.right).type,'Number');assert.equal(unparen(increment.left).value,'0');assert.equal(unparen(increment.right).value,'3');
  // The separately unproved captured global stays on its generic path. The
  // Number Arrow's success must not grant that Void callback a Number fact.
  assert.equal(voidArrow.type,'FunctionExpression');assert.equal(voidArrow.functionKind,'arrow');assert.deepEqual(voidArrow.params,[]);assert.equal(voidSignature.result.name,'void');
  assert.equal(assignment.type,'Assignment');assert.equal(assignment.op,'=');assert.equal(assignment.left.name,'seen');assert.equal(fallback.type,'Call');
  assert.ok(helper);assert.match(helper.name,/^__bwBinaryAdd_*$/);assert.deepEqual(helper.params,['left','right']);
  assert.equal(helper.paramTypes.left.text,'any');assert.equal(helper.paramTypes.right.text,'any');assert.equal(helper.returnType,'any');
  assert.equal(helper.body.length,1);const operation=unparen(helper.body[0].value);assert.equal(operation.type,'Binary');assert.equal(operation.op,'+');
  assert.equal(operation.left.name,helper.params[0]);assert.equal(operation.right.name,helper.params[1]);
  return constructionBindings[0];
 };
 const exportedProgram=parse(exported.ts),exportedProof=proveClassCallableSource(exportedProgram);exportArrowBindings(exportedProgram,exportedProof,'first',exported.ts);
 const actual=declaration(firstProject),parameters=JSON.parse(literal(actual.target,actual.block,'PARAMETERS'));
 assert.deepEqual(parameters.map(parameter=>parameter.type),['number','callable','callable']);
 assert.equal(parameters[1].callableSignature.result.name,'number');assert.equal(parameters[2].callableSignature.result.name,'void');
 const edits=[
  project=>{const {target,block}=declaration(project),values=JSON.parse(literal(target,block,'PARAMETERS'));values[1].callableSignature.result.name='string';setLiteral(target,block,'PARAMETERS',JSON.stringify(values));},
  project=>{const {target,block}=declaration(project),values=JSON.parse(literal(target,block,'PARAMETERS'));values[1].callableSignature.parameters[0].type.name='string';setLiteral(target,block,'PARAMETERS',JSON.stringify(values));},
  project=>{const {target,block}=declaration(project),values=JSON.parse(literal(target,block,'PARAMETERS'));values[1].type='(value:number)=>number';delete values[1].callableSignature;setLiteral(target,block,'PARAMETERS',JSON.stringify(values));},
  project=>{const {target,block}=declaration(project),code=literal(target,block,'CONSTRUCTOR'),prototypes=Object.values(target.blocks).filter(value=>value.opcode==='procedures_prototype'&&value.mutation.proccode===code);assert.equal(prototypes.length,1);const names=JSON.parse(prototypes[0].mutation.argumentnames);assert.deepEqual(names.slice(1),['seed','step','tick']);names[2]='wrongStep';prototypes[0].mutation.argumentnames=JSON.stringify(names);},
  project=>{let count=0;for(const target of project.targets)for(const block of Object.values(target.blocks))if(block.opcode==='arcade_declareCallable'){
   const metadata=JSON.parse(literal(target,block,'METADATA')),owners=metadata.plan.owners.filter(owner=>owner.kind==='constructor'&&owner.className==='Counter');assert.equal(owners.length,1);
   const binding=metadata.plan.bindings.find(binding=>binding.id===owners[0].parameters[1]);assert.ok(binding);assert.equal(binding.owner,owners[0].id);assert.equal(binding.sourceName,'step');
   owners[0].signature.parameters[1].type.result.name='string';binding.type.result.name='string';
   assert.doesNotThrow(()=>validateClassCallablePlan(metadata.plan));setLiteral(target,block,'METADATA',JSON.stringify(metadata));count++;
  }assert.equal(count,2);},
 ];
 for(let index=0;index<edits.length;index++){const edited=structuredClone(firstProject);edits[index](edited);const result=projectToArcade(edited);record({stage:'parameter-property-edited-constructor-refusal',index,project:edited,result});assert.ok(result.unsupported.length,index);}
 // Neither a callable declaration nor a Number parameter may rescue an
 // edited physical operand or captured global writer.
 for(const mode of ['callback-operand','captured-global-writer']){
  const edited=structuredClone(firstProject),game=edited.targets.find(target=>target.name==='Game');
  if(mode==='callback-operand'){
   const prototypes=Object.values(game.blocks).filter(block=>block.opcode==='procedures_prototype'&&JSON.stringify(JSON.parse(block.mutation.argumentnames))==='["value"]');assert.equal(prototypes.length,1);
   const definition=game.blocks[prototypes[0].parent],ret=game.blocks[definition.next];assert.equal(ret.opcode,'arcade_returnValue');
   const add=game.blocks[ret.inputs.VALUE[1]];assert.equal(add.opcode,'arrays_valueBinary');assert.equal(add.fields.OP[0],'+');
   const prior=add.inputs.RIGHT[1],number=game.blocks[prior];assert.equal(number.opcode,'operator_add');assert.ok(Object.values(number.inputs).every(input=>Array.isArray(input[1])));delete game.blocks[prior];
   add.inputs.RIGHT=[1,[10,'wrong']];
  }else{
   const owners=edited.targets.flatMap(target=>Object.entries(target.variables).filter(([,value])=>value[0]==='seen').map(([id])=>({target,id})));assert.equal(owners.length,1);
   const writers=Object.values(game.blocks).filter(block=>block.opcode==='data_setvariableto'&&block.fields.VARIABLE[1]===owners[0].id);assert.ok(writers.length);
   // Change the actual dominating source startup writer, keeping the same ID
   // and all declarations/captures/other writers intact.
   const starts=Object.values(game.blocks).filter(block=>block.opcode==='arcade_whenSourceStarts');assert.equal(starts.length,1);
   let current=starts[0].next;const visited=new Set();while(current&&!writers.includes(game.blocks[current])){assert.ok(!visited.has(current));visited.add(current);current=game.blocks[current].next;}assert.ok(current);
   const writer=game.blocks[current],prior=writer.inputs.VALUE[1],number=game.blocks[prior];assert.equal(number.opcode,'operator_add');assert.ok(Object.values(number.inputs).every(input=>Array.isArray(input[1])));delete game.blocks[prior];
   writer.inputs.VALUE=[1,[10,'wrong']];
  }
  const result=projectToArcade(edited);record({stage:'parameter-property-edited-numeric-refusal',mode,project:edited,result});assert.ok(result.unsupported.length,mode);
 }

 const again=arcadeToPseudocode(exported.files);record({stage:'parameter-property-reimport',result:again});clean(again,['unsupported','warnings']);
 const second=new Creator();second.parse(again.code);record({stage:'parameter-property-second-Creator',project:second.project,errors:second.errors,warnings:second.warnings,unparsed:second.unparsed});clean(second,['errors','warnings','unparsed']);
 const secondBytes=Buffer.from(await(await second.generateSB3()).arrayBuffer()),secondZip=await JSZip.loadAsync(secondBytes),secondProject=JSON.parse(await secondZip.file('project.json').async('string'));
 record({stage:'parameter-property-second-SB3',bytes:secondBytes.toString('base64'),project:secondProject});assert.deepEqual(secondProject,second.project);constructorBindings(secondProject);
 const unusedCalls=secondProject.targets.flatMap(target=>Object.entries(target.blocks).filter(([,block])=>block.opcode==='arcade_callObjectMethod'&&literal(target,block,'METHOD')==='bump').map(([id,block])=>({target,id,block,sink:target.blocks[block.parent]})));
 record({stage:'parameter-property-unused-Void-statement',calls:unusedCalls.map(({target,id,block,sink})=>({target:target.name,id,block,sink}))});
 assert.equal(unusedCalls.length,1,'the authored effectful call remains exactly once');
 assert.equal(unusedCalls[0].sink.opcode,'arcade_setLocal');assert.equal(unusedCalls[0].sink.inputs.VALUE[1],unusedCalls[0].id);
 // A statement certificate is conditional on full current-body validation.
 // Its ordinary-class metadata anchor cannot excuse an edited bound local
 // or malformed actual constructor argument upstream of the global receiver.
 for(const mode of ['bound-local-writer','constructor-argument','read-before-allocation']){
  const edited=structuredClone(secondProject),game=edited.targets.find(target=>target.name===unusedCalls[0].target.name),call=game.blocks[unusedCalls[0].id],slot=call.inputs.OBJECT[1];
  assert.ok(Array.isArray(slot)&&slot[0]===12);
  const writers=Object.values(game.blocks).filter(block=>block.opcode==='data_setvariableto'&&block.fields.VARIABLE[1]===slot[2]);assert.equal(writers.length,1);
  let read=game.blocks[writers[0].inputs.VALUE[1]],assignment,aliasWriter;const visited=new Set();
  while(read.opcode==='arcade_getLocal'){
   const name=literal(game,read,'NAME');assert.ok(!visited.has(name));visited.add(name);
   const locals=Object.values(game.blocks).filter(block=>block.opcode==='arcade_setLocal'&&literal(game,block,'NAME')===name);assert.equal(locals.length,1);assignment=locals[0];
   if(!aliasWriter)aliasWriter=assignment;
   const next=game.blocks[assignment.inputs.VALUE[1]];
   if(mode==='bound-local-writer'){
    assert.equal(next.opcode,'arcade_getLocal');delete game.blocks[assignment.inputs.VALUE[1]];assignment.inputs.VALUE=[1,[10,'wrong']];break;
   }
   read=next;
  }
  if(mode==='constructor-argument'){
   assert.equal(read.opcode,'arcade_createObject');const argument=game.blocks[read.inputs.ARGS[1]],number=game.blocks[argument.inputs.VALUE[1]];
   assert.equal(argument.opcode,'arcade_functionArgument');assert.equal(number.opcode,'operator_add');assert.ok(Object.values(number.inputs).every(input=>Array.isArray(input[1])));
   delete game.blocks[argument.inputs.VALUE[1]];argument.inputs.VALUE=[1,[10,'wrong']];
  }
  if(mode==='read-before-allocation'){
   assert.equal(read.opcode,'arcade_createObject');assert.notEqual(aliasWriter,assignment);
   const allocationID=Object.keys(game.blocks).find(id=>game.blocks[id]===assignment),aliasID=Object.keys(game.blocks).find(id=>game.blocks[id]===aliasWriter),prior=assignment.parent,after=aliasWriter.next;
   assert.equal(assignment.next,aliasID);assert.equal(aliasWriter.parent,allocationID);assert.equal(game.blocks[prior].next,allocationID);assert.ok(after);
   game.blocks[prior].next=aliasID;aliasWriter.parent=prior;aliasWriter.next=allocationID;assignment.parent=aliasID;assignment.next=after;game.blocks[after].parent=allocationID;
  }
  const result=projectToArcade(edited);record({stage:'parameter-property-edited-Void-producer-refusal',mode,project:edited,result});assert.ok(result.unsupported.length,mode);
 }
 const game=secondProject.targets.find(target=>target.name===unusedCalls[0].target.name),roots=Object.values(game.blocks).filter(block=>block.opcode==='arcade_whenSourceStarts');assert.equal(roots.length,1);
 const entries=[];let entryID=roots[0].next;const entrySeen=new Set();
 while(entryID){assert.ok(!entrySeen.has(entryID));entrySeen.add(entryID);const block=game.blocks[entryID],value=game.blocks[block.inputs?.VALUE?.[1]];if(block.opcode==='arcade_setLocal'&&value?.opcode==='arcade_callFunction')entries.push({sink:entryID,call:value});entryID=block.next;}
 assert.equal(entries.length,1);const entryCode=literal(game,entries[0].call,'NAME'),envelopes=Object.values(game.blocks).filter(block=>block.opcode==='arcade_declareCallable').map(block=>JSON.parse(literal(game,block,'METADATA'))),entryOwners=envelopes[0].plan.owners.filter(owner=>owner.kind==='declaration'&&owner.procedure===entryCode);assert.equal(entryOwners.length,1);
 assert.equal(entryOwners[0].signature.result.name,'void');assert.deepEqual(entryOwners[0].signature.parameters,[]);
 {
  const edited=structuredClone(secondProject),target=edited.targets.find(target=>target.name===game.name),prototypes=Object.values(target.blocks).filter(block=>block.opcode==='procedures_prototype'&&block.mutation.proccode===entryCode);assert.equal(prototypes.length,1);
  const definitionID=prototypes[0].parent,definition=target.blocks[definitionID],prior=definition.next;assert.ok(prior);
  let id='editedVoidReturn';while(target.blocks[id])id+='_';
  target.blocks[id]={opcode:'arcade_returnValue',parent:definitionID,next:prior,inputs:{VALUE:[1,[4,'1']]},fields:{},shadow:false,topLevel:false};
  definition.next=id;target.blocks[prior].parent=id;
  const result=projectToArcade(edited);record({stage:'parameter-property-edited-module-Void-refusal',mode:'body-number-return',project:edited,result});assert.ok(result.unsupported.length,'declared Void metadata cannot excuse the actual Number-returning body');
 }
 const final=projectToArcade(secondProject);record({stage:'parameter-property-second-export',result:final});clean(final,['unsupported','warnings']);
 assert.equal([...final.ts.matchAll(/\.bump\(\)/g)].length,1,'discarding a Void result neither drops nor duplicates the actual call');
 const reconstructed=parse(final.ts),finalProof=proveClassCallableSource(reconstructed),construction=exportArrowBindings(reconstructed,finalProof,'second',final.ts);
 const classLocals=envelopes[0].plan.bindings.filter(binding=>binding.owner===entryOwners[0].id&&binding.kind==='local'&&binding.type.kind==='named'&&binding.type.name==='Counter');
 const bare=construction.owner.body.filter(statement=>statement.type==='Declaration').flatMap(statement=>statement.decls).filter(row=>classLocals.some(binding=>binding.sourceName===row.name));
 const writes=construction.owner.body.filter(statement=>statement.type==='ExpressionStatement').map(statement=>({statement,assignment:unparen(statement.expr)})).filter(row=>row.assignment.type==='Assignment'&&row.assignment.op==='='&&row.assignment.left.type==='Identifier');
 const allocation=writes.filter(row=>row.assignment.left.name===construction.name),aliases=writes.filter(row=>classLocals.some(binding=>binding.sourceName===row.assignment.left.name)&&row.assignment.right.type==='Identifier'&&row.assignment.right.name===construction.name);
 const boxWrites=writes.filter(row=>row.assignment.left.name===unusedCalls[0].block.inputs.OBJECT[1][1]&&row.assignment.right.type==='Identifier'&&row.assignment.right.name===aliases[0]?.assignment.left.name);
 record({stage:'parameter-property-class-local-staging',owner:construction.owner.name,classLocals,bare,writes,allocation,aliases,boxWrites});
 assert.equal(construction.kind,'assignment');assert.equal(construction.owner.name,entryOwners[0].sourceName);assert.equal(classLocals.length,2);assert.equal(bare.length,2);
 for(const row of bare){assert.equal(row.typeName,'Counter');assert.equal(row.init,null);assert.equal(writes.filter(write=>write.assignment.left.name===row.name).length,1);}
 assert.equal(allocation.length,1);assert.equal(allocation[0].assignment,construction.assignment);assert.equal(aliases.length,1);assert.equal(boxWrites.length,1);
 assert.ok(construction.owner.body.indexOf(allocation[0].statement)<construction.owner.body.indexOf(aliases[0].statement));assert.ok(construction.owner.body.indexOf(aliases[0].statement)<construction.owner.body.indexOf(boxWrites[0].statement));
 const entryCalls=[];const visitEntry=(value,parent=null)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(child=>visitEntry(child,parent));return;}if(value.type==='Call'&&value.callee.type==='Identifier'&&value.callee.name===entryOwners[0].sourceName)entryCalls.push({call:value,parent});for(const child of Object.values(value))visitEntry(child,value);};visitEntry(reconstructed);
 record({stage:'parameter-property-module-Void-call-binding',sourceName:entryOwners[0].sourceName,signature:entryOwners[0].signature,calls:entryCalls});
 assert.equal(entryCalls.length,1,'module declaration executes once');assert.equal(entryCalls[0].parent.type,'ExpressionStatement');assert.equal(entryCalls[0].parent.expr,entryCalls[0].call,'Void module call stays a statement without a value sink');
 assert.match(final.ts,/Counter/);assert.match(final.ts,/trace/);assert.match(final.ts,/step/);assert.match(final.ts,/tick/);
});
