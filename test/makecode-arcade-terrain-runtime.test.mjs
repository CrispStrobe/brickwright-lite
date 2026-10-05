import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
function game({transparent=false,blank=false,tileSize=8,walls=Array.from({length:16},(_,i)=>i%4===2?1:0)}={}){
    const runtime=new EventEmitter(),arcade=new Arcade(runtime);
    arcade.setTilemap({DATA:JSON.stringify({columns:4,rows:4,tileSize,indices:Array(16).fill(0),walls,images:[{width:1,height:1,pixels:[0]}]})});
    const image=arcade.createImage({WIDTH:transparent||blank?3:1,HEIGHT:transparent||blank?3:1});if(!blank)arcade.drawImage({IMAGE:image,OP:'fillRect',X:transparent?1:0,Y:transparent?1:0,W:1,H:1,COLOR:2});
    const actor=arcade.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'});arcade.setSpritePosition({ID:actor,X:tileSize*1.5,Y:tileSize*1.5});
    const property=name=>arcade.spriteProperty({ID:actor,PROPERTY:name});
    const set=(name,value)=>arcade.setSpriteProperty({ID:actor,PROPERTY:name,VALUE:value});
    const hit=direction=>arcade.isHittingTile({ID:actor,DIRECTION:direction});return {runtime,arcade,actor,image,property,set,hit};
}
test('explicit small moves use opaque hitbox and preserve directional contacts until velocity motion clears them',async()=>{
    const expected=await runPxtArcade(`tiles.setTilemap(tiles.createTilemap(hex\`0400040000000000000000000000000000000000\`,img\`0 0 2 0
0 0 2 0
0 0 2 0
0 0 2 0\`,[img\`0\`],TileScale.Eight))
let actor=sprites.create(img\`0 0 0
0 2 0
0 0 0\`,SpriteKind.Player)
actor.setPosition(12,12)
actor.vx=20
actor.x=16
let opaqueX=actor.x
let stoppedVelocity=actor.vx
let right=actor.isHittingTile(CollisionDirection.Right)
let left=actor.isHittingTile(CollisionDirection.Left)
actor.x=12
let contactAfterReposition=actor.isHittingTile(CollisionDirection.Right)`);
    const g=game({transparent:true});g.set('vx',20);g.set('x',16);
    assert.equal(g.property('x'),expected.opaqueX);assert.equal(g.property('vx'),expected.stoppedVelocity);assert.equal(g.hit(2),expected.right);assert.equal(g.hit(0),expected.left);
    g.set('x',12);assert.equal(g.hit(2),expected.contactAfterReposition);
    g.set('vx',-20);g.arcade._advance(.033);assert.equal(g.hit(2),false,'moving next frame clears prior obstacle cache');
});
test('substeps stop high-speed movement at walls and retain stopped contacts',()=>{
    const g=game();g.set('vx',500);g.arcade._advance(.1);
    assert.equal(g.property('x'),15.5);assert.equal(g.property('vx'),0);assert.equal(g.hit(2),true);
    g.arcade._advance(.1);assert.equal(g.property('x'),15.5);assert.equal(g.hit(2),true);
});
test('ghost through tiles still collides with walls; wall ghost and camera-relative sprites cross them',()=>{
    const tiles=game();tiles.arcade.setSpriteFlag({ID:tiles.actor,FLAG:'GhostThroughTiles',ON:true});tiles.set('vx',100);tiles.arcade._advance(.1);assert.equal(tiles.property('x'),15.5);
    for(const flag of ['GhostThroughWalls','Ghost','RelativeToCamera']){
        const g=game();g.arcade.setSpriteFlag({ID:g.actor,FLAG:flag,ON:true});g.set('vx',100);g.arcade._advance(.1);assert.equal(g.property('x'),22,flag);assert.equal(g.hit(2),false,flag);
    }
});
test('bounce uses remaining movement and DestroyOnWall removes the collided sprite',()=>{
    const bounce=game();bounce.arcade.setSpriteFlag({ID:bounce.actor,FLAG:'BounceOnWall',ON:true});bounce.set('vx',100);bounce.arcade._advance(.1);
    assert.equal(bounce.property('vx'),-100);assert.equal(bounce.property('x'),15.5,'original engine preserves the contact position within this frame');assert.equal(bounce.hit(2),true);
    const destroyed=game();destroyed.arcade.setSpriteFlag({ID:destroyed.actor,FLAG:'DestroyOnWall',ON:true});destroyed.set('vx',100);destroyed.arcade._advance(.1);assert.equal(destroyed.arcade.spriteCount({KIND:'Player'}),0);
});
test('outside-map bounds are walls and teleports can clear persistent clipping',()=>{
    const g=game();g.set('x',-20);g.set('vx',100);g.arcade._advance(.1);assert.equal(g.property('x'),-10,'initial clipping allows free motion');
    g.set('x',4);g.set('vx',-100);g.arcade._advance(.1);assert.equal(g.property('x'),.5);assert.equal(g.hit(0),true);
});


