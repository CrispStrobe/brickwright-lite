import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {lexicalDeclarationReadiness} from '../overlay/scratch-gui/src/lib/bw-makecode/lexical-declaration-readiness.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
const parse=(source,selected=profile)=>parseMakeCodeTs(source,selected);
const options={arrayValues:true,arrayEffectSites:true,parenthesized:true,unboundIsOpaque:true,
    uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true,
    ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true};
const header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const suffix='let value:any;let callback=function(){return value};value=3;';
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','returnType','typeParameters','ordinaryParameterDefaultNames']);
const walk=(value,out=[],seen=new Set())=>{
    if(!value||typeof value!=='object'||seen.has(value))return out;seen.add(value);
    if(!Array.isArray(value))out.push(value);
    for(const [key,child]of Object.entries(value))if(!metadata.has(key))walk(child,out,seen);return out;
};
const callbackRead=ast=>{
    const declaration=walk(ast).find(node=>node.type==='Declaration'&&node.decls.some(decl=>decl.name==='callback'));
    assert.ok(declaration);const callable=declaration.decls.find(decl=>decl.name==='callback').init;
    assert.equal(callable.type,'FunctionExpression');const read=callable.body.find(node=>node.type==='Return').value;
    assert.equal(read.type,'Identifier');return read;
};
const readiness=(source,expected)=>{
    const ast=parse(source),read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options);
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),expected);return {ast,read,graph};
};
const accept=source=>{const ast=parse(header+';'+source),proof=inspectNativeArrayBinaryDomains(ast,profile);
    assert.equal(proof.reason,null);assert.equal(proof.helpers.size,1);assert.equal(proof.arrayHelpers.size,0);
    assert.equal(proof.current(),true);return {ast,proof};};
const refuse=source=>{const proof=inspectNativeArrayBinaryDomains(parse(header+';'+source),profile);assert.equal(proof.helpers.size,0);};
const classNode=ast=>{const node=ast.body.find(node=>node.type==='Class');assert.ok(node);return node;};

test('actual parser retains constructor instance role and diagnoses static constructors without inferring a missing flag',()=>{
    for(const selected of Object.values(GENERATED_HELPER_PROFILES)){
        const ast=parse('class Counter {constructor(public n:any){this.n=n}}',selected),ctor=classNode(ast).ctor;
        const role=Object.getOwnPropertyDescriptor(ctor,'isStatic');assert.ok(role&&Object.hasOwn(role,'value'));
        assert.equal(role.value,false);assert.equal(Object.hasOwn(ctor,'kind'),false);assert.equal(Object.hasOwn(ctor,'name'),false);
        const bad=classNode(parse('class Counter {static constructor(){this.value=3}}',selected));
        assert.equal(Object.getOwnPropertyDescriptor(bad.ctor,'isStatic').value,true);
        assert.ok(bad.unsupported.some(reason=>/static.*constructor/i.test(reason)),'unsupported static constructor cannot silently become an instance');
    }
    accept('class Counter {constructor(public n:any){}get value(){return this.n}}let counter=new Counter(3);function read(){return __bwBinaryAdd(counter.value,1)}read();');
});

test('genuine no-else parser branches and independent block bindings retain the complete raw EOF declaration frontier',()=>{
    const ast=parse('let gate=true;if(gate){let array=[1]}if(gate){let array=[2]}'+suffix),branches=ast.body.filter(node=>node.type==='If');
    assert.equal(branches.length,2);for(const branch of branches){assert.equal(Object.hasOwn(branch,'alternate'),true);assert.equal(branch.alternate,null);}
    const read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options);
    assert.notStrictEqual(graph.bindingOf(branches[0].consequent[0],'array'),graph.bindingOf(branches[1].consequent[0],'array'));
    assert.equal(graph.isInitializedAt(read),false);assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true);
    const eof=parse(header+';class Counter {value=3}function start(){counter=new Counter();read()}function read(){return __bwBinaryAdd(counter.value,1)}let counter:any;start();');
    const receiver=walk(eof).find(node=>node.type==='Member'&&node.object?.name==='counter').object;
    const whole=analyseSourceValueProducers(eof,options);assert.equal(whole.isInitializedAt(receiver),false);
    assert.equal(whole.isCapturedLexicalDeclarationReadyAt(receiver),true,'raw canonical helper keeps its own null-else bodies in this independent graph');
});

