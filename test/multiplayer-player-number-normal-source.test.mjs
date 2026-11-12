import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {multiplayerPlayerNumberNormalSource,MULTIPLAYER_PLAYER_NUMBER_SOURCE_SHA256} from '../overlay/scratch-gui/src/lib/bw-makecode/multiplayer-player-number-normal-source.js';
const parse=source=>parseMakeCodeTs(source,GENERATED_HELPER_PROFILES.ordinary);
const walk=(value,out=[])=>{
    if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const n of value)walk(n,out);return out;}
    out.push(value);for(const [key,child]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters','calls'].includes(key))walk(child,out);return out;
};
// Unchanged authored portable-graphs fixture. This file inspects source only;
// the original acceptance test retains its SDK/VM/Code/SB3 assertions.
const source='let observed="";let count=0;let ready=false;let beforeNull=-1;let beforeUndefined=-1;let afterNumber=-1;function describe(player){return console.inspect("Player "+mp.getPlayerProperty(player,mp.PlayerProperty.Number))}mp.onControllerEvent(ControllerEvent.Connected,function(renamed){let pending=null;beforeNull=mp.getPlayerProperty(pending,mp.PlayerProperty.Number);pending=undefined;beforeUndefined=mp.getPlayerProperty(pending,mp.PlayerProperty.Number);pending=renamed;afterNumber=mp.getPlayerProperty(pending,mp.PlayerProperty.Number);observed=describe(pending);count+=1});controller.player2.connected=true;game.onUpdate(function(){ready=count===1})';
const inspect=text=>{const program=parse(text),calls=walk(program).filter(n=>n.type==='Call'&&n.callee?.name==='getPlayerProperty');return {program,calls,proof:multiplayerPlayerNumberNormalSource(program)};};
const bad=text=>{const {calls,proof}=inspect(text);assert.ok(calls.length);for(const call of calls)assert.equal(proof.has(call),false,text);};

test('actual Player event, nullable local writers and describe helper produce only Number call receipts',()=>{
    const {program,calls,proof}=inspect(source),before=JSON.stringify(program);assert.equal(calls.length,4);
    for(const call of calls)assert.equal(proof.has(call),true);
    assert.equal(JSON.stringify(program),before);assert.deepEqual(Object.keys(proof).sort(),['current','has']);
    for(const node of walk(program))if(!calls.includes(node))assert.equal(proof.has(node),false);
    assert.equal(proof.has({...calls[0]}),false);
});

test('registration renaming and null/undefined normal returns do not invent Player values',()=>{
    for(const text of [source.replaceAll('renamed','actualEventParameter'),source.replace('ControllerEvent.Connected','ControllerEvent.Disconnected'),
        source.replace('pending=renamed','pending=renamed as any'),
        'mp.onControllerEvent(ControllerEvent.Connected,function(player){});let a=mp.getPlayerProperty(null,mp.PlayerProperty.Number);let b=mp.getPlayerProperty(undefined,mp.PlayerProperty.Number)']){
        const {calls,proof}=inspect(text);for(const call of calls)assert.equal(proof.has(call),true,text);
    }
});

test('actual generated callback aliases, ordinary comparison bodies and inspection limit remain source-proved',()=>{
    // Retained actual emitter source. These ordinary bodies are examined with
    // every caller; their names carry no role or eligibility authority.
    const emitted=`function __bwCompareLess(left:any,right:any):boolean{return left<right}
function __bwBinaryAdd(left:any,right:any):any{return left+right}
function __bwCompareStrictEqual(left:any,right:any):boolean{return left===right}
function Game_describe(player:mp.Player):string{return console.inspect(__bwBinaryAdd("Player ",mp.getPlayerProperty(player,mp.PlayerProperty.Number)),(0+20))}
let observed:string
let count:number
let ready:boolean
let beforeNull=0
let beforeUndefined=0
let afterNumber=0
observed=""
count=(0+0)
ready=__bwCompareLess(1,0)
beforeNull=(0+-1)
beforeUndefined=(0+-1)
afterNumber=(0+-1)
mp.onControllerEvent(ControllerEvent.Connected,function(actualEvent:mp.Player){
 let renamed:mp.Player=null
 let pending:mp.Player=null
 renamed=actualEvent
 pending=null
 beforeNull=mp.getPlayerProperty(pending,mp.PlayerProperty.Number)
 pending=undefined
 beforeUndefined=mp.getPlayerProperty(pending,mp.PlayerProperty.Number)
 pending=renamed
 afterNumber=mp.getPlayerProperty(pending,mp.PlayerProperty.Number)
 observed=Game_describe(pending)
 count=__bwBinaryAdd(count,(0+1))
})
controller.player2.connected=(__bwCompareLess(0,1) as any)
game.onUpdate(function(){ready=__bwCompareStrictEqual(count,(0+1))})`;
    for(const text of [emitted,emitted.replaceAll('__bwCompareLess','ordinaryLess').replaceAll('__bwBinaryAdd','ordinaryAddition')]){
        const {calls,proof}=inspect(text);assert.equal(calls.length,4);for(const call of calls)assert.equal(proof.has(call),true);
    }
    for(const text of [emitted.replace('controller.player2.connected=(__bwCompareLess(0,1) as any)','controller.player2.connected=1'),
        emitted.replace('(0+20))','("opaque limit"))'),
        emitted+';Game_describe("foreign receiver");'])bad(text);
});

