import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {source,pxt} from './fixtures/arcade-callable-typeof-source.mjs';
const expected={firstValue:3,aliasValue:4,labelValue:7,actionType:'object',labelType:'function'};
const editedExpected={...expected,firstValue:9,aliasValue:16};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function original(kind,files,values){
 const receipt=process.env.BW_CALLABLE_TYPEOF_ORIGINAL_RECEIPT_DIR;
 if(!receipt)return runPxtArcade(files,{fakeClock:true,waitForMain:true,waitForGlobals:values});
 const read=name=>JSON.parse(fs.readFileSync(path.join(receipt,name),'utf8'));
 const packet=read(kind+'-compilation.json');assert.deepEqual(packet.files,files,'cached original exact compiled inputs');
 assert.equal(packet.built.success,true);assert.deepEqual(packet.built.diagnostics,[]);assert.ok(packet.built.outfiles['binary.js'].length>0);
 const prepared=read('prepared.json'),before=read('execution-before.json'),after=read('execution-after.json');
 assert.equal(Object.keys(prepared.guards).length,9);assert.deepEqual(before,after);
 for(const [name,row]of Object.entries(prepared.guards)){assert.equal(before[name],row.sha256);assert.equal(sha(fs.readFileSync(new URL('../'+name,import.meta.url))),row.sha256,'current consumed guard '+name);}
 for(const [name,value]of Object.entries(files))assert.equal(sha(value),prepared.inputs[kind][name].sha256);
 return read(kind+'-original-observations.json');
}
const checkOriginal=(observed,values)=>{for(const [name,value]of Object.entries(values))assert.equal(observed[name],value,name);};
const check=(run,values)=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const actual=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));checkOriginal(actual,values);};
test('actual PXT label and captured action typeof agree through edited current-body authoring routes',async()=>{
 const files={'main.ts':source,'pxt.json':pxt};checkOriginal(await original('source',files,expected),expected);
 const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);const runs=[];
 try{
  const execute=async input=>{assert.deepEqual(input.unsupported,[]);const run=await runProgram(input.code,{frames:30});runs.push(run);return run;};
  const run=await execute(imported);check(run,expected);const project=JSON.parse(run.vm.toJSON());
  check(await execute({...imported,code:run.creator.decompile(project)}),expected);
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,30);check(run,expected);
  const fresh=await execute({...imported,code:run.creator.decompile(project)});await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,30);check(fresh,expected);
  let edits=0;for(const target of project.targets)for(const block of Object.values(target.blocks))if(block.opcode==='operator_add')for(const input of Object.values(block.inputs||{}))for(const value of input.slice(1))if(Array.isArray(value)&&value[0]===4&&value[1]==='1'){value[1]='7';edits++;}
  assert.equal(edits,1,'edit the actual connected captured receiver increment');
  check(await execute({...imported,code:run.creator.decompile(project)}),editedExpected);
  const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);checkOriginal(await original('export',exported.files,editedExpected),editedExpected);
  check(await execute(arcadeToPseudocode(exported.files)),editedExpected);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
