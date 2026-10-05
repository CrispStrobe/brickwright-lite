import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {STATIC} from '../scripts/lib/pxt-node.mjs';

const setup='let actor=sprites.create(img`1`,SpriteKind.Player);';

test('camera enum and follow cancellation match the pinned Arcade source',()=>{
    const target=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8'));
    const source=target.bundledpkgs.game['scenes.ts'];
    const members=source.match(/enum CameraProperty\s*\{([^}]+)\}/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(value=>value.trim()).filter(Boolean);
    assert.deepEqual(members,['X','Y','Left','Right','Top','Bottom']);
    assert.match(source,/centerCameraAt\(x: number, y: number\)\s*\{[\s\S]*?scene\.camera\.sprite = undefined/);
    assert.match(source,/cameraFollowSprite\(sprite: Sprite\)\s*\{[\s\S]*?scene\.camera\.sprite = sprite;\s*scene\.camera\.update\(\)/);
    assert.match(source,/cameraProperty\(property: CameraProperty\): number/);
});

test('all six properties and stored or computed numeric selectors become native reporters',()=>{
    const members=['X','Y','Left','Right','Top','Bottom'];
    const result=arcadeToPseudocode(members.map((name,index)=>`let edge${index}=scene.cameraProperty(CameraProperty.${name})`).join(';')+';let selector=CameraProperty.Bottom;let stored=scene.cameraProperty(selector);let unknown=scene.cameraProperty(99)');
    assert.deepEqual(result.unsupported,[]);
    for(let index=0;index<6;index++)assert.ok(result.code.includes(`arcade camera property (${index})`));
    assert.match(result.code,/set selector to 5/);
    assert.match(result.code,/arcade camera property \(selector\)/);
    assert.match(result.code,/arcade camera property \(99\)/);
});

test('camera-only programs select the native route and allow literal or proven scoped null',()=>{
    const result=arcadeToPseudocode('scene.centerCameraAt(80,60);scene.cameraFollowSprite(null);let target:Sprite=null;let alias=target;scene.cameraFollowSprite(alias)');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/SPRITE Game:/);
    assert.match(result.code,/arcade center camera x \(80\) y \(60\)/);
    assert.match(result.code,/arcade camera follow sprite \(null value\)/);
    assert.match(result.code,/arcade camera follow sprite \(alias\)/);
});

test('typed sprite aliases, procedure results and array items remain valid camera targets',()=>{
    const result=arcadeToPseudocode(setup+'let alias=actor;let actors=sprites.allOfKind(SpriteKind.Player);function owner(){return actor}scene.cameraFollowSprite(alias);scene.cameraFollowSprite(actors[0]);scene.cameraFollowSprite(owner())');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade camera follow sprite \(alias\)/);
    assert.match(result.code,/arcade camera follow sprite \(item .+ of array reference \(actors\)\)/);
    assert.match(result.code,/arcade camera follow sprite \(\(arcade call function "owner"/);
});

test('camera operands are emitted once and preserve their evaluation order',()=>{
    const result=arcadeToPseudocode(setup+'function owner(){return actor}function select(){return 2}function horizontal(){return 80}function vertical(){return 60}scene.centerCameraAt(horizontal(),vertical());scene.cameraFollowSprite(owner());let edge=scene.cameraProperty(select())');
    assert.deepEqual(result.unsupported,[]);
    for(const name of ['horizontal','vertical','owner','select'])assert.equal((result.code.match(new RegExp(`arcade call function "${name}"`,'g'))||[]).length,1);
    const center=result.code.split('\n').find(line=>line.includes('arcade center camera'));
    assert.ok(center.indexOf('"horizontal"')<center.indexOf('"vertical"'));
});

test('invalid arities, non-sprite targets and unknown enum members keep named gaps',()=>{
    for(const [source,gap] of [
        ['scene.centerCameraAt(80)','centerCameraAt'],
        ['scene.centerCameraAt(80,60,0)','centerCameraAt'],
        ['scene.cameraFollowSprite()','cameraFollowSprite'],
        [setup+'scene.cameraFollowSprite(actor,null)','cameraFollowSprite'],
        ['let edge=scene.cameraProperty()','cameraProperty'],
        ['let edge=scene.cameraProperty(0,1)','cameraProperty'],
        ['let edge=scene.cameraProperty(CameraProperty.Center)','CameraProperty.Center'],
        ['let target=12;scene.cameraFollowSprite(target)','typed sprite'],
        ['let target=null;target=12;scene.cameraFollowSprite(target)','typed sprite']
    ])assert.ok(arcadeToPseudocode(source).unsupported.some(note=>note.includes(gap)),source);
});

test('null inference respects procedure scopes and does not authorize unrelated same-name numbers',()=>{
    const result=arcadeToPseudocode('function clear(){let target=null;scene.cameraFollowSprite(target)}function bad(){let target=12;scene.cameraFollowSprite(target)}clear();bad()');
    assert.equal(result.unsupported.filter(note=>note.includes('typed sprite')).length,1);
    assert.equal((result.code.match(/arcade camera follow sprite/g)||[]).length,1);
    assert.match(result.code,/arcade camera follow sprite \(arcade local target\)/);
});

test('shake remains explicit while verified camera-relative positioning emits native flags',()=>{
    const shake=arcadeToPseudocode('scene.cameraShake(4,500);scene.centerCameraAt(80,60)');
    assert.ok(shake.unsupported.some(note=>note.includes('cameraShake')));
    const relative=arcadeToPseudocode(setup+'actor.setFlag(SpriteFlag.RelativeToCamera,true);scene.cameraFollowSprite(actor)');
    assert.ok(!relative.unsupported.some(note=>note.includes('RelativeToCamera')));
    assert.match(relative.code,/arcade set flag RelativeToCamera/);
});

test('shadowed CameraProperty bindings are not silently replaced with SDK enum numbers',()=>{
    for(const source of ['let CameraProperty=9;let edge=scene.cameraProperty(CameraProperty.X)', 'function edge(CameraProperty:number){return scene.cameraProperty(CameraProperty.X)}let value=edge(9)']) {
        const result=arcadeToPseudocode(source);
        assert.ok(result.unsupported.some(note=>note.includes('shadowed CameraProperty')));
        assert.doesNotMatch(result.code,/arcade camera property \(0\)/);
    }
});
