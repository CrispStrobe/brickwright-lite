import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const Arcade=loadExtensionClass('arcade');
// Template-clone Arcade sprites (no native drawable) must obey PXT z then
// creation order exactly like native drawables; Scratch clone creation order
// alone would leave the later clone in front regardless of z.
function fixture(){
 const runtime=new EventEmitter(),order=new Map();let nextOrder=0,nextDrawable=10;
 runtime.startHats=()=>[];runtime.requestRedraw=()=>{};
 runtime.renderer={createSVGSkin(){return 1;},updateSVGSkin(){},destroySkin(){},updateDrawableSkinId(){},updateDrawablePosition(){},
  setDrawableOrder(id,where,group){assert.equal(where,Infinity);assert.equal(group,'sprite');order.set(id,++nextOrder);},
  createDrawable(){return 900;},destroyDrawable(){},updateDrawableScale(){},updateDrawableVisible(){}};
 runtime.getSpriteTargetByName=()=>({makeClone(){const drawableID=nextDrawable++;order.set(drawableID,++nextOrder);
  return {drawableID,currentCostume:0,getCostumes:()=>[],setXY(){},setVisible(){},setSize(){},setCostume(){}};}});
 runtime.addTarget=()=>{};
 const arcade=new Arcade(runtime);
 const addSprite=kind=>arcade.createSprite({TEMPLATE:'t',KIND:kind,WIDTH:3,HEIGHT:3});
 const front=id=>{const state=arcade._state(),ids=Object.keys(state.sprites);
  return ids.reduce((a,b)=>order.get(state.spriteTargets[a].drawableID)>order.get(state.spriteTargets[b].drawableID)?a:b);};
 const render=()=>arcade._composeSceneFrame();
 return {arcade,addSprite,front,render};
}
test('template clones follow z across creation and later z changes',()=>{
 const f=fixture(),red=f.addSprite('Player'),yellow=f.addSprite('Enemy');
 assert.equal(f.front(),yellow,'equal z keeps creation order');
 f.arcade.setSpriteProperty({ID:red,PROPERTY:'z',VALUE:1});f.arcade.setSpriteProperty({ID:yellow,PROPERTY:'z',VALUE:0});
 f.render();
 assert.equal(f.front(),red);
 f.arcade.setSpriteProperty({ID:red,PROPERTY:'z',VALUE:-1});f.render();assert.equal(f.front(),yellow);
 f.arcade.setSpriteProperty({ID:red,PROPERTY:'z',VALUE:2});f.render();assert.equal(f.front(),red);
});
test('a clone created after a raised sprite stays behind it',()=>{
 const f=fixture(),red=f.addSprite('Player');f.arcade.setSpriteProperty({ID:red,PROPERTY:'z',VALUE:5});
 f.addSprite('Enemy');f.render();assert.equal(f.front(),red);
});
test('creation after a completed frame refreshes clone layers at the next render',()=>{
 const f=fixture(),red=f.addSprite('Player');
 f.arcade.setSpriteProperty({ID:red,PROPERTY:'z',VALUE:5});f.render();
 assert.equal(f.front(),red);
 f.addSprite('Enemy');f.render();assert.equal(f.front(),red);
});
test('renderable scene composition also refreshes clones created after a frame',()=>{
 const f=fixture(),state=f.arcade._state(),renderable={z:-20,id:100,draw(){}};
 f.arcade._inst._renderables.set(state,[renderable]);
 f.arcade._inst._sceneFlags.register(state,renderable);
 const render=()=>{for(const step of f.arcade._composeSceneSteps())assert.fail('non-yielding renderer unexpectedly yielded');};
 const red=f.addSprite('Player');
 f.arcade.setSpriteProperty({ID:red,PROPERTY:'z',VALUE:5});render();
 f.addSprite('Enemy');render();assert.equal(f.front(),red);
});
