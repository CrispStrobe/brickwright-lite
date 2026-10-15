import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../overlay/scratch-vm/src/util/bw-procedure-constraint-model.js';
import service from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/procedure-parameter-constraints.js';
import provenance from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values.js';
import owner from '../overlay/scratch-vm/src/util/bw-primitive-owner.js';
const field=value=>({value});
function fixture(type='Number',value='20',leafOpcode='math_number') {
 const blocks={
  def:{id:'def',opcode:'procedures_definition',topLevel:true,parent:null,next:'declare',fields:{},inputs:{custom_block:{block:'proto'}}},
  proto:{id:'proto',opcode:'procedures_prototype',parent:'def',next:null,fields:{},inputs:{arg:{block:'formal'}},mutation:{proccode:'hold %s',argumentnames:'["value"]',argumentids:'["arg"]',argumentdefaults:'[""]'}},
  formal:{id:'formal',opcode:'argument_reporter_string_number',parent:'proto',inputs:{},fields:{VALUE:field('value')}},
  declare:{id:'declare',opcode:model.OPCODE,parent:'def',next:'effect',inputs:{},fields:{PROCEDURE:field('hold %s'),PARAMETER:field('value'),TYPE:field(type)}},
  effect:{id:'effect',opcode:'looks_say',parent:'declare',next:null,inputs:{},fields:{}},
  call:{id:'call',opcode:'procedures_call',parent:null,next:null,fields:{},mutation:{proccode:'hold %s',argumentids:'["arg"]'},inputs:{arg:{block:'leaf'}}},
  leaf:{id:'leaf',opcode:leafOpcode,parent:'call',inputs:{},fields:{[leafOpcode==='math_number'?'NUM':'TEXT']:field(value)}}
 };
 const container={_blocks:blocks,getBlock:id=>blocks[id],getInputs:b=>b.inputs,_cache:{_executeCached:{}}};
 const target={blocks:container},thread={target,blockContainer:container,stackFrames:[],peekStack:()=> 'call'},runtime={on(){},targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:t=>runtime.threads.includes(t)};
 const args={arg:value,mutation:blocks.call.mutation},util={runtime,thread,target},proof=provenance(runtime,{referenceTypeOf:()=>undefined,typeOf:()=>undefined}),host=service(runtime,proof);host.start();proof.snapshot();
 const primitive=()=>host.stockEntry('hold %s',args,util),op={id:'call',opcode:'procedures_call',_argValues:args,_blockFunction:primitive,fields:blocks.call.fields,inputs:blocks.call.inputs,mutation:blocks.call.mutation};
 runtime.getOpcodeFunction=()=>primitive;container._cache._executeCached.call={_ops:[op]};container._cache._executeCached.leaf={id:'leaf',opcode:leafOpcode,fields:blocks.leaf.fields,inputs:blocks.leaf.inputs,_isShadowBlock:true,_shadowValue:value,_parentValues:args,_parentKey:'arg'};
 const run=()=>owner.invoke(runtime,thread,container,op,args,util,primitive);
 return{blocks,container,target,thread,runtime,args,util,host,op,run,proof};
}
test('pure model binds visible selectors to actual ordered formal IDs without producing facts',()=>{
 const f=fixture(),p=model.prepare(f.target),entry=p.procedures.get('hold %s');
 assert.deepEqual(entry.ids,['arg']);assert.equal(entry.constraints.get('value').type,'Number');
 assert.equal(typeof entry.constraints.set,'undefined');assert.equal(typeof p.procedures.set,'undefined');
 assert.equal(p.current(),true);f.blocks.effect.fields.TEXT=field('edited');assert.equal(p.current(),false);
});
test('stock entry distinguishes actual physical Number20 and text20 before a body is entered',()=>{
 assert.deepEqual(fixture().run().values,[20]);assert.deepEqual(fixture('String','20','text').run().values,['20']);
 assert.throws(()=>fixture('String').run(),/requires String/);assert.throws(()=>fixture('Number','20','text').run(),/requires Number/);
 for(const type of ['Number','String']){const f=fixture(type);delete f.args.arg;assert.throws(f.run,/argument is missing/);assert.equal(f.thread.stackFrames.length,0);}
});
test('dynamic socket authority requires current actual prototype/formal and physical leaf lineage',()=>{
 for(const change of [f=>{f.blocks.call.mutation.argumentids='["other"]';},f=>{f.blocks.proto.mutation.argumentids='["other"]';},f=>{f.blocks.declare.fields.PARAMETER=field('other');},f=>{f.blocks.proto.parent='foreign';}]) {const f=fixture();change(f);assert.throws(f.run,/constraint/);}
 for(const change of [f=>{f.blocks.leaf.parent='other';},f=>{f.container._cache._executeCached.leaf._parentKey='other';},f=>{f.container._cache._executeCached.leaf._parentValues={...f.args};},f=>{f.blocks.call.inputs.arg={block:'missing',shadow:'leaf'};}]) {const f=fixture();change(f);f.proof.snapshot();assert.throws(f.run,/requires Number|disconnected/);}
 const f=fixture();assert.throws(()=>f.host.stockEntry('hold %s',f.args,f.util),/actual current primitive/);
});
test('duplicate, detached, computed and incompatible declaration bindings explicitly refuse',()=>{
 for(const change of [f=>{f.blocks.extra={...f.blocks.proto,id:'extra'};},f=>{f.blocks.declare.inputs.TYPE={block:'leaf'};},f=>{f.blocks.declare.parent='other';},f=>{f.blocks.extra={...f.blocks.declare,id:'extra'};},f=>{f.blocks.proto.mutation.argumentnames='["value","value"]';}]){const f=fixture();change(f);assert.throws(()=>model.prepare(f.target),/constraint/);}
});
function managed(f,value=20,raw=value){
 const b=f.blocks;b.call.opcode='arcade_callFunction';b.call.mutation=undefined;b.call.inputs={NAME:{block:'code'},ARGS:{block:'argument'}};
 b.code={id:'code',opcode:'text',parent:'call',fields:{TEXT:field('hold %s')},inputs:{}};
 b.argument={id:'argument',opcode:'arcade_functionArgument',parent:'call',fields:{},inputs:{VALUE:{block:'leaf'},REST:{block:'end'}}};b.leaf.parent='argument';
 b.end={id:'end',opcode:'text',parent:'argument',fields:{TEXT:field('[]')},inputs:{}};
 const args={NAME:'hold %s',ARGS:JSON.stringify([raw])},fn=()=>f.host.managedEntry(f.target,'hold %s',[value],[raw],f.util,args),op={id:'call',opcode:b.call.opcode,_argValues:args,_blockFunction:fn,fields:b.call.fields,inputs:b.call.inputs};
 f.runtime.getOpcodeFunction=()=>fn;f.container._cache._executeCached.call={_ops:[op]};f.proof.snapshot();
 return()=>owner.invoke(f.runtime,f.thread,f.container,op,args,f.util,fn);
}
test('managed entry checks actual current call plus raw BW primitive carriers without text conversion',()=>{
 assert.deepEqual(managed(fixture())(),[20]);
 assert.throws(managed(fixture('Number','20','text'),'20'),/requires Number/);
 assert.deepEqual(managed(fixture(),NaN,{bwNumber:'NaN'})(),[NaN]);
 assert.throws(managed(fixture(),20,{bwNumber:'NaN'}),/decoded primitive argument differs/);
 assert.throws(managed(fixture(),20,{bwNumber:'NaN',extra:true}),/opaque|reference/);
 const f=fixture();assert.throws(()=>f.host.managedEntry(f.target,'hold %s',[20],[20],f.util,{}),/actual current primitive/);
});
test('issued formal writes require actual current fixed-name producer ownership',()=>{
 const f=fixture(),b=f.blocks;
 b.declare.next='write';b.write={id:'write',opcode:'arcade_setLocal',parent:'declare',next:'effect',inputs:{NAME:{block:'name'},VALUE:{block:'number'}},fields:{}};b.effect.parent='write';
 b.name={id:'name',opcode:'text',parent:'write',inputs:{},fields:{TEXT:field('value')}};b.number={id:'number',opcode:'math_number',parent:'write',inputs:{},fields:{NUM:field('21')}};
 f.proof.snapshot();const params={value:20};f.thread.stackFrames=[{params}];f.host.bind(f.thread,f.target,'hold %s',params,f.run().values);
 const args={NAME:'value',VALUE:21},fn=()=>f.host.write(params,'value',args.VALUE,f.util,args),op={id:'write',opcode:'arcade_setLocal',_argValues:args,_blockFunction:fn,fields:b.write.fields,inputs:b.write.inputs};
 f.runtime.getOpcodeFunction=()=>fn;f.thread.peekStack=()=> 'write';f.container._cache._executeCached.write={_ops:[op]};
 const write=()=>owner.invoke(f.runtime,f.thread,f.container,op,args,f.util,fn);
 assert.equal(write(),21);args.VALUE='20';assert.throws(write,/requires Number/);
 assert.throws(()=>fn(),/actual fixed formal/);args.VALUE=21;
 f.host.invalidate();f.host.start();assert.throws(write,/stale invocation/);
});
test('graph edits and dispose cannot reuse prior entry authority; real project load starts fresh',()=>{
 const f=fixture();f.run();f.blocks.effect.fields.TEXT=field('changed');assert.throws(f.run,/current graph changed/);
 f.host.start();f.proof.snapshot();assert.deepEqual(f.run().values,[20]);f.host.dispose();f.host.start();assert.throws(f.run,/inactive/);
 f.host.projectLoaded();f.host.start();assert.throws(f.run,/inactive/);
 const fresh=fixture();fresh.host.projectLoaded();fresh.host.start();assert.deepEqual(fresh.run().values,[20]);
});
test('existing nonprotocol procedures remain outside the declaration model',()=>{
 const f=fixture();f.blocks.def.next='effect';f.blocks.effect.parent='def';delete f.blocks.declare;
 assert.equal(model.prepare(f.target).procedures.get('hold %s'),undefined);assert.equal(f.run(),null);f.blocks.effect.fields.TEXT=field('ordinary edit');assert.equal(f.run(),null);
});

