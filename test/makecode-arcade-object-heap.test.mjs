import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import crypto from 'node:crypto';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';

const spec=name=>({name,fields:[{name:'value',type:'number',readonly:false},{name:'next',type:'any',readonly:false},{name:'label',type:'string',readonly:true}],initializer:'',constructor:'',parameters:[],methods:[]});
test('objects retain live cross-class identity, aliases, undefined fields, cycles and declaration metadata',()=>{
    const runtime=new EventEmitter(),heap=createHeap(runtime,BW);
    heap.register(spec('First'));heap.register(spec('Second'));
    const a=heap.allocate('First'),b=heap.allocate('Second');
    assert.equal(BW.compare(a.ref,'===',b.ref),false);
    assert.equal(BW.decode(heap.get(a.ref,'value')),undefined);
    heap.set(a.ref,'label','first',a.token);heap.set(a.ref,'next',a.ref);
    heap.set(a.ref,'value',7);heap.finish(a.ref,a.token);heap.finish(b.ref,b.token);
    const cloned=BW.decode(JSON.parse(JSON.stringify(a.ref)));
    assert.equal(BW.compare(cloned,'===',a.ref),true);heap.set(cloned,'value',9);
    assert.equal(heap.get(a.ref,'value'),9);assert.equal(BW.equal(heap.get(a.ref,'next'),a.ref),true);
    const array=BW.arrayReference(runtime,[a.ref,b.ref,a.ref]);assert.equal(BW.equal(BW.arrayValue(runtime,array)[2],a.ref),true);
    assert.throws(()=>heap.finish(a.ref,a.token),/no longer owns/);heap.set(a.ref,'label','changed');assert.equal(heap.get(a.ref,'label'),'changed','readonly is a static declaration check');
    assert.throws(()=>heap.set(a.ref,'missing',7),/Unknown class field/);
    assert.throws(()=>heap.set(a.ref,'next',{}),/registered reference/);
    const forged=BW.reference(runtime,'object','not allocated');assert.throws(()=>heap.get(forged,'value'),/Unknown or stale/);
    const otherRuntime=new EventEmitter(),otherHeap=createHeap(otherRuntime,BW);assert.throws(()=>otherHeap.get(a.ref,'value'),/Unknown or stale/);
    runtime.emit('PROJECT_START');assert.throws(()=>heap.get(a.ref,'value'),/Unknown or stale/);
    heap.register(spec('First'));const fresh=heap.allocate('First');assert.notEqual(fresh.ref.bwReference.id,a.ref.bwReference.id);
    heap.dispose();assert.throws(()=>heap.get(fresh.ref,'value'),/disposed/);otherHeap.dispose();
});

test('source class admission keeps readonly, inheritance, accessors and captured callbacks explicit',()=>{
    for(const [source,pattern]of [
        ['class A { constructor(public readonly n:number){} } let a=new A(1);a.n=2;',/Readonly class field/],
        ['class A extends Sprite {}',/unsupported/],
        ['class A {get n(){return 1}}',/accessors/],
        ['class A {callback=()=>1;}',/captured callbacks/]
    ])assert.match(arcadeToPseudocode(source).unsupported.join('\n'),pattern,source);
});

const source=`let trace="";
function argument(n:number){trace=trace+"a"+n;return n}
function field(){trace=trace+"f";return 3}
class First {
    missingNumber:number;missingBoolean:boolean;missingString:string;missingObject:First;next:First;
    value=field();
    constructor(public readonly label:string,n:number){trace=trace+"b";this.value=n;this.next=this}
    read(){return this.value}
    set(n:number){this.value=n;return this}
}
class Second {constructor(public value:number){}}
let a=new First("first",argument(7));let alias=a;let b=new Second(7);
let same=a===alias;let different=(a as any)===(b as any);let self=a.next===a;
let missingNumber=a.missingNumber;let missingBoolean=a.missingBoolean;let missingString=a.missingString;
let missingObject=a.missingObject===undefined;
let numericUndefined=a.missingNumber===undefined;numericUndefined=numericUndefined&&true;
let booleanUndefined=a.missingBoolean===undefined;booleanUndefined=booleanUndefined&&true;
let stringUndefined=a.missingString===undefined;stringUndefined=stringUndefined&&true;
let refs=[a,alias];let held=refs[1];let heldSame=held===a;
let returned=alias.set(11);let returnedSame=returned===a;let result=held.read();let label=a.label;
trace=trace+"";result+=0;
`;
test('actual constructor argument/field/body order and managed receivers match the original SDK',async()=>{
    const expected=await runPxtArcade(source,{fakeClock:true});
    for(const name of ['numericUndefined','booleanUndefined','stringUndefined','missingObject'])assert.equal(expected[name],true,'original '+name);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const run=await runProgram(imported.code,{frames:100,storage:true});
    try {
        assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
        const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
        for(const name of ['trace','same','different','self','heldSame','returnedSame','result','label','missingNumber','missingBoolean','missingString','missingObject','numericUndefined','booleanUndefined','stringUndefined'])
            assert.equal(BW.decode(vars[name]),expected[name],name);
        assert.ok(run.calls.get('arcade_createObject')===2);assert.ok(run.calls.get('arcade_callObjectMethod')===2);
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
        const original=await runPxtArcade(exported.files,{fakeClock:true});
        for(const name of ['trace','same','different','self','heldSame','returnedSame','result','label','missingNumber','missingBoolean','missingString','missingObject','numericUndefined','booleanUndefined','stringUndefined'])assert.equal(original[name]??original['Game_'+name],expected[name],name+' exported');
    }finally{run.vm.quit();clearStrayTimers();}
});

