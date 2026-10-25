import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),clock=require('../overlay/scratch-vm/src/util/bw-frame-delta-number'),loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');

// Authored execution-boundary model, not a Scratch VM or original SDK run.
// Actual source/adapter/native/current-project controls are separate tests.
function fixture(value,beforeBind=null) {
    if(arguments.length===0)value=42;
    const runtime=new EventEmitter(),scene={_sceneValueId:'scene:1',frameDeltaTime:value},scenes=new Map([['scene:1',scene]]);
    let serial=0,reads=0,legacyReads=0;
    runtime.bwArcadeDeviceState=scene;runtime.targets=[];runtime.threads=[];runtime._blockInfo=[];runtime._primitives={};runtime.sequencer={activeThread:null};
    runtime.getOpcodeFunction=function(name){return this._primitives[name];};runtime.getIsHat=()=>false;
    runtime.isActiveThread=thread=>runtime.threads.includes(thread)&&!thread.isKilled&&thread.status!==4;
    const instance={},owner={isInstance:object=>object===instance,isCurrent:()=>true,context:()=>({state:scene,scenes,serial,epoch:0})};
    const service=clock.create(runtime,owner),block=(id,opcode,parent=null,inputs={},fields={},shadow=false)=>({id,opcode,parent,inputs,fields,shadow,topLevel:false,next:null});
    const nodes={root:block('root','arcade_inspectValue',null,{VALUE:{block:'clock',shadow:null},LIMIT:{block:'limit',shadow:'limit'}}),clock:block('clock','arcade_frameDeltaTime','root'),limit:block('limit','math_number','root',{}, {NUM:{name:'NUM',value:'20'}},true)};
    const maps=Object.fromEntries(Object.entries(nodes).map(([id,node])=>[id,{...node.inputs}])),cache={};
    const container={_blocks:nodes,getBlock:id=>nodes[id],getInputs:node=>maps[node.id],_cache:{_executeCached:cache}},target={blocks:container};
    class Thread {static STATUS_DONE=4;}
    const thread=new Thread();Object.assign(thread,{target,blockContainer:container,isKilled:false,status:0,peekStack:()=> 'root',peekStackFrame:()=>frame});
    let frame={};runtime.targets.push(target);runtime.threads.push(thread);runtime.sequencer.activeThread=thread;
    const util={runtime,thread,target},read=()=>{reads++;return {state:scene,value:scene.frameDeltaTime};},legacy=()=>{legacyReads++;return scene.frameDeltaTime||0;};
    const actual=(args,u)=>service.read(args,u,read,legacy);
    const prototype={getInfo(){return clock.declaration({id:'arcade',blocks:[{opcode:'frameDeltaTime',arguments:{}}]},owner);}};
    const adapter=Object.assign(Object.create(prototype),{_inst:instance,frameDeltaTime:actual});
    const info=adapter.getInfo();if(beforeBind)beforeBind(info.blocks[0]);clock.bindAdapterInfo(info,adapter,instance);
    const row=info.blocks[0],registered=(args,u)=>adapter.frameDeltaTime(args,u);
    runtime._primitives.arcade_frameDeltaTime=registered;runtime._primitives.arcade_inspectValue=()=>{};
    const category={id:'arcade',blocks:[{json:{type:'arcade_frameDeltaTime'},info:{...row,func:registered}}]};runtime._blockInfo.push(category);runtime.emit('EXTENSION_ADDED',category);
    for(const [id,node]of Object.entries(nodes)) {
        const fn=runtime.getOpcodeFunction(node.opcode),defined=typeof fn!=='undefined',shadow=!defined&&Object.keys(node.fields).length===1&&!Object.keys(node.inputs).length;
        cache[id]={id,opcode:node.opcode,fields:node.fields,inputs:maps[id],mutation:node.mutation,_fields:node.fields,_inputs:maps[id],
            _argValues:{mutation:node.mutation,...Object.fromEntries(Object.entries(node.fields).map(([key,value])=>[key,value.value]))},
            _blockFunction:fn,_definedBlockFunction:defined,_isHat:false,_isShadowBlock:shadow,_shadowValue:shadow&&node.fields.NUM.value};
    }
    for(const id of ['clock','limit']){cache[id]._parentValues=cache.root._argValues;cache[id]._parentKey=id==='clock'?'VALUE':'LIMIT';}
    cache.root._parentValues=null;cache.root._parentKey=null;cache.root._argValues.LIMIT='20';cache.clock._ops=[cache.clock];cache.limit._ops=[];cache.root._ops=[cache.clock,cache.root];
    runtime.emit('PROJECT_START');
    const begin=()=>loan.beforeInputs(runtime,thread,container,cache.root);
    const report=(fn=()=>registered(cache.clock._argValues,util))=>{
        const result=loan.invoke(runtime,thread,container,cache.clock,cache.clock._argValues,util,fn);
        cache.root._argValues.VALUE=result;return result;
    };
    const consume=()=>loan.invoke(runtime,thread,container,cache.root,cache.root._argValues,util,()=>service.prove(target,nodes.clock,cache.root._argValues,util));
    return {runtime,scene,scenes,service,target,thread,util,nodes,cache,container,category,adapter,begin,report,consume,read,legacy,
        issue:()=>{const info=adapter.getInfo();clock.bindAdapterInfo(info,adapter,instance);return info.blocks[0];},
        refresh:row=>{category.blocks=[{json:{type:'arcade_frameDeltaTime'},info:{...row,func:registered}}];runtime.emit('BLOCKSINFO_UPDATE',category);},
        counts:()=>({reads,legacyReads}),sceneABA:()=>{serial+=2;},replaceFrame:()=>{frame={};}};
}
const rejected=work=>{try{assert.equal(work(),false,'no completed Number fact');}catch(error){assert.match(error.message,/Frame delta Number:|Primitive execution|Cached primitive/);}};

