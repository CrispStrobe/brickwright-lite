import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassCallableExportProvider} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-export-provider.js';
const named=name=>({kind:'named',name});
const signature={kind:'callable',parameters:[],result:named('number')};
const parameter={name:'action',optional:false,type:signature};
const fixture=()=>{
    const target={name:'Game',blocks:{definition:{opcode:'procedures_definition',next:null}},variables:{}};
    const cls={name:'Box',parent:null,target,fields:[],methods:[],constructor:'ctor %s %s',parameters:[{name:'action',type:'callable',optional:false,callableSignature:structuredClone(signature)}]};
    const owner={id:'ctor',kind:'constructor',parent:'module',sourceName:'constructor',procedure:cls.constructor,signature:{kind:'callable',parameters:[structuredClone(parameter)],result:named('void')},parameters:['parameter'],defaults:[],className:'Box',memberName:null,receiver:'receiver',receiverParameter:'self',typeParameters:[]};
    const plan={schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Box',parent:null}],owners:[{id:'module',kind:'module',parent:null},owner],bindings:[{id:'receiver',owner:'ctor',sourceName:'this',nativeName:'receiverCell',kind:'receiver',type:named('Box'),written:false},{id:'parameter',owner:'ctor',sourceName:'action',nativeName:'action',kind:'parameter',type:structuredClone(signature),written:false}],sites:[]};
    const classes=new Map([['Box',cls]]),key=(_target,code)=>code;
    const definitions=new Map([[cls.constructor,{target,code:cls.constructor,block:target.blocks.definition,parameters:['self','action']}]]);
    const provider=()=>createClassCallableExportProvider({target,project:{targets:[target]},classes,definitions,valueTypes:()=>new Set(),literal:(_target,block,name)=>block.inputs?.[name]?.[1]?.[1]??null,key,builtinNames:new Set()});
    return {target,cls,plan,provider,definitions};
};
test('constructor callback metadata must match the exact lexical parameter signature',()=>{
    const f=fixture();assert.equal(f.provider().validateCurrentPlan(f.plan,f.target),true);
    f.cls.parameters[0].callableSignature.result=named('string');
    assert.equal(f.provider().validateCurrentPlan(f.plan,f.target),false);
    delete f.cls.parameters[0].callableSignature;
    assert.equal(f.provider().validateCurrentPlan(f.plan,f.target),false);
});
test('generic constructor and foreign current target cannot acquire class plan authority',()=>{
    const f=fixture();assert.equal(f.provider().validateCurrentPlan(f.plan,{...f.target}),false);
    f.plan.owners[1].typeParameters=[{name:'T',constraint:'',defaultType:''}];
    assert.equal(f.provider().validateCurrentPlan(f.plan,f.target),false);
});
test('post-lowering local cells require a real dominating assignment in the actual procedure',()=>{
    const f=fixture(),owner=f.plan.owners[1];
    const write=(name,value,parent,next=null)=>({opcode:'arcade_setLocal',parent,next,inputs:{NAME:[1,[10,name]],VALUE:[1,value]}});
    f.target.blocks.definition.next='first';
    f.target.blocks.first=write('temp',[4,'2'],'definition','second');
    f.target.blocks.read={opcode:'arcade_getLocal',parent:'second',inputs:{NAME:[1,[10,'temp']]}};
    f.target.blocks.second=write('temp','read','first','last');
    f.target.blocks.last=write('other','read','second');
    const p=f.provider();assert.equal(p.validateCurrentPlan(f.plan,f.target),true);
    assert.deepEqual(p.localAssignment(f.target.blocks.first,owner),{name:'temp',type:named('number'),first:true});
    assert.deepEqual(p.localAssignment(f.target.blocks.second,owner),{name:'temp',type:named('number'),first:false});
    f.target.blocks.first.inputs.VALUE=[1,'read'];
    assert.equal(p.localAssignment(f.target.blocks.first,owner),null,'forward/self read cannot borrow a later type');
    f.target.blocks.first.inputs.VALUE=[1,[4,'2']];f.target.blocks.second.inputs.VALUE=[1,[10,'changed']];
    assert.equal(p.localAssignment(f.target.blocks.second,owner),null,'edited String assignment cannot widen a Number cell');
    f.target.blocks.foreign=write('temp',[4,'3'],null);
    assert.equal(p.localAssignment(f.target.blocks.foreign,owner),null,'same name outside the actual procedure is not a cell declaration');
});
test('declared field type needs an independent writer anchor and rejects opaque alternatives',()=>{
    const f=fixture(),owner=f.plan.owners[1];f.cls.fields=[{name:'value',type:'number',readonly:false}];
    f.target.blocks.definition.next='write';
    f.target.blocks.self={opcode:'arcade_getLocal',parent:'write',inputs:{NAME:[1,[10,'self']]}};
    f.target.blocks.read={opcode:'arcade_objectField',parent:'write',inputs:{OBJECT:[1,'self'],FIELD:[1,[10,'value']]}};
    f.target.blocks.write={opcode:'arcade_setObjectField',parent:'definition',next:null,inputs:{OBJECT:[1,'self'],FIELD:[1,[10,'value']],VALUE:[1,'read']}};
    const p=f.provider();assert.throws(()=>p.validateCurrentPlan(f.plan,f.target),/field write differs/);
    const type=()=>p.valueType(f.target.blocks.read,owner,{inputType:()=>named('Box'),argsType:()=>[],localType:()=>null});
    assert.throws(type,/field write differs/,'self-referential declared field cannot bootstrap type authority');
    f.target.blocks.write.inputs.VALUE=[1,[4,'2']];
    assert.equal(p.validateCurrentPlan(f.plan,f.target),true);
    assert.deepEqual(type(),named('number'));
    f.target.blocks.other={...f.target.blocks.write,inputs:{...f.target.blocks.write.inputs,VALUE:[1,[10,'opaque']]}};
    f.target.blocks.write.next='other';f.target.blocks.other.parent='write';
    assert.throws(type,/field write differs/,'one anchored Number does not hide a later String writer');
});

test('new local cells cannot shadow visible class, global or lexical bindings',()=>{
    for(const name of ['Box','class','action','visible']){
        const f=fixture(),owner=f.plan.owners[1];f.target.variables.global=['visible',0];
        f.target.blocks.definition.next='write';
        f.target.blocks.write={opcode:'arcade_setLocal',parent:'definition',next:null,inputs:{NAME:[1,[10,name]],VALUE:[1,[4,'2']]}};
        const p=f.provider();assert.equal(p.validateCurrentPlan(f.plan,f.target),true);
        assert.equal(p.localAssignment(f.target.blocks.write,owner),null,name);
    }
});
test('readonly writes require the actual constructor receiver and never a nested arrow owner',()=>{
    const f=fixture(),owner=f.plan.owners[1];f.cls.fields=[{name:'value',type:'number',readonly:true}];
    f.target.blocks.definition.next='write';
    f.target.blocks.self={opcode:'arcade_getLocal',parent:'write',inputs:{NAME:[1,[10,'self']]}};
    f.target.blocks.write={opcode:'arcade_setObjectField',parent:'definition',next:null,inputs:{OBJECT:[1,'self'],FIELD:[1,[10,'value']],VALUE:[1,[4,'2']]}};
    const p=f.provider();assert.equal(p.validateCurrentPlan(f.plan,f.target),true);
    const environment={inputType:name=>named(name==='OBJECT'?'Box':'number'),argsType:()=>[],localType:()=>null};
    assert.equal(p.statementType(f.target.blocks.write,owner,environment),true);
    assert.equal(p.statementType(f.target.blocks.write,{...owner,id:'arrow',kind:'arrow',parent:owner.id},environment),false);
    f.target.blocks.self.inputs.NAME=[1,[10,'other']];
    assert.throws(()=>p.validateCurrentPlan(f.plan,f.target),/field write differs/);
});

test('current nonplan class method cannot overwrite its callback formal from a String',()=>{
    const f=fixture();const method={name:'apply',procedure:'apply %s %s',parameters:structuredClone(f.cls.parameters),returnType:'number',typeParameters:[],callableSignature:{kind:'callable',parameters:[structuredClone(parameter)],result:named('number')}};
    f.cls.methods=[method];
    f.target.blocks.method={opcode:'procedures_definition',next:'return'};
    f.target.blocks.action={opcode:'arcade_getLocal',parent:'invoke',inputs:{NAME:[1,[10,'action']]}};
    f.target.blocks.invoke={opcode:'arcade_callCallable',parent:'return',inputs:{CALLABLE:[1,'action'],ARGS:[1,[10,'[]']]}};
    f.target.blocks.return={opcode:'arcade_returnValue',parent:'method',next:null,inputs:{VALUE:[1,'invoke']}};
    f.definitions.set(method.procedure,{target:f.target,code:method.procedure,block:f.target.blocks.method,parameters:['self','action']});
    const p=f.provider();assert.equal(p.validateCurrentPlan(f.plan,f.target),true);
    const context=p.contextForMethod(method.procedure);assert.throws(()=>context.local('action',true),/parameter writes/);
    f.target.blocks.write={opcode:'arcade_setLocal',parent:'method',next:'return',inputs:{NAME:[1,[10,'action']],VALUE:[1,[10,'bad']]}};
    f.target.blocks.method.next='write';f.target.blocks.return.parent='write';
    assert.equal(p.validateCurrentPlan(f.plan,f.target),false);
    assert.equal(p.contextForMethod(method.procedure),null,'failed validation revokes the method export context');
});

test('constructor actual procedure parameters cannot be renamed or appended behind plan metadata',()=>{
    const f=fixture(),definition=f.definitions.get(f.cls.constructor);
    definition.parameters[1]='different';assert.equal(f.provider().validateCurrentPlan(f.plan,f.target),false);
    definition.parameters=['self','action','extra'];assert.equal(f.provider().validateCurrentPlan(f.plan,f.target),false);
});
test('class global reference type follows actual allocations and every writer, not class graph annotations',()=>{
    const f=fixture(),ctor=f.plan.owners[1],old=f.cls.constructor;
    f.cls.constructor='ctor %s';f.cls.parameters=[];ctor.procedure=f.cls.constructor;ctor.signature.parameters=[];ctor.parameters=[];
    f.plan.bindings=f.plan.bindings.filter(binding=>binding.kind==='receiver');
    const definition=f.definitions.get(old);f.definitions.delete(old);definition.code=f.cls.constructor;definition.parameters=['self'];f.definitions.set(f.cls.constructor,definition);
    f.target.variables.box=['box',0];
    f.target.blocks.root={opcode:'arcade_whenSourceStarts',topLevel:true,next:'write'};
    f.target.blocks.allocation={opcode:'arcade_createObject',parent:'write',inputs:{CLASS:[1,[10,'Box']],ARGS:[1,[10,'[]']]}};
    f.target.blocks.write={opcode:'data_setvariableto',parent:'root',next:'read',fields:{VARIABLE:['box','box']},inputs:{VALUE:[1,'allocation']}};
    f.target.blocks.read={opcode:'data_variable',parent:'write',fields:{VARIABLE:['box','box']},inputs:{}};
    const p=f.provider();assert.equal(p.validateCurrentPlan(f.plan,f.target),true);
    assert.deepEqual(p.expressionType(f.target.blocks.read),named('Box'));
    f.target.blocks.opaque={opcode:'arcade_createImageSprite',parent:'write',inputs:{}};
    f.target.blocks.write.inputs.VALUE=[1,'opaque'];
    assert.equal(p.expressionType(f.target.blocks.read),null,'opaque actual producer cannot inherit a class annotation');
    f.target.blocks.write.inputs.VALUE=[1,'read'];
    assert.equal(p.expressionType(f.target.blocks.read),null,'unanchored variable alias cycle has no allocation authority');
});

test('constructor-only startup context requires its connected current ordinary allocation',()=>{
 const f=fixture();f.cls.constructor='ctor %s';f.cls.parameters=[];const ctor=f.plan.owners[1];ctor.procedure=f.cls.constructor;ctor.parameters=[];ctor.signature.parameters=[];f.plan.bindings=f.plan.bindings.filter(row=>row.kind!=='parameter');f.definitions.clear();f.definitions.set(f.cls.constructor,{target:f.target,code:f.cls.constructor,block:f.target.blocks.definition,parameters:['self']});
 const root=f.target.blocks.startup={opcode:'arcade_whenSourceStarts',topLevel:true,parent:null,next:'set',inputs:{}};
 f.target.blocks.set={opcode:'arcade_setLocal',parent:'startup',next:null,inputs:{NAME:[1,[10,'temp']],VALUE:[1,'allocation']}};
 const allocation=f.target.blocks.allocation={opcode:'arcade_createObject',parent:'set',inputs:{CLASS:[1,[10,'Box']],ARGS:[1,[10,'[]']]}};
 const provider=f.provider();assert.equal(provider.validateCurrentPlan(f.plan,f.target),true);
 const context=provider.contextForModuleRoot(root,{},new Set());assert.ok(context);assert.deepEqual(context.generatedLocal('set'),{name:'temp',type:named('Box'),first:true});
 allocation.inputs.ARGS=[1,'argument'];f.target.blocks.argument={opcode:'arcade_functionArgument',parent:'allocation',inputs:{VALUE:[1,[4,'3']],REST:[1,[10,'[]']]}};assert.throws(()=>provider.contextForModuleRoot(root,{},new Set()),/constructor arguments differ/);
 allocation.inputs.ARGS=[1,[10,'[]']];delete f.target.blocks.argument;
 f.target.blocks.set.inputs.VALUE=[1,[4,'2']];assert.equal(provider.contextForModuleRoot(root,{},new Set()),null,'disconnected allocation is not a typed startup anchor');f.target.blocks.set.inputs.VALUE=[1,'allocation'];
 allocation.inputs.CLASS=[1,'opaque'];f.target.blocks.opaque={opcode:'data_variable',parent:'allocation',fields:{VARIABLE:['Box','foreign']}};assert.equal(provider.contextForModuleRoot(root,{},new Set()),null);allocation.inputs.CLASS=[1,[10,'Box']];delete f.target.blocks.opaque;
 f.cls.target={...f.target};assert.equal(provider.contextForModuleRoot(root,{},new Set()),null,'a foreign class registration cannot anchor this startup');
});
