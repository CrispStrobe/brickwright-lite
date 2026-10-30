import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {createOrdinaryParseIntegerNumberSource,PARSE_INTEGER_PXT_SOURCE_SHA256,PARSE_INTEGER_GENERATED_SOURCE_SHA256} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-parse-integer-number-source.js';
const parse=source=>parseMakeCodeTs(source,GENERATED_HELPER_PROFILES.ordinary);
const walk=(value,out=[])=>{
    if(!value||typeof value!=='object')return out;
    if(Array.isArray(value)){for(const child of value)walk(child,out);return out;}
    out.push(value);for(const [key,child]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters','calls'].includes(key))walk(child,out);
    return out;
};
const inspect=source=>{const program=parse(source),calls=walk(program).filter(n=>n.type==='Call'&&n.callee?.name==='parseInt');return {program,calls,proof:createOrdinaryParseIntegerNumberSource(program)};};
const refused=source=>{const {calls,proof}=inspect(source);assert.ok(calls.length);for(const call of calls)assert.equal(proof.isNumberCall(call),false,source);};

test('literal PXT parseInt calls supply only occurrence-local Number normal results including NaN',()=>{
    for(const text of ['parseInt("7")','parseInt("10",8)','parseInt("invalid")','parseInt("")',
        'parseInt("10",40)','parseInt("10",0)','parseInt("ff",+16)','parseInt("10",-2)',
        'parseInt(" -0x1F")','parseInt("12.9px")']){
        const {program,calls,proof}=inspect('let n='+text);assert.equal(calls.length,1);
        const before=JSON.stringify(program);assert.equal(proof.isNumberCall(calls[0]),true,text);
        assert.equal(JSON.stringify(program),before);assert.deepEqual(Object.keys(proof).sort(),['current','isNumberCall']);
        assert.equal(proof.isNumberCall({...calls[0]}),false);assert.equal(proof.isNumberCall(calls[0].args[0]),false);
    }
});

test('the complete core-values scalar/onUpdate source retains literal calls without runtime execution',()=>{
    const {calls,proof}=inspect('let total=0;let frames=0;game.onUpdate(function(){total+=game.eventContext().deltaTime;frames+=1});let n=parseInt("7")+parseInt("10",8)');
    assert.equal(calls.length,2);for(const call of calls)assert.equal(proof.isNumberCall(call),true);
    const local=inspect('function twice(n:number){return n+n}let n=twice(parseInt("7"));');assert.equal(local.proof.isNumberCall(local.calls[0]),true);
});

test('shadowing extraction replacement and all hidden source effects revoke global identity',()=>{
    for(const neighbor of ['let copy=parseInt;','parseInt=other;','parseInt.x=1;',
        'let helpers=0;','function helpers(){}','let NaN="text";',
        'String.prototype.charCodeAt=other;','unknown();','let foreign=unknown;',
        'function poison(){parseInt=other;}','let image=game.eventContext();',
        'game.eventContext=other;','let ctx=game.eventContext();',
        'namespace extra {export let hidden=1}','let a=[1];','let o={x:1};'])refused('let n=parseInt("7");'+neighbor);
    refused('function parseInt(s:string){return 1}let n=parseInt("7")');
    refused('function f(parseInt:any){return parseInt("7")}let n=parseInt("7")');
    refused('let n=parseInt("7");game.onUpdate(function(x){parseInt("7")})');
});

test('unknown inputs and malformed call envelopes cannot enroll a producer',()=>{
    for(const source of ['let s="7";let n=parseInt(s)','let n=parseInt(7)','let n=parseInt("7",1.5)',
        'let n=parseInt("7",8+0)','let n=parseInt("7",undefined)','let n=parseInt("7",8,0)',
        'let n=new parseInt("7")'])refused(source);
    for(const edit of [c=>{c.isNew=true;},c=>{c.constructorCall=true;},c=>{c.optional=true;},
        c=>{c.typeArguments=[];},c=>{c.args[0]={type:'Spread',argument:c.args[0]};},
        c=>{c.callee.optional=true;},c=>{c.callee={type:'Member',object:c.callee,name:'call'};}]){
        const {program,calls}=inspect('let n=parseInt("7")');edit(calls[0]);assert.equal(createOrdinaryParseIntegerNumberSource(program).isNumberCall(calls[0]),false);
    }
    const {program,calls}=inspect('let text="7";let n=parseInt(text)');
    program.parseIntegerNumbers=true;calls[0].provedNumber=true;
    assert.equal(createOrdinaryParseIntegerNumberSource(program).isNumberCall(calls[0]),false);
});

test('defaults rest hidden executable fields and inherited getters cannot bypass closure',()=>{
    refused('function poison(x:any=(parseInt=other)){};let n=parseInt("7")');
    for(const edit of [p=>{const fn=walk(p).find(n=>n.type==='FunctionDeclaration');fn.params.restParam='args';},
        p=>{const st=p.body[0];Object.defineProperty(st,'expr',{value:{type:'Call',callee:{type:'Identifier',name:'unknown'},args:[]},enumerable:false});}]){
        const {program,calls}=inspect('function f(){};let n=parseInt("7")');edit(program);assert.equal(createOrdinaryParseIntegerNumberSource(program).isNumberCall(calls[0]),false);
    }
    let reads=0;const {program,calls}=inspect('let n=parseInt("7")');
    const parent=Object.create(Object.prototype);Object.defineProperty(parent,'optional',{get(){reads++;return false;}});Object.setPrototypeOf(calls[0],parent);
    assert.equal(createOrdinaryParseIntegerNumberSource(program).isNumberCall(calls[0]),false);assert.equal(reads,0);
});

test('source ABA and throwing source observations permanently expire the receipt',()=>{
    const first=inspect('let n=parseInt("7")');assert.equal(first.proof.isNumberCall(first.calls[0]),true);
    const before=first.calls[0].args[0].value;first.calls[0].args[0].value='8';assert.equal(first.proof.current(),false);
    first.calls[0].args[0].value=before;assert.equal(first.proof.isNumberCall(first.calls[0]),false);
    const second=inspect('let n=parseInt("7")'),body=second.program.body;
    second.program.body=new Proxy(body,{getPrototypeOf(){throw new Error('source observation');}});
    assert.equal(second.proof.current(),false);second.program.body=body;assert.equal(second.proof.current(),false);
});

test('realm mutation cannot certify itself and restoration does not revive old facts',()=>{
    const {proof,calls}=inspect('let n=parseInt("7")');assert.equal(proof.isNumberCall(calls[0]),true);
    const old=Array.prototype.every;let changed,restored;
    try{Array.prototype.every=()=>true;changed=proof.current();}finally{Array.prototype.every=old;restored=proof.current();}
    assert.equal(changed,false);assert.equal(restored,false);assert.equal(proof.isNumberCall(calls[0]),false);
});

test('realm checks cover initial admission, global aliases and iterator prototype chains',()=>{
    const {program,calls}=inspect('let n=parseInt("7")'),every=Array.prototype.every;
    let underChange,admission;
    try{Array.prototype.every=()=>true;admission=createOrdinaryParseIntegerNumberSource(program);underChange=admission.isNumberCall(calls[0]);}
    finally{Array.prototype.every=every;}
    assert.equal(underChange,false);assert.equal(admission.current(),false);
    const alias=inspect('let n=parseInt("7")'),oldParseInt=globalThis.parseInt;let aliasChanged;
    try{globalThis.parseInt=()=>1;aliasChanged=alias.proof.current();}finally{globalThis.parseInt=oldParseInt;}
    assert.equal(aliasChanged,false);assert.equal(alias.proof.current(),false);
    const iterator=inspect('let n=parseInt("7")'),parent=Object.getPrototypeOf([][Symbol.iterator]()),next=Object.getOwnPropertyDescriptor(parent,'next');let iteratorChanged;
    try{Object.defineProperty(parent,'next',{...next,value:function(){throw new Error('unexpected iterator call');}});iteratorChanged=iterator.proof.current();}
    finally{Object.defineProperty(parent,'next',next);}
    assert.equal(iteratorChanged,false);assert.equal(iterator.proof.current(),false);
});

test('source identity constants bind data review without invoking PXT or generated helpers',()=>{
    assert.equal(PARSE_INTEGER_PXT_SOURCE_SHA256,'e597d3b39d371872ebc8b021b4c63633e36641a8b239797da5cfb507c37da1cb');
    assert.equal(PARSE_INTEGER_GENERATED_SOURCE_SHA256,'6ac018eaeba0cc699a681e111d1c94bb8aa0b3bcdd46eaab9fc4af51f51f8713');
});
