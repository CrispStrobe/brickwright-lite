import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {createClassCallableDescriptors} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-class-descriptors.js';
const make=source=>createClassCallableDescriptors(parseMakeCodeTs(source,{retainCallableMetadata:true,retainClassHeritage:true,parameterDefaults:true}));
const source='class State {value:number;constructor(){this.value=2}}class Holder {action:(state:State)=>number;constructor(){}applyChange<T>(action:(state:State)=>T):T{return action(new State())}}';
const action=name=>({kind:'callable',parameters:[{name:'state',optional:false,type:{kind:'named',name:'State'}}],result:{kind:'named',name}});

test('class callback fields and invocation-local generic results retain concrete types',()=>{
    const graph=make(source);assert.deepEqual(graph.unsupported,[]);
    assert.equal(graph.classes.find(row=>row.name==='Holder').fields[0].type.result.name,'number');
    const number=graph.instantiate('Holder','applyChange',[action('number')]);
    const string=graph.instantiate('Holder','applyChange',[action('string')]);
    assert.deepEqual(number.unsupported,[]);assert.deepEqual(string.unsupported,[]);
    assert.equal(number.signature.result.name,'number');assert.equal(string.signature.result.name,'string');
    assert.equal(graph.classes.find(row=>row.name==='Holder').methods[0].signature.result.name,'T');
});

test('generic method type parameters shadow real same-spelled class names',()=>{
    const graph=make('class T {constructor(){}}'+source);
    assert.deepEqual(graph.unsupported,[]);
    assert.equal(graph.instantiate('Holder','applyChange',[action('boolean')]).signature.result.name,'boolean');
});

test('inherited callback method resolves its actual source owner',()=>{
    const graph=make(source+'class Child extends Holder {constructor(){super()}}');
    const result=graph.instantiate('Child','applyChange',[action('number')]);
    assert.equal(result.owner,'Holder');assert.equal(result.signature.result.name,'number');
});

test('opaque fields, unknown class domains and unqualified generic metadata refuse',()=>{
    for(const text of [source.replace('(state:State)=>number','(state:any)=>number'),source.replace('applyChange<T>','applyChange<T extends State>'),source.replace('applyChange<T>','applyChange<T=number>'),source.replace('applyChange<T>','static applyChange<T>'),source.replace('(state:State)=>number','(state:Sprite)=>number')])
        assert.ok(make(text).unsupported.length,text);
    const graph=make(source);
    assert.equal(graph.instantiate('Holder','applyChange',[action('any')]).signature,null);
    assert.equal(graph.instantiate('Holder','applyChange',[action('Missing')]).signature,null);
    assert.equal(graph.instantiate('Missing','applyChange',[action('number')]).signature,null);
});

test('callback receiver type, arity and optional parameters must match exactly',()=>{
    const graph=make(source);
    for(const callback of [
        {...action('number'),parameters:[]},
        {...action('number'),parameters:[{name:'state',optional:true,type:{kind:'named',name:'State'}}]},
        {...action('number'),parameters:[{name:'state',optional:false,type:{kind:'named',name:'Holder'}}]}
    ]) assert.equal(graph.instantiate('Holder','applyChange',[callback]).signature,null);
});

test('intrinsic ancestry and Array signature domains stay explicitly unqualified',()=>{
    for(const text of [source.replace('class State {','class State extends Sprite {'),source.replace('(state:State)=>number','(state:State[])=>number')])
        assert.ok(make(text).unsupported.length,text);
});

test('stored callback factories retain their callable return descriptor without callback parameters',()=>{
    const graph=make('class Holder {value:number;constructor(){this.value=2}make():()=>number{return()=>this.value}}');
    assert.deepEqual(graph.unsupported,[]);
    assert.equal(graph.classes[0].methods[0].name,'make');
    assert.equal(graph.classes[0].methods[0].signature.result.kind,'callable');
    assert.equal(graph.instantiate('Holder','make',[]).signature.result.result.name,'number');
});
