import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerCallableValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-callable-values.js';
import {callableDeclarationEnvelope, inspectCallableExportGraph, renderCallableSignature, createCallableLexicalEmitter, callableVariableEnvelope} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-export-graph.js';
const fixture = () => {
    const lowered = lowerCallableValues(parseMakeCodeTs('function makeCounter(start:number):()=>number {let n=start;return()=>{n+=1;return n}} let first=makeCounter(2);', {retainCallableMetadata:true}));
    assert.deepEqual(lowered.unsupported, []);
    const plan = lowered.program.bwCallableLexicalPlan, blocks = {};
    for (const owner of plan.owners.filter(owner => owner.kind !== 'module')) {
        const id = owner.id;
        blocks[id] = {opcode:'procedures_definition',parent:null,next:null,inputs:{custom_block:[1,id+'_proto']}};
        blocks[id+'_proto'] = {opcode:'procedures_prototype',parent:id,mutation:{proccode:owner.procedure,argumentnames:JSON.stringify(owner.signature.parameters.map(p=>p.name))}};
    }
    const site = plan.sites[0], name = plan.owners.find(owner=>owner.id===site.owner).procedure;
    blocks.source = {opcode:'arcade_whenSourceStarts',parent:null,next:'declare'};
    blocks.declare = {opcode:'arcade_declareCallable',parent:'source',values:{NAME:name,METADATA:JSON.stringify(callableDeclarationEnvelope(plan,site.id))}};
    blocks[site.createdIn].next='factoryInit';
    blocks.factoryInit={opcode:'arcade_setLocal',parent:site.createdIn,next:'factoryReturn',values:{NAME:plan.bindings.find(binding=>binding.id===site.captures[0].binding).nativeName}};
    blocks.factoryReturn={opcode:'arcade_returnValue',parent:'factoryInit',inputs:{VALUE:[1,'create']}};
    for(const binding of plan.bindings.filter(row=>row.kind==='global'&&row.type.kind==='callable')) {
        const id='global_'+binding.id,old=blocks.source.next;
        blocks.source.next=id;blocks[old].parent=id;
        blocks[id]={opcode:'arcade_declareSourceCallable',parent:'source',next:old,inputs:{VARIABLE:[1,id+'_reporter']},values:{SIGNATURE:JSON.stringify({...callableVariableEnvelope(plan,binding.id),variableId:id+'_variable'})}};
        blocks[id+'_reporter']={opcode:'data_variable',parent:id,fields:{VARIABLE:[binding.sourceName,id+'_variable']}};
    }
    blocks.create = {opcode:'arcade_createCallable',parent:'factoryReturn',values:{NAME:name}};
    blocks.service = {opcode:'arcade_whenCallableDispatched',parent:null,next:'dispatch',values:{NAME:name}};
    blocks.dispatch = {opcode:'arcade_runCallableDispatch',parent:'service',next:null,inputs:{}};
    return {target:{blocks},plan};
};
const inspect = f => inspectCallableExportGraph(f.target,f.plan,(block,name)=>block.values?.[name] ?? null);
test('current owned procedure and source-site identities are checked independently of source bodies', () => {
    const graph = inspect(fixture());
    assert.equal(graph.procedures.size,2);
    assert.equal(graph.creates.size,1);
    assert.equal(renderCallableSignature(graph.plan.owners.find(owner=>owner.kind==='declaration').signature),'(start: number) => () => number');
    assert.equal(JSON.stringify(graph.plan).includes('"body"'),false);
});
test('current edited procedure, create and bridge mutations cannot silently restore retained source', () => {
    const mutations = [
        f=>{delete f.target.blocks[f.plan.sites[0].owner];},
        f=>{f.target.blocks[f.plan.sites[0].createdIn+'_proto'].mutation.argumentnames='["edited"]';},
        f=>{f.target.blocks.create.parent='source';},
        f=>{f.target.blocks.create2={...f.target.blocks.create};},
        f=>{f.target.blocks.dispatch.next='declare';},
        f=>{f.target.blocks.dispatch.opcode='looks_show';},
        f=>{f.target.blocks.create.parent='create';},
        f=>{const envelope=JSON.parse(f.target.blocks.declare.values.METADATA);envelope.plan.body='return 999';f.target.blocks.declare.values.METADATA=JSON.stringify(envelope);},
        f=>{f.target.blocks.declare.values.METADATA='{}';},
        f=>{delete f.target.blocks.service;},
        f=>{f.target.blocks.declare2={...f.target.blocks.declare};},
        f=>{f.target.blocks.loose={opcode:'arcade_runCallableDispatch',parent:null};}
    ];
    for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(()=>inspect(f), /Callable (export graph|lexical plan):/);}
});

test('lexical emitter reconstructs a genuine nested arrow from current bodies and reflects edits', () => {
    const f=fixture(),site=f.plan.sites[0],capture=f.plan.bindings.find(binding=>binding.id===site.captures[0].binding);
    delete f.target.blocks.factoryInit;
    f.target.blocks[site.createdIn].next='currentFactoryBody';
    f.target.blocks.currentFactoryBody={opcode:'arcade_setLocal',parent:site.createdIn,next:'factoryReturn',values:{NAME:capture.nativeName}};
    f.target.blocks.factoryReturn.parent='currentFactoryBody';
    f.target.blocks[site.owner].next='currentArrowBody';
    f.target.blocks.currentArrowBody={opcode:'arcade_returnValue',parent:site.owner};
    const graph=inspect(f),bodyCalls=[];
    const emit=step=>createCallableLexicalEmitter(graph,(first,context)=>{
        bodyCalls.push(first);
        if(first==='currentFactoryBody')return ['    '+context.local(capture.nativeName)+' = '+context.local('start'), '    return '+context.create('create')];
        return ['    '+context.capture(capture.nativeName,true)+' += '+step,'    return '+context.capture(capture.nativeName)];
    }).declarations()[0];
    const initial=emit(1),edited=emit(7);
    assert.match(initial,/function makeCounter\(start: number\): \(\) => number/);
    assert.match(initial,/return \(\) => \{/);
    assert.match(edited,/n \+= 7/);
    assert.equal(edited.includes('n += 1'),false);
    assert.deepEqual(bodyCalls,['currentFactoryBody','currentArrowBody','currentFactoryBody','currentArrowBody']);
    assert.equal(/__bwCallable|bwCallable|\{.*capture/.test(initial),false,'No record or thunk substitute');
});
test('edited readonly capture writes and foreign locals have named export refusals', () => {
    const graph=inspect(fixture());
    assert.throws(()=>createCallableLexicalEmitter(graph,(_,context)=>[context.local('forged')]).declarations(),/unowned local/);
    const site=graph.plan.sites[0],capture=graph.plan.bindings.find(binding=>binding.id===site.captures[0].binding);
    capture.written=false;site.captures[0].mode='value';
    assert.throws(()=>createCallableLexicalEmitter(graph,(_,context)=>context.owner.kind==='declaration'?[context.create('create')]:[context.capture(capture.nativeName,true)]).declarations(),/snapshot capture/);
});

test('moving creation ahead of actual native local initialization is a named failure, not an exported hoist',()=>{
    const f=fixture(),site=f.plan.sites[0];
    f.target.blocks[site.createdIn].next='factoryReturn';f.target.blocks.factoryReturn.parent=site.createdIn;
    delete f.target.blocks.factoryInit;
    assert.throws(()=>inspect(f),/precedes its native local cell initialization/);
});
