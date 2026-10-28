import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import createGraph from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-graph.js';
import primitiveOwner from '../overlay/scratch-vm/src/util/bw-primitive-owner.js';
const fixture=()=>{
    const runtime=new EventEmitter();runtime.threads=[];runtime.sequencer={activeThread:null};
    const target=()=>{const _blocks={definition:{id:'definition',opcode:'procedures_definition',next:'body',parent:null,topLevel:true,inputs:{},fields:{}},body:{id:'body',opcode:'arcade_getObjectField',parent:'definition',next:null,fields:{},inputs:{}}};return {isOriginal:true,blocks:{_blocks,getBlock:id=>_blocks[id],getProcedureDefinition:()=> 'definition',getProcedureParamNamesIdsAndDefaults:()=>[[],[],[]]}};};
    const owned=target(),foreign=target();runtime.targets=[owned,foreign];
    const graph=createGraph(runtime);runtime.emit('PROJECT_START');
    return {runtime,owned,foreign,graph,target};
};

test('semantic graph binds real containers, body objects and project membership',()=>{
    for(const mutation of ['body','sameIdReplacement','addedBlock','removedBlock','container','addedTarget','removedTarget','foreignEdit','clone']) {
        const f=fixture();assert.equal(f.graph.current(f.owned),true);
        if(mutation==='body')f.owned.blocks._blocks.body.opcode='arcade_setObjectField';
        if(mutation==='sameIdReplacement')f.owned.blocks._blocks.body={...f.owned.blocks._blocks.body};
        if(mutation==='addedBlock')f.owned.blocks._blocks.extra={id:'extra'};
        if(mutation==='removedBlock')delete f.owned.blocks._blocks.body;
        if(mutation==='container')f.owned.blocks=f.target().blocks;
        if(mutation==='addedTarget')f.runtime.targets.push(f.target());
        if(mutation==='removedTarget')f.runtime.targets.pop();
        if(mutation==='foreignEdit')f.foreign.blocks._blocks.body.next='another';
        if(mutation==='clone')f.owned.isOriginal=false;
        assert.equal(f.graph.current(f.owned),false,mutation);
    }
});

test('Stop/load/dispose revoke graph authority and a new start snapshots edited source',()=>{
    for(const event of ['PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED']) {
        const f=fixture();f.runtime.emit(event);assert.equal(f.graph.current(f.owned),false);
    }
    const f=fixture();f.owned.blocks._blocks.body.opcode='arcade_setObjectField';assert.equal(f.graph.current(f.owned),false);
    f.runtime.emit('PROJECT_START');assert.equal(f.graph.current(f.owned),true);
    f.owned.blocks._blocks.definition.x=120;assert.equal(f.graph.current(f.owned),true,'layout does not alter procedure semantics');
});

test('caller graph authority rejects observers, retired threads and foreign target loans',()=>{
    const f=fixture(),thread={target:f.owned,status:0,constructor:{STATUS_DONE:4}};
    f.runtime.threads.push(thread);const util={thread,target:f.owned};
    assert.equal(f.graph.callerCurrent(util),false);f.runtime.sequencer.activeThread=thread;assert.equal(f.graph.callerCurrent(util),true);
    assert.equal(f.graph.callerCurrent({...util,target:f.foreign}),false);
    thread.isKilled=true;assert.equal(f.graph.callerCurrent(util),false);thread.isKilled=false;
    f.runtime.threads=[];assert.equal(f.graph.callerCurrent(util),false);
});

test('creation requires its real current static reporter operand and module source hat',()=>{
    const f=fixture(),blocks=f.owned.blocks._blocks;
    blocks.create={id:'create',opcode:'arcade_createCallable',parent:'definition',next:null,fields:{},inputs:{NAME:{block:'name',shadow:'name'}}};
    blocks.name={id:'name',opcode:'text',shadow:true,parent:'create',fields:{TEXT:{value:'OwnedClosure'}},inputs:{},next:null};
    blocks.source={id:'source',opcode:'arcade_whenSourceStarts',parent:null,topLevel:true,fields:{},inputs:{},next:'create'};
    f.runtime.emit('PROJECT_START');
    const thread={target:f.owned,topBlock:'definition',status:0,constructor:{STATUS_DONE:4},peekStack:()=> 'create'};
    f.runtime.threads.push(thread);f.runtime.sequencer.activeThread=thread;const util={thread,target:f.owned,runtime:f.runtime};
    thread.blockContainer=f.owned.blocks;f.runtime.isActiveThread=value=>f.runtime.threads.includes(value);
    const args={NAME:'OwnedClosure'},op={id:'create',opcode:'arcade_createCallable',_argValues:args,_blockFunction:()=>0};
    f.owned.blocks._cache={_executeCached:{create:{_ops:[op]}}};
    f.runtime.getOpcodeFunction=()=>op._blockFunction;
    const check=options=>primitiveOwner.invoke(f.runtime,thread,f.owned.blocks,op,args,util,()=>f.graph.callerCurrent(util,{...options,args}));
    assert.equal(check({procedure:'OwnedClosure',module:false}),true);
    assert.equal(check({procedure:'SiblingClosure',module:false}),false);
    assert.equal(check({procedure:'OwnedClosure',module:true}),false);
    thread.topBlock='source';assert.equal(check({procedure:'OwnedClosure',module:true}),true);
    thread.peekStack=()=> 'body';assert.equal(f.graph.callerCurrent(util,{procedure:'OwnedClosure',module:true,args}),false);
    thread.peekStack=()=> 'create';blocks.name.shadow=false;f.runtime.emit('PROJECT_START');
    assert.equal(check({procedure:'OwnedClosure',module:true}),false);
});

test('v2 owners bind the actual procedure definition and cached native parameter map',()=>{
    const f=fixture(),plan={schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Holder',parent:null}],
        owners:[{id:'module',kind:'module',parent:null},{id:'arrow',kind:'arrow',parent:'module',sourceName:null,procedure:'ReadHolder',signature:{kind:'callable',parameters:[],result:{kind:'named',name:'number'}},parameters:[],defaults:[]}],
        bindings:[],sites:[{id:'site',owner:'arrow',createdIn:'module',captures:[],defaults:[]}]};
    assert.equal(f.graph.current(f.owned,plan),true);
    f.owned.blocks.getProcedureParamNamesIdsAndDefaults=()=>[['extra'],[],[]];assert.equal(f.graph.current(f.owned,plan),false);
    f.owned.blocks.getProcedureParamNamesIdsAndDefaults=()=>[[],[],[]];
    f.owned.blocks.getProcedureDefinition=()=> 'body';assert.equal(f.graph.current(f.owned,plan),false);
    assert.throws(()=>f.graph.current(f.owned,{...plan,version:1}),/unsupported schema version/);
});
