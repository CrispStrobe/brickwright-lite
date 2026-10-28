import {test} from 'node:test';
import assert from 'node:assert/strict';
import {callableDeclarationEnvelope,inspectCallableExportGraph,createCallableLexicalEmitter,validateCallableCurrentBodyTypes} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-export-graph.js';
const named=name=>({kind:'named',name});
const fixture=()=>{
    const plan={schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Holder',parent:null}],owners:[
        {id:'module',kind:'module',parent:null},
        {id:'ctor',kind:'constructor',parent:'module',sourceName:'constructor',procedure:'__bwClass_Holder_constructor %s',signature:{kind:'callable',parameters:[],result:named('void')},parameters:[],defaults:[],className:'Holder',memberName:null,receiver:'self',receiverParameter:'__bwSelf',typeParameters:[]},
        {id:'arrow',kind:'arrow',parent:'ctor',sourceName:null,procedure:'__bwCallable_1',signature:{kind:'callable',parameters:[],result:named('number')},parameters:[],defaults:[]}
    ],bindings:[{id:'self',owner:'ctor',sourceName:'this',nativeName:'cellSelf',kind:'receiver',type:named('Holder'),written:false}],sites:[{id:'site',owner:'arrow',createdIn:'ctor',captures:[{binding:'self',mode:'value'}],defaults:[]}]};
    const blocks={};
    for(const owner of plan.owners.filter(row=>row.kind!=='module')) {
        blocks[owner.id]={opcode:'procedures_definition',parent:null,next:null,inputs:{custom_block:[1,owner.id+'_proto']}};
        blocks[owner.id+'_proto']={opcode:'procedures_prototype',parent:owner.id,mutation:{proccode:owner.procedure,argumentnames:JSON.stringify(owner.receiverParameter?[owner.receiverParameter]:[])}};
    }
    blocks.start={opcode:'arcade_whenSourceStarts',parent:null,next:'declare'};
    blocks.declare={opcode:'arcade_declareCallable',parent:'start',values:{NAME:'__bwCallable_1',METADATA:JSON.stringify(callableDeclarationEnvelope(plan,'site',{classPrototype:true}))}};
    blocks.ctor.next='assign';
    blocks.assign={opcode:'arcade_setObjectField',parent:'ctor',inputs:{VALUE:[1,'create']}};
    blocks.create={opcode:'arcade_createCallable',parent:'assign',values:{NAME:'__bwCallable_1'}};
    blocks.arrow.next='return';
    blocks.return={opcode:'arcade_returnValue',parent:'arrow',inputs:{VALUE:[1,'field']}};
    blocks.field={opcode:'arcade_objectField',parent:'return',values:{NAME:'n'},inputs:{OBJECT:[1,'capture']}};
    blocks.capture={opcode:'arcade_getCaptured',parent:'field',values:{NAME:'cellSelf'}};
    blocks.service={opcode:'arcade_whenCallableDispatched',parent:null,next:'dispatch',values:{NAME:'__bwCallable_1'}};
    blocks.dispatch={opcode:'arcade_runCallableDispatch',parent:'service',next:null,inputs:{}};
    const target={blocks};
    const literal=(block,name)=>block.values?.[name]??null;
    const provider={validateCurrentPlan:current=>JSON.stringify(current)===JSON.stringify(plan),
        valueType:(block,_owner,{inputType})=>block.opcode==='arcade_objectField'&&literal(block,'NAME')==='n'&&inputType('OBJECT')?.name==='Holder'?named('number'):null,
        statementType:block=>block.opcode==='arcade_setObjectField'};
    return {plan,target,literal,provider};
};
test('v2 current constructor context emits a genuine receiver-capturing Arrow from current blocks',()=>{
    const f=fixture(),graph=inspectCallableExportGraph(f.target,f.plan,f.literal,{classProvider:f.provider});
    validateCallableCurrentBodyTypes(graph,f.literal);
    const emitter=createCallableLexicalEmitter(graph,(_body,context)=>[`    return ${context.capture('cellSelf')}.n`]);
    const ctor=emitter.contextForProcedure('__bwClass_Holder_constructor %s');
    assert.equal(ctor.local('__bwSelf'),'this');
    assert.match(ctor.create('create'),/^\(\) => \{\n    return this.n\n\}$/);
    assert.equal(emitter.contextForProcedure('unknown'),null);
    assert.throws(()=>ctor.local('__bwSelf',true),/writes its class receiver/);
    assert.throws(()=>ctor.create('foreign'),/not owned/);
    assert.deepEqual(emitter.declarations(),[]);
});
test('v2 provider, actual receiver parameter, capture mode and current typed field edits remain strict',()=>{
    const f=fixture();
    assert.throws(()=>inspectCallableExportGraph(f.target,f.plan,f.literal),/current class provider/);
    assert.throws(()=>inspectCallableExportGraph(f.target,f.plan,f.literal,{classProvider:{validateCurrentPlan:()=>false}}),/current class provider/);
    const renamed=structuredClone(f.target);renamed.blocks.ctor_proto.mutation.argumentnames='["foreign"]';
    assert.throws(()=>inspectCallableExportGraph(renamed,f.plan,f.literal,{classProvider:f.provider}),/parameter ownership mismatch/);
    const changed=structuredClone(f.plan);changed.sites[0].captures[0].mode='cell';
    assert.throws(()=>callableDeclarationEnvelope(changed,'site',{classPrototype:true}),/actual enclosing owner/);
    const field=structuredClone(f.target);field.blocks.field.values.NAME='unknown';
    const graph=inspectCallableExportGraph(field,f.plan,f.literal,{classProvider:f.provider});
    assert.throws(()=>validateCallableCurrentBodyTypes(graph,f.literal),/current return differs/);
});

