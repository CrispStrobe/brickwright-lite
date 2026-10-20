import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {BUILTIN_IMAGES} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-builtin-images.js';
import {decodeMkcdImage} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
const builtin='sprites.dungeon.greenOuterNorthWest';
const factory=`namespace myTiles { helpers._registerFactory("tilemap",function(name:string){switch(name){case "level":return tiles.createTilemap(hex\`0100010000\`,img\`0\`,[${builtin}],TileScale.Sixteen)}return null})}`;
const imported=files=>arcadeToPseudocode({'main.ts':'tiles.setTilemap(tilemap`level`)','tilemap.g.ts':factory,'pxt.json':JSON.stringify({files:['main.ts','tilemap.g.ts']}),...files});
const tileData=translation=>{
    const line=translation.code.split('\n').find(line=>line.trim().startsWith('arcade set tilemap data '));
    assert.ok(line,translation.code);return JSON.parse(JSON.parse(line.trim().slice('arcade set tilemap data '.length)));
};
test('generated tilemap factories resolve original builtin tile pixels without replacement art',()=>{
    const result=imported();assert.deepEqual(result.unsupported,[]);
    const expected=decodeMkcdImage(BUILTIN_IMAGES[builtin]);
    assert.ok(expected);assert.deepEqual(tileData(result).images[0],{width:expected.width,height:expected.height,pixels:Array.from(expected.pixels)});
});
test('project tile assets precede builtin fallback and unknown builtin names remain diagnostics',()=>{
    const replacement=decodeMkcdImage(BUILTIN_IMAGES['sprites.dungeon.greenOuterSouthEast']);
    const result=imported({'override.jres':JSON.stringify({'sprites.dungeon.greenOuterNorthWest':{mimeType:'image/x-mkcd-f4',data:BUILTIN_IMAGES['sprites.dungeon.greenOuterSouthEast']}})});
    assert.deepEqual(result.unsupported,[]);assert.deepEqual(tileData(result).images[0].pixels,Array.from(replacement.pixels));
    const bad=imported({'tilemap.g.ts':factory.replace(builtin,'sprites.dungeon.noSuchTile')});assert.ok(bad.unsupported.some(gap=>gap.includes('readable literal tile map')));
});
