import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BW.decode(v.value)]));
async function qualify(source,expected){
 const original=await runPxtArcade(source,{fakeClock:true});for(const[name,value]of Object.entries(expected))assert.equal(original[name],value,'original '+name);
 const runs=[],check=run=>{assert.deepEqual(run.errors,[]);for(const name of Object.keys(expected))assert.equal(values(run)[name],expected[name],name);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:100,storage:true});runs.push(run);assert.deepEqual(run.creator.warnings,[]);check(run);return run;};
 try {
  const imported=arcadeToPseudocode(source),run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/extends/);
  const oracle=await runPxtArcade(exported.files,{fakeClock:true});for(const name of Object.keys(expected))assert.equal(oracle[name]??oracle['Game_'+name],expected[name],'originalexport '+name);
  await execute(arcadeToPseudocode(exported.files));
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,100);check(fresh);
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
}
test('selected PXT derived field/super order, parameter properties, aliases and virtual override retain all authoring routes',async()=>{
 await qualify(`let trace="";function mark(s:string){trace=trace+s;return 2}
class Base {base=mark("f");constructor(public p:number){trace=trace+"b";this.virtual()}virtual(){trace=trace+"B"}read(){return this.p+this.base}}
class Child extends Base {child=mark("g");constructor(public q:number){super(mark("s"));trace=trace+"c"}virtual(){trace=trace+(this.q===undefined?"U":"V")+(this.p===2?"P":"Z")}read(){return super.read()+this.child+this.q}}
let x=new Child(mark("x"));let result=x.read();let alias:Base=x;alias.virtual();let same=alias===x;trace=trace+"";result+=0;`,{trace:'xfgsfbVPcVP',result:8,same:true});
});
test('three-level initialization, super method nonvirtual target and virtual this calls retain the selected original order',async()=>{
 await qualify(`let trace="";function mark(s:string){trace=trace+s;return 1}
class A {a=mark("A");constructor(){trace=trace+"a"} virtual(){return 1} call(){return this.virtual()}}
class B extends A {b=mark("B");constructor(){super();trace=trace+"b"}virtual(){return super.virtual()+2}call(){return super.call()+4}}
class C extends B {c=mark("C");constructor(){super();trace=trace+"c"}}
let x=new C();let result=x.call();let ref:A=x;let same=ref===x;trace=trace+"";result+=0;`,{trace:'ABCABAabc',result:7,same:true});
});
test('implicit constructors forward arguments and lazily resolved namespace parent declarations do not allocate unused constants',async()=>{
 await qualify(`let trace="";function mark(s:string){trace=trace+s;return 7}
namespace app {export class Base {field=mark("f");constructor(public value:number){trace=trace+"b"}read(){return this.value}} export class Child extends Base {}
 //% whenUsed
 export const unused=new Child(mark("D"));}
let x=new app.Child(mark("a"));let result=x.read();let same=x===x;trace=trace+"";result+=0;`,{trace:'afb',result:7,same:true});
});
test('parent descriptors bind lazily and inherited mutable fields/methods keep object identity without eager allocation',()=>{
 const runtime=new EventEmitter(),heap=createHeap(runtime,BW),spec=(name,parent,fields,methods)=>({name,...(parent?{parent}:{}),fields,methods,initializer:'',constructor:'',parameters:[]});
 heap.register(spec('Child','Base',[{name:'b',type:'number',readonly:false}],[{name:'read',procedure:'Child_read %s',parameters:[],returnType:'number'}]));
 assert.throws(()=>heap.allocate('Child'),/Base is not declared/);
 heap.register(spec('Base',null,[{name:'a',type:'number',readonly:false}],[{name:'read',procedure:'Base_read %s',parameters:[],returnType:'number'}]));
 const a=heap.allocate('Child');heap.set(a.ref,'a',7);heap.set(a.ref,'b',9);heap.finish(a.ref,a.token);assert.equal(heap.get(a.ref,'a'),7);assert.equal(heap.method(a.ref,'read').procedure,'Child_read %s');
 heap.register(spec('Loop','Loop',[],[]));assert.throws(()=>heap.allocate('Loop'),/Cyclic/);heap.dispose();
});
test('selected SDK and native admission retain invalid super placement, duplicate fields, missing explicit constructor and intrinsic/generic boundaries',async()=>{
 for(const[source,pattern]of [
 ['class A {constructor(){}}class B extends A {field=1;constructor(){let n=1;super()}}let b=new B();',/super first/],
 ['class A {constructor(){}}class B extends A {constructor(){let n=this;super()}}let b=new B();',/this before super/],
 ['class A {constructor(){}}class B extends A {field=1}let b=new B();',/explicit constructor/],
 ['class A {field=1;constructor(){}}class B extends A {field=2;constructor(){super()}}let b=new B();',/Redefinition/],
 ['class A {constructor(){}}class B extends A {constructor(){}}let b=new B();',/direct super call/],
 ['class Child extends Base {}class Base {constructor(){}}let x=new Child();',/parent declaration order/]
 ]){await assert.rejects(()=>runPxtArcade(source,{fakeClock:true}));assert.match(arcadeToPseudocode(source).unsupported.join('\n'),pattern);}
 assert.match(arcadeToPseudocode('class A extends Sprite {constructor(){super(image.create(1,1))}}').unsupported.join('\n'),/parent/);
 assert.match(arcadeToPseudocode('class A<T>{}class B extends A<number>{}').unsupported.join('\n'),/unsupported/);
});

