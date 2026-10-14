import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClassCallablePlan,createClassCallablePlan} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-plan.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseCallableFlow} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-flow.js';
import nativeSchema from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-plan.generated.js';
const named=name=>({kind:'named',name});
const signature=(parameters,result)=>({kind:'callable',parameters,result});
const plan=()=>({schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Holder',parent:null}],owners:[
    {id:'module',kind:'module',parent:null},
    {id:'method',kind:'method',parent:'module',sourceName:'make',procedure:'HolderMake %s',signature:signature([],signature([],named('number'))),parameters:[],defaults:[],className:'Holder',memberName:'make',receiver:'self',receiverParameter:'actualSelf',typeParameters:[]},
    {id:'arrow',kind:'arrow',parent:'method',sourceName:null,procedure:'ReadHolder',signature:signature([],named('number')),parameters:[],defaults:[]}
],bindings:[{id:'self',owner:'method',sourceName:'this',nativeName:'__bwSelf',kind:'receiver',type:named('Holder'),written:false}],sites:[{id:'site',owner:'arrow',createdIn:'method',captures:[{binding:'self',mode:'value'}],defaults:[]}]});

test('class lexical schema retains receiver identity separately from scalar cells',()=>{
    const source=plan(),copy=validateClassCallablePlan(source);
    assert.deepEqual(copy,source);assert.notEqual(copy,source);
    copy.bindings[0].nativeName='changed';assert.equal(source.bindings[0].nativeName,'__bwSelf');
});

test('unknown class, forged receiver, foreign capture and cycles refuse atomically',()=>{
    for(const mutate of [
        value=>value.classes[0].parent='Missing',
        value=>value.classes[0].parent='Holder',
        value=>value.bindings[0].type=named('Sprite'),
        value=>value.bindings[0].owner='arrow',
        value=>value.sites[0].captures[0].mode='cell',
        value=>value.sites[0].createdIn='module',
        value=>value.owners[1].receiver='missing',
        value=>value.owners[1].parent='arrow',
        value=>value.owners[2].signature.result=named('any'),
        value=>value.owners[2].className='Holder'
    ]){const input=plan();mutate(input);assert.throws(()=>validateClassCallablePlan(input),/Class callable plan/);}
});

test('generic variables belong to their method invocation template only',()=>{
    const input=plan();input.owners[1].typeParameters=[{name:'T',constraint:'',defaultType:''}];input.owners[1].signature.result=named('T');
    assert.deepEqual(validateClassCallablePlan(input).owners[1].signature.result,named('T'));
    input.owners[2].signature.result=named('T');
    assert.throws(()=>validateClassCallablePlan(input),/nested generic closure signature/);
    input.classes.push({name:'T',parent:null});
    assert.throws(()=>validateClassCallablePlan(input),/nested generic closure signature/);
});

test('method defaults, constrained generic variables and duplicate native bindings remain refused',()=>{
    for(const mutate of [
        value=>value.owners[1].defaults=[{name:'n',value:2}],
        value=>value.owners[1].typeParameters=[{name:'T',constraint:'Holder',defaultType:''}],
        value=>value.bindings.push({...value.bindings[0],id:'other'}),
        value=>value.owners[2].procedure=value.owners[1].procedure
    ]){const input=plan();mutate(input);assert.throws(()=>validateClassCallablePlan(input),/Class callable plan/);}
});

test('native generated schema retains exact frontend positives and closed-domain refusals',()=>{
    assert.deepEqual(nativeSchema.validateClassCallablePlan(plan()),validateClassCallablePlan(plan()));
    for(const mutate of [
        value=>value.version=1,
        value=>value.classes[0].name='Missing',
        value=>value.owners[1].sourceName='other',
        value=>value.bindings[0].kind='global',
        value=>value.owners[2].signature.result={kind:'array',element:named('number')}
    ]){const input=plan();mutate(input);assert.throws(()=>validateClassCallablePlan(input),/Class callable plan/);assert.throws(()=>nativeSchema.validateClassCallablePlan(input),/Class callable plan/);}
});

test('actual lexical receiver binding maps to the separately lowered hygienic parameter',()=>{
    const ast=parseMakeCodeTs('class Holder {value:number;constructor(){this.value=3}make():()=>number{return()=>this.value}}let holder=new Holder();let callback=holder.make();',{retainCallableMetadata:true,retainClassHeritage:true,parameterDefaults:true});
    const flow=analyseCallableFlow(ast),scope=flow.lexical.functions.find(scope=>scope.node.type==='FunctionExpression');
    const info={name:'ReadHolder',site:'readSite',scope};
    const mapping={scopeId:scope.parent.id,className:'Holder',methodName:'make',receiverParameter:'__bwSelf_',procedure:'HolderMake %s'};
    const result=createClassCallablePlan(flow,[info],[mapping]);
    const method=result.owners.find(owner=>owner.kind==='method');
    assert.equal(method.receiverParameter,'__bwSelf_');
    const receiver=result.bindings.find(binding=>binding.id===method.receiver);
    assert.equal(receiver.sourceName,'this');assert.notEqual(receiver.nativeName,method.receiverParameter);
    assert.equal(result.sites[0].captures[0].binding,receiver.id);assert.equal(result.sites[0].captures[0].mode,'value');
    assert.throws(()=>createClassCallablePlan(flow,[info],[]),/missing actual lowered class method mapping/);
    assert.throws(()=>createClassCallablePlan(flow,[info],[{...mapping,className:'Other'}]),/missing actual lowered class method mapping/);
});