test('frame fact needs the actual finite completion, current parent slot and current consumer loan',()=>{
    const f=fixture();f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);assert.deepEqual(f.counts(),{reads:1,legacyReads:0});
    assert.equal(f.service.prove(f.target,f.nodes.clock,f.cache.root._argValues,{...f.util}),false,'copied utility cannot be the current loan');
    assert.equal(f.service.eligible(f.target,f.nodes.clock),true,'dormant shape is eligibility only');
    f.begin();assert.equal(f.consume(),false,'no receipt for a new unevaluated segment');assert.deepEqual(f.counts(),{reads:1,legacyReads:0});
    assert.equal(f.report(),42);assert.equal(f.consume(),true);assert.deepEqual(f.counts(),{reads:2,legacyReads:0});
});

test('direct historical calls issue no receipt and negative zero keeps the old zero fallback',()=>{
    const f=fixture(-0);assert.equal(f.service.read({},null,f.read,f.legacy),0);assert.deepEqual(f.counts(),{reads:0,legacyReads:1});
    f.begin();assert.equal(f.consume(),false);assert.equal(Object.is(f.report(),0),true);assert.equal(f.consume(),true);assert.deepEqual(f.counts(),{reads:1,legacyReads:1});
});
for(const value of [NaN,Infinity,-Infinity,'42',undefined,null])test('cached frame cannot certify '+String(value),()=>{
    const f=fixture(value);f.begin();assert.throws(()=>f.report(),/actual scene read is not finite Number/);assert.equal(f.consume(),false);assert.deepEqual(f.counts(),{reads:1,legacyReads:0});
    assert.equal(f.service.read({},null,f.read,f.legacy),value||0,'historical direct fallback unchanged');
});
for(const mode of ['loan without read','changed return','copied arguments','throw after read'])test('frame completion refuses '+mode,()=>{
    const f=fixture();f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);f.begin();
    const work=mode==='loan without read'?()=>42:mode==='changed return'?()=>{f.service.read(f.cache.clock._argValues,f.util,f.read,f.legacy);return 43;}:
        mode==='copied arguments'?()=>f.service.read({...f.cache.clock._argValues},f.util,f.read,f.legacy):()=>{f.service.read(f.cache.clock._argValues,f.util,f.read,f.legacy);throw Error('original throw');};
    assert.throws(()=>f.report(work),mode==='throw after read'?/original throw/:/real finite reporter completion/);
    assert.equal(f.consume(),false,'failed call cannot leave a completion');
});
for(const mode of ['parent value','block graph','cached function','cache order','argument identity','metadata function','metadata extra argument','metadata accessor arguments','metadata schema descriptor','opcode lookup','adapter delegate','scene ABA','stopped thread','foreign target','new stack frame','yield resume','Stop','Load','dispose'])test('completed frame refuses '+mode+' without rereading',()=>{
    const f=fixture();f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);
    if(mode==='parent value')f.cache.root._argValues.VALUE=43;
    if(mode==='block graph')f.nodes.clock.fields.EXTRA={value:1};
    if(mode==='cached function')f.cache.clock._blockFunction=()=>42;
    if(mode==='cache order')f.cache.root._ops.reverse();
    if(mode==='argument identity')f.cache.clock._argValues={...f.cache.clock._argValues};
    if(mode==='metadata function')f.category.blocks[0].info.func=()=>42;
    if(mode==='metadata extra argument')f.category.blocks[0].info.arguments.EXTRA={type:'number'};
    if(mode==='metadata accessor arguments')Object.defineProperty(f.category.blocks[0].info,'arguments',{get(){throw Error('must not read schema accessor');}});
    if(mode==='metadata schema descriptor')Object.defineProperty(f.category.blocks[0].info,'arguments',{writable:false});
    if(mode==='opcode lookup')f.runtime.getOpcodeFunction=function(name){return this._primitives[name];};
    if(mode==='adapter delegate')f.adapter.frameDeltaTime=()=>42;
    if(mode==='scene ABA')f.sceneABA();
    if(mode==='stopped thread')f.thread.isKilled=true;
    if(mode==='foreign target')f.thread.target={blocks:f.container};
    if(mode==='new stack frame')f.replaceFrame();
    if(mode==='yield resume')f.begin();
    if(mode==='Stop')f.runtime.emit('PROJECT_STOP_ALL');
    if(mode==='Load')f.runtime.emit('PROJECT_LOADED');
    if(mode==='dispose')f.runtime.emit('RUNTIME_DISPOSED');
    rejected(f.consume);assert.deepEqual(f.counts(),{reads:1,legacyReads:0});
});


