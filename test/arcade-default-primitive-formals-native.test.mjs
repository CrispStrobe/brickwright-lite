import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers,SB3Creator} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const BW=createRequire(import.meta.url)(VM_SRC+'/util/bw-values.js');
const source='let entered=0;let seen="";let independent=0;function holdText(thisText:string){entered+=1;seen=thisText;}independent+=1;';
const imported=s=>importProjectFiles({'main.ts':s},{target:'arcade'});
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));
const finish=run=>{run.vm.stopAll();run.vm.quit();clearStrayTimers();};
const prefix=/declare arcade procedure "(?:Game_)?holdText %s" parameter "thisText" as String/;
const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.equal(values(run).entered,0);assert.equal(values(run).seen,'');assert.equal(values(run).independent,1);const declarations=JSON.parse(run.vm.toJSON()).targets.flatMap(t=>Object.values(t.blocks)).filter(b=>b.opcode==='arcade_declareParameterConstraint');assert.equal(declarations.length,1);assert.equal(declarations[0].fields.TYPE[0],'String');};

test('default unused String keeps its actual constraint through Code, same/fresh SB3 and current export',async()=>{
 const firstImport=imported(source);assert.deepEqual(firstImport.unsupported,[]);assert.deepEqual(firstImport.warnings,[]);assert.match(firstImport.code,prefix);let run;
 try{
  run=await runProgram(firstImport.code,{frames:8});check(run);const feedback=run.creator.decompile(JSON.parse(run.vm.toJSON()));assert.match(feedback,prefix);const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,8);check(run);finish(run);run=null;
  run=await runProgram(feedback,{frames:8});check(run);finish(run);run=null;
  run=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});run.vm.stopAll();await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,8);check(run);const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.match(exported.ts,/function (?:Game_)?holdText\s*\(thisText:\s*string\)/);const again=importProjectFiles(exported.files,{target:'arcade'});assert.deepEqual(again.unsupported,[]);assert.match(again.code,prefix);finish(run);run=null;
  run=await runProgram(again.code,{frames:8});check(run);
 }finally{if(run)finish(run);}
});

for(const[type,value,expected]of[['text','"ok"','ok'],['number','20',null]])test(`current Code caller ${type} is checked against the retained unused String before body effects`,async()=>{
 const result=imported(source);assert.deepEqual(result.unsupported,[]);const code=result.code.replace('\nDEFINE holdText',`\n  CALL: (holdText (${value}))\nDEFINE holdText`);assert.notEqual(code,result.code);let run;
 try{run=await runProgram(code,{frames:10});if(expected===null){assert.equal(values(run).entered,0);assert.equal(values(run).seen,'');assert.equal(run.errors.length,1);assert.match(run.errors[0],/Procedure parameter constraint/);assert.ok(projectToArcade(JSON.parse(run.vm.toJSON())).unsupported.some(d=>/constraint|requires String/i.test(d)));}else{assert.deepEqual(run.errors,[]);assert.equal(values(run).entered,1);assert.equal(values(run).seen,expected);}assert.equal(values(run).independent,1);}finally{if(run)finish(run);}
});

test('old already-erased String has no default annotation recovery',()=>{
 const result=imported('function holdText(thisText:string){game.showLongText(thisText,DialogLayout.Full);}'),creator=new SB3Creator();creator.parse(result.code.replace(/^  declare arcade procedure .+\n/gm,''));const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/thisText:\s*any/);assert.doesNotMatch(exported.ts,/thisText:\s*string/);const again=importProjectFiles(exported.files,{target:'arcade'});assert.ok(again.unsupported.length);
});

test('ordinary owned info.score Number is supplied by the real native reporter',async t=>{
 const result=imported('let seen=0;function receive(value:number){seen=value;}info.setScore(35);receive(info.score());');assert.deepEqual(result.unsupported,[]);let run;try{run=await runProgram(result.code,{frames:10});t.diagnostic(JSON.stringify({code:result.code,values:values(run),errors:run.errors}));assert.deepEqual(run.errors,[]);assert.equal(values(run).seen,35);const current=JSON.parse(run.vm.toJSON());assert.equal(current.targets.flatMap(t=>Object.values(t.blocks)).filter(b=>b.opcode==='arcade_getPlayerScore').length,1);assert.deepEqual(projectToArcade(current).unsupported,[]);}finally{if(run)finish(run);}
});