test('no-else and two-arm flow joins cannot borrow an early or branch-only declaration frontier',()=>{
    readiness('let gate=true;if(gate){let inside:any}'+suffix,true);
    readiness('let gate=true;if(gate){let value:any}else{let value:any}let callback=function(){return value};',false);
    readiness('let gate=true;function read(){return value}if(gate){read()}let value:any;read();let callback=function(){return value};',true);
    const early=parse('let gate=true;function read(){return value}if(gate){read()}let value:any;read();'),read=early.body.find(node=>node.type==='FunctionDeclaration').body[0].value;
    assert.equal(analyseSourceValueProducers(early,options).isCapturedLexicalDeclarationReadyAt(read),false,'late entry does not hide an early conditional entry');
    readiness('function outer(flag){if(flag){return 0}let value:any;let callback=function(){return value};return callback}outer(true);outer(false);',true);
    readiness('function outer(flag){let value:any;if(flag){return 0}else{return 1}let callback=function(){return value};return callback}outer(true);outer(false);',false);
    readiness('function outer(flag){if(flag){throw 0}let value:any;let callback=function(){return value};return callback}outer(false);',true);
});

test('missing undefined inherited accessor and sparse alternate shapes refuse at the direct frontier boundary without getters',()=>{
    for(const mode of ['missing','undefined','non-array','own getter','sparse','inherited index']){
        const ast=parse('if(true){}'+suffix),read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options),branch=ast.body[0];
        assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true);let gets=0;
        if(mode==='missing')delete branch.alternate;
        else if(mode==='undefined')branch.alternate=undefined;
        else if(mode==='non-array')branch.alternate={};
        else if(mode==='own getter')Object.defineProperty(branch,'alternate',{get(){gets++;throw new Error('alternate getter must not execute');},configurable:true});
        else if(mode==='sparse'){branch.alternate=[];branch.alternate.length=1;}
        else {const inherited=Object.create(Array.prototype);Object.defineProperty(inherited,'0',{get(){gets++;throw new Error('inherited statement must not execute');}});branch.alternate=[];branch.alternate.length=1;Object.setPrototypeOf(branch.alternate,inherited);}
        // The genuine graph was built before the invalid input. Only this
        // theorem runs on the malformed source; no generic-graph safety claim.
        const direct=lexicalDeclarationReadiness(ast).analyse(graph);assert.equal(direct.isCapturedReadyAt(read),false);assert.equal(gets,0,mode);
    }
    const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty;
    for(const getter of [false,true]){
        const ast=parse('if(true){}'+suffix),read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options),branch=ast.body[0],saved=descriptor(branch,'alternate'),old=descriptor(Object.prototype,'alternate');
        let result,failure,gets=0;
        try{delete branch.alternate;define(Object.prototype,'alternate',getter?{configurable:true,get(){gets++;throw new Error('inherited alternate');}}:{value:null,configurable:true});
            result=lexicalDeclarationReadiness(ast).analyse(graph).isCapturedReadyAt(read);
        }catch(error){failure=error;}finally{if(old)define(Object.prototype,'alternate',old);else delete Object.prototype.alternate;define(branch,'alternate',saved);}
        assert.equal(failure,undefined);assert.equal(result,false);assert.equal(gets,0);
    }
});

test('actual method constructor getter and setter ownership admits receiver syntax without an initialized receiver certificate',()=>{
    const source='class Counter {constructor(public n:any){}get value(){return this.n}set value(v:any){this.n=v}sample(){return this.n}}';
    readiness(source+';'+suffix,true);
    for(const expression of ['counter.value','counter.sample()']){
        const {ast}=accept(source+'let counter=new Counter(3);function read(){return __bwBinaryAdd('+expression+',1)}counter.value=4;read();');
        const read=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='read'),operand=read.body[0].value.args[0];
        const receiver=operand.type==='Member'?operand.object:operand.callee.object;
        assert.equal(receiver.name,'counter');assert.equal(analyseSourceValueProducers(ast,options).isInitializedAt(receiver),false);
    }
});

