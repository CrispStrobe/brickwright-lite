import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const BWValues=createRequire(import.meta.url)(VM_SRC+'/util/bw-values');
const Arcade=loadExtensionClass('arcade');
function game(){
    const runtime=new EventEmitter(),arcade=new Arcade(runtime);
    const image=color=>{const value=arcade.createImage({WIDTH:1,HEIGHT:1});arcade.drawImage({IMAGE:value,OP:'fillRect',X:0,Y:0,W:1,H:1,COLOR:color});return value;};
    const red=image(2),blue=image(3),green=image(7),actor=arcade.createImageSprite({IMAGE:green,TEMPLATE:'',KIND:'Player'});
    const pixel=()=>arcade.spritePixel({ID:actor,X:0,Y:0});
    const frames=BWValues.arrayReference(runtime,[red,blue]);
    return {runtime,arcade,image,red,blue,green,actor,pixel,frames};
}
function legacy(g,action=7,interval=100){
    const animation=g.arcade.createAnimation({ACTION:action,INTERVAL:interval});
    g.arcade.addAnimationFrame({ANIMATION:animation,IMAGE:g.red});g.arcade.addAnimationFrame({ANIMATION:animation,IMAGE:g.blue});
    g.arcade.attachAnimation({ID:g.actor,ANIMATION:animation});g.arcade.setAnimationAction({ID:g.actor,ACTION:action});return animation;
}
test('legacy timers advance once per update, stay shared across attached sprites and preserve late frame writes',()=>{
    const g=game(),animation=legacy(g),a=g.arcade;
    const other=a.createImageSprite({IMAGE:g.green,TEMPLATE:'',KIND:'Food'});a.attachAnimation({ID:other,ANIMATION:animation});a.setAnimationAction({ID:other,ACTION:7});
    a._advance(.01);assert.equal(g.pixel(),3);assert.equal(a.spritePixel({ID:other,X:0,Y:0}),3);
    a._advance(.34);assert.equal(g.pixel(),2,'large dt advances one frame, rather than skipping three');
    a._advance(.01);assert.equal(g.pixel(),2);
    a.addAnimationFrame({ANIMATION:animation,IMAGE:g.green});
    assert.equal(a._image(a.animationProperty({ANIMATION:animation,PROPERTY:'image'})).pixels[0],7);
    a._advance(.01);assert.equal(g.pixel(),7,'adding after cycling writes at ++current index');
    a.destroySprite({ID:other});a._advance(.01);assert.equal(a._animation(animation).sprites.length,1);
});
test('modern playback retains mutable source arrays, restarts and preserves its nonloop endpoint',()=>{
    const g=game(),a=g.arcade;a.runImageAnimation({ID:g.actor,FRAMES:g.frames,INTERVAL:100,LOOP:false});
    a._advance(.05);assert.equal(g.pixel(),2);
    BWValues.arrayValue(g.runtime,g.frames)[1]=g.green;a._advance(.05);assert.equal(g.pixel(),7,'future frames read the live array');
    a._advance(.2);assert.equal(g.pixel(),7);
    a.setSpriteImage({ID:g.actor,IMAGE:g.blue});a._advance(.2);assert.equal(g.pixel(),3,'completed animation does not reapply endpoint');
    a.runImageAnimation({ID:g.actor,FRAMES:g.frames,INTERVAL:100,LOOP:true});a._advance(.05);assert.equal(g.pixel(),2,'starting replaces/restarts the animation');
    a._advance(.2);assert.equal(g.pixel(),2,'looping computes the absolute frame index');
});
test('zero intervals use 500ms, stop movement preserves image playback and stop image clears legacy action',()=>{
    const g=game(),a=g.arcade;legacy(g,7,1000000);
    a.runImageAnimation({ID:g.actor,FRAMES:g.frames,INTERVAL:0,LOOP:true});a._advance(.1);assert.equal(g.pixel(),2);
    a.stopAnimation({ID:g.actor,TYPE:2});a._advance(.4);assert.equal(g.pixel(),3);
    a.stopAnimation({ID:g.actor,TYPE:1});a.setSpriteImage({ID:g.actor,IMAGE:g.green});a._advance(.7);assert.equal(g.pixel(),7);
    assert.equal(a.spriteProperty({ID:g.actor,PROPERTY:'_action'}),-1);
});
test('legacy and modern libraries render in first-use registration order',()=>{
    const before=game();before.arcade.runImageAnimation({ID:before.actor,FRAMES:before.frames,INTERVAL:1000000,LOOP:true});legacy(before,7,1000000);before.arcade._advance(.03);assert.equal(before.pixel(),3,'legacy handler registered second wins');
    const after=game();legacy(after,7,1000000);after.arcade.runImageAnimation({ID:after.actor,FRAMES:after.frames,INTERVAL:1000000,LOOP:true});after.arcade._advance(.03);assert.equal(after.pixel(),2,'modern handler registered second wins');
});
test('animation block menus expose all implemented controls and references reject other projects',()=>{
    const g=game(),animation=legacy(g),other=game(),info=g.arcade.getInfo();
    for(const opcode of ['createAnimation','addAnimationFrame','attachAnimation','setAnimationAction','animationProperty','setAnimationInterval','runImageAnimation','stopAnimation'])assert.ok(info.blocks.some(block=>block.opcode===opcode),opcode);
    assert.deepEqual(info.menus.animationProperties.items,['image','action','interval']);
    assert.deepEqual(info.menus.animationTypes.items.map(item=>item.value),['0','1','2']);
    assert.equal(other.arcade._animation(animation),null);g.runtime.emit('PROJECT_START');assert.equal(g.arcade._animation(animation),null);
});
test('original PXT confirms modern-first rendering and stop-action semantics',async()=>{
    const actual=await runPxtArcade(`let red=img\`2\`
let blue=img\`3\`
let actor=sprites.create(img\`7\`,SpriteKind.Player)
animation.runImageAnimation(actor,[red,blue],1000000,true)
let animationSet=animation.createAnimation(7,1000000)
animationSet.addAnimationFrame(red)
animationSet.addAnimationFrame(blue)
animation.attachAnimation(actor,animationSet)
animation.setAction(actor,7)
pause(60)
let legacyWins=actor.image.getPixel(0,0)
animation.stopAnimation(animation.AnimationTypes.MovementAnimation,actor)
pause(60)
let movementStopPreserves=actor.image.getPixel(0,0)
animation.stopAnimation(animation.AnimationTypes.ImageAnimation,actor)
actor.setImage(img\`7\`)
pause(60)
let imageStopPreserves=actor.image.getPixel(0,0)`,{dependencies:{device:'*',animation:'*'}});
    assert.equal(actual.legacyWins,3);assert.equal(actual.movementStopPreserves,3);assert.equal(actual.imageStopPreserves,7);
});


