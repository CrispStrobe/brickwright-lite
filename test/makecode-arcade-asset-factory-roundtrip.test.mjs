import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeTileImage} from '../overlay/scratch-gui/src/lib/bw-makecode/tile-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {getTutorialTilemapGenerator} from '../scripts/lib/pxt-node.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';

const entry=(pixel,name,tile=false)=>({data:encodeTileImage({width:1,height:1,pixels:Uint8Array.from([pixel])}),mimeType:'image/x-mkcd-f4',dataEncoding:'base64',displayName:name,...(tile?{tilemapTile:true}:{})});
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('source factory kinds preserve null, fresh images and shared tiles through editable runtime roundtrips',async()=>{
    const images=JSON.stringify({'*':{namespace:'myImages'},hero:entry(3,'shared')});
    const tiles=JSON.stringify({'*':{namespace:'myTiles'},tile1:entry(5,'winCloud',true),tile2:entry(9,'shared',true)});
    const main='let missing=assets.image`winCloud`;let imageMissing=missing===null;let tileMissing=assets.tile`hero`===null;let picture=assets.image`shared`;picture.setPixel(0,0,8);let freshPixel=assets.image`shared`.getPixel(0,0);let tile=assets.tile`shared`;tile.setPixel(0,0,6);let tilePixel=assets.tile`shared`.getPixel(0,0);scene.onOverlapTile(SpriteKind.Player,missing,function(actor:Sprite,location:tiles.Location){});let done=1;done+=0;';
    const generate=await getTutorialTilemapGenerator('arcade');
    const files={'images.g.jres':images,'tilemap.g.jres':tiles,'tilemap.g.ts':generate(tiles),'main.ts':main,'pxt.json':JSON.stringify({name:'asset-factory-roundtrip',dependencies:{device:'*'},files:['tilemap.g.ts','images.g.jres','tilemap.g.jres','main.ts']})};
    const expected=await runPxtArcade(files);assert.equal(expected.imageMissing,true);assert.equal(expected.tileMissing,true);assert.equal(expected.freshPixel,3);assert.equal(expected.tilePixel,6);
    const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of ['imageMissing','tileMissing','freshPixel','tilePixel','done'])assert.equal(values(run)[name],expected[name],name);};
    try {
        const run=await runProgram(imported.code,{frames:90,uploads:imported.costumes,storage:true});check(run);
        const sb3=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(sb3);run.vm.greenFlag();await stepFrames(run.vm,90);check(run);
        check(await runProgram(run.creator.decompile(),{frames:90,uploads:imported.costumes,storage:true}));
        const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        const oracle=await runPxtArcade(exported.files);for(const name of ['imageMissing','tileMissing','freshPixel','tilePixel','done'])assert.equal(oracle[name]??oracle['Game_'+name],expected[name],name+' exported');
        const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);check(await runProgram(restored.code,{frames:90,uploads:restored.costumes,storage:true}));
    } finally {clearStrayTimers();}
});

test('missing gallery snippets keep their unresolved asset diagnostic',()=>{
    assert.ok(arcadeToPseudocode('let missing=assets.image`notProvided`;missing.setPixel(0,0,1)').unsupported.length);
});
