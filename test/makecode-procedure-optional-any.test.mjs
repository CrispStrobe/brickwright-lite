import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers,stepFrames} from './helpers/bw-vm.mjs';
import {createRequire} from 'node:module';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const BW=createRequire(import.meta.url)(VM_SRC+'/util/bw-values.js'),options={procedureConstraintsPrototype:true};
const source='let calls=0;let argCalls=0;function next(){argCalls+=1;return "title"}function keep(title:any,subtitle?:any){calls+=1;return subtitle}let omitted=keep(next());let explicit=keep(next(),undefined);let present=keep(next(),20);let ready=calls;';
test('optional Any pads missing arguments without introducing a new type or default rule',()=>{
 const imported=arcadeToPseudocode(source,options);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/declare arcade procedure "keep %s %s" parameter "title" as Any\n  declare arcade procedure "keep %s %s" parameter "subtitle" as Any/);
 assert.doesNotMatch(arcadeToPseudocode(source).code,/declare arcade procedure/);
 const mixed=arcadeToPseudocode('function keep(title:string,subtitle?:any){return subtitle}let result=keep("title");',options);assert.deepEqual(mixed.unsupported,[]);assert.match(mixed.code,/parameter "title" as String/);
});
test('only supported trailing optional Any enters the existing protocol',()=>{
 const cases=[
 'function keep(required:string,optional?:any){}keep();',
 'function keep(value?:any){}keep(1,2);',
 'function keep(optional?:any,required:any){}keep(1,2);',
 'function keep(value?:number){}keep();',
 'function keep(value?:string){}keep();',
 'function keep(value?:boolean){}keep();',
 'function keep(value:any=image.create(1,1)){}keep();',
 'function keep(value:number=20){}keep();',
 'function keep<T>(value?:any){}keep();',
 'function keep(picture:Image,value?:any){}keep(image.create(1,1));',
 'function keep(required:number,optional?:any){required="bad"}keep(20);',
 'function keep(required:number,optional?:any){game.onUpdate(()=>{required+="bad"})}keep(20);',
 'function keep(value?:any){}keep=other;keep();',
 'function keep(value?:any,value?:any){}keep();'
 ];assert.equal(cases.length,14);
 for(const text of cases)assert.ok(arcadeToPseudocode(text,options).unsupported.some(message=>/Procedure parameter constraint:/.test(message)),text);
});
test('optional Any actual omitted/Undefined/value arguments survive portable current calls exactly once',async()=>{
 const imported=arcadeToPseudocode(source,options);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));const actual=name=>{const row=vars.find(v=>v.name===name);assert.ok(row,'actual '+name+' exists');return BW.decode(row.value);};assert.equal(actual('omitted'),undefined);assert.equal(actual('explicit'),undefined);assert.equal(actual('present'),20);assert.equal(actual('calls'),3);assert.equal(actual('argCalls'),3);assert.equal(actual('ready'),3);return JSON.parse(run.vm.toJSON());};
 try{
  const first=await runProgram(imported.code,{frames:35});runs.push(first);check(first);
  const code=await runProgram(first.creator.decompile(JSON.parse(first.vm.toJSON())),{frames:35});runs.push(code);check(code);
  const bytes=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());first.vm.stopAll();await first.vm.loadProject(bytes);first.vm.greenFlag();await stepFrames(first.vm,35);check(first);
  const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,35);const project=check(fresh);
  const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/subtitle:\s*any/);assert.match(exported.ts,/undefined/);const again=arcadeToPseudocode(exported.files,options);assert.deepEqual(again.unsupported,[]);const final=await runProgram(again.code,{frames:35});runs.push(final);check(final);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
