import test from 'node:test';
import assert from 'node:assert/strict';
import {TileAssetExporter, parseTileAssets} from '../overlay/scratch-gui/src/lib/bw-makecode/tile-assets.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const image = (color, tileId, displayName) => ({width:4,height:4,pixels:Array(16).fill(color),...(tileId?{tileId,displayName}: {})});
const anonymous=image(2), named=image(3,'myTiles.tile1','Named floor');
const map=images=>({columns:2,rows:1,tileSize:4,indices:[0,1],walls:[0,1],images});
function project(maps) {
    const blocks={hat:{opcode:'event_whenflagclicked',next:'map0',parent:null,inputs:{},fields:{},shadow:false,topLevel:true}};
    maps.forEach((data,index)=>{blocks['map'+index]={opcode:'arcade_setTilemap',next:index+1<maps.length?'map'+(index+1):null,parent:index?'map'+(index-1):'hat',inputs:{DATA:[1,[10,JSON.stringify(data)]]},fields:{},shadow:false,topLevel:false};});
    return {targets:[{isStage:true,name:'Stage',variables:{},lists:{},broadcasts:{},blocks,costumes:[],sounds:[]}],extensions:['arcade']};
}

test('anonymous names cannot claim later explicit tile IDs, regardless of registration order',()=>{
    for(const order of [[anonymous,named],[named,anonymous]]) {
        const warnings=[],assets=new TileAssetExporter(warnings);assets.reserve(order);
        const ids=order.map(tile=>assets.register(tile,1));
        assert.equal(ids[order.indexOf(named)],'myTiles.tile1');
        assert.notEqual(ids[order.indexOf(anonymous)],'myTiles.tile1');
        assert.deepEqual(warnings,[]);
        const read=parseTileAssets(assets.files()['tilemap.g.jres']);
        assert.deepEqual(Array.from(read['myTiles.tile1'].pixels),named.pixels);
        assert.deepEqual(Array.from(read[ids[order.indexOf(anonymous)]].pixels),anonymous.pixels);
    }
});

test('whole current export reserves explicit names in later maps and keeps all actual pixels',()=>{
    const transparent=image(0,'myTiles.transparency4','Transparent');
    for(const maps of [[map([transparent,anonymous]),map([transparent,named])],[map([transparent,anonymous,named])]]) {
        const before=structuredClone(maps),exported=projectToArcade(project(maps));
        assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
        const read=parseTileAssets(exported.files['tilemap.g.jres']);
        assert.deepEqual(Array.from(read['myTiles.tile1'].pixels),named.pixels);
        assert.ok(Object.values(read).some(tile=>tile&&tile.tileId!=='myTiles.tile1'&&Array.from(tile.pixels).every(p=>p===2)));
        assert.deepEqual(maps,before,'export cannot rewrite authored map metadata');
        const imported=arcadeToPseudocode(exported.files);
        assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    }
});

test('genuine conflicting named edits still warn, and their suffix cannot steal another explicit name',()=>{
    const changed=image(4,'myTiles.tile1','Named floor'),suffix=image(5,'myTiles.tile1_2','Authored suffix');
    const warnings=[],assets=new TileAssetExporter(warnings);assets.reserve([named,changed,suffix]);
    assert.equal(assets.register(named,1),'myTiles.tile1');
    assert.equal(assets.register(changed,1),'myTiles.tile1_3');
    assert.equal(assets.register(suffix,2),'myTiles.tile1_2');
    assert.equal(warnings.length,1);assert.match(warnings[0],/conflicting edits or names/);
    const read=parseTileAssets(assets.files()['tilemap.g.jres']);
    for(const[id,color]of [['myTiles.tile1',3],['myTiles.tile1_2',5],['myTiles.tile1_3',4]])assert.deepEqual(Array.from(read[id].pixels),Array(16).fill(color));
    assert.equal(read['Named floor'],null,'ambiguous display names cannot silently select one edit');
});

test('malformed maps and unrelated metadata cannot reserve names, while anonymous duplicates still share resources',()=>{
    const transparent=image(0,'myTiles.transparency4','Transparent');
    const input=project([map([transparent,anonymous]),{...map([transparent,named]),columns:0}]);
    input.targets[0].reservedTileMetadata=[named];
    const exported=projectToArcade(input);
    assert.ok(exported.unsupported.some(message=>message.includes('valid fixed tile data')));
    const read=parseTileAssets(exported.files['tilemap.g.jres']);
    assert.deepEqual(Array.from(read['myTiles.tile1'].pixels),anonymous.pixels);
    assert.equal(read['myTiles.tile1_2'],undefined);
    const assets=new TileAssetExporter();assets.reserve([named]);
    const first=assets.register(anonymous,1);
    assert.equal(assets.register(structuredClone(anonymous),1),first);
    assert.equal(assets.entries.size,1);
});