test('only a fresh genuine registration issue renews frame ownership; an older unused issue is stale',()=>{
    const f=fixture();f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);
    const earlierUnused=f.issue(),fresh=f.issue();f.refresh(fresh);f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);
    f.refresh(earlierUnused);assert.throws(f.begin,/actual input segment owner differs/);assert.equal(f.consume(),false);assert.deepEqual(f.counts(),{reads:2,legacyReads:0});
});

test('runtime-free and duplicate service objects retain direct fallback behavior without result ownership',()=>{
    const fallback=clock.create(null,null);assert.equal(fallback.read({},null,()=>{throw Error('not a certified read');},()=>Infinity),Infinity);assert.equal(fallback.eligible({},{}),false);
    const f=fixture(),foreign=clock.create(f.runtime,{isCurrent:()=>true});f.begin();assert.throws(()=>f.report(()=>foreign.read(f.cache.clock._argValues,f.util,f.read,f.legacy)),/real finite reporter completion/);assert.equal(f.consume(),false);assert.deepEqual(f.counts(),{reads:0,legacyReads:1});
});

test('schema mutation before adapter issuance or registration cannot authorize a frame',()=>{
    assert.throws(()=>fixture(42,row=>{row.arguments.EXTRA={type:'number'};}),/zero-argument schema/);
    let beforeIssueReads=0;assert.throws(()=>fixture(42,row=>Object.defineProperty(row,'arguments',{get(){beforeIssueReads++;return {};}})),/zero-argument schema/);assert.equal(beforeIssueReads,0);
    const f=fixture(),row=f.issue();row.arguments.EXTRA={type:'number'};f.refresh(row);assert.throws(f.begin,/actual input segment owner differs/);assert.deepEqual(f.counts(),{reads:0,legacyReads:0});
    const owner={isInstance:()=>true,isCurrent:()=>true};
    assert.throws(()=>clock.declaration({id:'arcade',blocks:[{opcode:'frameDeltaTime',arguments:{EXTRA:{}}}]},owner),/zero-argument schema/);
    let getters=0;const bad={opcode:'frameDeltaTime'};Object.defineProperty(bad,'arguments',{get(){getters++;return {};}});
    assert.throws(()=>clock.declaration({id:'arcade',blocks:[bad]},owner),/zero-argument schema/);assert.equal(getters,0);
});