test('v2 method typing receives the actual ordered argument chain and rejects edited operands',()=>{
    const f=fixture();
    f.target.blocks.field={opcode:'arcade_callObjectMethod',parent:'return',inputs:{OBJECT:[1,'capture'],ARGS:[1,'argFirst']}};
    f.target.blocks.argFirst={opcode:'arcade_functionArgument',parent:'field',inputs:{VALUE:[1,[4,'2']],REST:[1,'argSecond']}};
    f.target.blocks.argSecond={opcode:'arcade_functionArgument',parent:'argFirst',inputs:{VALUE:[1,[4,'7']],REST:[1,[10,'[]']]}};
    f.provider.valueType=(block,_owner,{inputType,argsType})=>{
        if(block.opcode!=='arcade_callObjectMethod'||inputType('OBJECT')?.name!=='Holder')return null;
        const args=argsType();return args.length===2&&args.every(type=>type.name==='number')?named('number'):null;
    };
    validateCallableCurrentBodyTypes(inspectCallableExportGraph(f.target,f.plan,f.literal,{classProvider:f.provider}),f.literal);
    const changed=structuredClone(f.target);changed.blocks.argSecond.inputs.VALUE=[1,[10,'7']];
    assert.throws(()=>validateCallableCurrentBodyTypes(inspectCallableExportGraph(changed,f.plan,f.literal,{classProvider:f.provider}),f.literal),/current return differs/);
    const computed=structuredClone(f.target);computed.blocks.argSecond.inputs.REST=[1,[10,'not an argument chain']];
    assert.throws(()=>validateCallableCurrentBodyTypes(inspectCallableExportGraph(computed,f.plan,f.literal,{classProvider:f.provider}),f.literal),/actual current ordered argument chain/);
});

test('actual class receiver locals and discarded field mutations require current typed proof rather than a temporary name',()=>{
    const f=fixture(),b=f.target.blocks;
    b.arrow.next='mutate';b.return.parent='mutate';
    b.mutate={opcode:'arcade_setLocal',parent:'arrow',next:'return',values:{NAME:'arbitraryTemporary'},inputs:{VALUE:[1,'mutation']}};
    b.mutation={opcode:'arcade_assignObjectField',parent:'mutate',values:{FIELD:'n'},inputs:{OBJECT:[1,'mutationReceiver'],VALUE:[1,[4,'3']]}};
    b.mutationReceiver={opcode:'arcade_getCaptured',parent:'mutation',values:{NAME:'cellSelf'}};
    b.assign.inputs.OBJECT=[1,'ctorReceiver'];b.ctorReceiver={opcode:'arcade_getLocal',parent:'assign',values:{NAME:'__bwSelf'}};
    f.provider.statementType=(block,_owner,{inputType})=>block.opcode==='arcade_setObjectField'?inputType('OBJECT')?.name==='Holder':
        block.opcode==='arcade_assignObjectField'&&block.values.FIELD==='n'&&inputType('OBJECT')?.name==='Holder'&&inputType('VALUE')?.name==='number';
    const prior=f.provider.valueType;
    f.provider.valueType=(block,owner,context)=>block.opcode==='arcade_assignObjectField'&&f.provider.statementType(block,owner,context)?named('number'):prior(block,owner,context);
    const graph=inspectCallableExportGraph(f.target,f.plan,f.literal,{classProvider:f.provider});
    validateCallableCurrentBodyTypes(graph,f.literal);
    const emitter=createCallableLexicalEmitter(graph,(_body,context)=>{assert.equal(context.discardLocal('mutate'),true);return ['    this.n = 3','    return this.n'];});
    assert.match(emitter.contextForProcedure('__bwClass_Holder_constructor %s').create('create'),/this.n = 3/);
    b.mutation.inputs.VALUE=[1,[10,'3']];
    assert.throws(()=>emitter.contextForProcedure('__bwClass_Holder_constructor %s').create('create'),/false !== true/);
    assert.throws(()=>validateCallableCurrentBodyTypes(graph,f.literal),/not a validated current field mutation/);
});

