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

// These preparation controls compare the original eager public entry with the
// translator-only demand. No value/completion fact is supplied by the latter.
import {analyseSourceValueProducers,analyseSourceDeclarationIdentityForPreparation} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {declarationIdentityInput} from '../overlay/scratch-gui/src/lib/bw-makecode/declaration-identity-input.js';
import {prepareProcedureConstraintSource,prepareProcedureConstraintSourceForTranslation} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
const identityOptions={unboundIsOpaque:true,opaqueDeclarationValues:true};
const identityNodes=program=>{
    const out=[],seen=new Set();
    const visit=value=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);out.push(value);
        for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(Object.hasOwn(d,'value'))visit(d.value);}};
    visit(program);return out;
};
const completionFacts=fn=>{try{return {value:fn()};}catch(error){return {error:{name:error.name,message:error.message}};}};
const identityParity=program=>{
    const eager=analyseSourceValueProducers(program,identityOptions),identity=analyseSourceDeclarationIdentityForPreparation(program);
    assert.deepEqual(Reflect.ownKeys(identity),['unchangedFunctionAt']);assert.equal(Object.isFrozen(identity),true);
    for(const node of identityNodes(program))assert.equal(identity.unchangedFunctionAt(node),eager.unchangedFunctionAt(node));
    return {eager,identity};
};
const preparedFacts=value=>({program:value.program,diagnostics:value.diagnostics,independentRoutes:value.independentRoutes,
    prefixes:value.program.body.filter(node=>node.type==='FunctionDeclaration').map(fn=>value.prefix(fn,'actual_'+fn.name,name=>'arg_'+name))});
const preparationParity=(program,mode='prototype')=>{
    const old=completionFacts(()=>preparedFacts(prepareProcedureConstraintSource(program,{mode}))),
        demand=completionFacts(()=>preparedFacts(prepareProcedureConstraintSourceForTranslation(program,{mode})));
    assert.deepEqual(demand,old);return old;
};

test('preparation declaration demand preserves unique lexical identities without granting immutable results',()=>{
    const program=parse('function direct(n:number){return n}let result=direct(2);function recurse(n:number):number{return recurse(n)}let recursive=recurse(1);let alias=direct;let indirect=alias(3);');
    assert.ok(declarationIdentityInput(program));
    const {eager,identity}=identityParity(program),nodes=identityNodes(program);
    const direct=program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='direct');
    const recurse=program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='recurse');
    const calls=nodes.filter(node=>node.type==='Call'&&node.callee?.type==='Identifier');
    assert.equal(identity.unchangedFunctionAt(calls.find(node=>node.callee.name==='direct')),direct);
    assert.equal(identity.unchangedFunctionAt(calls.find(node=>node.callee.name==='recurse')),recurse);
    assert.equal(eager.immutableFunctionAt(recurse),null);
    assert.equal(identity.unchangedFunctionAt(calls.find(node=>node.callee.name==='alias')),null);
    for(const source of [
        'function read(){return 1}function outer(){function read(){return 2}return read()}let value=read();',
        'function read(){return 1}read=function(){return 2};let value=read();',
        'function read(){return 1}function read(){return 2}let value=read();',
        'function read(){return 1}let value=new read();',ordinaryClass,sdkClass
    ])identityParity(parse(source));
});

test('Throw and unreachable writers retain the original complete exceptional identity path',()=>{
    for(const source of [
        'function read(){return 1}function fail(){throw 2}let result=read();',
        'function read(){return 1}function change(){return;read=function(){return 2}}let result=read();',
        'function read(){return 1}function fail(){throw 2;read=function(){return 2}}let result=read();'
    ]){
        const program=parse(source);identityParity(program);preparationParity(program);
        if(identityNodes(program).some(node=>node.type==='ThrowStatement'))assert.equal(declarationIdentityInput(program),null);
    }
    const program=parse('function read(){return 1}function change(){return;read=function(){return 2}}let result=read();');
    const graph=identityParity(program).identity;
    assert.equal(graph.unchangedFunctionAt(program.body[0]),null,'physical unreachable reassignment still invalidates the declaration');
});

test('selected primitive constraints and omitted defaults keep full validation and lowering',()=>{
    for(const source of [
        'function read(n:number){return n+1}let result=read(2);',
        'function read(n:number){return n+1}let result=read("wrong");',
        'function read(n:string,b:boolean){return n}let result=read("ok",true);',
        'function read(n:number){n="wrong";return n}let result=read(2);',
        'function read(n:any=2){return n}let result=read();'
    ])for(const mode of ['prototype','supported-default'])preparationParity(parse(source),mode);
    const good=preparationParity(parse('function read(n:number){return n+1}let result=read(2);'));
    assert.ok(good.value);assert.deepEqual(good.value.diagnostics,[]);assert.equal(good.value.prefixes[0].length,1);
    const bad=preparationParity(parse('function read(n:number){return n}let result=read("wrong");'));
    assert.ok(bad.value.diagnostics.length,'identity does not replace actual argument production');
});