test('namespace selector callee writer and opaque helper callers remain explicit refusals',()=>{
    for(const prefix of ['mp.getPlayerProperty=unknown;','mp.onControllerEvent=unknown;','mp.PlayerProperty.Number=7;',
        'ControllerEvent.Connected=7;','let escaped=mp;','let fn=mp.getPlayerProperty;',
        'let properties=mp.PlayerProperty;','Object.defineProperty(mp,"getPlayerProperty",unknown);',
        'unknown();','let mp=0;'])bad(prefix+source);
    for(const text of [source.replace('mp.PlayerProperty.Number','mp.PlayerProperty.Index'),
        source.replace('mp.PlayerProperty.Number','2'),source.replace('ControllerEvent.Connected','1'),
        source.replace('pending=renamed','pending=7'),
        source.replace('pending=renamed','renamed._index="bad";pending=renamed'),
        source.replace('pending=renamed','let key="_index";renamed[key]="bad";pending=renamed'),
        source.replace('pending=renamed','renamed.getProperty=()=>3;pending=renamed'),
        source+';describe(image.create(1,1));',source+';describe("not a Player");',
        source.replace('player){return console.inspect','player:number){return console.inspect'),
        source.replace('controller.player2.connected=true','controller.player2.connected=unknown()'),
        source+';game.pushScene();'])bad(text);
});

test('Player escapes unknown coercions and annotation-only receivers cannot enroll',()=>{
    for(const text of [
        'let leaked:any=null;'+source.replace('pending=renamed','leaked=renamed;pending=renamed'),
        source.replace('pending=renamed','foreign(renamed);pending=renamed'),
        source.replace('pending=renamed','game.onUpdate(function(){mp.getPlayerProperty(renamed,mp.PlayerProperty.Number)});pending=renamed'),
        source.replace('observed=describe(pending)','observed=console.inspect(pending)'),
        source.replace('observed=describe(pending)','observed=console.inspect("Player "+pending)'),
        'let alleged:mp.Player="text";mp.onControllerEvent(ControllerEvent.Connected,function(player){});let n=mp.getPlayerProperty(alleged,mp.PlayerProperty.Number)'
    ])bad(text);
});

test('defaults hidden fields malformed registrations and symbolic badges do not grant',()=>{
    bad(source.replace('function describe(player)','function describe(player=unknown())'));
    for(const edit of [p=>{walk(p).find(n=>n.type==='FunctionDeclaration').params.restParam='players';},
        p=>{const call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='onControllerEvent');call.optional=true;},
        p=>{const call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='getPlayerProperty');call.typeArguments=[];},
        p=>{const fn=walk(p).find(n=>n.type==='FunctionExpression'&&n.params.length===1);fn.parameterDefaults={hidden:'effect'};},
        p=>{const st=p.body[0];Object.defineProperty(st,'hidden',{value:{type:'Call',callee:{type:'Identifier',name:'unknown'},args:[]},enumerable:false});}]){
        const {program,calls}=inspect(source);edit(program);const proof=multiplayerPlayerNumberNormalSource(program);for(const call of calls)assert.equal(proof.has(call),false);
    }
    const {program,calls}=inspect(source.replace('pending=renamed','pending=7'));program.PlayerNumber=true;calls[0].provedPlayerNumber=true;
    assert.equal(multiplayerPlayerNumberNormalSource(program).has(calls[0]),false);
});

test('non-data and inherited executable fields cannot run getters',()=>{
    let reads=0;const {program,calls}=inspect(source),parent=Object.create(Object.prototype);
    Object.defineProperty(parent,'optional',{get(){reads++;return false;}});Object.setPrototypeOf(calls[0],parent);
    assert.equal(multiplayerPlayerNumberNormalSource(program).has(calls[0]),false);assert.equal(reads,0);
    const fake={type:'Program'};Object.defineProperty(fake,'body',{get(){reads++;return [];}});
    assert.equal(multiplayerPlayerNumberNormalSource(fake).has({}),false);assert.equal(reads,0);
});

test('snapshot mutation source ABA and observation exceptions permanently revoke old graph facts',()=>{
    const first=inspect(source);assert.equal(first.proof.has(first.calls[0]),true);
    const selector=first.calls[0].args[1],name=selector.name;selector.name='Index';assert.equal(first.proof.current(),false);
    selector.name=name;assert.equal(first.proof.current(),false);assert.equal(first.proof.has(first.calls[0]),false);
    const second=inspect(source),body=second.program.body;
    second.program.body=new Proxy(body,{getPrototypeOf(){throw new Error('source observation');}});
    assert.equal(second.proof.current(),false);second.program.body=body;assert.equal(second.proof.current(),false);
});

test('captured realm guard cannot certify itself through changed every or iterator methods',()=>{
    const first=inspect(source);assert.equal(first.proof.has(first.calls[0]),true);const every=Array.prototype.every;let changed;
    try{Array.prototype.every=()=>true;changed=first.proof.current();}finally{Array.prototype.every=every;}
    assert.equal(changed,false);assert.equal(first.proof.current(),false);
    const second=inspect(source),parent=Object.getPrototypeOf([][Symbol.iterator]()),next=Object.getOwnPropertyDescriptor(parent,'next');
    try{Object.defineProperty(parent,'next',{...next,value:function(){throw new Error('unexpected iterator');}});changed=second.proof.current();}
    finally{Object.defineProperty(parent,'next',next);}
    assert.equal(changed,false);assert.equal(second.proof.current(),false);
    const third=inspect(source),has=WeakSet.prototype.has;let invoked=0;
    try{WeakSet.prototype.has=()=>{invoked++;return true;};changed=third.proof.has(third.calls[0]);}
    finally{WeakSet.prototype.has=has;}
    assert.equal(invoked,0);assert.equal(changed,false);assert.equal(third.proof.current(),false);
});

test('reviewed original multiplayer implementation identity is data only',()=>{
    assert.equal(MULTIPLAYER_PLAYER_NUMBER_SOURCE_SHA256,'03de34ae9da35c2a387bb5a5ce8be08117614e8d8f1d1a40c941d2afcb5136e0');
});
