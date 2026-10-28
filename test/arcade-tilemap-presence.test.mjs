import assert from 'node:assert/strict';
import test from 'node:test';
import {imageToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {findTilemapBlocks,createTilemap,tilemapText} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-editor.js';
import {hasTilemapBlocks} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-presence.js';
const target=(blocks={},isOriginal=true)=>({id:'stage',isOriginal,getName:()=> 'Stage',blocks:{_blocks:blocks}});
const vm=(...targets)=>({runtime:{targets}});
const command=(opcode,inputs={})=>({id:'command',opcode,inputs});
const text=(value)=>({id:'text',opcode:'text',fields:{TEXT:{value}}});
const cases=[['nullVM',null],['emptyVM',{}],['noTargets',vm()],['noBlocks',vm(target())],['unrelated',vm(target({x:command('arcade_tileLocation')}))]];
for(const opcode of ['arcade_setTilemap','arcade_setLegacyTilemap']){
 cases.push([`${opcode}:missingInput`,vm(target({command:command(opcode)}))]);
 cases.push([`${opcode}:computed`,vm(target({command:command(opcode,{DATA:{block:'dynamic',shadow:'text'},IMAGE:{block:'dynamic',shadow:'text'},SCALE:{block:'dynamic',shadow:'text'}}),dynamic:command('data_variable'),text:text('malformed')}))]);
 cases.push([`${opcode}:cloneOnly`,vm(target({command:command(opcode)},false))]);
 cases.push([`${opcode}:undefinedOriginal`,vm({...target({command:command(opcode)}),isOriginal:undefined})]);
 cases.push([`${opcode}:laterTarget`,vm(target(),target({command:command(opcode)}))]);
}
for(const value of ['null','{bad','',tilemapText(createTilemap({columns:1,rows:1,tileSize:4}))])cases.push([`modern:literal:${value.slice(0,12)}`,vm(target({command:command('arcade_setTilemap',{DATA:{block:'text',shadow:'text'}}),text:text(value)}))]);
cases.push(['legacy:literalScaleComputedImage',vm(target({command:command('arcade_setLegacyTilemap',{SCALE:{block:'text',shadow:'text'}}),text:text('4')}))]);
cases.push(['mixedCloneAndOriginal',vm(target({command:command('arcade_setTilemap')},false),target({command:command('arcade_setLegacyTilemap')}))]);
const legacyBlocks={command:command('arcade_setLegacyTilemap',{IMAGE:{block:'image'},SCALE:{block:'scale',shadow:'scale'}}),scale:{id:'scale',opcode:'math_number',fields:{NUM:{value:4}}},image:{id:'image',opcode:'arcade_frameImage',inputs:{}}};
for(const [field,value] of Object.entries({TEMPLATE:'hero',KEY:'frame',INDEX:0,START:0,COUNT:1})){
 const id=`value${field}`;legacyBlocks.image.inputs[field]={block:id,shadow:id};legacyBlocks[id]={...text(value),id};
}
const art={...target(),id:'art',getName:()=> 'hero',getCostumes:()=>[{name:'layout',assetId:'owned',dataFormat:'svg',asset:{assetId:'owned',decodeText:()=>imageToSvg({width:2,height:2,pixels:[1,2,3,4]})}}]};
cases.push(['legacy:validArtwork',vm(target(legacyBlocks),art)]);
cases.push(['bothModernAndLegacy',vm(target({modern:command('arcade_setTilemap'),legacy:command('arcade_setLegacyTilemap')}))]);
cases.push(['missingBlocksContainer',vm({id:'noBlocks',isOriginal:true,getName:()=> 'Stage'})]);
for (const [name,input] of cases) test(`tilemap presence matches existing editor discovery: ${name}`,()=>{
    const refs=findTilemapBlocks(input);
    assert.equal(hasTilemapBlocks(input),refs.length>0);
    if(name==='legacy:validArtwork')assert.equal(refs.filter(ref=>ref.editable).length,1);
});
test('presence does not invoke artwork callbacks or decode map data',()=>{
    const expensive=vm(target({command:command('arcade_setLegacyTilemap')}));
    Object.defineProperty(expensive.runtime.targets[0],'getCostumes',{get(){throw Error('presence must not decode art');}});
    assert.equal(hasTilemapBlocks(expensive),true);
});
