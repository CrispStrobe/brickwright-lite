import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const setup=`scene.setBackgroundColor(9)
let actor=sprites.create(img\`2\`,SpriteKind.Player)
actor.setPosition(80,60)
`;
const capture=`
pause(60)
let raster=""
let digits="0123456789abcdef"
for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
`;
const invoke=(run,opcode,args={})=>run.vm.runtime.getOpcodeFunction('arcade_'+opcode)(args,{});
for(const method of ['sayText','say'])test(method+' expires in a suspended parent using global time, matching original PXT',async()=>{
 const source=setup+`actor.${method}("Hello",500)\n`;
 const original=await runPxtArcade(source+'game.pushScene()\npause(700)\ngame.popScene()\n'+capture);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:2,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);
 const parent=run.vm.runtime.bwArcadeDeviceState;
 assert.equal(Object.keys(parent.speech).length,1);
 const parentTime=parent.elapsedMs;
 await invoke(run,'pushScene');await stepFrames(run.vm,21);
 assert.equal(parent.elapsedMs,parentTime,'parent frame clock remains suspended');
 await invoke(run,'popScene');await stepFrames(run.vm,1);
 assert.deepEqual(parent.speech,{});
 assert.deepEqual([...parent.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
});

test('a child created later receives a deadline in global time and expires after subsequent scene suspension',()=>{
 const Arcade=loadExtensionClass('arcade'),ext=new Arcade(stubRuntime());
 ext._advance(1);
 ext.pushScene({});
 const actor=ext.spawnSprite({KIND:'Player',X:80,Y:60,WIDTH:1,HEIGHT:1});
 ext.spriteSay({ID:actor,TEXT:'Child',DURATION:500,ANIMATED:false,FOREGROUND:2,BACKGROUND:5,MODE:'text'});
 assert.equal(ext._state().elapsedMs || 0,0);
 assert.equal(ext._state().speech[actor].end,1500);
 const child=ext._state();
 ext.pushScene({});ext._advance(.6);ext.popScene({});ext._advance(.01);
 assert.equal(child.elapsedMs,10);assert.deepEqual(child.speech,{});
});

test('short scene suspension retains the modern speech pixels, matching original PXT',async()=>{
 const source=setup+'actor.sayText("Hello",2000,false,2,0)\n';
 const original=await runPxtArcade(source+'game.pushScene()\npause(100)\ngame.popScene()\n'+capture);
 const imported=arcadeToPseudocode(source);const run=await runProgram(imported.code,{frames:2,uploads:imported.costumes,storage:true});
 const parent=run.vm.runtime.bwArcadeDeviceState;
 await invoke(run,'pushScene');await stepFrames(run.vm,3);await invoke(run,'popScene');await stepFrames(run.vm,1);
 assert.equal(Object.keys(parent.speech).length,1);
 assert.deepEqual([...parent.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 assert.deepEqual(run.errors,[]);
});
