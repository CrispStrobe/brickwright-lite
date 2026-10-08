import test from 'node:test';
import assert from 'node:assert/strict';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const Arcade=loadExtensionClass('arcade');
const make=()=>{const runtime=stubRuntime(),ext=new Arcade(runtime),state=ext._state();const a={id:'a',vx:0,vy:17},b={id:'b',vx:0,vy:0};state.sprites={a,b};return {runtime,ext,state,a,b};};
test('per-controller bindings preserve disabled axes, shared-sprite order, release and scene isolation',()=>{
 const {runtime,ext,state,a,b}=make();
 ext._controlSprite(1,'a',100,0);ext._controlSprite(2,'a',60,60);
 state.buttons={right:true};state.controllerButtons={2:{left:true,up:true}};
 ext._moveControlledSprites([a,b]);assert.equal(a.vx,-181*60/256);assert.equal(a.vy,-181*60/256);
 state.controllerButtons[2]={};ext._moveControlledSprites([a,b]);assert.equal(a.vx,0);assert.equal(a.vy,0);
 ext._stopControllingSprite(2,'a');ext._moveControlledSprites([a,b]);assert.equal(a.vx,100);
 ext._controlSprite(1,'a',0,0);assert.equal(a.vx,0);a.vx=22;ext._moveControlledSprites([a,b]);assert.equal(a.vx,22);
 // Scene bindings belong to the active world; physical inputs remain shared.
 runtime.bwArcadeDeviceState={sprites:{a,b},buttons:state.buttons,controllerButtons:state.controllerButtons};
 ext._moveControlledSprites([a,b]);assert.equal(a.vx,22);
 runtime.bwArcadeDeviceState=state;ext._controlSprite(2,'b',undefined,undefined);
 state.controllerButtons[2]={right:true,left:true,down:true};ext._moveControlledSprites([a,b]);assert.equal(b.vx,0);assert.equal(b.vy,100);
 ext._moveControlledSprites([a]);assert.equal(state.controlledSprites[2].length,0);
});
test('player movement defaults, missing players and deferred sprite assignment preserve bindings',()=>{
 const {ext,state,a,b}=make(),player=ext.playerLookup({MODE:'number',VALUE:3});
 ext.movePlayerWithButtons({PLAYER:player,VX:undefined,VY:0});ext.setPlayerSprite({PLAYER:player,ID:'a'});
 state.controllerButtons={3:{right:true}};ext._moveControlledSprites([a,b]);assert.equal(a.vx,100);assert.equal(a.vy,17);
 ext.setPlayerSprite({PLAYER:player,ID:'b'});ext._moveControlledSprites([a,b]);assert.equal(a.vx,100);assert.equal(b.vx,100);
 ext.movePlayerWithButtons({PLAYER:player,VX:0,VY:0});assert.equal(b.vx,0);
 ext.movePlayerWithButtons({PLAYER:'missing',VX:90,VY:90});assert.equal(state.controlledSprites[3].length,1);
 ext.setPlayerSprite({PLAYER:player,ID:null});assert.equal(state.controlledSprites[3].length,0);
});