test('unchanged MIT TeamData fixed instances preserve field values and original whenUsed allocation reachability through Code and fresh SB3',async()=>{
    const dir=new URL('./fixtures/arcade-teamdata-source/',import.meta.url),library=fs.readFileSync(new URL('teamdata.ts',dir),'utf8');
    assert.equal(crypto.createHash('sha256').update(library).digest('hex'),'79d2141d20a88696bbd9e97c3bb0fe81fbc35e7663f00c79252cdec8048568ef');
    const main=`let home=league.kansasCityChiefs;let away=league.oaklandRaiders;let alias=home;let same=home===alias;let different=home===away;let homeName=home.name;let abbreviation=away.abbreviation;let one=home.colorOne;let two=away.colorTwo;one+=0;two+=0;`;
    const files={'teamdata.ts':library,'main.ts':main,'pxt.json':JSON.stringify({name:'teamdata-control',dependencies:{device:'*'},files:['teamdata.ts','main.ts']})};
    const expected=await runPxtArcade(files,{fakeClock:true}),runs=[];
    const check=run=>{assert.deepEqual(run.errors,[]);const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BW.decode(v.value)]));for(const name of ['same','different','homeName','abbreviation','one','two'])assert.equal(vars[name],expected[name],name);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:100,storage:true});runs.push(run);assert.deepEqual(run.creator.warnings,[]);check(run);assert.equal(run.calls.get('arcade_createObject'),2,'only the two original-used fixed instances are allocated');return run;};
    try {
        const imported=arcadeToPseudocode(files),run=await execute(imported);
        await execute({...imported,code:run.creator.decompile()});
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/readonly name: string/);
        const original=await runPxtArcade(exported.files,{fakeClock:true});for(const name of ['same','different','homeName','abbreviation','one','two'])assert.equal(original[name]??original['Game_'+name],expected[name],name+' original export');
        await execute(arcadeToPseudocode(exported.files));
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,100);check(fresh);
    }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

test('whenUsed initializer ordering ignores unused function bodies and reaches called constructor/method dependencies',async()=>{
    const authored=`let trace="";function mark(text:string){trace=trace+text;return text}
class Box {constructor(public text:string){} read(){return used.text}}
namespace library {
 //% whenUsed
 export const dead=new Box(mark("D"));
 //% whenUsed
 export const live=new Box(mark("L"));
}
//% whenUsed
const used=new Box(mark("U"));
function unused(){return library.dead}
let result=library.live.read();trace=trace+"";`;
    const expected=await runPxtArcade(authored,{fakeClock:true}),imported=arcadeToPseudocode(authored);
    assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const run=await runProgram(imported.code,{frames:100});
    try{assert.deepEqual(run.errors,[]);const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));assert.equal(vars.trace,expected.trace);assert.equal(vars.result,expected.result);assert.equal(run.calls.get('arcade_createObject'),2);}finally{run.vm.quit();clearStrayTimers();}
});