test('top and bottom explicit contacts match original PXT with transparent borders',async()=>{
    const expected=await runPxtArcade(`tiles.setTilemap(tiles.createTilemap(hex\`0400040000000000000000000000000000000000\`,img\`2 2 2 2
0 0 0 0
2 2 2 2
0 0 0 0\`,[img\`0\`],TileScale.Eight))
let actor=sprites.create(img\`0 0 0
0 2 0
0 0 0\`,SpriteKind.Player)
actor.setPosition(12,12)
actor.vy=20
actor.y=16
let bottomY=actor.y
let bottomVelocity=actor.vy
let bottomContact=actor.isHittingTile(CollisionDirection.Bottom)
actor.y=12
actor.vy=-20
actor.y=8
let topY=actor.y
let topVelocity=actor.vy
let topContact=actor.isHittingTile(CollisionDirection.Top)`);
    const g=game({transparent:true,walls:Array.from({length:16},(_,i)=>Math.floor(i/4)===0 || Math.floor(i/4)===2?1:0)});
    g.set('vy',20);g.set('y',16);assert.equal(g.property('y'),expected.bottomY);assert.equal(g.property('vy'),expected.bottomVelocity);assert.equal(g.hit(3),expected.bottomContact);
    g.set('y',12);g.set('vy',-20);g.set('y',8);assert.equal(g.property('y'),expected.topY);assert.equal(g.property('vy'),expected.topVelocity);assert.equal(g.hit(1),expected.topContact);
});
test('wall geometry respects 4, 16 and 32 pixel tile scales on both axes',()=>{
    for(const tileSize of [4,16,32]){
        const horizontal=game({tileSize});horizontal.set('vx',500);horizontal.arcade._advance(.1);assert.equal(horizontal.property('x'),tileSize*2-.5,'right boundary '+tileSize);assert.equal(horizontal.hit(2),true);
        const vertical=game({tileSize,walls:Array.from({length:16},(_,i)=>Math.floor(i/4)===2?1:0)});vertical.set('vy',500);vertical.arcade._advance(.1);assert.equal(vertical.property('y'),tileSize*2-.5,'bottom boundary '+tileSize);assert.equal(vertical.hit(3),true);
    }
});
test('fully transparent images match the original engine hitbox behavior',async()=>{
    const expected=await runPxtArcade(`tiles.setTilemap(tiles.createTilemap(hex\`0400040000000000000000000000000000000000\`,img\`0 0 2 0
0 0 2 0
0 0 2 0
0 0 2 0\`,[img\`0\`],TileScale.Eight))
let blank=sprites.create(image.create(3,3),SpriteKind.Player)
blank.setPosition(12,12)
blank.vx=20
blank.x=16
let blankX=blank.x
let blankVelocity=blank.vx
let blankContact=blank.isHittingTile(CollisionDirection.Right)`);
    const g=game({blank:true});g.set('vx',20);g.set('x',16);assert.equal(g.property('x'),expected.blankX);assert.equal(g.property('vx'),expected.blankVelocity);assert.equal(g.hit(2),expected.blankContact);
});

test('large placement deep in a wall preserves position and clipping until escape',()=>{
    const g=game();g.arcade.setSpritePosition({ID:g.actor,X:20,Y:12});assert.equal(g.property('x'),20,'half-pixel hitbox edges round before clipping offsets');
    g.set('vx',20);g.arcade._advance(.1);assert.equal(g.property('x'),22,'deep clipping permits free escape rather than jumping sideways');
    g.arcade.setSpritePosition({ID:g.actor,X:12,Y:12});g.set('vx',100);g.arcade._advance(.1);assert.equal(g.property('x'),15.5,'teleport outside wall clears clipping');
});

test('velocity motion clears cached contacts after the map is removed',()=>{
    const g=game();g.set('vx',100);g.arcade._advance(.1);assert.equal(g.hit(2),true);
    g.arcade.setTilemap({DATA:'null'});g.set('vx',-20);g.arcade._advance(.033);assert.equal(g.hit(2),false);
});
