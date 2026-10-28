import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import {decodeTilemap} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-values.js';
import {parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {cameraMap,CAMERA_CONTROLLER_SOURCE} from './fixtures/arcade-camera.mjs';

const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?`${path(node.object)}.${node.name}`:'';
const decode=node=>decodeTilemap(node,node=>node?.type==='Template' && node.tag==='img'?parseImageLiteral(node.value):null,path);
const lower=source=>lowerPxtStagedValues(parseMakeCodeTs(source),{isStaticResource:node=>!!decode(node)});
const calls=(node,result=[])=>{
    if(!node || typeof node!=='object')return result;
    if(node.type==='Call')result.push(node);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>calls(child,result));else calls(value,result);
    return result;
};

test('validated literal resources retain complete tile images, wall layer and scale through PXT staging',()=>{
    const source=cameraMap(32,16),input=parseMakeCodeTs(source),output=lower(source);
    const before=decode(input.body[0].expr.args[0]);
    const after=decode(output.body[0].expr.args[0]);
    assert.deepEqual(after,before);
    assert.equal(after.indices[12*32+25],1);
    assert.equal(after.tileSize,8);
    assert.equal(after.images[1].pixels.length,64);
    assert.deepEqual(arcadeToPseudocode(CAMERA_CONTROLLER_SOURCE).unsupported,[]);
});

test('resource treatment does not bypass shadowed SDK calls or effectful tile arrays',()=>{
    const literal=cameraMap(2,2).replace(/^tiles.setTilemap\((.*)\)$/s,'$1');
    const shadowed=lower(`function invoke(tiles:any){return ${literal}}`);
    const factory=calls(shadowed).find(node=>path(node.callee)==='tiles.createTilemap');
    assert.equal(factory.args[2].type,'Identifier','user method arguments keep ordinary array staging');
    const dynamic=lower(literal.replace('[img`0`,','[touch(),'));
    assert.ok(calls(dynamic).some(node=>path(node.callee)==='touch'));
    assert.equal(calls(dynamic).find(node=>path(node.callee)==='tiles.createTilemap').args[2].type,'Identifier');
    assert.ok(arcadeToPseudocode(`tiles.setTilemap(${literal.replace('[img`0`,','[touch(),')})`).unsupported.some(message=>message.includes('readable literal tile map')));
});

test('native Code and MakeCode roundtrip preserve staged tilemap data',async()=>{
    try{
        const imported=arcadeToPseudocode(cameraMap(32,16));
        assert.deepEqual(imported.unsupported,[]);
        const first=await runProgram(imported.code,{frames:4});
        assert.deepEqual(first.errors,[]);assert.deepEqual(first.creator.warnings,[]);
        const expected=first.vm.runtime.bwArcadeDeviceState.tilemap;
        assert.equal(expected.indices[12*32+25],1);assert.equal(expected.tileSize,8);
        const exported=projectToArcade(first.creator.project);assert.deepEqual(exported.unsupported,[]);
        for(const code of [first.creator.decompile(),arcadeToPseudocode(exported.files).code]){
            const next=await runProgram(code,{frames:4});assert.deepEqual(next.errors,[]);
            const map=next.vm.runtime.bwArcadeDeviceState.tilemap;
            for(const field of ['columns','rows','tileSize','indices','walls'])assert.deepEqual(map[field],expected[field],field);
            assert.deepEqual(map.images.map(image=>Array.from(image.pixels)),expected.images.map(image=>Array.from(image.pixels)));
        }
    }finally{clearStrayTimers();}
});
