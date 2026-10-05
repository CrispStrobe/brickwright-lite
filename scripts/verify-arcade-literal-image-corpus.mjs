#!/usr/bin/env node
// Keep private source apps in the corpus; save only action checks and results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {runProgram,stepFrames} from '../test/helpers/bw-vm.mjs';
import {compile} from './lib/pxt-node.mjs';
const args=process.argv.slice(2);
const option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const corpus=option('--corpus-dir','/mnt/storage/brickwright-corpora/collected/arcade');
const out=option('--out',path.resolve(import.meta.dirname,'../test-results/arcade-literal-image-corpus-current.json'));
const file='arcade-f73125d9e87f9aa3.ts';
const imported=arcadeToPseudocode(fs.readFileSync(path.join(corpus,file),'utf8'));
const original=imported.costumes.map(c=>svgToPixels(c.svg)).find(i=>i.width===16&&i.height===16);
assert.ok(original,'the builtin gallery image must be retained as artwork');
const expected=Uint8Array.from(original.pixels,(_,i)=>original.pixels[Math.floor(i/16)*16+15-i%16]);
async function execute(value){
    assert.deepEqual(value.unsupported,[]);
    const run=await runProgram(value.code,{frames:10,uploads:value.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
function check(run){
    const sprites=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(sprites.length,1);
    const sprite=sprites[0];assert.equal(sprite.width,16);assert.equal(sprite.height,16);
    assert.deepEqual([...sprite.image.pixels],[...expected],'the runtime image must be the original duck flipped horizontally');
}
const run=await execute(imported);check(run);
check(await execute({...imported,code:run.creator.decompile()}));
const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));check(await execute(arcadeToPseudocode(exported.ts)));
await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,10);check(run);
const report={generatedAt:new Date().toISOString(),cases:[{file,width:16,height:16,pixels:'exact horizontal flip',native:'pass',code:'pass',sb3:'pass',compile:'pass',makecodeReimport:'pass'}]};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
