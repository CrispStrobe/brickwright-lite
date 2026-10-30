// Genuine VM/artwork controls are separate from the pure projection module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {inspectTilemapPalette, drawTilemapImage} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-palette.js';
import {DEFAULT_PROJECT_PALETTE} from '../overlay/scratch-gui/src/lib/arcade-project-palette.js';
import {findTilemapBlocks, paintTilePixel, setWall, writeTilemapBlock} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-editor.js';

const palette=[...DEFAULT_PROJECT_PALETTE];palette[0]='#102030';palette[1]='#123456';palette[2]='#123456';palette[3]='#654321';palette[15]='#000000';
const source='namespace myTiles { export const empty=img`0 0\n0 0`; export const floor=img`1 2\nf 0`; }\n'+
    'tiles.setTilemap(tiles.createTilemap(hex`020001000100`,img`2 .`,[myTiles.empty,myTiles.floor],TileScale.Four))';
const pixels=data=>data.images[1].pixels;
const record=row=>{if(process.env.BW_SHARED_FRAME_SNAPSHOTS)appendFileSync(process.env.BW_SHARED_FRAME_SNAPSHOTS,JSON.stringify(row)+'\n');};

test('actual edited tile artwork keeps project colors, indices, walls and names through Code SB3 export and reimport',async()=>{
    const imported=arcadeToPseudocode({'main.ts':source,'pxt.json':JSON.stringify({name:'painter-palette',dependencies:{device:'*'},files:['main.ts'],palette})});
    record({stage:'tile-palette-import',result:imported});
    assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const runs=[],closed=new Set();
    const close=run=>{if(!closed.has(run)){run.vm.quit();closed.add(run);}};
    try{
        const run=await runProgram(imported.code,{frames:3,storage:true,uploads:imported.costumes});runs.push(run);
        record({stage:'tile-palette-initial-VM',project:JSON.parse(run.vm.toJSON()),errors:run.errors,palette:inspectTilemapPalette(run.vm)});
        assert.deepEqual(run.errors,[]);assert.deepEqual(inspectTilemapPalette(run.vm).colors,[null,...palette.slice(1)]);
        const [ref]=findTilemapBlocks(run.vm),original=[...pixels(ref.data)];assert.ok(original.includes(1)&&original.includes(2)&&original.includes(15));
        const edited=setWall(paintTilePixel(ref.data,1,0,0,2),1,0,true);
        assert.equal(writeTilemapBlock(run.vm,ref,edited),true);
        const code=run.creator.decompile(JSON.parse(run.vm.toJSON()));
        record({stage:'tile-palette-current-Code',code,edited});
        const saved=await run.vm.saveProjectSb3(),bytes=Buffer.from(await saved.arrayBuffer());
        record({stage:'tile-palette-saved-SB3',bytesBase64:bytes.toString('base64'),project:JSON.parse(run.vm.toJSON())});
        await run.vm.loadProject(bytes);
        const restored=findTilemapBlocks(run.vm)[0];assert.deepEqual(restored.data,edited);assert.equal(writeTilemapBlock(run.vm,ref,edited),false);
        const projection=inspectTilemapPalette(run.vm),colors=[],ctx={fillStyle:null,fillRect(){colors.push(this.fillStyle);}};
        drawTilemapImage(ctx,restored.data.images[1],0,0,1,projection);assert.ok(colors.includes('#123456')&&colors.includes('#000000'));
        // Match the stage export UI: after a real load/reload, the VM owns the
        // current asset IDs and bytes. The original Creator's cache is not the
        // current costume registry.
        const svgs=new Map(),assetInputs=[];
        for(const target of run.vm.runtime.targets){
            if(!target.isOriginal)continue;
            for(const costume of target.sprite.costumes){
                if(costume.asset?.dataFormat!=='svg')continue;
                const svg=costume.asset.decodeText();assert.equal(typeof svg,'string');
                if(svgs.has(costume.assetId))assert.equal(svgs.get(costume.assetId),svg,'one current asset ID must name the same actual bytes');
                svgs.set(costume.assetId,svg);
                assetInputs.push({targetId:target.id,targetName:target.getName(),costumeName:costume.name,
                    assetId:costume.assetId,svg,originalCreatorHasAsset:run.creator.assets.has(costume.assetId)});
            }
        }
        const exportProject=JSON.parse(run.vm.toJSON());
        const exported=projectToArcade(exportProject,{costumeSvg:(_target,costume)=>svgs.get(costume.assetId)||null});
        record({stage:'tile-palette-export',result:exported,project:exportProject,assetInputs});
        assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
        close(run);
        const codeRun=await runProgram(code,{frames:3,storage:true,uploads:imported.costumes});runs.push(codeRun);
        record({stage:'tile-palette-Code-VM',project:JSON.parse(codeRun.vm.toJSON()),errors:codeRun.errors});
        assert.deepEqual(codeRun.errors,[]);assert.deepEqual(findTilemapBlocks(codeRun.vm)[0].data,edited);
        close(codeRun);
        const again=arcadeToPseudocode(exported.files);record({stage:'tile-palette-reimport',result:again});assert.deepEqual(again.unsupported,[]);assert.deepEqual(again.warnings,[]);
        const reimported=await runProgram(again.code,{frames:3,storage:true,uploads:again.costumes});runs.push(reimported);
        record({stage:'tile-palette-reimport-VM',project:JSON.parse(reimported.vm.toJSON()),errors:reimported.errors,palette:inspectTilemapPalette(reimported.vm)});
        assert.deepEqual(reimported.errors,[]);assert.deepEqual(findTilemapBlocks(reimported.vm)[0].data,edited);
        assert.deepEqual(inspectTilemapPalette(reimported.vm).colors,[null,...palette.slice(1)]);
    }finally{for(const run of runs)close(run);clearStrayTimers();}
});
