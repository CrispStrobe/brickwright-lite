#!/usr/bin/env node
// Private sources remain in the corpus; only verification results are saved.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from '../test/helpers/bw-vm.mjs';
import {compile} from './lib/pxt-node.mjs';
const args=process.argv.slice(2);
const option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const corpus=option('--corpus-dir','/mnt/storage/brickwright-corpora/collected/arcade');
const out=option('--out',path.resolve(import.meta.dirname,'../test-results/arcade-background-corpus-current.json'));
async function execute(imported){
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
async function check(run,id){
    const state=run.vm.runtime.bwArcadeDeviceState,image=state.backgroundImage;
    assert.ok(image);assert.equal(image.width,160);assert.equal(image.height,120);
    if(id==='d1ded6ae1608f7a9'){
        assert.equal(image.pixels[5*160+5],2);assert.equal(image.pixels[10*160+25],2);
        assert.equal(image.pixels[0],0);assert.equal(Object.values(state.sprites).length,0);
    }else{
        assert.ok(image.pixels.some(pixel=>pixel!==0));
        const sprites=Object.values(state.sprites),player=sprites.find(s=>s.kind==='Player'),ball=sprites.find(s=>s.kind==='Basketball');
        assert.equal(sprites.length,2);assert.ok(player&&ball);
        const score=()=>Number(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>/^(Game_)?score$/.test(v.name))?.value ?? state.score);
        const before=score();
        // Start a fresh contact so both initially overlapping and separated
        // imports exercise the callback deterministically.
        for(const [sprite,x,y] of [[player,20,20],[ball,140,100]]){
            for(const [PROPERTY,VALUE] of [['x',x],['y',y]])run.vm.runtime._primitives.arcade_setSpriteProperty({ID:sprite.id,PROPERTY,VALUE},{});
        }
        await stepFrames(run.vm,2);
        let contact=false;
        for(let y=4;y<=36&&!contact;y++)for(let x=4;x<=36&&!contact;x++){
            for(const [PROPERTY,VALUE] of [['x',x],['y',y]])run.vm.runtime._primitives.arcade_setSpriteProperty({ID:ball.id,PROPERTY,VALUE},{});
            contact=run.vm.runtime._primitives.arcade_spriteOverlaps({A:player.id,B:ball.id},{});
        }
        assert.ok(contact,'the real artwork must have an opaque-pixel contact');
        await stepFrames(run.vm,12);assert.ok(score()>before);
        assert.ok(run.calls.get('arcade_startCountdown')>0);
        assert.ok(ball.x>=0&&ball.x<=160&&ball.y>=0&&ball.y<=120);
    }
    return {width:image.width,height:image.height,sprites:Object.values(state.sprites).length};
}
const cases=[];
for(const id of ['22c635974827251d','d1ded6ae1608f7a9']){
    const file=`arcade-${id}.ts`,imported=arcadeToPseudocode(fs.readFileSync(path.join(corpus,file),'utf8'));
    const run=await execute(imported),native=await check(run,id);
    await check(await execute({...imported,code:run.creator.decompile()}),id);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
    await check(await execute(arcadeToPseudocode(exported.ts)),id);
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,3);await check(run,id);
    cases.push({file,native,code:'pass',sb3:'pass',compile:'pass',makecodeReimport:'pass'});
}
const report={generatedAt:new Date().toISOString(),cases};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
