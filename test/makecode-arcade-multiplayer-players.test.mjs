import test from 'node:test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {MULTIPLAYER_PLAYERS_SOURCE as source} from './fixtures/arcade-multiplayer-players.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const dependencies={device:'*',multiplayer:'*'};
test('scene-local player identities, properties, sprite references and arrays agree with original PXT across roundtrips',async()=>{
 const expected=await runPxtArcade(source,{dependencies});
 await fs.writeFile('artifacts/arcade-multiplayer-players-oracle.json',JSON.stringify(expected,null,2)+'\n');
 const names=['count','same','absent','invalid','fractional','nullIndex','nanIndex','infiniteIndex','missingOwner','reverse','observedX','number','index','fourth','nested','copied','cleared','nullOwner','invalidProperty','distinct','oldSprite','newEmpty','restored'];
 assert.equal(expected.count,4);assert.equal(expected.number,3);assert.equal(expected.index,1);assert.equal(expected.fourth,4);assert.equal(expected.copied,4);assert.equal(expected.invalidProperty,0);
 for(const name of ['same','absent','invalid','fractional','nullIndex','nanIndex','infiniteIndex','missingOwner','reverse','nested','cleared','nullOwner','distinct','oldSprite','newEmpty','restored'])assert.equal(expected[name],true,name);
 const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:180,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 assert.equal(JSON.parse(exported.files['pxt.json']).dependencies.multiplayer,'*');assert.match(exported.ts,/mp\.Player/);
 await fs.writeFile('artifacts/arcade-multiplayer-players-debug-export.ts',exported.ts);
 const native=await runPxtArcade(exported.files);for(const name of names)assert.equal(native[name],expected[name],name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,180);check(run);
});
test('multiplayer events and unsupported player members remain named gaps',()=>{
 for(const source of ['mp.onButtonEvent(mp.MultiplayerButton.A,ControllerButtonEvent.Pressed,function(p){})','let p=mp.playerSelector(mp.PlayerNumber.One);let value=p.data'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});


test('shadowed mp bindings and player member writes remain explicit',()=>{
 for(const source of [
 'function choose(mp:number){return mp.playerSelector(1)}let p=choose(3)',
 'let mp=1;let p=mp.playerSelector(1)',
 'let mp=1;mp.setPlayerSprite(null,null)',
 'let mp=1;let n=mp.PlayerNumber.One',
 'let p=mp.playerSelector(mp.PlayerNumber.One);p.number=3'
 ])assert.ok(arcadeToPseudocode(source).unsupported.some(x=>/shadowed|member support/.test(x)),source);
});


test('unknown multiplayer enum members stay named instead of becoming variables',()=>{
 for(const source of ['let p=mp.playerSelector(mp.PlayerNumber.Five)','let p=mp.playerSelector(mp.PlayerNumber.One);let n=mp.getPlayerProperty(p,mp.PlayerProperty.Missing)'])assert.ok(arcadeToPseudocode(source).unsupported.some(x=>x.includes('not a declared multiplayer enum member')),source);
});
