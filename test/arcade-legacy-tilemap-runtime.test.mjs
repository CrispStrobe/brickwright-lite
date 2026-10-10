import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
test('legacy tile definitions and live map pixels feed opaque-hitbox wall collision',async()=>{
 const expected=await runPxtArcade(`let mapImage=img\`0 0 2 0
0 0 2 0
0 0 2 0
0 0 2 0\`
scene.setTileMap(mapImage,TileScale.Eight)
scene.setTile(2,img\`2\`,true)
let actor=sprites.create(img\`3\`,SpriteKind.Player)
actor.setPosition(12,12)
actor.vx=20
actor.x=16
let contactX=actor.x
let contactVx=actor.vx
let hit=actor.isHittingTile(CollisionDirection.Right)
mapImage.setPixel(2,1,0)
actor.x=16
let openX=actor.x
scene.setTileMap(null)
actor.x=20
let clearX=actor.x`,{dependencies:{device:'*','color-coded-tilemap':'*'}});
 const runtime=new EventEmitter(),ext=new Arcade(runtime);
 const pixels=Uint8Array.from(Array.from({length:16},(_,i)=>i%4===2?2:0));
 const map=ext._imageHandle({width:4,height:4,pixels});ext.setLegacyTilemap({IMAGE:map,SCALE:3});
 const tile=ext._imageHandle({width:1,height:1,pixels:Uint8Array.of(2)});ext.setLegacyTile({INDEX:2,IMAGE:tile,WALL:true});
 const image=ext._imageHandle({width:1,height:1,pixels:Uint8Array.of(3)}),actor=ext.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'});
 ext.setSpritePosition({ID:actor,X:12,Y:12});ext.setSpriteProperty({ID:actor,PROPERTY:'vx',VALUE:20});ext.setSpriteProperty({ID:actor,PROPERTY:'x',VALUE:16});
 assert.equal(ext.spriteProperty({ID:actor,PROPERTY:'x'}),expected.contactX);assert.equal(ext.spriteProperty({ID:actor,PROPERTY:'vx'}),expected.contactVx);assert.equal(ext.isHittingTile({ID:actor,DIRECTION:2}),expected.hit);
 ext.setImagePixel({IMAGE:map,X:2,Y:1,COLOR:0});ext.setSpriteProperty({ID:actor,PROPERTY:'x',VALUE:16});assert.equal(ext.spriteProperty({ID:actor,PROPERTY:'x'}),expected.openX);
 ext.setLegacyTilemap({IMAGE:null,SCALE:4});ext.setSpriteProperty({ID:actor,PROPERTY:'x',VALUE:20});assert.equal(ext.spriteProperty({ID:actor,PROPERTY:'x'}),expected.clearX);
});