test('entry tickets are one-use and bind only the installed actual validated cells',()=>{
 const f=fixture(),params={value:20};f.thread.stackFrames=[{params}];
 assert.throws(()=>f.host.bind(f.thread,f.target,'hold %s',params),/entry proof/);
 const checked=f.run().values;f.host.bind(f.thread,f.target,'hold %s',params,checked);
 assert.throws(()=>f.host.bind(f.thread,f.target,'hold %s',params,checked),/entry proof/);
 const changed=f.run().values;params.value='20';assert.throws(()=>f.host.bind(f.thread,f.target,'hold %s',params,changed),/cells differ/);
});

test('constrained body ownership rejects shared children, missing nodes and cycles before entry',()=>{
 for(const change of [f=>{f.blocks.effect.next='effect';},f=>{f.blocks.effect.next='missing';},f=>{f.blocks.effect.inputs.A={block:'leaf'};},f=>{f.blocks.declare.parent='effect';}]){const f=fixture();change(f);assert.throws(()=>model.prepare(f.target),/constraint/);}
});

test('constraint metadata never hides extra evaluated inputs or unsupported fields',()=>{
 for(const edit of [f=>{f.blocks.declare.inputs.EXTRA={block:'leaf'};},f=>{f.blocks.declare.fields.EXTRA=field('hidden');}]){const f=fixture();edit(f);assert.throws(()=>model.prepare(f.target),/zero inputs/);}
});