test('recursive constructors/methods, optional defaults and field updates bind each receiver and evaluate compound operands once',async()=>{
    const authored=`let trace="";let reads=0;
class Node {
 next:Node;value:number;
 constructor(n:number=2){this.value=n;if(n>0)this.next=new Node(n-1)}
 sum(n:number=2):number {if(n<=0)return this.value;return this.value+this.next.sum(n-1)}
}
let node=new Node();let alias=node;
function receiver(){reads++;trace=trace+"L";return alias}
function right(){trace=trace+"R";return 3}
receiver().value+=right();let old=receiver().value++;let pre=++receiver().value;
let result=node.sum();let same=node===alias;trace=trace+"";result+=0;`;
    const expected=await runPxtArcade(authored,{fakeClock:true}),runs=[];
    const check=run=>{assert.deepEqual(run.errors,[]);const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BW.decode(v.value)]));for(const name of ['trace','reads','old','pre','result','same'])assert.equal(vars[name],expected[name],name);};
    try{const imported=arcadeToPseudocode(authored);assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:120});runs.push(run);assert.deepEqual(run.creator.warnings,[]);check(run);const code=await runProgram(run.creator.decompile(),{frames:120});runs.push(code);check(code);const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files,{fakeClock:true});for(const name of ['trace','reads','old','pre','result','same'])assert.equal(original[name]??original['Game_'+name],expected[name],name+' export');const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);const again=await runProgram(reimported.code,{frames:120});runs.push(again);check(again);}finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

test('yielding construction retains allocation ownership and stop/restart never invokes a stale constructor continuation',async()=>{
    const authored=`let started=0;let bodies=0;
function initialize(){started++;pause(40);return 3}
class Delayed {value=initialize();constructor(public readonly name:string){bodies++;this.value=7}}
let result=new Delayed("ready");let value=result.value;let label=result.name;let elapsed=control.millis();elapsed+=0;`;
    const expected=await runPxtArcade(authored,{fakeClock:true});assert.equal(expected.started,1);assert.equal(expected.bodies,1);assert.equal(expected.elapsed,40);
    const imported=arcadeToPseudocode(authored);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:0});let now=0;
    const runtime=run.vm.runtime;runtime.updateCurrentMSecs=()=>{runtime.currentMSecs=now;};runtime.bwArcadeProgramClock={now:()=>now};runtime.currentMSecs=now;run.vm.greenFlag();
    const vars=()=>Object.fromEntries(runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));
    try {
        await stepFrames(run.vm,2);assert.equal(vars().started,1);assert.equal(vars().bodies,0);
        run.vm.stopAll();now=40;await stepFrames(run.vm,3);assert.equal(vars().bodies,0);assert.equal(runtime.threads.length,0);assert.deepEqual(run.errors,[]);
        run.vm.greenFlag();await stepFrames(run.vm,2);assert.equal(vars().started,1);assert.equal(vars().bodies,0);
        now=80;await stepFrames(run.vm,4);assert.equal(vars().bodies,1);assert.equal(vars().value,7);assert.equal(vars().label,'ready');assert.equal(vars().elapsed,40);assert.deepEqual(run.errors,[]);
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files,{fakeClock:true});assert.equal(original.value??original.Game_value,expected.value);assert.equal(original.label??original.Game_label,expected.label);assert.equal(original.elapsed??original.Game_elapsed,40);
    }finally{run.vm.quit();clearStrayTimers();}
});

test('authored managed void procedure falls through once with its actual arguments and no sentinel reexecution',async()=>{
    const expected=await runPxtArcade('let count=0;function once(value:number){count+=value}once(7);let done=1;done+=0;count+=0;',{fakeClock:true});
    const code=`DEVICE ARCADE
SPRITE Game:
WHEN arcade source starts:
  set count to (0 + 0)
  set returned to (arcade call function "once %s" arguments (arcade function argument (0 + 7) rest "[]"))
  set done to (0 + 1)
DEFINE once (value):
  set count to (calculate value (count) op "+" with (arcade local value))
`;
    const run=await runProgram(code,{frames:30});
    try{assert.deepEqual(run.errors,[]);const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));assert.equal(vars.count,expected.count);assert.equal(vars.done,expected.done);assert.equal(vars.returned,undefined);assert.equal(run.calls.get('arcade_callFunction'),1);assert.equal(run.calls.get('arrays_valueBinary'),1);}finally{run.vm.quit();clearStrayTimers();}
});

test('class namespace types remain lexical through source export and readonly any-cast writes retain runtime semantics',async()=>{
    const authored=`namespace Library {export class Node {next:Node;constructor(public value:number){this.next=this}read(){return this.value}}export function make(){return new Node(9)}}let object=Library.make();let same=object.next===object;let result=object.read();result+=0;`;
    const expected=await runPxtArcade(authored,{fakeClock:true}),imported=arcadeToPseudocode(authored);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const run=await runProgram(imported.code,{frames:80});
    try{assert.deepEqual(run.errors,[]);const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));assert.equal(vars.same,expected.same);assert.equal(vars.result,expected.result);const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files,{fakeClock:true});assert.equal(original.result??original.Game_result,expected.result);assert.equal(original.same??original.Game_same,expected.same);}finally{run.vm.quit();clearStrayTimers();}
    const cast=`class Readonly {constructor(public readonly value:number){}}let object=new Readonly(1);(object as any).value=2;let observed=object.value;observed+=0;`;
    const original=await runPxtArcade(cast,{fakeClock:true});assert.equal(original.observed,2);
    assert.deepEqual(arcadeToPseudocode(cast).unsupported,[]);
    assert.match(arcadeToPseudocode('class A {constructor(){}}let constructorValue=A;').unsupported.join('\n'),/runtime value requires function references/);
});

