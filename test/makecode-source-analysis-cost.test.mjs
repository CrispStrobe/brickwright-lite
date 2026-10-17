import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs,currentParserClassAbsence} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveNamedFunctionSource} from '../overlay/scratch-gui/src/lib/bw-makecode/named-function-source.js';
import {lowerNamedFunctionValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-named-function-values.js';
import {selectClassCallableSourceProof,selectClassCallableSourceProofForTranslation} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-gate.js';
import {source as ordinaryClass} from './fixtures/arcade-class-callable-source.mjs';
import {source as sdkClass} from './fixtures/arcade/sdk-image-class-callables.mjs';

const parse=source=>parseMakeCodeTs(source,{retainCallableMetadata:true,parameterDefaults:true,
    retainParentheses:true,retainClassHeritage:true,retainOrdinaryDefaultProvenance:true});
// Preserve hidden syntax metadata and aliases, but deliberately lose private
// parser origin. This exercises the unchanged eager analysis as the comparator.
const externalCopy=(value,seen=new Map())=>{
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    const copy=Array.isArray(value)?[]:Object.create(Object.getPrototypeOf(value));seen.set(value,copy);
    for(const key of Reflect.ownKeys(value)){
        const d=Object.getOwnPropertyDescriptor(value,key);
        if(Object.hasOwn(d,'value'))d.value=externalCopy(d.value,seen);
        Object.defineProperty(copy,key,d);
    }
    return copy;
};
const facts=proof=>({eligible:proof.eligible,unsupported:proof.unsupported});
const selected=(program,options={})=>selectClassCallableSourceProofForTranslation(program,options);
const result=fn=>{try{return {returned:fn()};}catch(error){return {threw:error};}};
const selectionFacts=value=>({proof:facts(value.proof),sdkImageEnabled:value.sdkImageEnabled});

test('class absence is tied to current parser structure, not source spelling or supplied metadata',()=>{
    for(const source of ['let n=1;', 'let Class="class Fake {}";',
        'function direct(n:number=2){return n+1}let n=direct();',
        'let a=[1,2];let alias=a;alias.push(3);']) {
        const program=parse(source),external=externalCopy(program);
        assert.equal(currentParserClassAbsence(program),true);
        assert.equal(currentParserClassAbsence(external),false);
        external.classAbsent=true;assert.equal(currentParserClassAbsence(external),false);
        const fast=selected(program),old=selectClassCallableSourceProof(external);
        assert.deepEqual(selectionFacts(fast),selectionFacts(old));
        assert.equal(Object.hasOwn(fast.proof,'flow'),false);
        assert.ok(old.proof.flow); // public default still returns actual analysis
        assert.ok(selectClassCallableSourceProof(program).proof.flow);
    }
    assert.equal(currentParserClassAbsence(parseMakeCodeTs('let n=1;')),false);
    // Real partial/uncertain parser products must not bypass an old analysis.
    for(const source of ['let value = ;','let value = 1; §',
        'let value = "unterminated;',
        'function uncertain(value: number |){return value;}',
        'let value: number | = 1;',
        'function generic<T>(value:T){return value;}',
        'function (){return 1;}',
        'interface Value { [index: string]: number } let n=1;']) {
        const program=parse(source),external=externalCopy(program);
        assert.equal(currentParserClassAbsence(program),false,source);
        const a=result(()=>selected(program)),b=result(()=>selectClassCallableSourceProof(external));
        assert.equal(!!a.threw,!!b.threw,source);
        if(a.threw){assert.equal(a.threw.constructor,b.threw.constructor);assert.equal(a.threw.message,b.threw.message);}
        else {assert.deepEqual(selectionFacts(a.returned),selectionFacts(b.returned),source);
            assert.equal(Object.hasOwn(a.returned.proof,'flow'),Object.hasOwn(b.returned.proof,'flow'));}
        assert.deepEqual(facts(proveNamedFunctionSource(program)),facts(proveNamedFunctionSource(external)),source);
    }
    for(const source of ['let value = 1e+;','function incomplete('])assert.throws(()=>parse(source));

});

test('named target-free and actual declaration alias lowering agree with eager producer analysis',()=>{
    for(const source of [
        'let n=1;function direct(){return 7}n=direct();',
        'function read():number{return 7}let alias=read;let n=alias();',
        'function read():string{return "ok"}let alias=read;let again=alias;let n=again();',
        'let count=0;function write():void{count=7}let alias=write;alias();',
        'namespace own {export function read():number{return 7}}let alias=own.read;let n=alias();',
        'function read(a:number=2):number{return a}let alias=read;let n=alias();',
        'function read():number{return 7}let alias=read;alias=image.create(1,1);'
    ]) {
        const program=parse(source),external=externalCopy(program),before=JSON.stringify(program);
        assert.deepEqual(facts(proveNamedFunctionSource(program)),facts(proveNamedFunctionSource(external)),source);
        const fast=lowerNamedFunctionValues(program),old=lowerNamedFunctionValues(external);
        assert.deepEqual(fast.unsupported,old.unsupported,source);
        assert.deepEqual(fast.program,old.program,source);
        assert.equal(JSON.stringify(program),before);
    }
    assert.equal(proveNamedFunctionSource(parse('function read():number{return 7}let alias=read;')).eligible,true);
});

test('ordinary and SDK class proofs preserve completed body validation and SDK selection',()=>{
    for(const [source,options] of [[ordinaryClass,{}],[sdkClass,{}],[sdkClass,{sdkImagePrototype:true}],
        [ordinaryClass.replace('s.value+=2;return s.value','s.value="wrong";return s.value'),{}],
        [ordinaryClass.replace('class State {','class State extends Sprite {'),{}]]) {
        const program=parse(source),external=externalCopy(program);
        assert.equal(currentParserClassAbsence(program),false);
        const fast=selected(program,options),old=selectClassCallableSourceProof(external,options);
        assert.deepEqual(selectionFacts(fast),selectionFacts(old),source);
        assert.equal(Object.hasOwn(fast.proof,'flow'),Object.hasOwn(old.proof,'flow'));
    }
    assert.equal(selected(parse(ordinaryClass)).proof.eligible,true);
    assert.equal(selected(parse(sdkClass),{sdkImagePrototype:true}).proof.eligible,true);
});

test('nested classes and class-bearing syntax metadata retain the complete old path',()=>{
    for(const source of ['function outer(){class Local {value:number;constructor(){this.value=1}}}',
        'namespace own {export class Local {value:number;constructor(){this.value=1}}}',
        'class Plain {value:number;constructor(){this.value=1}}let instance=new Plain();']) {
        const program=parse(source),external=externalCopy(program);
        assert.equal(currentParserClassAbsence(program),false,source);
        assert.deepEqual(selectionFacts(selected(program)),selectionFacts(selectClassCallableSourceProof(external)),source);
        assert.ok(selected(program).proof.flow);
    }
    const program=parse('let n=1;');
    Object.defineProperty(program,'hiddenClass',{value:parse(ordinaryClass).body[0],configurable:true});
    assert.equal(currentParserClassAbsence(program),false);
    delete program.hiddenClass;assert.equal(currentParserClassAbsence(program),false);
});

test('changed values, physical child replacement and descriptor changes expire parser evidence permanently',()=>{
    for(const change of [
        program=>{const before=program.body[0].decls[0].init.value;program.body[0].decls[0].init.value='2';return ()=>{program.body[0].decls[0].init.value=before;};},
        program=>{const before=program.body;program.body=externalCopy(before);return ()=>{program.body=before;};},
        program=>{const before=Object.getOwnPropertyDescriptor(program,'body');Object.defineProperty(program,'body',{...before,enumerable:!before.enumerable});return ()=>Object.defineProperty(program,'body',before);}
    ]) {
        const program=parse('let n=1;');assert.equal(currentParserClassAbsence(program),true);
        const restore=change(program);assert.equal(currentParserClassAbsence(program),false);restore();
        assert.equal(currentParserClassAbsence(program),false);
        assert.ok(selected(program).proof.flow);
        assert.deepEqual(facts(proveNamedFunctionSource(program)),facts(proveNamedFunctionSource(externalCopy(program))));
    }
    const program=parse('let n=1;'),before=program.body;
    program.body=parse(ordinaryClass).body;
    assert.equal(currentParserClassAbsence(program),false);
    assert.equal(selected(program).proof.eligible,true); // reanalysis, no stale negative
    program.body=before;assert.ok(selected(program).proof.flow);
});

test('accessor and Proxy replacements are not invoked by the structural observer',()=>{
    const program=parse('let n=1;'),body=program.body,sentinel=Error('actual getter'),reads=[];
    Object.defineProperty(program,'body',{configurable:true,get(){reads.push('body');throw sentinel;}});
    assert.equal(currentParserClassAbsence(program),false);assert.deepEqual(reads,[]);
    assert.equal(result(()=>selected(program)).threw,sentinel);assert.ok(reads.length);
    Object.defineProperty(program,'body',{configurable:true,enumerable:true,writable:true,value:body});
    assert.equal(currentParserClassAbsence(program),false);
    const next=parse('let n=1;');let traps=0;
    next.body=new Proxy(next.body,{ownKeys(){traps++;throw sentinel;},get(){traps++;throw sentinel;}});
    assert.equal(currentParserClassAbsence(next),false);assert.equal(traps,0);
    assert.equal(result(()=>selected(next)).threw,sentinel);assert.ok(traps>0);
});

test('external hostile and malformed ASTs retain old errors and exact access observations',()=>{
    for(const method of ['class','named']) {
        const invoke=method==='class'?value=>selectionFacts(selected(value)):value=>facts(proveNamedFunctionSource(value));
        const old=method==='class'?value=>selectionFacts(selectClassCallableSourceProof(value)):value=>facts(proveNamedFunctionSource(value));
        const make=()=>{let reads=0;const sentinel=Error('opaque body');const value={type:'Program'};
            Object.defineProperty(value,'body',{enumerable:true,get(){reads++;throw sentinel;}});
            return {value,sentinel,reads:()=>reads};};
        const left=make(),right=make();
        assert.equal(result(()=>invoke(left.value)).threw,left.sentinel);
        assert.equal(result(()=>old(right.value)).threw,right.sentinel);
        assert.equal(left.reads(),right.reads());
        const malformed={type:'Program',body:null};
        const a=result(()=>invoke(malformed)),b=result(()=>old(malformed));
        assert.equal(a.threw?.constructor,b.threw?.constructor);assert.equal(a.threw?.message,b.threw?.message);
        let aTraps=0,bTraps=0;
        const aProxy=new Proxy(externalCopy(parse('let n=1;')),{get(target,key,receiver){aTraps++;return Reflect.get(target,key,receiver);}});
        const bProxy=new Proxy(externalCopy(parse('let n=1;')),{get(target,key,receiver){bTraps++;return Reflect.get(target,key,receiver);}});
        assert.deepEqual(invoke(aProxy),old(bProxy));assert.equal(aTraps,bTraps);
    }
});

test('prototype changes invalidate absence evidence without running inherited accessors',()=>{
    const program=parse('let n=1;'),before=Object.getOwnPropertyDescriptor(Object.prototype,'__bwAbsenceProbe');
    let reads=0;
    try {
        Object.defineProperty(Object.prototype,'__bwAbsenceProbe',{configurable:true,get(){reads++;throw Error('prototype getter');}});
        assert.equal(currentParserClassAbsence(program),false);assert.equal(reads,0);
    } finally {
        if(before)Object.defineProperty(Object.prototype,'__bwAbsenceProbe',before);else delete Object.prototype.__bwAbsenceProbe;
    }
    assert.equal(currentParserClassAbsence(program),false);
    assert.ok(selected(program).proof.flow);
    assert.equal(currentParserClassAbsence(parse('let n=1;')),true);
});


test('overwritten Array helpers and iterator cannot validate a changed parser graph',()=>{
    const alterations=[
        ['every',()=>true],['some',()=>false],
        [Symbol.iterator,function(){throw Error('must not iterate observer arrays');}]
    ];
    for(const [key,replacement] of alterations) {
        const program=parse('let n=1;'),body=program.body;
        const classBody=parse(ordinaryClass).body;
        assert.equal(currentParserClassAbsence(program),true);
        program.body=classBody;
        const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,key);
        let observed;
        try {
            Object.defineProperty(Array.prototype,key,{...descriptor,value:replacement});
            observed=currentParserClassAbsence(program);
        } finally {Object.defineProperty(Array.prototype,key,descriptor);}
        assert.equal(observed,false);
        assert.equal(selected(program).proof.eligible,true);
        program.body=body;
        assert.equal(currentParserClassAbsence(program),false);
        assert.ok(selected(program).proof.flow);
    }
    // RegExp.test would dispatch through a replaced prototype.exec. Compare
    // unchanged parser work with and without recording to isolate extra calls.
    const descriptor=Object.getOwnPropertyDescriptor(RegExp.prototype,'exec');
    let calls=0,ordinaryCalls,recordedCalls,recorded;
    try {
        Object.defineProperty(RegExp.prototype,'exec',{...descriptor,value:function(...args){calls++;return Reflect.apply(descriptor.value,this,args);}});
        parseMakeCodeTs('let value:number=1;',{retainCallableMetadata:false});ordinaryCalls=calls;
        calls=0;recorded=parseMakeCodeTs('let value:number=1;',{retainCallableMetadata:true});recordedCalls=calls;
    } finally {Object.defineProperty(RegExp.prototype,'exec',descriptor);}
    assert.equal(recordedCalls,ordinaryCalls,'recording never invokes replaced RegExp.exec');
    assert.equal(currentParserClassAbsence(recorded),true);
});
