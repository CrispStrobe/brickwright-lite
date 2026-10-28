import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {classCallableSourceGate} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-gate.js';
import {source} from './fixtures/arcade-class-callable-source.mjs';
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,
    retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
const gate=text=>{try{return classCallableSourceGate(parse(text));}catch(error){return {eligible:false,unsupported:[error.message]};}};
test('source gate proves typed ordinary allocations, captured receivers and per-invocation results',()=>{
    assert.deepEqual(gate(source),{eligible:true,unsupported:[]});
    const renamed=source.replace(/State/g,'Sprite').replace(/Holder/g,'Font').replace(/apply/g,'transform').replace(/read/g,'take').replace(/state/g,'record');
    assert.deepEqual(gate(renamed),{eligible:true,unsupported:[]});
    assert.deepEqual(gate(source.replace('new Holder(state)','new Holder(alias)').replace('let holder=','let alias=state;let holder=')),{eligible:true,unsupported:[]});
});
test('source gate refuses actual missing arguments, wrong writers and nonvoid fallthrough',()=>{
    for(const changed of [
        source.replace('holder.apply((s:State)=>{s.value+=2;return s.value})','holder.apply()'),
        source.replace('s.value+=2;return s.value','s.value="wrong";return s.value'),
        source.replace('s.value+=2;return s.value','s.value+=2;'),
        source.replace('s.value+=2;return s.value','s.value+=2;').replace('(s:State)=>{','(s:State):number=>{'),
        source.replace('return action(this.state)','action="wrong" as any;return action(this.state)'),
        source.replace('let state=new State()','let state:State="opaque" as any'),
        source.replace('this.state=state;this.read=', 'this.read=()=>this.state.value;this.read();this.state=state;this.read='),
    ]){const result=gate(changed);assert.equal(result.eligible,false,changed);assert.ok(result.unsupported.length,changed);}
    const annotated=parse(source.replace('s.value+=2;return s.value','s.value+=2;'));
    const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionExpression'&&node.body.some(st=>st.expr?.type==='Assignment'))node.returnType='number';for(const value of Object.values(node))if(value&&typeof value==='object'){if(Array.isArray(value))value.forEach(walk);else walk(value);}};walk(annotated);
    const result=classCallableSourceGate(annotated);assert.equal(result.eligible,false);assert.match(result.unsupported.join(' '),/returned value/);
});
test('source gate checks the whole neighboring program without discarding unsupported bodies',()=>{
    for(const adjacent of [
        'function unrelated(value:any){return value.missing()}',
        'class Unknown {value:number;constructor(){this.value=1}opaque(value:any){return value.missing()}}let unknown=new Unknown();',
        'let escaped=holder.read;let again=escaped();',
        'let wrong:State=State;',
        'let replaced=state;replaced="opaque" as any;',
    ])assert.equal(gate(source+adjacent).eligible,false,adjacent);
    assert.deepEqual(gate('let n=1;'),{eligible:false,unsupported:[]});
});
test('source gate retains readonly lexical rights and refuses intrinsic/generic widening',()=>{
    assert.deepEqual(gate(source.replace('value:number;','readonly value:number;').replace('s.value+=2;return s.value','return s.value')),{eligible:true,unsupported:[]});
    for(const changed of [
        source.replace('value:number;','readonly value:number;'),
        source.replace('class State {','class State extends Sprite {'),
        source.replace('apply<T>','apply<T extends number>'),
        source.replace('apply<T>','apply<T=number>'),
        source.replace('state:State)','state:State=undefined)'),
        source.replace('()=>number','()=>boolean').replace('this.read=()=>this.state.value','this.read=()=>true'),
    ])assert.equal(gate(changed).eligible,false,changed);
});

test('callable field initializers cannot borrow a caller constructor or an undefined receiver binding',()=>{
    const initialized=source.replace('read:()=>number;','read:()=>number=()=>this.state.value;').replace('this.read=()=>this.state.value','');
    const result=gate(initialized);assert.equal(result.eligible,false);assert.match(result.unsupported.join(' '),/field initializers.*receiver\/lexical ABI/);
    const fields=parse(source);const holder=fields.body.find(node=>node.type==='Class'&&node.name==='Holder');
    const arrow=holder.ctor.body.find(node=>node.expr?.right?.type==='FunctionExpression').expr.right;arrow.returnType='number';arrow.body[0].value.object.object.name='unboundReceiver';
    const unbound=classCallableSourceGate(fields);assert.equal(unbound.eligible,false);assert.match(unbound.unsupported.join(' '),/unresolved lexical value/);
});

test('generic method results remain generic inside their declaring body',()=>{
    assert.deepEqual(gate(source.replace('return action(this.state)','let result:T=action(this.state);return result')),{eligible:true,unsupported:[]});
    assert.deepEqual(gate(source.replace('return action(this.state)','let result=action(this.state);return result')),{eligible:true,unsupported:[]});
    for(const body of [
        'this.state.value=action(this.state);return action(this.state)',
        'let result:number=action(this.state);return action(this.state)',
        'let result=action(this.state)+1;return action(this.state)',
        'let result:T=1;return result',
        'return 1 as T',
    ])assert.equal(gate(source.replace('return action(this.state)',body)).eligible,false,body);
});
