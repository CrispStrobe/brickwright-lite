import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const capture=`
pause(60)
let raster=""
let digits="0123456789abcdef"
for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
let actorId=actor.id
let mapId=game.currentScene().tileMap.renderable.id
`;
const sprite=`let actor=sprites.create(img\`7 7 7
7 . 7
7 7 7\`,SpriteKind.Player)
actor.setPosition(2,2)
actor.z=-1
`;
const modern=`tiles.setTilemap(tiles.createTilemap(hex\`0200020001020201\`,img\`0 0
0 0\`,[img\`0\`,img\`2 .
. 2\`,img\`5\`],TileScale.Four))
`;
const legacy=`scene.setTile(1,img\`2 .
. 2\`,false)
scene.setTile(2,img\`5\`,false)
scene.setTileMap(img\`1 2
2 1\`,TileScale.Four)
`;
const wideColumns=48,wideRows=32;
const wideHex=[wideColumns,0,wideRows,0,...Array.from({length:wideColumns*wideRows},(_,i)=>1+(i%wideColumns+Math.floor(i/wideColumns))%2)].map(n=>n.toString(16).padStart(2,'0')).join('');
const wideWalls=Array.from({length:wideRows},()=>Array(wideColumns).fill('0').join(' ')).join('\n');
const wideMap=`tiles.setTilemap(tiles.createTilemap(hex\`${wideHex}\`,img\`${wideWalls}\`,[img\`0\`,img\`2 .\n. 2\`,img\`5\`],TileScale.Four))\n`;
const cases=[
 ['modern camera offset and padded art',wideMap+sprite+'scene.centerCameraAt(100,70)\nactor.setPosition(101.25,70.75)\nactor.z=0\n',false],
 ['modern tile allocated before tied sprite',modern+sprite,false],
 ['modern tile allocated after tied sprite',sprite+modern,false],
 ['modern sprite below tile z',modern+sprite+'actor.z=-2\n',false],
 ['modern sprite above tile z',modern+sprite+'actor.z=0\n',false],
 ['modern replacement retains renderable ID',modern+sprite+modern,false],
 ['modern clear preserves ID and background',modern+sprite+'tiles.setTilemap(null)\n',false],
 ['modern parent scene restores renderable identity',modern+sprite+'game.pushScene()\n'+modern+'game.popScene()\n',false],
 ['legacy tile allocated before tied sprite',legacy+sprite,true],
 ['legacy tile allocated after tied sprite',sprite+legacy,true],
 ['legacy replacement and scale preserves ID',legacy+sprite+'scene.setTileMap(img`2 1`,TileScale.Eight)\n',true],
 ['legacy clear preserves ID and background',legacy+sprite+'scene.setTileMap(null)\n',true],
];
for(const [name,source,isLegacy] of cases)test('indexed tile plane agrees with original PXT: '+name,async()=>{
 const original=await runPxtArcade('scene.setBackgroundColor(9)\n'+source+capture,{dependencies:isLegacy?{device:'*','color-coded-tilemap':'*'}:{device:'*'}});
 const imported=arcadeToPseudocode('scene.setBackgroundColor(9)\n'+source);
 assert.deepEqual([...new Set(imported.unsupported)],[]);
 const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);
 const state=run.vm.runtime.bwArcadeDeviceState;
 assert.equal(original.raster.length,160*120);
 assert.deepEqual([...state.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 assert.equal(state.tilemapRenderable.pxtId,original.mapId);assert.equal(Object.values(state.sprites)[0].pxtId,original.actorId);
 assert.deepEqual(state.sceneFrame.coverage,['background','tilemap','sprites','modernSpeech','particles']);assert.ok(!state.sceneFrame.remaining.includes('tilemap'));
});

test('legacy cached art and live map aliases remain exact across tile raster composition',async()=>{
 const source=`scene.setBackgroundColor(9)
let exact=image.create(4,4)
exact.fill(2)
let small=img\`5\`
let map=img\`1 2\`
scene.setTile(1,exact,false)
scene.setTile(2,small,false)
scene.setTileMap(map,TileScale.Four)
let actor=sprites.create(img\`7\`,SpriteKind.Player)
actor.setPosition(20,20)
pause(60)
exact.setPixel(0,0,8)
small.setPixel(0,0,9)
map.setPixel(0,0,2)
`;
 const original=await runPxtArcade(source+capture,{dependencies:{device:'*','color-coded-tilemap':'*'}});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:15,uploads:imported.costumes,storage:true});
 assert.deepEqual(run.errors,[]);assert.deepEqual([...run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 const frame=run.vm.runtime.bwArcadeDeviceState.sceneFrame,buffer=frame.pixels;await stepFrames(run.vm,2);assert.strictEqual(frame.pixels,buffer);
});
