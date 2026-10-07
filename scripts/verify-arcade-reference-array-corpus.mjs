#!/usr/bin/env node
// Private source stays in the corpus; this report contains only checks.
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
const corpus=option('--corpus-dir',process.env.BW_ARCADE_CORPUS||path.resolve(import.meta.dirname,'../../brickwright-firmware-private/compat-corpora/makecode/arcade'));
const out=option('--out',path.resolve(import.meta.dirname,'../test-results/arcade-reference-array-corpus-current.json'));
const file='arcade-a1936970d088e350.ts';
const imported=arcadeToPseudocode(fs.readFileSync(path.join(corpus,file),'utf8'));
const expected=imported.costumes.map(c=>svgToPixels(c.svg)).filter(i=>i.width===16&&i.height===16).map(i=>JSON.stringify([...i.pixels]));
assert.equal(new Set(expected).size,2,'retain both original asteroid gallery images');
async function execute(value){
    assert.deepEqual(value.unsupported,[]);
    const run=await runProgram(value.code,{frames:100,uploads:value.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
function check(run){
    const sprites=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
    assert.ok(sprites.length>=3,'the one-second creation event must run repeatedly');
    for(const sprite of sprites){
        assert.equal(sprite.kind,'Asteroid');assert.equal(sprite.width,16);assert.equal(sprite.height,16);
        assert.ok(expected.includes(JSON.stringify([...sprite.image.pixels])),'random selection must use an original gallery image');
        assert.ok(sprite.x>=0&&sprite.x<=160);assert.ok(sprite.y>=0&&sprite.y<=120);
    }
    return {spawned:sprites.length,originalGalleryImages:true,positionsInBounds:true};
}
const run=await execute(imported),native=check(run);
check(await execute({...imported,code:run.creator.decompile()}));
const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));check(await execute(arcadeToPseudocode(exported.ts)));
await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,100);check(run);
const report={generatedAt:new Date().toISOString(),cases:[{file,native,code:'pass',sb3:'pass',compile:'pass',makecodeReimport:'pass'}]};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
