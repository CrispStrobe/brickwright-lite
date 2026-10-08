import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const Arcade=loadExtensionClass('arcade');
test('state-key allocation is project-global and resets together with Player identity',()=>{
 const runtime=Object.assign(new EventEmitter(),stubRuntime());delete runtime.on;delete runtime.emit;
 const ext=new Arcade(runtime),player=ext.playerLookup({MODE:'number',VALUE:4});
 assert.equal(ext.createPlayerState(),2);ext.pushScene({});assert.equal(ext.createPlayerState(),3);ext.popScene({});assert.equal(ext.createPlayerState(),4);
 ext.setPlayerState({PLAYER:player,KEY:2,VALUE:6.5});assert.equal(ext.getPlayerState({PLAYER:player,KEY:2}),6.5);
 runtime.emit('PROJECT_START');assert.equal(ext.createPlayerState(),2);assert.equal(ext.getPlayerState({PLAYER:player,KEY:2}),0);
 const fresh=ext.playerLookup({MODE:'number',VALUE:4});assert.equal(ext.getPlayerState({PLAYER:fresh,KEY:2}),0);
});
