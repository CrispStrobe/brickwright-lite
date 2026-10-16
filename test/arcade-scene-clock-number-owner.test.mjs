import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),clock=require('../overlay/scratch-vm/src/util/bw-scene-clock-number'),loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');

// Authored execution-boundary model, not a Scratch VM or original SDK run.
// Actual source/adapter/native/current-project controls are separate tests.
function fixture(value) {
    if(arguments.length===0)value=42;
    const runtime=new EventEmitter(),scene={_sceneValueId:'scene:1',elapsedMs:value},scenes=new Map([['scene:1',scene]]);
    let serial=0,reads=0,legacyReads=0;
    runtime.targets=[];runtime.threads=[];runtime._blockInfo=[];runtime._primitives={};runtime.sequencer={activeThread:null};
    runtime.getOpcodeFunction=function(name){return this._primitives[name];};runtime.getIsHat=()=>false;
    runtime.isActiveThread=thread=>runtime.threads.includes(thread)&&!thread.isKilled&&thread.status!==4;
    const instance={},owner={isInstance:object=>object===instance,isCurrent:()=>true,context:()=>({state:scene,scenes,serial,epoch:0})};
    const service=clock.create(runtime,owner),block=(id,opcode,parent=null,inputs={},fields={},shadow=false)=>({id,opcode,parent,inputs,fields,shadow,topLevel:false,next:null});
    const nodes={root:block('root','arcade_inspectValue',null,{VALUE:{block:'clock',shadow:null},LIMIT:{block:'limit',shadow:'limit'}}),clock:block('clock','arcade_sceneMillis','root'),limit:block('limit','math_number','root',{}, {NUM:{name:'NUM',value:'20'}},true)};
    const maps=Object.fromEntries(Object.entries(nodes).map(([id,node])=>[id,{...node.inputs}])),cache={};
    const container={_blocks:nodes,getBlock:id=>nodes[id],getInputs:node=>maps[node.id],_cache:{_executeCached:cache}},target={blocks:container};
    class Thread {static STATUS_DONE=4;}
    const thread=new Thread();Object.assign(thread,{target,blockContainer:container,isKilled:false,status:0,peekStack:()=> 'root',peekStackFrame:()=>frame});
    let frame={};runtime.targets.push(target);runtime.threads.push(thread);runtime.sequencer.activeThread=thread;
    const util={runtime,thread,target},read=()=>{reads++;return {state:scene,value:scene.elapsedMs};},legacy=()=>{legacyReads++;return scene.elapsedMs||0;};
    const actual=(args,u)=>service.read(args,u,read,legacy);
    const prototype={getInfo(){return clock.declaration({id:'arcade',blocks:[{opcode:'sceneMillis',arguments:{}}]},owner);}};
    const adapter=Object.assign(Object.create(prototype),{_inst:instance,sceneMillis:actual});
    const info=adapter.getInfo();clock.bindAdapterInfo(info,adapter,instance);
    const row=info.blocks[0],registered=(args,u)=>adapter.sceneMillis(args,u);
    runtime._primitives.arcade_sceneMillis=registered;runtime._primitives.arcade_inspectValue=()=>{};
    const category={id:'arcade',blocks:[{json:{type:'arcade_sceneMillis'},info:{...row,func:registered}}]};runtime._blockInfo.push(category);runtime.emit('EXTENSION_ADDED',category);
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
        refresh:row=>{category.blocks=[{json:{type:'arcade_sceneMillis'},info:{...row,func:registered}}];runtime.emit('BLOCKSINFO_UPDATE',category);},
        counts:()=>({reads,legacyReads}),sceneABA:()=>{serial+=2;},replaceFrame:()=>{frame={};}};
}
const rejected=work=>{try{assert.equal(work(),false,'no completed Number fact');}catch(error){assert.match(error.message,/Scene clock Number:|Primitive execution|Cached primitive/);}};

test('clock fact needs the actual finite completion, current parent slot and current consumer loan',()=>{
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
for(const value of [NaN,Infinity,-Infinity,'42',undefined,null])test('cached clock cannot certify '+String(value),()=>{
    const f=fixture(value);f.begin();assert.throws(()=>f.report(),/actual scene read is not finite Number/);assert.equal(f.consume(),false);assert.deepEqual(f.counts(),{reads:1,legacyReads:0});
    assert.equal(f.service.read({},null,f.read,f.legacy),value||0,'historical direct fallback unchanged');
});
for(const mode of ['loan without read','changed return','copied arguments','throw after read'])test('clock completion refuses '+mode,()=>{
    const f=fixture();f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);f.begin();
    const work=mode==='loan without read'?()=>42:mode==='changed return'?()=>{f.service.read(f.cache.clock._argValues,f.util,f.read,f.legacy);return 43;}:
        mode==='copied arguments'?()=>f.service.read({...f.cache.clock._argValues},f.util,f.read,f.legacy):()=>{f.service.read(f.cache.clock._argValues,f.util,f.read,f.legacy);throw Error('original throw');};
    assert.throws(()=>f.report(work),mode==='throw after read'?/original throw/:/real finite reporter completion/);
    assert.equal(f.consume(),false,'failed call cannot leave a completion');
});
for(const mode of ['parent value','block graph','cached function','cache order','argument identity','metadata function','opcode lookup','adapter delegate','scene ABA','stopped thread','foreign target','new stack frame','yield resume','Stop','Load','dispose'])test('completed clock refuses '+mode+' without rereading',()=>{
    const f=fixture();f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);
    if(mode==='parent value')f.cache.root._argValues.VALUE=43;
    if(mode==='block graph')f.nodes.clock.fields.EXTRA={value:1};
    if(mode==='cached function')f.cache.clock._blockFunction=()=>42;
    if(mode==='cache order')f.cache.root._ops.reverse();
    if(mode==='argument identity')f.cache.clock._argValues={...f.cache.clock._argValues};
    if(mode==='metadata function')f.category.blocks[0].info.func=()=>42;
    if(mode==='opcode lookup')f.runtime.getOpcodeFunction=function(name){return this._primitives[name];};
    if(mode==='adapter delegate')f.adapter.sceneMillis=()=>42;
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


test('only a fresh genuine registration issue renews clock ownership; an older unused issue is stale',()=>{
    const f=fixture();f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);
    const earlierUnused=f.issue(),fresh=f.issue();f.refresh(fresh);f.begin();assert.equal(f.report(),42);assert.equal(f.consume(),true);
    f.refresh(earlierUnused);assert.throws(f.begin,/actual input segment owner differs/);assert.equal(f.consume(),false);assert.deepEqual(f.counts(),{reads:2,legacyReads:0});
});

test('runtime-free and duplicate service objects retain direct fallback behavior without result ownership',()=>{
    const fallback=clock.create(null,null);assert.equal(fallback.read({},null,()=>{throw Error('not a certified read');},()=>Infinity),Infinity);assert.equal(fallback.eligible({},{}),false);
    const f=fixture(),foreign=clock.create(f.runtime,{isCurrent:()=>true});f.begin();assert.throws(()=>f.report(()=>foreign.read(f.cache.clock._argValues,f.util,f.read,f.legacy)),/real finite reporter completion/);assert.equal(f.consume(),false);assert.deepEqual(f.counts(),{reads:0,legacyReads:1});
});
