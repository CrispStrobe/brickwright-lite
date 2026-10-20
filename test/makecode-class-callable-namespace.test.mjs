import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
import {createClassCallableDescriptors} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-class-descriptors.js';
const lower=source=>lowerNamespaceBindings(parseMakeCodeTs(source,{retainClassHeritage:true,retainCallableMetadata:true,parameterDefaults:true}));

test('class callable parameters qualify namespace classes while retaining generic shadowing',()=>{
    const result=lower('namespace Domain {export class T {constructor(){}}export class State {constructor(){}}export class Holder {action:(state:State)=>number;constructor(){}applyChange<T>(action:(state:State)=>T):T{return action(new State())}}}');
    assert.deepEqual(result.unsupported,[]);
    const holder=result.program.body.find(node=>node.type==='Class'&&node.name.endsWith('_Holder'));
    const state=result.program.body.find(node=>node.type==='Class'&&node.name.endsWith('_State'));
    assert.equal(holder.methods[0].paramTypes.action.text,`(state: ${state.name}) => T`);
    assert.equal(holder.methods[0].returnType,'T');
    assert.equal(holder.fields[0].typeName,`(state: ${state.name}) => number`);
    const descriptor=createClassCallableDescriptors(result.program);
    assert.deepEqual(descriptor.unsupported,[]);
});

test('constructor original body and actual body resolve the same lexical namespace owner',()=>{
    const result=lower('namespace Domain {export let source=3;export class Holder {value:number;constructor(){this.value=source}}}');
    assert.deepEqual(result.unsupported,[]);
    const cls=result.program.body.find(node=>node.type==='Class');
    assert.deepEqual(cls.ctor.originalBody,cls.ctor.body);
    assert.match(cls.ctor.originalBody[0].expr.right.name,/Domain_source$/);
});

test('unknown callable domains remain unresolved rather than acquiring a guessed class',()=>{
    const result=lower('namespace Domain {export class Holder {action:(state:Missing)=>number;constructor(){}}}');
    assert.deepEqual(result.unsupported,[]);
    assert.ok(createClassCallableDescriptors(result.program).unsupported.length);
});
