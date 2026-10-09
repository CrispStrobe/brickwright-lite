import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
function fixture(){const runtime=new EventEmitter();runtime.startHats=()=>[];const arcade=new Arcade(runtime);return {runtime,arcade};}
test('boolean question guards first 500 ms and requires released A/B before confirming',async()=>{
 const {runtime,arcade}=fixture();let settled=false;
 const answer=arcade.ask({TITLE:'Continue?',SUBTITLE:'A/B'}).then(value=>{settled=true;return value;});
 runtime.emit('ARCADE_DIALOG_BUTTON_EDGE','a',true);runtime.emit('ARCADE_FRAME',500);
 await Promise.resolve();assert.equal(settled,false,'a held through guard cannot accept');
 runtime.emit('ARCADE_BUTTON_DOWN','left');assert.equal(runtime.bwArcadeDialogOpen,true);
 runtime.emit('ARCADE_DIALOG_BUTTON_EDGE','a',false);runtime.emit('ARCADE_FRAME',30);
 runtime.emit('ARCADE_DIALOG_BUTTON_EDGE','a',true);runtime.emit('ARCADE_FRAME',30);
 assert.equal(await answer,true);assert.equal(runtime.bwArcadeDialogOpen,false);
 const no=arcade.ask({TITLE:'Again?',SUBTITLE:''});runtime.emit('ARCADE_FRAME',500);
 runtime.emit('ARCADE_DIALOG_BUTTON_EDGE','b',true);runtime.emit('ARCADE_FRAME',30);assert.equal(await no,false);
});
test('dialog queue, explicit choices, stop and stale callbacks settle exactly once',async()=>{
 const {runtime,arcade}=fixture();const shown=[];runtime.on('ARCADE_DIALOG',d=>shown.push(d));
 const first=arcade.ask({TITLE:'First',SUBTITLE:''}),second=arcade.ask({TITLE:'Second',SUBTITLE:''});
 const old=shown[0];old.dismiss(true);assert.equal(runtime.bwArcadeDialogOpen,true);
 runtime.emit('ARCADE_FRAME',500);old.dismiss(false);assert.equal(await first,false);
 old.dismiss(true);assert.equal(shown.at(-1).title,'Second');
 runtime.emit('PROJECT_STOP_ALL');assert.equal(await second,false);assert.equal(runtime.bwArcadeDialogOpen,false);
});
for(const [button,expected] of [['a',true],['b',false]])test(`game.ask ${button} value preserves conditional, Code, SB3 and original-PXT export`,async()=>{
 const source='let before=true\nlet reply=game.ask("Play?","Choose A/B")\nlet branch=0\nif(reply){branch=1}else{branch=2}\nlet ready=true';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:5,storage:true});
 const value=name=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name.replace(/^(?:Game_)+/,'')===name)?.value;
 try{
  assert.equal(run.vm.runtime.bwArcadeDialogOpen,true);assert.notEqual(value('ready'),true);
  await stepFrames(run.vm,20);run.vm.runtime.emit('ARCADE_DIALOG_BUTTON_EDGE',button,true);await stepFrames(run.vm,12);
  assert.deepEqual(run.errors,[]);assert.equal(value('reply'),expected);assert.equal(value('branch'),expected?1:2);
  const code=run.creator.decompile();assert.match(code,/arcade ask yes/);
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/game\.ask\(/);
  const original=await runPxtArcade(source,{buttonActions:{steps:[{delay:650},{button:button==='a'?5:6,held:true}]}});
  const actual=await runPxtArcade(exported.files,{waitForGlobals:{ready:true},buttonActions:{steps:[{delay:650},{button:button==='a'?5:6,held:true}]}});
  assert.equal(original.reply,expected);assert.equal(actual.reply,expected);assert.equal(actual.branch,original.branch);
  const back=arcadeToPseudocode(exported.files);assert.deepEqual(back.unsupported,[]);
  const codeRun=await runProgram(code,{frames:5});await stepFrames(codeRun.vm,20);
  codeRun.vm.runtime.emit('ARCADE_DIALOG_BUTTON_EDGE',button,true);await stepFrames(codeRun.vm,12);
  assert.deepEqual(codeRun.errors,[]);assert.equal(codeRun.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name.replace(/^(?:Game_)+/,'')==='reply')?.value,expected);
  const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,20);
  run.vm.runtime.emit('ARCADE_DIALOG_BUTTON_EDGE',button,true);await stepFrames(run.vm,12);assert.equal(value('reply'),expected);
 }finally{clearStrayTimers();}
});