test('unused formal contradictions refuse before entry, while Any creates no producer grant',()=>{
 const f=fixture(),b=f.blocks;b.declare.next='bad';b.effect.parent='bad';
 b.bad={id:'bad',opcode:'arcade_setLocal',parent:'declare',next:'effect',fields:{},inputs:{NAME:{block:'badName'},VALUE:{block:'opaque'}}};
 b.badName={id:'badName',opcode:'text',parent:'bad',inputs:{},fields:{TEXT:field('value')}};
 b.opaque={id:'opaque',opcode:'arcade_createSprite',parent:'bad',inputs:{},fields:{}};f.proof.snapshot();
 assert.throws(f.run,/domain evidence/);assert.equal(f.thread.stackFrames.length,0);
 const any=fixture('Any','opaque:SpriteID','arcade_createSprite');assert.deepEqual(any.run().values,['opaque:SpriteID']);
 assert.throws(()=>any.host.stockEntry('hold %s',any.args,any.util),/actual current primitive/);
});

test('formal domain proof includes real inherited captured writes and survives normal owner return only',()=>{
 const f=fixture(),b=f.blocks;
 b.effect.next='register';b.register={id:'register',opcode:'arcade_registerUpdateHandler',parent:'effect',fields:{},inputs:{TOKEN:{block:'token'},CAPTURES:{block:'captures'}}};
 b.token={id:'token',opcode:'text',parent:'register',inputs:{},fields:{TEXT:field('tick')}};b.captures={id:'captures',opcode:'text',parent:'register',inputs:{},fields:{TEXT:field('value')}};
 b.hat={id:'hat',opcode:'arcade_whenRegisteredUpdate',topLevel:true,fields:{},inputs:{TOKEN:{block:'hatToken'}},next:'capturedWrite'};b.hatToken={id:'hatToken',opcode:'text',parent:'hat',inputs:{},fields:{TEXT:field('tick')}};
 b.capturedWrite={id:'capturedWrite',opcode:'arcade_setCaptured',parent:'hat',fields:{},inputs:{NAME:{block:'capturedName'},VALUE:{block:'capturedValue'}}};b.capturedName={id:'capturedName',opcode:'text',parent:'capturedWrite',inputs:{},fields:{TEXT:field('value')}};
 b.capturedValue={id:'capturedValue',opcode:'math_number',parent:'capturedWrite',inputs:{},fields:{NUM:field('22')}};
 f.proof.snapshot();const params={value:20};f.thread.stackFrames=[{params}];f.host.bind(f.thread,f.target,'hold %s',params,f.run().values);
 const child={target:f.target,blockContainer:f.container,stackFrames:[],peekStack:()=> 'capturedWrite',bwArcadeCaptures:new Map([['value',{values:params,key:'value'}]])};
 f.runtime.threads=[child];f.runtime.sequencer.activeThread=child;f.thread.stackFrames=[];
 const util={runtime:f.runtime,target:f.target,thread:child},args={NAME:'value',VALUE:22},fn=()=>f.host.write(params,'value',22,util,args),op={id:'capturedWrite',opcode:'arcade_setCaptured',_argValues:args,_blockFunction:fn,fields:b.capturedWrite.fields,inputs:b.capturedWrite.inputs};
 f.runtime.getOpcodeFunction=()=>fn;f.container._cache._executeCached.capturedWrite={_ops:[op]};
 const write=()=>owner.invoke(f.runtime,child,f.container,op,args,util,fn);
 assert.equal(write(),22);child.bwArcadeCaptures.clear();assert.throws(write,/does not own/);child.bwArcadeCaptures.set('value',{values:params,key:'value'});
 f.host.invalidate();f.host.start();assert.throws(write,/stale invocation/);
});

