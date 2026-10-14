import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {cameraMap} from './fixtures/arcade-camera.mjs';
const Arcade=loadExtensionClass('arcade');
const BW=createRequire(import.meta.url)(`${VM_SRC}/util/bw-values`);
function game(){const runtime=new EventEmitter(),arcade=new Arcade(runtime);return {runtime,arcade};}
function actor(a,w,h,color=5){const image=a.createImage({WIDTH:w,HEIGHT:h});a.drawImage({IMAGE:image,OP:'fillRect',X:0,Y:0,W:w,H:h,COLOR:color});return a.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'});}
const value=(a,id,p)=>a.spriteProperty({ID:id,PROPERTY:p});
function map(a){a.setTilemap({DATA:JSON.stringify({columns:64,rows:48,tileSize:8,indices:Array(3072).fill(0),walls:Array(3072).fill(0),images:[{width:1,height:1,pixels:[0]}]})});}
test('original camera rendering, viewport lifecycle and opaque edge clamp',async()=>{
 const expected=await runPxtArcade(`${cameraMap()}
let hero=sprites.create(image.create(4,8),SpriteKind.Player)
hero.image.fill(5)
hero.setPosition(200.75,100.25)
let hud=sprites.create(image.create(2,2),SpriteKind.Food)
hud.image.fill(9)
hud.setFlag(SpriteFlag.RelativeToCamera,true)
hud.setPosition(10.75,10.25)
scene.cameraFollowSprite(hero)
game.currentScene().render()
let cameraX=scene.cameraProperty(CameraProperty.X)
let cameraY=scene.cameraProperty(CameraProperty.Y)
let heroPixel=screen.getPixel(78,58)
let hudPixel=screen.getPixel(9,9)
let heroOutside=screen.getPixel(77,58)
let tilePixel=screen.getPixel(84,60)
let off=sprites.create(img\`2\`,SpriteKind.Projectile)
off.setPosition(10,10)
off.setFlag(SpriteFlag.AutoDestroy,true)
let visible=sprites.create(img\`2\`,SpriteKind.Projectile)
visible.setPosition(200,100)
visible.setFlag(SpriteFlag.AutoDestroy,true)
game.currentScene().camera.update()
off.__update(game.currentScene().camera,0)
visible.__update(game.currentScene().camera,0)
let liveProjectiles=sprites.allOfKind(SpriteKind.Projectile).length
let edge=sprites.create(img\`0 0 0
0 2 0
0 0 0\`,SpriteKind.Enemy)
edge.setPosition(110,100)
edge.setFlag(SpriteFlag.StayInScreen,true)
game.currentScene().physicsEngine.move(0.01)
let edgeX=edge.x
scene.cameraFollowSprite(null)
scene.centerCameraAt(-10.25,30.75)
let retainedWorldX=hero.x
let cameraRuntimeDone=liveProjectiles===1`);
 const {arcade:a}=game();map(a);const hero=actor(a,4,8);a.setSpritePosition({ID:hero,X:200.75,Y:100.25});const hud=actor(a,2,2,9);a.setSpriteFlag({ID:hud,FLAG:'RelativeToCamera',ON:true});a.setSpritePosition({ID:hud,X:10.75,Y:10.25});a.cameraFollowSprite({ID:hero});
 assert.equal(a.cameraProperty({PROPERTY:0}),expected.cameraX);assert.equal(a.cameraProperty({PROPERTY:1}),expected.cameraY);
 assert.deepEqual(a._spriteViewPosition(a._sprite(hero)),{x:80,y:62});assert.deepEqual(a._spriteViewPosition(a._sprite(hud)),{x:10,y:10});assert.equal(expected.heroPixel,5);assert.equal(expected.hudPixel,9);assert.equal(expected.heroOutside,0);assert.equal(expected.tilePixel,2);
 a._state().tilemap.indices[12*64+25]=1;a._state().tilemap.images.push({width:8,height:8,pixels:new Uint8Array(64).fill(2)});a._renderTilemap();assert.equal(a._state().tilemap.image.pixels[60*160+84],expected.tilePixel);
 for(const [x,y] of [[10,10],[200,100]]){const id=actor(a,1,1,2);a.setSpriteKind({ID:id,KIND:'Projectile'});a.setSpritePosition({ID:id,X:x,Y:y});a.setSpriteFlag({ID:id,FLAG:'AutoDestroy',ON:true});}a._advance(.01);assert.equal(a.spriteCount({KIND:'Projectile'}),expected.liveProjectiles);
 const im=a.createImage({WIDTH:3,HEIGHT:3});a.drawImage({IMAGE:im,OP:'fillRect',X:1,Y:1,W:1,H:1,COLOR:2});const edge=a.createImageSprite({IMAGE:im,TEMPLATE:'',KIND:'Enemy'});a.setSpritePosition({ID:edge,X:110,Y:100});a.setSpriteFlag({ID:edge,FLAG:'StayInScreen',ON:true});a._advance(.01);assert.equal(value(a,edge,'x'),expected.edgeX);assert.equal(value(a,hero,'x'),expected.retainedWorldX);
});
test('camera cancellation, invalid selector, frame-only draw update and lifecycle reset',()=>{
 const {runtime,arcade:a}=game();const id=actor(a,4,8);a.setSpritePosition({ID:id,X:200,Y:100});a.cameraFollowSprite({ID:id});assert.equal(a.cameraProperty({PROPERTY:1}),98);
 a.cameraFollowSprite({ID:BW.encode(null)});a.setSpritePosition({ID:id,X:250,Y:150});assert.equal(a.cameraProperty({PROPERTY:0}),200);
 a.centerCameraAt({X:-10.25,Y:30.75});assert.equal(a.cameraProperty({PROPERTY:0}),-11);assert.equal(a.cameraProperty({PROPERTY:1}),30);assert.equal(a._camera().drawOffsetX,120,'centering does not redraw before a frame');assert.equal(BW.decode(a.cameraProperty({PROPERTY:99})),undefined);
 a._advance(.01);assert.equal(a._camera().drawOffsetX,-91);runtime.emit('PROJECT_START');assert.equal(a.cameraProperty({PROPERTY:0}),80);assert.equal(a.cameraProperty({PROPERTY:1}),60);
});
test('camera-relative and wall-ghost explicit large placement preserve original clipping semantics',async()=>{
 const expected=await runPxtArcade(`tiles.setTilemap(tiles.createTilemap(hex\`0400040000000000000000000000000000000000\`,img\`0 0 2 0
0 0 2 0
0 0 2 0
0 0 2 0\`,[img\`0\`],TileScale.Eight))
let hud=sprites.create(img\`2\`,SpriteKind.Player)
hud.setFlag(SpriteFlag.RelativeToCamera,true)
hud.setPosition(16,12)
let hudPlacement=hud.x
let ghost=sprites.create(img\`2\`,SpriteKind.Enemy)
ghost.setFlag(SpriteFlag.GhostThroughWalls,true)
ghost.setPosition(16,12)
let ghostPlacement=ghost.x`);
 const {arcade:a}=game();a.setTilemap({DATA:JSON.stringify({columns:4,rows:4,tileSize:8,indices:Array(16).fill(0),walls:Array.from({length:16},(_,i)=>i%4===2?1:0),images:[{width:1,height:1,pixels:[0]}]})});
 for(const [flag,key] of [['RelativeToCamera','hudPlacement'],['GhostThroughWalls','ghostPlacement']]){const id=actor(a,1,1,2);a.setSpriteFlag({ID:id,FLAG:flag,ON:true});a.setSpritePosition({ID:id,X:16,Y:12});assert.equal(value(a,id,'x'),expected[key],flag);}
});