test('legacy numeric getters preserve legal undefined and null arguments like PXT',async()=>{
    const expected=await runPxtArcade(`let missing=animation.createAnimation(undefined,undefined)
let missingAction=missing.getAction()===undefined
let missingInterval=missing.getInterval()===undefined
let empty=animation.createAnimation(null,null)
let nullAction=empty.getAction()===null
let nullInterval=empty.getInterval()===null
empty.setInterval(undefined)
let updatedMissing=empty.getInterval()===undefined`,{dependencies:{device:'*',animation:'*'}});
    const g=game(),a=g.arcade,missing=a.createAnimation({ACTION:BWValues.UNDEFINED,INTERVAL:BWValues.UNDEFINED}),empty=a.createAnimation({ACTION:null,INTERVAL:null});
    const get=(animation,property)=>BWValues.decode(a.animationProperty({ANIMATION:animation,PROPERTY:property}));
    assert.equal(get(missing,'action')===undefined,expected.missingAction);assert.equal(get(missing,'interval')===undefined,expected.missingInterval);
    assert.equal(get(empty,'action')===null,expected.nullAction);assert.equal(get(empty,'interval')===null,expected.nullInterval);
    a.setAnimationInterval({ANIMATION:empty,INTERVAL:BWValues.UNDEFINED});assert.equal(get(empty,'interval')===undefined,expected.updatedMissing);
});