test('v2 nonzero-argument sites use their full exact actual procedure label',()=>{
    const f=fixture(),owner=f.plan.owners.find(row=>row.id==='arrow');
    owner.procedure='__bwCallable_1 %s';owner.parameters=['argument'];owner.signature.parameters=[{name:'argument',type:named('number'),optional:false}];
    f.plan.bindings.push({id:'argument',owner:'arrow',sourceName:'argument',nativeName:'argument',kind:'parameter',type:named('number'),written:false});
    f.target.blocks.arrow_proto.mutation={proccode:owner.procedure,argumentnames:'["argument"]'};
    for(const id of ['declare','create','service'])f.target.blocks[id].values.NAME=owner.procedure;
    f.target.blocks.declare.values.METADATA=JSON.stringify(callableDeclarationEnvelope(f.plan,'site',{classPrototype:true}));
    assert.equal(inspectCallableExportGraph(f.target,f.plan,f.literal,{classProvider:f.provider}).creates.get('site'),'create');
    f.target.blocks.create.values.NAME='__bwCallable_1';
    assert.throws(()=>inspectCallableExportGraph(f.target,f.plan,f.literal,{classProvider:f.provider}),/unknown creation site/);
});

test('post-plan native local cells export at their actual first assignment and never gain forward read authority',()=>{
    const f=fixture(),b=f.target.blocks;
    b.arrow.next='firstWrite';b.return.parent='secondWrite';
    b.firstWrite={opcode:'arcade_setLocal',parent:'arrow',next:'secondWrite',values:{NAME:'freshCell'},inputs:{VALUE:[1,[4,'3']]}};
    b.secondWrite={opcode:'arcade_setLocal',parent:'firstWrite',next:'return',values:{NAME:'freshCell'},inputs:{VALUE:[1,[4,'7']]}};
    b.return.inputs.VALUE=[1,'readFresh'];b.readFresh={opcode:'arcade_getLocal',parent:'return',values:{NAME:'freshCell'}};
    f.provider.localAssignment=block=>({name:'freshCell',type:named('number'),first:block===b.firstWrite});
    f.provider.valueType=block=>block.opcode==='arcade_getLocal'&&block.values.NAME==='freshCell'?named('number'):null;
    const graph=inspectCallableExportGraph(f.target,f.plan,f.literal,{classProvider:f.provider});
    validateCallableCurrentBodyTypes(graph,f.literal);
    const emitter=createCallableLexicalEmitter(graph,(_body,context)=>{
        assert.deepEqual(context.generatedLocal('firstWrite'),{name:'freshCell',type:named('number'),first:true});
        assert.deepEqual(context.generatedLocal('secondWrite'),{name:'freshCell',type:named('number'),first:false});
        assert.equal(context.local('freshCell'),'freshCell');
        return ['    let freshCell: number = 3','    freshCell = 7','    return freshCell'];
    });
    assert.match(emitter.contextForProcedure('__bwClass_Holder_constructor %s').create('create'),/let freshCell: number = 3/);
    b.firstWrite.inputs.VALUE=[1,'earlyRead'];b.earlyRead={opcode:'arcade_getLocal',parent:'firstWrite',values:{NAME:'freshCell'}};
    assert.throws(()=>validateCallableCurrentBodyTypes(graph,f.literal),/RHS differs/);
});
