#!/usr/bin/env node
// Original sources stay in the private corpus; persist only checks and IDs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from '../test/helpers/bw-vm.mjs';
import {compile} from './lib/pxt-node.mjs';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const corpus=option('--corpus-dir','/mnt/storage/brickwright-corpora/collected/arcade');
const out=option('--out',path.resolve(import.meta.dirname,'../test-results/arcade-optional-corpus-current.json'));
const file='arcade-784124ace9bd6367.ts';
const imported=arcadeToPseudocode(fs.readFileSync(path.join(corpus,file),'utf8'));
async function check(run){
    const deadline=Date.now()+5000;
    while(run.vm.runtime.threads.length && Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(done=>setTimeout(done,10));}
    assert.equal(run.vm.runtime.threads.length,0,'optional-argument example must finish');
    const lines=(run.vm.runtime.bwArcadeDeviceState.serial||'').trim().split('\n');
    assert.equal(lines.length,8);assert.ok(lines[0]!==lines[3]);
    assert.ok(lines.slice(0,3).every(line=>line===lines[0]));assert.ok(lines.slice(3).every(line=>line===lines[3]));
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
}
async function execute(imported){
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:80,storage:true,uploads:imported.costumes});await check(run);return run;
}
const run=await execute(imported);
await execute({...imported,code:run.creator.decompile()});
const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));await execute(arcadeToPseudocode(exported.ts));
await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await check(run);
const report={generatedAt:new Date().toISOString(),cases:[{file,logLines:8,groups:[3,5],native:'pass',code:'pass',sb3:'pass',compile:'pass',makecodeReimport:'pass',scope:'omitted optional argument defaults in the function body, explicit argument, loop count and log order'}]};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