test('empty selections excluded declarations duplicates and callable routes keep the original passes',()=>{
    for(const source of [
        'let value=1;', 'function read(){return 1}let result=read();',
        'function read(n:number[]){return n}let result=read([1]);',
        'function read(n:number=2){return n}let result=read();',
        'function read(n:number){return n}let alias=read;let result=alias(2);',
        'function read(n:number){return n}function read(n:number){return n+1}let result=read(2);',
        'function makeCounter(start:number):()=>number{let n=start;return()=>{n+=1;return n}}let first=makeCounter(2);let value=first();'
    ])for(const mode of ['prototype','supported-default'])preparationParity(parse(source),mode);
    // Even an empty catalogue must perform the old malformed-graph observation.
    const program=parse('screen.print("hello");');
    const call=identityNodes(program).find(node=>node.type==='Call');call.args=null;
    const old=completionFacts(()=>prepareProcedureConstraintSource(program)),demand=completionFacts(()=>prepareProcedureConstraintSourceForTranslation(program));
    assert.ok(old.error);assert.deepEqual(demand,old);
});

test('private identity preserves original print formal and malformed syntax errors before its cut',()=>{
    const rows=[
        ['screen.print("hi");',program=>{identityNodes(program).find(node=>node.type==='Call').args=null;}],
        ['function read(n:number){return n}let result=read(2);',program=>{program.body[0].params=null;}],
        ['function read(n:number){return n}let result=read(2);',program=>{identityNodes(program).find(node=>node.type==='Call').args=null;}],
        ['let value=1;',program=>{program.body.push({type:'Unknown',text:'unparsed'});}]
    ];
    for(const [source,mutate] of rows){
        const program=parse(source);mutate(program);
        const old=completionFacts(()=>{analyseSourceValueProducers(program,identityOptions);return 'returned';}),
            demand=completionFacts(()=>{analyseSourceDeclarationIdentityForPreparation(program);return 'returned';});
        assert.deepEqual(demand,old);preparationParity(program);
    }
    const program=parse('screen.print("hi");');identityNodes(program).find(node=>node.type==='Call').args=null;
    assert.ok(completionFacts(()=>analyseSourceDeclarationIdentityForPreparation(program)).error);
});

test('fresh preparation reanalyses changed formal metadata writers and physical declarations',()=>{
    const program=parse('function read(n:number){return n}let result=read(2);'),original=program.body[0];
    identityParity(program);assert.deepEqual(preparationParity(program).value.diagnostics,[]);
    const input=declarationIdentityInput(program);assert.ok(input);assert.equal(input.current(),true);
    const replacement=externalCopy(original);program.body[0]=replacement;
    assert.equal(input.current(),false);program.body[0]=original;assert.equal(input.current(),false);
    program.body[0]=replacement;
    assert.equal(identityParity(program).identity.unchangedFunctionAt(replacement),replacement);
    assert.equal(identityParity(program).identity.unchangedFunctionAt(original),null);
    const call=identityNodes(program).find(node=>node.type==='Call');
    const argument=call.args[0];call.args[0]={type:'String',value:'wrong'};
    assert.ok(preparationParity(program).value.diagnostics.length);
    call.args[0]=argument;assert.deepEqual(preparationParity(program).value.diagnostics,[]);
    replacement.paramTypes.n.text='string';assert.ok(preparationParity(program).value.diagnostics.length);
    replacement.paramTypes.n.text='number';assert.deepEqual(preparationParity(program).value.diagnostics,[]);
});