test('unconstrained stock and synthetic class calls bypass new operation and runtime-util requirements',()=>{
 const f=fixture(),synthetic={thread:f.thread,target:f.target,sequencer:null};
 // The target may contain a different constrained procedure. Its model must
 // not turn the absence of a protocol for an actual class body into a lease.
 assert.equal(f.host.managedEntry(f.target,'__class_constructor',[],[],synthetic,{}),null);
 assert.equal(f.host.managedEntry(f.target,'__class_method',[{bwReference:{kind:'object',id:'actual'}}],[],synthetic,{}),null);
 assert.equal(f.host.stockEntry('ordinary Scratch %s',{},synthetic),null);
 assert.throws(()=>f.host.managedEntry(f.target,'hold %s',[20],[20],synthetic,{}),/entry caller is not current/);
 assert.throws(()=>f.host.stockEntry('hold %s',{},synthetic),/entry caller is not current/);
 // A previously constrained procedure cannot escape validation by removing
 // its declaration prefix, even through the synthetic path.
 f.blocks.def.next='effect';f.blocks.effect.parent='def';delete f.blocks.declare;
 assert.throws(()=>f.host.managedEntry(f.target,'hold %s',[20],[20],synthetic,{}),/current graph changed/);
});


test('constrained current stock calls refuse extra and disconnected input sockets',()=>{
 for(const change of [f=>{f.blocks.call.inputs.EXTRA={block:'leaf'};},f=>{f.blocks.call.inputs.arg={block:null};}]){
  const f=fixture();change(f);assert.throws(()=>model.prepare(f.target),/stock call requires exactly/);assert.throws(f.run,/stock call requires exactly/);
 }
 const f=fixture();f.blocks.call.mutation.proccode='unconstrained %s';f.blocks.call.inputs.EXTRA={block:'leaf'};assert.doesNotThrow(()=>model.prepare(f.target));
});
test('constrained managed call and argument chains reject unrepresented sockets',()=>{
 for(const selector of ['call','argument']){
  const f=fixture(),run=managed(f);f.blocks[selector].inputs.EXTRA={block:'leaf'};f.proof.snapshot();assert.throws(run,/requires exactly its actual input sockets/);
 }
});