test('default constructor parameter properties and inherited optional defaults retain actual original values',async()=>{
 await qualify(`class A {constructor(public readonly value:number=2){}read(){return this.value}}class B extends A {constructor(public other:number=3){super()}read(){return super.read()+this.other}}class C extends A {}let b=new B();let result=b.read();let c=new C();let inherited=c.read();let same=c===c;result+=0;inherited+=0;`,{result:5,inherited:2,same:true});
});

test('yielding inherited initializers and super calls retain actual delays and Stop/restart cancellation ownership',async()=>{
 const source=`let started=0;let bodies=0;function initialize(){started++;pause(40);return 3}class A {value=initialize();constructor(){bodies++}read(){return this.value}}class B extends A {constructor(){super();bodies++}}let object=new B();let result=object.read();let elapsed=control.millis();result+=0;elapsed+=0;`;
 const expected=await runPxtArcade(source,{fakeClock:true});assert.equal(expected.started,2);assert.equal(expected.bodies,2);assert.equal(expected.elapsed,80);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:0,storage:true});let now=0;const runtime=run.vm.runtime;runtime.updateCurrentMSecs=()=>runtime.currentMSecs=now;runtime.bwArcadeProgramClock={now:()=>now};run.vm.greenFlag();
 try{
  await stepFrames(run.vm,4);assert.equal(values(run).started,1);assert.equal(values(run).bodies,0);
  run.vm.stopAll();now=40;await stepFrames(run.vm,4);assert.equal(values(run).bodies,0);assert.equal(runtime.threads.length,0);
  run.vm.greenFlag();await stepFrames(run.vm,4);assert.equal(values(run).started,1);now=80;await stepFrames(run.vm,4);assert.equal(values(run).started,2);assert.equal(values(run).bodies,0);now=120;await stepFrames(run.vm,6);assert.equal(values(run).bodies,2);assert.equal(values(run).result,3);assert.equal(values(run).elapsed,80);assert.deepEqual(run.errors,[]);
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const oracle=await runPxtArcade(exported.files,{fakeClock:true});assert.equal(oracle.elapsed??oracle.Game_elapsed,80);assert.equal(oracle.started??oracle.Game_started,2);assert.equal(oracle.bodies??oracle.Game_bodies,2);
 }finally{run.vm.quit();clearStrayTimers();}
});

test('recursive derived construction and virtual recursion bind each receiver and preserve shared array references',async()=>{
 await qualify(`class A {constructor(public value:number){}read(){return this.value}}class B extends A {next:B;constructor(n:number){super(n);if(n>0)this.next=new B(n-1)}read():number{if(this.next)return super.read()+this.next.read();return super.read()}}let object=new B(3);let refs:A[]=[object,object.next];let alias:A=refs[0];let result=alias.read();let same=alias===object;let nextSame=refs[1]===object.next;result+=0;`,{result:6,same:true,nextSame:true});
});


test('literal constructor and method defaults bind only omitted slots, including implicit constructors and super calls',async()=>{
 await qualify(`class A {constructor(public value:number=2){}read(){return this.value}number(n:number=7){return n}boolean(b:boolean=true){return b}nullable(n:number=null){return n}}
class B extends A {}class Explicit extends A {constructor(){super(undefined)}}
let a=new B();let explicit=new B(undefined);let nul=new B(null);let zero=new B(0);let sup=new Explicit();
let omitted=a.read();let undefinedArg=explicit.read()===undefined;let nullArg=nul.read()===null;let zeroArg=zero.read();let superUndefined=sup.read()===undefined;
let methodOmitted=a.number();let methodUndefined=a.number(undefined)===undefined;let methodNull=a.number(null)===null;let methodZero=a.number(0);let boolOmitted=a.boolean();let boolFalse=a.boolean(false);let nullOmitted=a.nullable()===null;omitted+=0;methodOmitted+=0;zeroArg+=0;methodZero+=0;`,{omitted:2,undefinedArg:true,nullArg:true,zeroArg:0,superUndefined:true,methodOmitted:7,methodUndefined:true,methodNull:true,methodZero:0,boolOmitted:true,boolFalse:false,nullOmitted:true});
});