// Evaluate only the actual source method against a modeled read boundary. This
// isolates its pre-read guard from unrelated real VM frame/state maintenance.
test('actual frame read callback refuses inherited access before the existing initializer',()=>{
    const source=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js',import.meta.url),'utf8');
    const start=source.indexOf('    frameDeltaTime(args,util) {'),end=source.indexOf('\n    musicVolume()',start);
    assert.ok(start>=0&&end>start);const body=source.slice(start,end),services=new WeakMap();
    const method=Function('frameDeltaValues','return ({'+body+'}).frameDeltaTime;')(services);
    let accessorReads=0,initializations=0;const state={},instance={_runtime:{bwArcadeDeviceState:state},_state(){initializations++;if(state.frameDeltaTime===undefined)state.frameDeltaTime=0;return state;}};
    services.set(instance,{read:(_args,_util,read)=>read()});
    assert.equal(Object.getOwnPropertyDescriptor(Object.prototype,'frameDeltaTime'),undefined);
    try{
        Object.defineProperty(Object.prototype,'frameDeltaTime',{get(){accessorReads++;return 42;},configurable:true});
        assert.throws(()=>method.call(instance,{},{}),/frame accessor is not owned data/);
        assert.equal(accessorReads,0);assert.equal(initializations,0);
    }finally{delete Object.prototype.frameDeltaTime;}
    state.frameDeltaTime=undefined;assert.deepEqual(method.call(instance,{},{}),{state,value:0});assert.equal(initializations,1,'genuine own undefined initialization stays live');
    services.set(instance,{read:(_args,_util,_read,legacy)=>legacy()});state.frameDeltaTime='historical';assert.equal(method.call(instance,{},null),'historical','direct historical path remains unchanged and uncertified');
});

// Finite host assignments establish a primitive domain, never a time origin.
test('current finite host data is admitted, but replacement and post-read mutation are not',()=>{
    const f=fixture(1);f.scene.frameDeltaTime=2.5;f.begin();assert.equal(f.report(),2.5);assert.equal(f.consume(),true);
    f.scene.frameDeltaTime=3;assert.equal(f.consume(),false,'old completion cannot describe a different field generation');
    f.begin();assert.equal(f.report(),3);assert.equal(f.consume(),true);
    f.runtime.bwArcadeDeviceState={...f.scene};rejected(f.consume);
    const g=fixture();g.begin();assert.throws(()=>g.report(()=>{const result=g.service.read(g.cache.clock._argValues,g.util,g.read,g.legacy);g.scene.frameDeltaTime='bad';return result;}),/real finite reporter completion/);assert.equal(g.consume(),false);
});
test('finite-looking read callbacks cannot replace actual current own data or reenter the engine',()=>{
    const f=fixture('bad');f.begin();assert.throws(()=>f.report(()=>f.service.read(f.cache.clock._argValues,f.util,()=>({state:f.scene,value:42}),f.legacy)),/scene or input segment changed/);assert.equal(f.consume(),false);
    const g=fixture();g.begin();assert.throws(()=>g.report(()=>g.service.read(g.cache.clock._argValues,g.util,()=>{g.report();return g.read();},g.legacy)),/cannot be reentered/);assert.equal(g.consume(),false);
    const h=fixture();h.begin();let reads=0;Object.defineProperty(h.scene,'frameDeltaTime',{get(){reads++;return 42;},configurable:true});
    assert.throws(()=>h.report(()=>h.service.read(h.cache.clock._argValues,h.util,()=>({state:h.scene,value:42}),h.legacy)),/scene or input segment changed/);assert.equal(reads,0);assert.equal(h.consume(),false);
});