test('global static field nested and moved function this cannot acquire instance-method role',()=>{
    for(const source of [
        'let other=this;',
        'function outer(){return this.value}',
        'class Counter {static sample(){return this.value}}',
        'class Counter {value=this.other}',
        'class Counter {sample(){function nested(){return this.value}return nested()}}',
        'class Counter {sample(){let nested=()=>this.value;return nested()}}'
    ])readiness(source+';'+suffix,false);
    for(const slot of ['ctor','method']){
        const ast=parse('class Counter {constructor(){}sample(){return 1}}function moved(){return this.value};'+suffix),read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options);
        const moved=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='moved'),cls=classNode(ast);
        ast.body.splice(ast.body.indexOf(moved),1);
        if(slot==='ctor'){moved.isStatic=false;cls.ctor=moved;}else{moved.kind='method';moved.isStatic=false;cls.methods.push(moved);}
        assert.equal(lexicalDeclarationReadiness(ast).analyse(graph).isCapturedReadyAt(read),false,'ordinary function tag survives movement into '+slot);
    }
    for(const source of ['let other=this;','function ordinary(){return this.value}']){
        const ast=parse(source+';'+suffix);ast.instanceThis=true;ast.owner={instanceThis:true};
        const ordinary=ast.body.find(node=>node.type==='FunctionDeclaration');
        if(ordinary){ordinary.instanceThis=true;ordinary.owner={instanceThis:true};}
        const read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options);
        assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),false,'supplied Program/function owner flags are not private method membership');
    }
    for(const role of [undefined,true,'false']){
        const ast=parse('class Counter {constructor(){this.n=3}};'+suffix),read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options);classNode(ast).ctor.isStatic=role;
        assert.equal(lexicalDeclarationReadiness(ast).analyse(graph).isCapturedReadyAt(read),false);
    }
    const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty;
    for(const inheritedGetter of [false,true]){
        const ast=parse('class Counter {constructor(){this.n=3}};'+suffix),read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options),ctor=classNode(ast).ctor;
        assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true);
        const saved=descriptor(ctor,'isStatic'),old=descriptor(Object.prototype,'isStatic');let gets=0,result,failure;
        try{delete ctor.isStatic;define(Object.prototype,'isStatic',inheritedGetter?{configurable:true,get(){gets++;throw new Error('inherited constructor role');}}:{value:false,configurable:true});
            result=lexicalDeclarationReadiness(ast).analyse(graph).isCapturedReadyAt(read);
        }catch(error){failure=error;}finally{if(old)define(Object.prototype,'isStatic',old);else delete Object.prototype.isStatic;define(ctor,'isStatic',saved);}
        assert.equal(failure,undefined);assert.equal(result,false);assert.equal(gets,0,'missing own role cannot borrow inherited false');
    }
});

test('method seeds remain empty and constructor reentry early virtual fields unknown entries and effects stay separate',()=>{
    const ast=parse('class Counter {sample(){return value}}let value:any;value=3;let counter=new Counter();counter.sample();');
    const read=classNode(ast).methods[0].body[0].value,graph=analyseSourceValueProducers(ast,options);
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),false,'method syntax does not invent caller declaration seeds');
    refuse('class Counter {value=3;constructor(){read()}}function read(){return __bwBinaryAdd(counter.value,1)}let counter=new Counter();read();');
    refuse('class Counter {value=3;trigger(){return read()}}function read(){return __bwBinaryAdd(counter.value,1)}let counter=new Counter();counter.trigger();');
    refuse('class Base {constructor(){this.sample()}sample(){return 1}}class Counter extends Base {value:any={};sample(){return this.value}}let counter=new Counter();function read(){return __bwBinaryAdd(counter.sample(),1)}read();');
    for(const effect of ['counter.value={};','foreign(counter);','let method=counter.sample;method();','foreign(function(v:any){counter.value=v});']){
        refuse('class Counter {value=3;sample(){return this.value}}let counter=new Counter();'+effect+'function read(){return __bwBinaryAdd(counter.value,1)}read();');
    }
});