test('selected original SDK restrictions on field this and effectful defaults remain diagnosed',async()=>{
    for(const [authored,pattern]of [
        ['class A {before=this.value;constructor(public value:number){}}let a=new A(7);',/this.*outside of a method/],
        ['function argument(){return 7}class A {constructor(public value:number=argument()){}}let a=new A();',/only numbers, null, true and false supported as default arguments/]
    ]) {
        await assert.rejects(runPxtArcade(authored,{fakeClock:true}),pattern);
        assert.match(arcadeToPseudocode(authored).unsupported.join('\n'),/selected Arcade SDK/);
    }
});

test('class fields retain sprite and image aliases and arrays containing cyclic object references across source and original export',async()=>{
    const authored=`class Carrier {next:Carrier;items:Carrier[];constructor(public sprite:Sprite,public art:Image){this.next=this;this.items=[this]}update(){this.art.setPixel(0,0,7);this.sprite.x=23;return this.items[0]}}
let art=image.create(2,2);let sprite=sprites.create(art,SpriteKind.Player);let object=new Carrier(sprite,art);let alias=object.update();let cycle=alias.next===object;let arraySame=object.items[0]===alias;let spriteSame=object.sprite===sprite;let imageSame=object.art===art;let pixel=art.getPixel(0,0);let position=sprite.x;pixel+=0;position+=0;`;
    const expected=await runPxtArcade(authored,{fakeClock:true}),imported=arcadeToPseudocode(authored);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const run=await runProgram(imported.code,{frames:100});
    try{assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));for(const name of ['cycle','arraySame','spriteSame','imageSame','pixel','position'])assert.equal(vars[name],expected[name],name);const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files,{fakeClock:true});for(const name of ['cycle','arraySame','spriteSame','imageSame','pixel','position'])assert.equal(original[name]??original['Game_'+name],expected[name],name+' export');}finally{run.vm.quit();clearStrayTimers();}
});

test('constructor argument expressions execute once left to right before fields and body',async()=>{
    const authored=`let trace="";function argument(n:number){trace=trace+n;return n}function initialize(){trace=trace+"f";return 3}
class Pair {value=initialize();constructor(public a:number,public b:number){trace=trace+"b"}}
let object=new Pair(argument(1),argument(2));let result=object.a*10+object.b;result+=0;trace=trace+"";`;
    const expected=await runPxtArcade(authored,{fakeClock:true});assert.equal(expected.trace,'12fb');
    const imported=arcadeToPseudocode(authored);assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:80});
    try{assert.deepEqual(run.errors,[]);const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));assert.equal(vars.trace,expected.trace);assert.equal(vars.result,expected.result);}finally{run.vm.quit();clearStrayTimers();}
});

test('pure constructors and methods finish at the original initial clock and same-VM SB3 reload rearms the heap',async()=>{
    const authored=`class Box { constructor(public value:number){} read(){return this.value} } let box=new Box(7);let result=box.read();let done=control.millis();result+=0;done+=0;`;
    const expected=await runPxtArcade(authored,{fakeClock:true});assert.equal(expected.done,0);
    const imported=arcadeToPseudocode(authored);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:0,storage:true});
    const vars=()=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));
    try {
        let now=0;const runtime=run.vm.runtime;runtime.bwArcadeProgramClock={now:()=>now};runtime.updateCurrentMSecs=()=>{runtime.currentMSecs=now;};
        run.vm.greenFlag();await stepFrames(run.vm,12);assert.equal(vars().result,expected.result);assert.equal(vars().done,0);assert.deepEqual(run.errors,[]);
        const old=vars().box,archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(archive);now=100;run.vm.greenFlag();await stepFrames(run.vm,12);
        assert.equal(vars().result,7);assert.equal(vars().done,0);assert.equal(BW.equal(vars().box,old),false,'reload constructs a fresh live instance');assert.deepEqual(run.errors,[]);
        await run.vm.loadProject(archive);now=200;run.vm.greenFlag();await stepFrames(run.vm,12);assert.equal(vars().result,7);assert.equal(vars().done,0);assert.deepEqual(run.errors,[]);
    }finally{run.vm.quit();clearStrayTimers();}
});