test('public external AST APIs stay eager and cannot receive a declaration demand through options',()=>{
    const sentinel=Error('actual getter failure');
    const run=privateEntry=>{
        const program=parse('function read(){return 1}let value=read();');let reads=0;
        Object.defineProperty(program,'foreign',{enumerable:true,get(){reads++;throw sentinel;}});
        const observed=result(()=>privateEntry?analyseSourceDeclarationIdentityForPreparation(program):analyseSourceValueProducers(program,identityOptions));
        return {observed,reads};
    };
    const old=run(false),demand=run(true);assert.equal(old.observed.threw,sentinel);assert.equal(demand.observed.threw,sentinel);assert.equal(demand.reads,old.reads);
    const program=parse('function read(){return 1}let value=read();');
    const poison=new Proxy({}, {get(){throw Error('supplied token read');}});
    const graph=analyseSourceValueProducers(program,{...identityOptions,identityOnly:true,declarationIdentityOnly:true,identityInput:poison});
    assert.equal(typeof graph.typesAt,'function');assert.equal(typeof graph.immutableFunctionAt,'function');assert.equal(typeof graph.bindingOf,'function');
    const fn=program.body[0];assert.equal(graph.unchangedFunctionAt(fn),fn);
    let ownKeys=0;const proxy=new Proxy(program,{ownKeys(target){ownKeys++;return Reflect.ownKeys(target);}});
    analyseSourceValueProducers(proxy,identityOptions);const first=ownKeys;ownKeys=0;
    analyseSourceValueProducers(proxy,{...identityOptions,identityInput:poison,identityOnly:true});assert.equal(ownKeys,first);
});

test('changed intrinsics during the original front phase force the original value tail',()=>{
    const originalValues=Object.getOwnPropertyDescriptor(Object,'values');
    const run=privateEntry=>{
        const target=parse('function read(n:number){return n+1}let result=read(2);');
        let armed=true,values=0;const gets=[];
        const proxy=new Proxy(target,{get(object,key,receiver){gets.push(key);if(armed&&key==='type'){
            armed=false;Object.defineProperty(Object,'values',{...originalValues,value:function(value){values++;return Reflect.apply(originalValues.value,Object,[value]);}});
        }return Reflect.get(object,key,receiver);}});
        let graph;
        try{graph=privateEntry?analyseSourceDeclarationIdentityForPreparation(proxy):analyseSourceValueProducers(proxy,identityOptions);}
        finally{Object.defineProperty(Object,'values',originalValues);}
        assert.equal(graph.unchangedFunctionAt(target.body[0]),target.body[0]);
        return {gets,values};
    };
    assert.deepEqual(run(true),run(false),'currentness decline resumes the actual full eager tail');
    // The old eager tail has several dynamic freeze observations. An altered
    // intrinsic must see exactly that old sequence, with no NEW private-view
    // call after it. A one-shot throw at the next call distinguishes this from
    // merely checking that final output still looks frozen.
    const freezeDescriptor=Object.getOwnPropertyDescriptor(Object,'freeze');
    const freezeSentinel=Error('changed freeze reached');
    const freezeRun=(privateEntry,throwAt=Infinity)=>{
        const target=parse('function read(n:number){return n}let result=read(2);');let armed=true,calls=0;
        const proxy=new Proxy(target,{get(object,key,receiver){if(armed&&key==='type'){
            armed=false;Object.defineProperty(Object,'freeze',{...freezeDescriptor,value:function(value){
                calls++;if(calls===throwAt)throw freezeSentinel;return Reflect.apply(freezeDescriptor.value,Object,[value]);
            }});
        }return Reflect.get(object,key,receiver);}});
        let observed;
        try{observed=result(()=>privateEntry?analyseSourceDeclarationIdentityForPreparation(proxy):analyseSourceValueProducers(proxy,identityOptions));}
        finally{Object.defineProperty(Object,'freeze',freezeDescriptor);}
        return {observed,calls};
    };
    const originalFreezeCalls=freezeRun(false);assert.ok(originalFreezeCalls.observed.returned);assert.ok(originalFreezeCalls.calls>0);
    const eagerFreeze=freezeRun(false,originalFreezeCalls.calls+1),privateFreeze=freezeRun(true,originalFreezeCalls.calls+1);
    assert.ok(eagerFreeze.observed.returned);assert.ok(privateFreeze.observed.returned);
    assert.equal(privateFreeze.calls,eagerFreeze.calls);assert.equal(privateFreeze.calls,originalFreezeCalls.calls);
    assert.equal(freezeRun(false,1).observed.threw,freezeSentinel);
    assert.equal(freezeRun(true,1).observed.threw,freezeSentinel,'original eager freeze failure is still observed');
    for(const [key,replacement] of [['every',()=>true],['some',()=>false],[Symbol.iterator,function(){throw Error('foreign iterator');}]]){
        const program=parse('let value=1;'),input=declarationIdentityInput(program);assert.ok(input);
        const d=Object.getOwnPropertyDescriptor(Array.prototype,key);let current;
        try{Object.defineProperty(Array.prototype,key,{...d,value:replacement});current=input.current();}
        finally{Object.defineProperty(Array.prototype,key,d);}
        assert.equal(current,false);assert.equal(input.current(),false);assert.ok(declarationIdentityInput(program));
    }
});