test('nested Class fields mask the outer method context while inner methods receive their own actual ownership',()=>{
    readiness('class Outer {make(){class Inner {value=3};return 1}};'+suffix,true);
    readiness('class Outer {make(){class Inner {value=this.tag};return 1}};'+suffix,false);
    readiness('class Outer {make(){class Inner {value=3;get read(){return this.value}};return 1}};'+suffix,true);
    readiness('class Outer {make(){class Inner {value=3;get read(){function nested(){return this.value}return nested()}};return 1}};'+suffix,false);
});

test('private Boolean and primitive union carriers use actual Boolean values and remain result-only facts',()=>{
    const declaration='class Counter {constructor(public n:any){}get value(){return this.n}}';
    for(const initial of ['true','null','undefined','3']){
        const source=declaration+'let counter=new Counter('+initial+');function read(){return __bwBinaryAdd(counter.value,1)}read();';
        const {ast}=accept(source),view=nativeClassScalarView(parse(declaration+'let counter=new Counter('+initial+');let observed=counter.value;'),profile);
        const result=walk(view.program).find(node=>node.type==='Conditional'&&node.test?.type==='Member'&&node.test.object?.name==='counter');assert.ok(result);
        assert.equal(view.hasNormalPrimitiveResult(result),true);assert.equal(view.hasNormalPrimitiveResult({...result}),false);
        for(const node of walk(view.program).filter(node=>node.type==='Boolean'))assert.equal(typeof node.value,'boolean');
        const types=analyseSourceValueProducers(view.program,options).typesAt(result);
        if(initial==='true'){assert.ok(types.has('Boolean'));assert.equal(types.has('Number'),false);}
        const receiver=walk(ast).find(node=>node.type==='Member'&&node.object?.name==='counter').object;
        assert.equal(analyseSourceValueProducers(ast,options).isInitializedAt(receiver),false);
    }
    accept(declaration+'let counter=new Counter(3);counter.n="text";counter.n=true;counter.n=null;function read(){return __bwBinaryAdd(counter.value,1)}read();');
    refuse(declaration+'let counter=new Counter(3);counter.n=[1];function read(){return __bwBinaryAdd(counter.value,1)}read();');
});

test('failed method roles cannot fall through into inherited callable metadata getters and no-this legacy records remain usable',()=>{
    const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty;
    for(const slot of ['body','params','parameterDefaults']){
        const ast=parse('class Counter {constructor(){}sample(){return this.value}};'+suffix),read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options),method=classNode(ast).methods[0];
        assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true);
        const object=slot==='parameterDefaults'?ast.body.find(node=>node.type==='Declaration'&&node.decls.some(decl=>decl.name==='callback')).decls[0].init:method;
        const saved=descriptor(object,slot),old=descriptor(Object.prototype,slot);let gets=0,result,failure;
        try{delete object[slot];define(Object.prototype,slot,{configurable:true,get(){gets++;throw new Error('inherited callable '+slot);}});
            result=lexicalDeclarationReadiness(ast).analyse(graph).isCapturedReadyAt(read);
        }catch(error){failure=error;}finally{if(old)define(Object.prototype,slot,old);else delete Object.prototype[slot];if(saved)define(object,slot,saved);else delete object[slot];}
        assert.equal(failure,undefined);assert.equal(result,false);assert.equal(gets,0,'direct frontier, not generic graph construction');
    }
    const legacy=parse('class Counter {constructor(){}};'+suffix),read=callbackRead(legacy);delete classNode(legacy).ctor.isStatic;
    assert.equal(analyseSourceValueProducers(legacy,options).isCapturedLexicalDeclarationReadyAt(read),true,'own empty params/body remain legacy syntax without granting this role');
});

