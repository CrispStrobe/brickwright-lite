import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../overlay/scratch-vm/src/util/bw-procedure-constraint-model.js';
import service from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/procedure-parameter-constraints.js';
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
 const args={arg:value,mutation:blocks.call.mutation},util={runtime,thread,target},host=service(runtime);host.start();
 const primitive=()=>host.stockEntry('hold %s',args,util),op={id:'call',opcode:'procedures_call',_argValues:args,_blockFunction:primitive,fields:blocks.call.fields,inputs:blocks.call.inputs,mutation:blocks.call.mutation};
 runtime.getOpcodeFunction=()=>primitive;container._cache._executeCached.call={_ops:[op]};container._cache._executeCached.leaf={id:'leaf',opcode:leafOpcode,fields:blocks.leaf.fields,inputs:blocks.leaf.inputs,_isShadowBlock:true,_shadowValue:value,_parentValues:args,_parentKey:'arg'};
 const run=()=>owner.invoke(runtime,thread,container,op,args,util,primitive);
 return{blocks,container,target,thread,runtime,args,util,host,op,run};
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
 for(const change of [f=>{f.blocks.leaf.parent='other';},f=>{f.container._cache._executeCached.leaf._parentKey='other';},f=>{f.container._cache._executeCached.leaf._parentValues={...f.args};},f=>{f.blocks.call.inputs.arg={block:'missing',shadow:'leaf'};}]) {const f=fixture();change(f);assert.throws(f.run,/requires Number/);}
 const f=fixture();assert.throws(()=>f.host.stockEntry('hold %s',f.args,f.util),/actual current primitive/);
});
test('duplicate, detached, computed and incompatible declaration bindings explicitly refuse',()=>{
 for(const change of [f=>{f.blocks.extra={...f.blocks.proto,id:'extra'};},f=>{f.blocks.declare.inputs.TYPE={block:'leaf'};},f=>{f.blocks.declare.parent='other';},f=>{f.blocks.extra={...f.blocks.declare,id:'extra'};},f=>{f.blocks.proto.mutation.argumentnames='["value","value"]';}]){const f=fixture();change(f);assert.throws(()=>model.prepare(f.target),/constraint/);}
});
test('managed entry checks raw and decoded actual values and never converts numeric text',()=>{
 const f=fixture();assert.deepEqual(f.host.managedEntry(f.target,'hold %s',[20],[20],f.util),[20]);
 assert.throws(()=>f.host.managedEntry(f.target,'hold %s',['20'],['20'],f.util),/requires Number/);
 assert.throws(()=>f.host.managedEntry(f.target,'hold %s',[20],['20'],f.util),/requires Number/);
 assert.throws(()=>f.host.managedEntry(f.target,'hold %s',[],[],f.util),/argument count/);
});
test('issued formal and captured writers retain actual cell identity, all writes and generation',()=>{
 const f=fixture(),params={value:20};f.thread.stackFrames=[{params}];const checked=f.run().values;f.host.bind(f.thread,f.target,'hold %s',params,checked);
 assert.equal(f.host.write(params,'value',21,f.util),21);assert.throws(()=>f.host.write(params,'value','20',f.util),/requires Number/);
 const other={target:f.target,blockContainer:f.container,stackFrames:[],bwArcadeCaptures:new Map()};f.runtime.threads.push(other);f.runtime.sequencer.activeThread=other;const util={runtime:f.runtime,target:f.target,thread:other};
 assert.throws(()=>f.host.write(params,'value',22,util),/does not own/);
 other.bwArcadeCaptures.set('value',{values:params,key:'value'});f.runtime.threads.splice(f.runtime.threads.indexOf(f.thread),1);f.thread.stackFrames=[];
 assert.equal(f.host.write(params,'value',22,util),22,'real captured map survives completed owner invocation');
 f.host.invalidate();f.host.start();assert.throws(()=>f.host.write(params,'value',23,util),/stale invocation/);
});
test('graph edits and dispose cannot reuse prior entry authority; real project load starts fresh',()=>{
 const f=fixture();f.run();f.blocks.effect.fields.TEXT=field('changed');assert.throws(f.run,/current graph changed/);
 f.host.start();assert.deepEqual(f.run().values,[20]);f.host.dispose();f.host.start();assert.throws(f.run,/inactive/);
 f.host.projectLoaded();f.host.start();assert.throws(f.run,/inactive/);
 const fresh=fixture();fresh.host.projectLoaded();fresh.host.start();assert.deepEqual(fresh.run().values,[20]);
});
test('existing nonprotocol procedures remain outside the declaration model',()=>{
 const f=fixture();f.blocks.def.next='effect';f.blocks.effect.parent='def';delete f.blocks.declare;
 assert.equal(model.prepare(f.target).procedures.get('hold %s'),undefined);assert.equal(f.run(),null);
});

test('entry tickets are one-use and bind only the installed actual validated cells',()=>{
 const f=fixture(),params={value:20};f.thread.stackFrames=[{params}];
 assert.throws(()=>f.host.bind(f.thread,f.target,'hold %s',params),/entry proof/);
 const checked=f.run().values;f.host.bind(f.thread,f.target,'hold %s',params,checked);
 assert.throws(()=>f.host.bind(f.thread,f.target,'hold %s',params,checked),/entry proof/);
 const changed=f.run().values;params.value='20';assert.throws(()=>f.host.bind(f.thread,f.target,'hold %s',params,changed),/cells differ/);
});
