import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const source=`class Box {
 public readonly n:number=1; private p:number=2; protected q:number=3;
 constructor(private readonly extra:number){}
 private read(){return this.p+this.extra} protected other(){return this.q}
 public total(){return this.read()+this.other()+this.n}
}
let a=new Box(5);let alias:any=a;
(a as any).n=7;alias.p=11;(a as any).q=13;alias.extra=17;
let post=a.n;(a as any).n=post+1;alias.n+=2;
let n=a.n;let total=a.total();let privateCall=(a as any).read();let protectedCall=alias.other();
let same=a===alias;n+=0;total+=0;privateCall+=0;protectedCall+=0;post+=0;
`;
test('readonly and visibility remain static metadata while valid any access preserves runtime aliases through all routes',async()=>{
 const expected=await runPxtArcade(source,{fakeClock:true});for(const [k,v]of Object.entries({n:10,total:51,privateCall:28,protectedCall:13,post:7,same:true}))assert.equal(expected[k],v,k);
 const runs=[],variables=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BW.decode(v.value)]));
 const check=run=>{assert.deepEqual(run.errors,[]);for(const name of ['n','total','privateCall','protectedCall','post','same'])assert.equal(variables(run)[name],expected[name],name);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:100,storage:true});runs.push(run);assert.deepEqual(run.creator.warnings,[]);check(run);return run;};
 try {
  const run=await execute(arcadeToPseudocode(source));await execute({...arcadeToPseudocode(source),code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/private readonly extra: number/);assert.match(exported.ts,/protected other\(/);assert.match(exported.ts,/private read\(/);assert.match(exported.ts,/as any/);
  const original=await runPxtArcade(exported.files,{fakeClock:true});for(const name of ['n','total','privateCall','protectedCall','post','same'])assert.equal(original[name]??original['Game_'+name],expected[name],name+' originalexport');
  await execute(arcadeToPseudocode(exported.files));
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,100);check(fresh);
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});
test('invalid typed visibility and readonly accesses retain the selected original static errors',async()=>{
 for(const [source,pattern]of [
  ['class A {constructor(public readonly n:number){}} let a=new A(1);(a as any).n=7;a.n=2;',/Readonly class field/],
  ['class A {constructor(private n:number){}} let a=new A(1);let n=a.n;n+=0;',/private member/],
  ['class A {constructor(protected n:number){}} let a=new A(1);a.n++;',/protected member/],
  ['class A {constructor(){} private read(){return 1}} let a=new A();let n=a.read();n+=0;',/private member/],
  ['class A {constructor(){} protected read(){return 1}} let a=new A();let n=a.read();n+=0;',/protected member/],
  ['class A {constructor(public n:number){}} let a=new A(1);let n=(a as any).n++;n+=0;',/unary update on any class properties/]
 ]){await assert.rejects(()=>runPxtArcade(source,{fakeClock:true}));assert.match(arcadeToPseudocode(source).unsupported.join('\n'),pattern);}
});
