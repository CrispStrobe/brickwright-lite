import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {LEGACY_TILE_VALUES_SOURCE as source} from './fixtures/arcade-legacy-tile-values.mjs';
const dependencies={device:'*','color-coded-tilemap':'*'};
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('legacy Tile identities, lists, owning maps and placement match original PXT across native/export/SB3',async()=>{
 const expected=await runPxtArcade(source,{dependencies});
 const names=['sceneOrder','methodOrder','sumX','pickedMember','empty','emptyX','count','firstX','firstY','secondX','secondY','thirdX','thirdY','fourthX','fourthY','fresh','freshList','freshElement','invalidCount','fractionalCount','retainedIndex','changedIndex','changedPixel','afterInvalid','outsideIndex','placedX','placedY','methodX','methodY','randomX','randomY','noMatchX','noMatchY','childRetainedX','childRetainedY','childPixel','originalRetainedIndex','restoredIndex','rescaledX','replacedIndex','disabledX','placementBefore','editBefore'];
 assert.equal(expected.sceneOrder,12);assert.equal(expected.methodOrder,12);assert.equal(expected.sumX,40);assert.equal(expected.pickedMember,true);assert.equal(expected.count,4);assert.equal(expected.fourthX,20);assert.equal(expected.fourthY,4);assert.equal(expected.childPixel,6);assert.equal(expected.originalRetainedIndex,4);assert.equal(expected.rescaledX,10);assert.equal(expected.disabledX,20);
 const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:24,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 assert.match(exported.ts,/tiles\.Tile\[\]/);assert.match(exported.ts,/tiles\.Tile/);assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['color-coded-tilemap'],'*');
 const native=await runPxtArcade(exported.files);for(const name of names)assert.equal(native[name],expected[name],name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,24);check(run);
 const state=run.vm.runtime.bwArcadeDeviceState;state.buttons.a=true;run.vm.runtime.emit('ARCADE_BUTTON_EDGE','a',true);await stepFrames(run.vm,3);
 assert.equal(state.tilemap.indices[2],9);assert.equal(Object.values(state.sprites)[0].x,11);
});
test('legacy Tile invalid arities, unknown properties, shadowing and mixed-map mutation remain diagnosed',()=>{
 for(const source of ['scene.getTile(0)','scene.getTilesByType()','scene.setTileAt(scene.getTile(0,0))','scene.place(null)','scene.placeOnRandomTile(null)','let scene=1;scene.getTile(0,0)','let scene=1;scene.getTilesByType(1)','let t=scene.getTile(0,0);let x=t.column','scene.getTile(0,0);tiles.setTilemap(null)'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});