test('discarded questions execute and reserve a private consumer without clobbering source variables',async()=>{
 const imported=arcadeToPseudocode('let __bwDiscardedQuestion1=42\ngame.ask("Continue?")\nlet ready=true');
 assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/set __bwDiscardedQuestion2 to arcade ask yes/);
 const run=await runProgram(imported.code,{frames:5,storage:true});try{
  assert.equal(run.vm.runtime.bwArcadeDialogOpen,true);await stepFrames(run.vm,20);
  run.vm.runtime.emit('ARCADE_DIALOG_BUTTON_EDGE','b',true);await stepFrames(run.vm,10);assert.deepEqual(run.errors,[]);
  const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));
  assert.equal(vars.find(v=>v.name.replace(/^(?:Game_)+/,'')==='__bwDiscardedQuestion1')?.value,42);
 }finally{clearStrayTimers();}
});

test('queued questions sample current held input and each starts its own guard',async()=>{
 const {runtime,arcade}=fixture();
 const first=arcade.ask({TITLE:'First',SUBTITLE:''}),second=arcade.ask({TITLE:'Second',SUBTITLE:''});
 runtime.emit('ARCADE_FRAME',500);arcade._state().buttons.a=true;runtime.emit('ARCADE_DIALOG_BUTTON_EDGE','a',true);runtime.emit('ARCADE_FRAME',30);
 assert.equal(await first,true);runtime.emit('ARCADE_FRAME',500);
 assert.equal(runtime.bwArcadeDialogOpen,true,'same held press cannot accept the next question');
 runtime.emit('ARCADE_DIALOG_BUTTON_EDGE','a',false);runtime.emit('ARCADE_FRAME',30);
 runtime.emit('ARCADE_DIALOG_BUTTON_EDGE','a',true);runtime.emit('ARCADE_FRAME',30);assert.equal(await second,true);
});

test('keyboard/controller input belongs to the question while scene updates are paused',async()=>{
 const {runtime,arcade}=fixture();let callbacks=0,updates=0;
 arcade._inst._controllerButtonCallbacks=function*(){callbacks++;};
 arcade._inst._advanceFrameSteps=function*(){updates++;};
 const reply=arcade.ask({TITLE:'Continue?',SUBTITLE:''});
 runtime.emit('ARCADE_FRAME',500);assert.equal(updates,0);
 runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',2,'a',true);runtime.emit('ARCADE_FRAME',30);
 assert.equal(runtime.bwArcadeDialogOpen,true);assert.equal(callbacks,0);
 runtime.emit('KEY_STATE_CHANGED','Z',true);runtime.emit('ARCADE_FRAME',30);
 assert.equal(await reply,false);assert.equal(callbacks,0);assert.equal(updates,1);
 runtime.emit('KEY_STATE_CHANGED','Z',false);assert.equal(callbacks,1,'normal handlers resume after the modal');
});

test('dialog readiness publishes a new snapshot so pure UI consumers can enable choices',async()=>{
 const {runtime,arcade}=fixture(),shown=[];runtime.on('ARCADE_DIALOG',dialog=>shown.push(dialog));
 const answer=arcade.ask({TITLE:'Continue?',SUBTITLE:''});
 const initial=shown[0];assert.equal(initial.elapsed,0);
 runtime.emit('ARCADE_FRAME',500);const ready=shown.at(-1);
 assert.notStrictEqual(ready,initial,'a pure stage container must observe new dialog identity');
 assert.equal(initial.elapsed,0,'prior UI snapshots retain their displayed guard state');
 assert.equal(ready.elapsed,500);
 initial.dismiss(true);assert.equal(await answer,true,'callbacks retain the live queue authority');
 assert.equal(shown.at(-1),null);
});
