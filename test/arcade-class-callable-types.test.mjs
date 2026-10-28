import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import createTypes from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-types.js';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';
import CallableValues from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/callable-values.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';

// Real heap/resource unit controls; managed VM/source admission remains separate.
const named=name=>({kind:'named',name});
const callback=(inputs,result)=>({kind:'callable',parameters:inputs.map((type,index)=>({name:'arg'+index,type,optional:false})),result});
const fixture=()=>{
    const runtime=new EventEmitter();runtime.targets=[];
    const heap=createHeap(runtime,BW);
    for(const [name,parent] of [['State',null],['Child','State'],['Other',null]])heap.register({name,...(parent?{parent}:{}),fields:[],initializer:'',constructor:'',parameters:[],methods:[]});
    const definitions=new Map(),parameters=new Map(),signatures=new Map();
    const target={blocks:{getProcedureDefinition:name=>definitions.get(name),getProcedureParamNamesIdsAndDefaults:name=>[parameters.get(name),[],[]]}};
    runtime.targets.push(target);
    const resources=new CallableValues(runtime,BW);
    const types=createTypes(runtime,BW,heap,ref=>{const resource=resources.resource(ref);return signatures.get(resource.definition.procedure);});
    let next=0;
    const allocate=signature=>{
        const name='callback'+ ++next,params=signature.parameters.map(parameter=>parameter.name);
        definitions.set(name,{id:name});parameters.set(name,params);signatures.set(name,structuredClone(signature));
        resources.declare(target,{procedure:name,site:name,parameters:params,captures:[]});return resources.create(target,name);
    };
    return {runtime,heap,types,allocate,resources,signatures};
};
const apply=callback([callback([named('State')],named('T'))],named('T'));
const generics=[{name:'T',constraint:'',defaultType:''}];

test('Number and String action results specialize per actual owned resource invocation',()=>{
    const f=fixture(),number=f.allocate(callback([named('State')],named('number'))),string=f.allocate(callback([named('State')],named('string')));
    const numeric=f.types.instantiate(apply,generics,[number]),text=f.types.instantiate(apply,generics,[string]);
    assert.equal(numeric.result.name,'number');assert.equal(text.result.name,'string');
    assert.equal(apply.result.name,'T');assert.equal(apply.parameters[0].type.result.name,'T');
    assert.equal(f.types.result(numeric,NaN),NaN);assert.equal(f.types.result(text,'changed'),'changed');
    assert.throws(()=>f.types.result(numeric,'wrong'),/argument type differs/);
    assert.throws(()=>f.types.result(text,7),/argument type differs/);
});

test('class argument identity and ordinary inheritance use the actual heap without copies',()=>{
    const f=fixture(),state=f.heap.allocate('State').ref,child=f.heap.allocate('Child').ref,other=f.heap.allocate('Other').ref;
    const signature=callback([named('State')],named('State'));
    assert.equal(f.types.instantiate(signature,[],[state]).parameters[0].type.name,'State');
    assert.equal(f.types.result(signature,state),state);assert.equal(f.types.result(signature,child),child);
    assert.throws(()=>f.types.instantiate(signature,[],[other]),/argument type differs/);
    assert.throws(()=>f.types.instantiate(signature,[],[BW.reference(f.runtime,'object','forged')]),/stale class object/);
    assert.throws(()=>f.types.instantiate(signature,[],[BW.reference(new EventEmitter(),'object','foreign')]),/foreign reference/);
});

test('callback argument arity and parameter types remain invariant',()=>{
    const f=fixture();
    for(const signature of [callback([],named('number')),callback([named('Other')],named('number')),callback([named('Child')],named('number'))]) {
        const ref=f.allocate(signature);assert.throws(()=>f.types.instantiate(apply,generics,[ref]),/callback (arity|parameter type) differs/);
    }
    assert.throws(()=>f.types.instantiate(apply,generics,[]),/argument arity differs/);
    assert.throws(()=>f.types.instantiate(apply,generics,[f.allocate(callback([named('State')],named('number'))),1]),/argument arity differs/);
});

test('generic input disagreement and opaque or unresolved domains refuse',()=>{
    const f=fixture(),signature=callback([named('T'),named('T')],named('T'));
    assert.throws(()=>f.types.instantiate(signature,generics,[1,'1']),/generic inputs disagree/);
    for(const value of [null,BW.UNDEFINED])assert.throws(()=>f.types.instantiate(callback([named('T')],named('T')),generics,[value]),/concrete input/);
    assert.throws(()=>f.types.instantiate(callback([],named('T')),generics,[]),/unresolved generic result/);
    for(const type of [named('any'),named('unknown')])assert.throws(()=>f.types.validate(type),/opaque signature domain/);
    assert.throws(()=>f.types.validate(named('Missing')),/not declared in this project run/);
    assert.throws(()=>f.types.validate({kind:'array',element:named('number')}),/malformed signature/);
    assert.throws(()=>f.types.actual({value:1}),/opaque runtime value/);
    assert.throws(()=>f.types.actual(BW.reference(f.runtime,'image','unqualified')),/unqualified reference domain/);
});

test('stopped, reloaded, disposed and forged callback resources cannot provide signatures',()=>{
    for(const event of ['PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED']) {
        const f=fixture(),ref=f.allocate(callback([named('State')],named('number')));f.runtime.emit(event);
        assert.throws(()=>f.types.actual(ref),/^(?:Error: )?(?:Stale or foreign callable reference|Class callable type: foreign reference)$/);
    }
    const f=fixture();assert.throws(()=>f.types.instantiate(apply,generics,[BW.reference(f.runtime,'callable','forged')]),/Stale or foreign/);
});

test('genuine undefined remains explicit and void does not fabricate a value',()=>{
    const f=fixture(),undefinedSignature=callback([],named('undefined')),voidSignature=callback([],named('void'));
    assert.equal(f.types.result(undefinedSignature,BW.UNDEFINED),BW.UNDEFINED);
    assert.throws(()=>f.types.result(undefinedSignature,0),/argument type differs/);
    const state=f.heap.allocate('State').ref;assert.equal(f.types.result(voidSignature,state),state);
    const action=f.allocate(callback([named('State')],named('void'))),method=f.types.instantiate(apply,generics,[action]);
    assert.equal(method.result.name,'void');assert.equal(f.types.result(method,BW.UNDEFINED),BW.UNDEFINED);
});