test('physical alternate and method role changes revoke held readiness and retain original reflection errors',()=>{
    for(const mode of ['alternate','role']){
        const out=readiness('class Counter {constructor(){this.value=3}}if(true){}'+suffix,true);let restore;
        if(mode==='alternate'){const branch=out.ast.body.find(node=>node.type==='If'),saved=branch.alternate;branch.alternate=undefined;restore=()=>{branch.alternate=saved;};}
        else {const ctor=classNode(out.ast).ctor,saved=ctor.isStatic;ctor.isStatic=true;restore=()=>{ctor.isStatic=saved;};}
        assert.equal(out.graph.lexicalDeclarationReadinessCurrent(),false);restore();
        assert.equal(out.graph.isCapturedLexicalDeclarationReadyAt(out.read),false,'observed source ABA cannot revive '+mode);
        const fresh=analyseSourceValueProducers(out.ast,options);assert.equal(fresh.isCapturedLexicalDeclarationReadyAt(out.read),true);
    }
    const ast=parse('if(true){}'+suffix),callable=ast.body.find(node=>node.type==='Declaration'&&node.decls.some(decl=>decl.name==='callback')).decls[0].init;
    const original=callable.body[0].value,failure=new Error('frontier source reflection failed');let armed=false,reads=0;
    callable.body[0].value=new Proxy(original,{getOwnPropertyDescriptor(target,key){reads++;if(armed)throw failure;return Reflect.getOwnPropertyDescriptor(target,key);}});
    const read=callbackRead(ast),graph=analyseSourceValueProducers(ast,options);assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true);armed=true;
    try{assert.throws(()=>graph.lexicalDeclarationReadinessCurrent(),error=>error===failure);}finally{armed=false;}
    const count=reads;assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),false);assert.equal(graph.lexicalDeclarationReadinessCurrent(),false);assert.equal(reads,count,'revoked frontier performs no new source reflection');

    const analysisAst=parse('class Counter {constructor(){this.value=3}};'+suffix),cls=classNode(analysisAst);
    const analysisFailure=new Error('frontier record analysis reflection failed');let analysisArmed=false,parameterReads=0,analysisReads=0,boundaryStack='';
    cls.ctor=new Proxy(cls.ctor,{getOwnPropertyDescriptor(target,key){
        analysisReads++;
        if(analysisArmed&&key==='params'&&++parameterReads===2){boundaryStack=new Error('analysis boundary observation').stack;throw analysisFailure;}
        return Reflect.getOwnPropertyDescriptor(target,key);
    }});
    const analysisRead=callbackRead(analysisAst),actualGraph=analyseSourceValueProducers(analysisAst,options);
    assert.equal(actualGraph.isCapturedLexicalDeclarationReadyAt(analysisRead),true,'genuine Proxy source and graph are prepared while unarmed');
    const direct=lexicalDeclarationReadiness(analysisAst);assert.equal(direct.current(),true);
    // Exactly one params descriptor belongs to the initial physical current
    // snapshot. The second is record's own-data required(params) read, after
    // that snapshot returned true; this must exercise analyse's error latch.
    parameterReads=0;analysisArmed=true;
    try{assert.throws(()=>direct.analyse(actualGraph),error=>error===analysisFailure);}
    finally{analysisArmed=false;}
    assert.equal(parameterReads,2,'one snapshot params read precedes the actual record read');
    assert.match(boundaryStack,/\bat required\b/);assert.match(boundaryStack,/\bat record\b/);
    assert.doesNotMatch(boundaryStack,/\bat encode\b/,'failure occurs after the physical snapshot, not inside it');
    const afterAnalysisFailure=analysisReads;assert.equal(direct.current(),false);
    assert.equal(direct.analyse(actualGraph).isCapturedReadyAt(analysisRead),false);
    assert.equal(analysisReads,afterAnalysisFailure,'analysis-error revocation cannot reenter source reflection');
});
