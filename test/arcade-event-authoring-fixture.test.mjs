import test from 'node:test';import assert from 'node:assert/strict';
import {eventAuthoringFiles,eventSample} from './fixtures/arcade-event-authoring-game.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
test('owned real GUI event fixture imports into editable matching handler/wait/player blocks',()=>{
 for(const options of [{},{value:2,player:3,message:'PLAY'}]) {
  const files=eventAuthoringFiles(options),translated=arcadeToPseudocode(files);assert.deepEqual(translated.unsupported,[]);assert.deepEqual(translated.warnings,[]);
  const creator=new SB3Creator();creator.parse(translated.code);assert.deepEqual(creator.warnings,[]);
  const blocks=creator.project.targets.flatMap(t=>Object.values(t.blocks)),types=blocks.map(b=>b.opcode);
  for(const op of ['allocateControlEventSource','registerControlEvent','whenRegisteredControlEvent','raiseControlEvent','waitControlEvent','setControllerConnected','registerMultiplayerConnection','whenRegisteredMultiplayerConnection'])assert.ok(types.includes('arcade_'+op),op);
  const setter=blocks.find(b=>b.opcode==='arcade_setControllerConnected');assert.deepEqual(setter.fields.PLAYER,[String(options.player??2),null]);assert.equal(setter.inputs.PLAYER,undefined);
  const code=creator.decompile(),again=new SB3Creator();again.parse(code);assert.deepEqual(again.warnings,[]);assert.equal(again.decompile(),code);
  assert.equal(eventSample({...options,pressed:true}).connectionPlayer,options.player??2);
 }
});
