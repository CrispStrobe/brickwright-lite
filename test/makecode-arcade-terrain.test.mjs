import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {TERRAIN_CONTACT_SOURCE} from './fixtures/arcade-terrain.mjs';
const names=['before','blockedX','blockedVx','contactRight','contactLeft','contactTop','contactBottom','throughProcedure','terrainDone'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const remaining=['full terrain collision physics and scene lifecycle are not yet supported'];

test('wall contact is actual physics state across Code/SB3 and executed original/exported PXT',async()=>{
    const expected=await runPxtArcade(TERRAIN_CONTACT_SOURCE,{waitForGlobals:{terrainDone:true}});
    assert.equal(expected.blockedX,31);assert.equal(expected.blockedVx,0);assert.equal(expected.contactRight,true);assert.equal(expected.before,false);
    const check=run=>{const actual=values(run);for(const name of names)assert.equal(actual[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,remaining);const run=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(TERRAIN_CONTACT_SOURCE),run=await execute(imported);
    const blocks=run.creator.project.targets.flatMap(t=>Object.values(t.blocks));assert.ok(blocks.some(b=>b.opcode==='arcade_isHittingTile'));
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/isHittingTile\(/);assert.match(exported.ts,/function (?:Game_)?touching[^\n]*Sprite[^\n]*number[^\n]*boolean/);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{terrainDone:true}});for(const name of names)assert.equal(again[name],expected[name],name+' in executed export');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,80);check(run);
});
