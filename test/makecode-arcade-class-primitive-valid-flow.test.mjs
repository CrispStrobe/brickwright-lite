import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {arrayReferenceCases} from './fixtures/arcade-array-reference-cases.mjs';
const cases=[
 ['explicit undefined and inherited literal defaults',`class A {constructor(public value:number=2){}read(){return this.value}number(n:number=7){return n}}class B extends A {}class Explicit extends A {constructor(){super(undefined)}}let a=new B();let explicit=new B(undefined);let sup=new Explicit();let omitted=a.read();let explicitUndefined=explicit.read()===undefined;let superUndefined=sup.read()===undefined;let methodDefault=a.number();let methodUndefined=a.number(undefined)===undefined;`,{omitted:2,explicitUndefined:true,superUndefined:true,methodDefault:7,methodUndefined:true}],
 ['actual primitive Boolean numeric operation result',`function pair(a:any,b:any){return a*10+b}class Reader{value:number;constructor(){this.value=pair(1,false)}}let reader=new Reader();let result=reader.value;`,{result:10}],
 ['staged numeric argument body',`function pair(a:number,b:number){return a*10+b}class Box{value:number;constructor(){this.value=1}}let box=new Box();let yes=true;box.value=pair(1,yes?2:3);let result=box.value;`,{result:12}],
 ['actual class array element returned through a formal',arrayReferenceCases['class-element'].source,arrayReferenceCases['class-element'].expected],
 ['actual inherited SDK Sprite constructor',`class Picture extends Sprite {}let picture=image.create(2,3);picture.setPixel(1,2,7);let object=new Picture(picture);let sameImage=object.image===picture;picture.setPixel(0,0,4);let pixel=object.image.getPixel(0,0);let width=object.width;let height=object.height;let other=image.create(3,2);object.setImage(other);let changed=object.image===other;let resizedWidth=object.width;let resizedHeight=object.height;pixel+=0;`,{sameImage:true,pixel:4,width:2,height:3,changed:true,resizedWidth:3,resizedHeight:2}]
];
for(const[name,source,expected]of cases)test(name+' retains current class export constraints across portable routes',async()=>{
 const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));for(const[key,value]of Object.entries(expected))assert.equal(values[key],value,key);};
 const execute=async code=>{const run=await runProgram(code,{frames:30,storage:true});runs.push(run);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const run=await execute(imported.code);
  await execute(run.creator.decompile());
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,30);check(run);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,30);check(fresh);
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
  const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);await execute(again.code);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('actual class-array receiver proof rejects incompatible and unresolved current writers',async()=>{
 const {default:Creator}=await import('../overlay/scratch-gui/src/lib/sb3-creator.js');
 const build=()=>{const imported=arcadeToPseudocode(arrayReferenceCases['class-element'].source),creator=new Creator();assert.deepEqual(imported.unsupported,[]);creator.parse(imported.code);return creator.project;};
 for(const change of ['element','receiver','operation']){
  const project=build();const target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arrays_mutateReference'));
  const writer=Object.values(target.blocks).find(b=>b.opcode==='arrays_mutateReference');
  if(change==='element')writer.inputs.VALUE=[1,[10,'not a class instance']];
  if(change==='receiver')writer.inputs.ARRAY=[1,[10,'not an array']];
  if(change==='operation')writer.inputs.OP=[1,[10,'unknown writer']];
  const before=JSON.stringify(project),exported=projectToArcade(project);
  assert.ok(exported.unsupported.includes('Class primitive export: field writer requires an actual declared receiver and fixed property'),change+': '+JSON.stringify(exported.unsupported));
  assert.equal(JSON.stringify(project),before);
 }
});

test('only the actual fixed special-value kind provides primitive constraint facts',async()=>{
 const {default:Creator}=await import('../overlay/scratch-gui/src/lib/sb3-creator.js');
 for(const kind of ['unknown',null]){
  const creator=new Creator();creator.parse(arcadeToPseudocode('class Reader{constructor(public value:number){}}let reader=new Reader(undefined);').code);
  const project=creator.project,target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arrays_specialValue'));
  const special=Object.values(target.blocks).find(b=>b.opcode==='arrays_specialValue');
  if(kind===null){special.fields={};special.inputs.KIND=[1,[4,'0']];}else special.fields.KIND=[kind,null];
  assert.ok(projectToArcade(project).unsupported.some(message=>message.includes('Class primitive export: argument Reader.')));
 }
});

test('producer cycles without results and actual String arithmetic writers never become Number facts',async()=>{
 const {default:Creator}=await import('../overlay/scratch-gui/src/lib/sb3-creator.js');
 for(const source of [
  'function loop(value:any):any{return loop(value)}class Reader{value:number;constructor(){this.value=loop(1)}}let reader=new Reader();',
  'function loop(value:any):any{return -loop(value)}class Reader{value:number;constructor(){this.value=loop(1)}}let reader=new Reader();',
  'function pair(a:any,b:any){return a*10+b}class Reader{value:number;constructor(){this.value=pair(1,"bad")}}let reader=new Reader();'
 ]){
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);
  assert.ok(projectToArcade(creator.project).unsupported.some(message=>message.includes('Class primitive export: field Reader.value writer conflicts with declared number')));
 }
});

test('an ordinary class cannot borrow an intrinsic constructor by procedure spelling',async()=>{
 const {default:Creator}=await import('../overlay/scratch-gui/src/lib/sb3-creator.js');
 const creator=new Creator();creator.parse(arcadeToPseudocode('class Reader{value=1;constructor(){}}let reader=new Reader();').code);
 const project=creator.project,decl=project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='arcade_declareClass');
 decl.inputs.CONSTRUCTOR=[1,[10,'__bwClass_Sprite_constructor %s %s']];
 assert.ok(projectToArcade(project).unsupported.some(message=>message.includes('class Reader requires a unique actual procedure')));
});