test('observed adapter invalidation is sticky after restoration',()=>{
    const f=fixture();f.begin();f.report();assert.equal(f.consume(),true);
    const original=f.adapter.frameDeltaTime;f.adapter.frameDeltaTime=()=>42;assert.equal(f.consume(),false);
    f.adapter.frameDeltaTime=original;assert.equal(f.consume(),false);assert.throws(f.begin,/actual input segment owner differs/);
});
test('actual source callback refuses own state and field accessors without evaluating them',()=>{
    const source=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js',import.meta.url),'utf8');
    const start=source.indexOf('    frameDeltaTime(args,util) {'),end=source.indexOf('\n    musicVolume()',start),services=new WeakMap();
    const method=Function('frameDeltaValues','return ({'+source.slice(start,end)+'}).frameDeltaTime;')(services);
    let reads=0,initializations=0;const state={},runtime={},instance={_runtime:runtime,_state(){initializations++;return state;}};
    services.set(instance,{read:(_args,_util,read)=>read()});
    Object.defineProperty(runtime,'bwArcadeDeviceState',{get(){reads++;return state;},configurable:true});
    assert.throws(()=>method.call(instance,{},{}),/scene accessor/);assert.equal(reads,0);assert.equal(initializations,0);
    Object.defineProperty(runtime,'bwArcadeDeviceState',{value:state,configurable:true});
    Object.defineProperty(state,'frameDeltaTime',{get(){reads++;return 42;},configurable:true});
    assert.throws(()=>method.call(instance,{},{}),/frame accessor/);assert.equal(reads,0);assert.equal(initializations,0);
});

test('actual frame callback performs the original property read once and does not substitute a Proxy descriptor',()=>{
    const source=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js',import.meta.url),'utf8');
    const start=source.indexOf('    frameDeltaTime(args,util) {'),end=source.indexOf('\n    musicVolume()',start),services=new WeakMap();
    const method=Function('frameDeltaValues','return ({'+source.slice(start,end)+'}).frameDeltaTime;')(services);
    for(const returned of [9,'foreign']){
        let reads=0,initializations=0;const target={frameDeltaTime:42},state=new Proxy(target,{get(object,key,receiver){if(key==='frameDeltaTime'){reads++;return returned;}return Reflect.get(object,key,receiver);}});
        const instance={_runtime:{bwArcadeDeviceState:state},_state(){initializations++;return state;}};
        services.set(instance,{read:(_args,_util,read)=>{const observed=read();assert.equal(observed.state,state);assert.equal(observed.value,returned);assert.notEqual(observed.value,Object.getOwnPropertyDescriptor(state,'frameDeltaTime').value);return observed.value;}});
        assert.equal(method.call(instance,{},{}),returned);assert.equal(reads,1,'one actual reporter read after the modeled initializer');assert.equal(initializations,1);
    }
    const f=fixture();f.begin();assert.throws(()=>f.report(()=>f.service.read(f.cache.clock._argValues,f.util,()=>({state:f.scene,value:9}),f.legacy)),/scene or input segment changed/);assert.equal(f.consume(),false,'descriptor/result disagreement supplies no Number fact');
});
