import test from 'node:test';
import assert from 'node:assert/strict';
import {MULTIPLAYER_STATE_SOURCE as source} from './fixtures/arcade-multiplayer-state.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const dependencies={device:'*',multiplayer:'*'};
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('numeric player state, global key allocation, Info backing and scene references agree with original PXT across roundtrips',async()=>{
 const expected=await runPxtArcade(source,{dependencies});
 const names=['key','otherKey','empty','custom','independent','observedScore','sharedScore','observedLife','sharedLife','nanKey','infiniteKey','nullKey','undefinedKey','undefinedValue','missing','allocated','next','fresh','oldCustom','activeScore','restoredScore','restoredCustom'];
 assert.equal(expected.key,2);assert.equal(expected.otherKey,3);assert.equal(expected.custom,7.75);assert.equal(expected.observedScore,12);assert.equal(expected.sharedScore,15);assert.equal(expected.observedLife,9);assert.equal(expected.sharedLife,8);assert.equal(expected.nanKey,0);assert.equal(expected.nullKey,21);assert.equal(expected.undefinedKey,0);assert.equal(expected.undefinedValue,true);assert.equal(expected.allocated,4);assert.equal(expected.next,5);assert.equal(expected.activeScore,41);assert.equal(expected.restoredScore,15);
 const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:5,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const native=await runPxtArcade(exported.files);for(const name of names)assert.equal(native[name],expected[name],name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,5);check(run);
 const state=run.vm.runtime.bwArcadeDeviceState;state.controllerButtons[2]={a:true};run.vm.runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',2,'a',true);await stepFrames(run.vm,3);
 assert.equal(values(run).custom,9.75);assert.equal(values(run).sharedScore,16);assert.equal(Object.values(state.sprites)[0].x,49.75);
});
test('invalid state arity, shadowed namespace and arbitrary data remain named',()=>{
 for(const source of ['namespace MultiplayerState {export const score=6}', 'let mp=1;mp.setPlayerState(null,2,3)', 'mp.getPlayerState(null)','mp.setPlayerState(null,2)','mp.changePlayerStateBy(null,2)','MultiplayerState.create(1)','let MultiplayerState=1;let key=MultiplayerState.create()','let MultiplayerState=1;let key=MultiplayerState.score','let p=mp.playerSelector(1);let data=p.data'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});
