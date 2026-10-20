import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerCallableValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-callable-values.js';
const source='class State {current:number;label:string;constructor(){this.current=1;this.label="a"}}class Holder {state:State;read:()=>number;constructor(state:State){this.state=state;this.read=()=>this.state.current}applyChange<T>(action:(state:State)=>T):T {return action(this.state)}}let state=new State();let holder=new Holder(state);let amount=holder.applyChange((s:State)=>{s.current+=2;return s.current});let text=holder.applyChange((s:State)=>s.label);let observed=holder.read();';
const parse=text=>parseMakeCodeTs(text,{retainCallableMetadata:true,retainClassHeritage:true,parameterDefaults:true});
const collect=(node,predicate)=>{
    const found=[];const walk=value=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(walk);return;}if(predicate(value))found.push(value);for(const[key,child]of Object.entries(value))if(!['originalBody','parameterDefaults'].includes(key))walk(child);};walk(node);return found;
};

test('class prototype keeps default source lowering closed and requires explicit option',()=>{
    const ast=parse(source);
    assert.ok(lowerCallableValues(ast).unsupported.some(row=>/qualified class descriptor bridge/.test(row)));
    assert.ok(lowerCallableValues(ast,{classPrototype:'yes'}).unsupported.some(row=>/explicit Boolean option/.test(row)));
});

test('captured receiver rewrites only the escaped body and retains actual constructor metadata',()=>{
    const ast=parse(source),holder=ast.body.find(row=>row.name==='Holder'),originalBody=holder.ctor.originalBody;
    const result=lowerCallableValues(ast,{classPrototype:true});assert.deepEqual(result.unsupported,[]);
    const rewritten=result.program.body.find(row=>row.name==='Holder');
    assert.deepEqual(rewritten.ctor.originalBody,originalBody);
    assert.ok(collect(rewritten.ctor.body,node=>node.type==='Identifier'&&node.name==='this').length);
    const definition=result.program.body.find(row=>row.bwCallableDefinition?.captures.some(capture=>capture.receiverClass));
    const capture=definition.bwCallableDefinition.captures[0];
    assert.equal(capture.receiverClass,'Holder');assert.equal(capture.mode,'value');
    assert.equal(collect(definition.body,node=>node.type==='Identifier'&&node.name==='this').length,0);
    assert.ok(collect(definition.body,node=>node.type==='Identifier'&&node.name===capture.name&&node.assertedType==='Holder').length);
});

test('same generic method preserves invocation-local Number and String result metadata',()=>{
    const result=lowerCallableValues(parse(source),{classPrototype:true});assert.deepEqual(result.unsupported,[]);
    const calls=collect(result.program.body,node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='applyChange');
    assert.deepEqual(calls.map(node=>node.bwClassCallableInvocation.result.name),['number','string']);
    const method=result.program.bwClassCallableDescriptors.classes.find(row=>row.name==='Holder').methods[0];
    assert.equal(method.signature.result.name,'T');assert.equal(method.typeParameters[0].name,'T');
    assert.equal(result.program.bwCallableLexicalPlan,undefined);
});

test('v2 plan waits for actual emitted constructor mapping and preserves self parameter hygiene',()=>{
    const result=lowerCallableValues(parse(source),{classPrototype:true}),holder=result.program.body.find(row=>row.name==='Holder');
    assert.throws(()=>result.finishClassPlan([]),/missing actual lowered class method mapping/);
    const mapping={scopeId:holder.ctor.bwClassCallableScopeId,className:'Holder',methodName:null,procedure:'ActualHolderCtor %s %s',receiverParameter:'actualSelf_'};
    const plan=result.finishClassPlan([mapping]),constructor=plan.owners.find(row=>row.kind==='constructor');
    assert.equal(plan.version,2);assert.equal(constructor.procedure,mapping.procedure);assert.equal(constructor.receiverParameter,'actualSelf_');
    assert.notEqual(plan.bindings.find(row=>row.id===constructor.receiver).nativeName,'actualSelf_');
    assert.throws(()=>result.finishClassPlan([{...mapping,methodName:'wrong'}]),/missing actual lowered class method mapping/);
});

test('static fields, opaque callbacks and constrained generic methods remain refused',()=>{
    for(const text of [source.replace('read:()=>number','static read:()=>number'),source.replace('read:()=>number','read:()=>any'),source.replace('applyChange<T>','applyChange<T extends State>'),source.replace('applyChange<T>','applyChange<T=number>')])
        assert.ok(lowerCallableValues(parse(text),{classPrototype:true}).unsupported.length,text);
});
