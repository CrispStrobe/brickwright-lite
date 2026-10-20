import test from 'node:test';
import assert from 'node:assert/strict';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const Arcade=loadExtensionClass('arcade');
const setup=()=>{const runtime=stubRuntime(),ext=new Arcade(runtime)._inst,events=[];ext._registeredCallbackSteps=function*(registrations,opcode,event){events.push(...registrations.map(r=>({token:r.token,opcode,player:event.player})));};return {runtime,ext,events};};
const register=(ext,token,event=2049)=>ext.registerMultiplayerButtonHandler({BUTTON:0,EVENT:event,TOKEN:token,CAPTURES:''});
const dispatch=(ext,player,event)=>[...ext._controllerButtonCallbacks(player,'a',event)];
test('multiplayer slot installation/replacement, direct override and player identity survive scenes',()=>{
 const {ext,events}=setup();register(ext,'old');ext.registerButtonHandler({BUTTON:'A',EVENT:2049,TOKEN:'direct',CAPTURES:''});register(ext,'new');
 dispatch(ext,1,2049);dispatch(ext,2,2049);assert.deepEqual(events.map(e=>e.token),['direct','new']);
 const parent=ext.playerLookup({MODE:'number',VALUE:2});assert.strictEqual(events[1].player,parent);
 ext.pushScene({});register(ext,'child');dispatch(ext,2,2049);assert.notStrictEqual(events.at(-1).player,parent);
 ext.popScene({});dispatch(ext,2,2049);assert.strictEqual(events.at(-1).player,parent);assert.equal(events.at(-1).token,'new');
});
test('independent press/release states, short taps and default repeat boundaries follow PXT',async()=>{
 const {ext,events}=setup();for(const event of [2049,2048,2054])register(ext,String(event),event);
 // Control events enqueue their callbacks. Drain the real continuation queue
 // without advancing controller time or replacing its dispatch implementation.
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const frame=async()=>{[...ext._sceneButtons(1/30)];await settle();};
 ext._state().controllerButtons[3]={a:true};await frame();assert.equal(events.at(-1).token,'2049');
 for(let i=0;i<15;i++)await frame();assert.equal(events.length,1);
 await frame();assert.equal(events.at(-1).token,'2054');
 ext._state().controllerButtons[3].a=false;await frame();assert.equal(events.at(-1).token,'2048');
 const before=events.length;ext._controllerButtonEdge(4,'a',true);ext._controllerButtonEdge(4,'a',false);await settle();assert.deepEqual(events.slice(before).map(e=>e.token),['2049','2048']);
 await frame();assert.equal(events.length,before+2);
 const player=ext.playerLookup({MODE:'number',VALUE:3});assert.equal(ext.playerButtonPressed({PLAYER:player,BUTTON:0}),false);
 ext._state().controllerButtons[3].a=true;assert.equal(ext.playerButtonPressed({PLAYER:player,BUTTON:0}),true);
 assert.equal(ext.playerButtonPressed({PLAYER:'missing',BUTTON:0}),false);
 assert.throws(()=>ext.playerButtonPressed({PLAYER:player,BUTTON:null}),TypeError);
 assert.throws(()=>ext.registerMultiplayerButtonHandler({BUTTON:99,EVENT:2049}),TypeError);
});
