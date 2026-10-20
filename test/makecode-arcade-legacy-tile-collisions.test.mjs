import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {LEGACY_TILE_COLLISIONS_SOURCE as source} from './fixtures/arcade-legacy-tile-collisions.mjs';
const names=['firstFilter','secondFilter','order','count','hitBefore','nullHit','hitDuring','hitAfterEdit','sawVelocity','returned','finalX','hitAfter','childHits','childIndex','parentBeforeController'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('legacy collision filters/order, captures, yielding, snapshot indices and scenes match PXT through all roundtrips',async()=>{
 const expected=await runPxtArcade(source,{dependencies:{device:'*','color-coded-tilemap':'*'}});
 assert.equal(expected.firstFilter,'ABF');assert.equal(expected.secondFilter,'ABFABLF');assert.equal(expected.order,'ABC');assert.equal(expected.count,12);assert.equal(expected.hitDuring,2);assert.equal(expected.hitAfterEdit,2);assert.equal(expected.nullHit,0);assert.equal(expected.hitBefore,-1);assert.equal(expected.childHits,1);assert.equal(expected.parentBeforeController,0);
 const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:60,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/scene.onHitTile/);assert.match(exported.ts,/scene.tileHitFrom/);
 const native=await runPxtArcade(exported.files);for(const name of names)assert.equal(native[name],expected[name],name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,60);check(run);
 const state=run.vm.runtime.bwArcadeDeviceState;state.buttons.a=true;run.vm.runtime.emit('ARCADE_BUTTON_EDGE','a',true);await stepFrames(run.vm,30);
 assert.equal(values(run).order,'ABCABC');assert.equal(values(run).count,25);assert.equal(values(run).parentSceneHits,1);
});

test('invalid legacy callback arity, unknown receivers and shadowed scene bindings remain diagnosed',()=>{
 for(const source of ['scene.onHitTile(SpriteKind.Player,2,function(a,b){})','scene.onHitTile(SpriteKind.Player,function(a){})','scene.tileHitFrom(null)','let scene=1;scene.tileHitFrom(null,2)','let scene=1;scene.onHitTile(SpriteKind.Player,2,function(s){})','let x=1;let value=x.tileHitFrom(2)'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});
