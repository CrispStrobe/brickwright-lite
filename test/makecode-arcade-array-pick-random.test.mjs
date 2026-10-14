import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
import {ARRAY_PICK_RANDOM_SOURCE as source} from './fixtures/arcade-array-pick-random.mjs';
test('PXT array random method preserves types, references, empties and single receiver evaluation across roundtrips',async()=>{
 const expected=await runPxtArcade(source);
 assert.equal(expected.calls,1);assert.equal(expected.pixel,5);assert.equal(expected.observedX,41);assert.equal(expected.same,true);assert.equal(expected.missing,true);assert.equal(expected.length,2);assert.equal(expected.membership,40);
 const names=['calls','pixel','observedX','same','missing','text','number','length','membership'];
 const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:200,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const native=await runPxtArcade(exported.ts);for(const name of names)assert.equal(native[name],expected[name],name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,200);check(run);
});
test('non-array and wrong-arity random method calls retain explicit diagnostics',()=>{
 for(const source of ['let value=3;let chosen=value._pickRandom()','let values=[1];let chosen=values._pickRandom(2)'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});
