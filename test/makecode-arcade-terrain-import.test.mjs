import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {STATIC} from '../scripts/lib/pxt-node.mjs';

const setup='let actor=sprites.create(img`1`,SpriteKind.Player);';

test('wall-contact direction slots and cached-obstacle semantics follow the pinned sprite source',()=>{
    const target=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8'));
    const source=target.bundledpkgs.game['sprite.ts'];
    assert.match(source,/enum CollisionDirection\s*\{[\s\S]*?Left = 0,[\s\S]*?Top = 1,[\s\S]*?Right = 2,[\s\S]*?Bottom = 3/);
    assert.match(source,/isHittingTile\(direction: CollisionDirection\): boolean\s*\{\s*return this\._obstacles && !!this\._obstacles\[direction\]/);
    const events=target.bundledpkgs.game['spriteevents.ts'];
    assert.match(events,/onHitWall\(kind: number, handler: \(sprite: Sprite, location: tiles\.Location\) => void\)/);
    assert.match(events,/onOverlapTile\(kind: number, tile: Image, handler: \(sprite: Sprite, location: tiles\.Location\) => void\)/);
});

test('all four cached wall contacts become native boolean reporters, including a stored direction',()=>{
    const result=arcadeToPseudocode(setup+`
let left=actor.isHittingTile(CollisionDirection.Left)
let top=actor.isHittingTile(CollisionDirection.Top)
let right=actor.isHittingTile(CollisionDirection.Right)
let bottom=actor.isHittingTile(CollisionDirection.Bottom)
let direction=CollisionDirection.Bottom
let stored=actor.isHittingTile(direction)
if(actor.isHittingTile(CollisionDirection.Bottom)){actor.vy=-50}`);
    assert.deepEqual(result.unsupported,[]);
    for(const direction of [0,1,2,3])assert.match(result.code,new RegExp(`arcade sprite \\(actor\\) hitting wall \\(${direction}\\)`));
    assert.match(result.code,/set direction to 3/);
    assert.match(result.code,/arcade sprite \(actor\) hitting wall \(direction\)/);
    assert.match(result.code,/IF truthiness of value \(arcade sprite \(actor\) hitting wall \(3\)\) THEN:/);
});

test('sprite aliases, procedure parameters and collection entries retain native wall queries',()=>{
    const result=arcadeToPseudocode(setup+`
let alias=actor
let actors=sprites.allOfKind(SpriteKind.Player)
function blocked(sprite:Sprite,direction:number){return sprite.isHittingTile(direction)}
let aliasContact=alias.isHittingTile(CollisionDirection.Left)
let itemContact=actors[0].isHittingTile(CollisionDirection.Right)
let argumentContact=blocked(actor,CollisionDirection.Bottom)`);
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade sprite \(alias\) hitting wall \(0\)/);
    assert.match(result.code,/arcade sprite \(item .+ of array reference \(actors\)\) hitting wall \(2\)/);
    assert.match(result.code,/arcade sprite \(sprite\) hitting wall \(arcade local direction\)/);
});

test('computed sprite receivers and directions are each emitted once in evaluation order',()=>{
    const result=arcadeToPseudocode(setup+`
function owner(){return actor}
function direction(){return 2}
let contact=owner().isHittingTile(direction())`);
    assert.deepEqual(result.unsupported,[]);
    const line=result.code.split('\n').find(line=>line.includes('set contact to'));
    assert.equal((line.match(/arcade call function "owner"/g)||[]).length,1);
    assert.equal((line.match(/arcade call function "direction"/g)||[]).length,1);
    assert.ok(line.indexOf('"owner"')<line.indexOf('"direction"'));
});

test('invalid receivers, arities and unknown directions keep named diagnostics',()=>{
    for(const source of [
        setup+'let x=actor.isHittingTile()',
        setup+'let x=actor.isHittingTile(0,1)',
        'let actor=12;let x=actor.isHittingTile(CollisionDirection.Left)',
        setup+'let x=actor.isHittingTile(CollisionDirection.Center)'
    ]) {
        const result=arcadeToPseudocode(source);
        assert.ok(result.unsupported.some(gap=>/isHittingTile|CollisionDirection\.Center/.test(gap)),source);
        assert.doesNotMatch(result.code,/hitting wall \(/);
    }
});

test('the shipped platformer wall queries lower while pending terrain and event features remain explicit',async()=>{
    const {files}=await unpackMakeCodeSource(fs.readFileSync(new URL('./fixtures/makecode/arcade-tilemap.hex',import.meta.url)));
    const result=arcadeToPseudocode(files);
    assert.ok(result.code.includes('hitting wall (3)'));
    assert.ok(!result.unsupported.some(gap=>gap.includes('isHittingTile')));
    assert.ok(result.unsupported.some(gap=>gap.includes('terrain collision physics and scene lifecycle')));
    assert.match(result.code,/arcade register tile kind/);
    assert.ok(!result.unsupported.some(gap=>gap.includes('synchronous handler mutation ordering')));
    const events=arcadeToPseudocode(setup+`scene.onHitWall(SpriteKind.Player,function(sprite,location){sprite.x=10});scene.onOverlapTile(SpriteKind.Player,img\`2\`,function(sprite,location){sprite.y=20})`);
    assert.match(events.code,/WHEN arcade wall handler/);
    assert.match(events.code,/WHEN arcade tile handler/);
    assert.deepEqual(events.unsupported,[]);
});


test('DestroyOnWall imports as a real flag; camera-relative sprites retain a scoped limitation',()=>{
    const wall=arcadeToPseudocode(setup+'actor.setFlag(SpriteFlag.DestroyOnWall,true)');
    assert.deepEqual(wall.unsupported,[]);
    assert.match(wall.code,/arcade set flag DestroyOnWall of actor to \(0 < 1\)/);
    const camera=arcadeToPseudocode(setup+'actor.setFlag(SpriteFlag.RelativeToCamera,true)');
    assert.ok(!camera.unsupported.some(gap=>gap.includes('RelativeToCamera')));
    assert.match(camera.code,/arcade set flag RelativeToCamera/);
});
