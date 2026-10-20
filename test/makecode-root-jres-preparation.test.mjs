import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProjectInputs,compile,hasRuntime,getTutorialTilemapGenerator} from '../scripts/lib/pxt-node.mjs';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {encodeTileImage} from '../overlay/scratch-gui/src/lib/bw-makecode/tile-assets.js';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
const skip=hasRuntime('arcade')?false:'Original Arcade worker not synced';
function project() {
    const image=color=>encodeTileImage({width:16,height:16,pixels:new Uint8Array(256).fill(color)});
    const jres=JSON.stringify({
        transparency16:{data:image(0),mimeType:'image/x-mkcd-f4',tilemapTile:true},
        ground:{data:image(7),mimeType:'image/x-mkcd-f4',tilemapTile:true},
        level:{id:'level',displayName:'level',mimeType:'application/mkcd-tilemap',
            data:Buffer.from('1002000200000101000000').toString('base64'),
            tileset:['myTiles.transparency16','myTiles.ground']},
        '*':{mimeType:'image/x-mkcd-f4',dataEncoding:'base64',namespace:'myTiles'}});
    return {'main.ts':'tiles.setTilemap(tilemap`level`)', 'tilemap.g.jres':jres,
        'pxt.json':JSON.stringify({dependencies:{device:'*'},files:['main.ts','tilemap.g.jres']})};
}

test('original worker generates absent root tilemap companion without changing authored files',{skip},async()=>{
    const original=project(),before=JSON.stringify(original);
    const resolved=await resolveProjectInputs('arcade',original);
    const emit=await getTutorialTilemapGenerator('arcade');
    assert.equal(resolved.generatedRootFiles['tilemap.g.ts'],emit(original['tilemap.g.jres']));
    const prepared=prepareArcadeDependencyInputs(original,resolved);
    assert.equal(JSON.stringify(original),before);
    for(const [name,content] of Object.entries(original))if(name!=='pxt.json')assert.equal(prepared.files[name],content);
    assert.ok(prepared.provenance.some(entry=>entry.id==='root'&&entry.emitter==='pxt.emitTilemapsFromJRes'));
    const compiled=await compile('arcade',original);assert.equal(compiled.success,true,JSON.stringify(compiled.diagnostics));
    const imported=arcadeToPseudocode(prepared.files);assert.deepEqual(imported.unsupported,[]);
    try {
        const run=await runProgram(imported.code,{frames:10,uploads:imported.costumes});
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const map=run.vm.runtime.bwArcadeDeviceState.tilemap;
        assert.equal(map.columns,2);assert.equal(map.rows,2);assert.deepEqual(Array.from(map.indices),[0,1,1,0]);
    }finally{clearStrayTimers();}
});

test('original root companions are never overwritten by generated views',{skip},async()=>{
    const original=project(),emit=await getTutorialTilemapGenerator('arcade');
    original['tilemap.g.ts']=emit(original['tilemap.g.jres'])+'\n// authored companion retained';
    const config=JSON.parse(original['pxt.json']);config.files.push('tilemap.g.ts');original['pxt.json']=JSON.stringify(config);
    const resolved=await resolveProjectInputs('arcade',original);
    assert.deepEqual(resolved.generatedRootFiles,{});
    assert.equal(prepareArcadeDependencyInputs(original,resolved).files['tilemap.g.ts'],original['tilemap.g.ts']);
    assert.throws(()=>prepareArcadeDependencyInputs(original,{...resolved,generatedRootFiles:{'tilemap.g.ts':'changed'}}),/overwrite project file/);
});

test('original image factories initialize before custom authored asset users',{skip},async()=>{
    const image=encodeTileImage({width:16,height:16,pixels:new Uint8Array(256).fill(7)});
    const original={'images.g.jres':JSON.stringify({hero:{mimeType:'image/x-mkcd-f4',data:image,displayName:'hero'},
        '*':{mimeType:'image/x-mkcd-f4',dataEncoding:'base64',namespace:'myImages'}}),
        'custom.ts':'namespace Art { export let hero=assets.image`hero` }',
        'main.ts':'scene.setBackgroundColor(2)\nlet hero=sprites.create(Art.hero,SpriteKind.Player)\nhero.setPosition(40,50)\nhero.setVelocity(0,0)',
        'pxt.json':JSON.stringify({dependencies:{device:'*'},files:['custom.ts','main.ts','images.g.jres']})};
    const before=JSON.stringify(original);
    const resolved=await resolveProjectInputs('arcade',original);
    assert.match(resolved.generatedRootFiles['images.g.ts'],/_registerFactory/);
    assert.equal(resolved.generatedRootProvenance[0].emitter,'pxt.emitProjectImages');
    assert.match(resolved.generatedRootProvenance[0].workerSha256,/^[a-f0-9]{64}$/);
    const prepared=prepareArcadeDependencyInputs(original,resolved);
    assert.equal(JSON.stringify(original),before);
    const compiled=await compile('arcade',original);assert.equal(compiled.success,true,JSON.stringify(compiled.diagnostics));
    assert.equal(compiled.generatedRootFiles['images.g.ts'],resolved.generatedRootFiles['images.g.ts']);
    const actual=await runArcadeSim(compiled.outfiles['binary.js'],{ms:300});
    assert.equal(actual.error,null);assert.ok(Array.from(actual.screen()).includes(7),'original asset pixels must actually render');
    const imported=arcadeToPseudocode(prepared.files);assert.deepEqual(imported.unsupported,[]);
    try {
        const run=await runProgram(imported.code,{frames:15,uploads:imported.costumes,storage:true});
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        assert.deepEqual(Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels),Array.from(actual.screen()));
    }finally{clearStrayTimers();}
});