test('inherited visibility is static ownership while valid any casts mutate the same referenced fields',async()=>{
 await qualify(`class A {private secret=2;protected value=3;constructor(public readonly fixed:number){}protected compute(){return this.value}read(){return this.compute()+this.secret+this.fixed}}
class B extends A {constructor(){super(5)}compute(){return super.compute()+1}inspect(other:B){return other.value}}
let b=new B();let alias:A=b;let result=alias.read();let protectedResult=b.inspect(b);(b as any).secret=7;(b as any).fixed=9;let mutated=alias.read();let same=alias===b;result+=0;protectedResult+=0;mutated+=0;`,{result:11,protectedResult:3,mutated:20,same:true});
});

test('selected original rejects inherited readonly writes, inaccessible protected receivers and private or reduced-visibility overrides',async()=>{
 for(const [source,pattern]of [
 [`class A {protected p=1;constructor(){}}class B extends A {constructor(){super()}read(other:A){return other.p}}let b=new B();let result=b.read(b);result+=0;`,/Protected class member/],
 [`class A {protected p=1;constructor(){}}class B extends A {constructor(){super()}read(other:A[]){return other[0].p}}let b=new B();let result=b.read([b]);result+=0;`,/Protected class member/],
 [`class A {constructor(public readonly p:number){}}class B extends A {constructor(){super(1);this.p=2}}let b=new B();`,/Readonly class field/],
 [`class A {constructor(){}private read(){return 1}}class B extends A {constructor(){super()}read(){return 2}}let b=new B();`,/override visibility/],
 [`class A {constructor(){}read(){return 1}}class B extends A {constructor(){super()}protected read(){return 2}}let b=new B();`,/override visibility/]
 ]){await assert.rejects(()=>runPxtArcade(source,{fakeClock:true}));assert.match(arcadeToPseudocode(source).unsupported.join('\n'),pattern);}
});

test('export refuses changed super helper arguments instead of replacing edited executable bodies',async()=>{
 const imported=arcadeToPseudocode('class A {extra=4;constructor(public value:number){}}class B extends A {constructor(){super(3)}}let b=new B();let result=b.value;result+=0;');assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:10});
 try{const project=structuredClone(run.creator.project),target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='procedures_prototype'&&b.mutation?.proccode.startsWith('__bwClass_A_superConstructor'))),[protoId]=Object.entries(target.blocks).find(([,b])=>b.opcode==='procedures_prototype'&&b.mutation?.proccode.startsWith('__bwClass_A_superConstructor')),def=Object.values(target.blocks).find(b=>b.opcode==='procedures_definition'&&b.inputs.custom_block[1]===protoId),set=target.blocks[def.next],call=target.blocks[set.inputs.VALUE[1]],arg=target.blocks[call.inputs.ARGS[1]],local=target.blocks[arg.inputs.VALUE[1]];local.inputs.NAME=[1,[10,'changedReceiver']];const exported=projectToArcade(project);assert.match(exported.unsupported.join('\n'),/super constructor helper/);
  const editField=(procedure,field)=>{const clone=structuredClone(run.creator.project),t=clone.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='procedures_prototype'&&b.mutation?.proccode.startsWith(procedure))),[id]=Object.entries(t.blocks).find(([,b])=>b.opcode==='procedures_prototype'&&b.mutation?.proccode.startsWith(procedure)),definition=Object.values(t.blocks).find(b=>b.opcode==='procedures_definition'&&b.inputs.custom_block[1]===id),setter=t.blocks[definition.next];setter.inputs.FIELD=[1,[10,field]];return projectToArcade(clone);};
  assert.match(editField('__bwClass_A_fields','value').unsupported.join('\n'),/field initializer export/);
  assert.match(editField('__bwClass_A_constructor','extra').unsupported.join('\n'),/parameter property export/);
 }
 finally{run.vm.quit();clearStrayTimers();}
});


test('authored undefined normalization is preserved after literal default binding',async()=>{
 await qualify(`class A {constructor(public value:number=2){if(value===undefined)this.value=9}read(){return this.value}method(n:number=3){if(n===undefined)n=8;return n}}class B extends A {}let a=new B(undefined);let result=a.read();let normalized=a.method(undefined);result+=0;normalized+=0;`,{result:9,normalized:8});
});


test('authored parameter-property rebinding after super retains the mutated argument value',async()=>{
 await qualify(`class A {constructor(){}}class B extends A {constructor(public value:number){super();value+=3;this.value=value}read(){return this.value}}let b=new B(2);let result=b.read();result+=0;`,{result:5});
});


test('selected original rejects string defaults separately in constructors and methods',async()=>{
 for(const source of [
  'class A {constructor(public value:string="seed"){}read(){return this.value}}class B extends A {}let b=new B();let result=b.read();result=result+"";',
  'class A {constructor(){}read(value:string="seed"){return value}}class B extends A {}let b=new B();let result=b.read();result=result+"";'
 ]){
  await assert.rejects(()=>runPxtArcade(source,{fakeClock:true}),/only numbers, null, true and false supported as default arguments/);
  assert.match(arcadeToPseudocode(source).unsupported.join('\n'),/nonliteral default arguments/);
 }
});
