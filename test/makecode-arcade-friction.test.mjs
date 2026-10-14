import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {bundledExtensionIds,loadExtensionClass,probeExtension,stubRuntime} from './helpers/bw-extensions.mjs';
import {FRICTION_VALUES_SOURCE,FRICTION_MOTION_SOURCE} from './fixtures/arcade-friction.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
async function verify(source,names,done){
    const expected=await runPxtArcade(source,{waitForGlobals:{[done]:true}});
    const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:300,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    const properties=run.creator.project.targets.flatMap(target=>Object.values(target.blocks)).filter(block=>['arcade_setSpriteProperty','arcade_spriteProperty'].includes(block.opcode)).map(block=>block.fields.PROPERTY[0]);
    assert.ok(properties.includes('fx'));assert.ok(properties.includes('fy'));
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/\.fx/);assert.match(exported.ts,/\.fy/);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{[done]:true}});for(const name of names)assert.equal(again[name],expected[name],name+' in exported PXT');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,300);check(run);
    return {expected,exported};
}
test('friction values, computed receivers, typed numeric returns and retained sprites match original across all paths',async()=>{
    const {expected,exported}=await verify(FRICTION_VALUES_SOURCE,['negativeClamp','fractionalFy','compoundFx','incrementFy','receiverCalls','amountCalls','numericProcedure','aliasFx','suspendedFy','restoredFy','frictionValuesDone'],'frictionValuesDone');
    assert.equal(expected.fractionalFy,315/256);assert.equal(expected.incrementFy,571/256);
    assert.match(exported.ts,/function (?:Game_)?friction[^\n]*Sprite[^\n]*number/);
});
test('friction stops both axes and acceleration overrides friction through Code/SB3 and executed PXT export',async()=>{
    const {expected}=await verify(FRICTION_MOTION_SOURCE,['horizontalStopped','verticalStopped','horizontalMoved','verticalMoved','accelerationOverridesFriction','horizontalFriction','verticalFriction','frictionMotionDone'],'frictionMotionDone');
    assert.equal(expected.horizontalStopped,true);assert.equal(expected.verticalStopped,true);assert.equal(expected.accelerationOverridesFriction,true);
});
test('Blocks expose both friction axes through the existing real sprite property menu',()=>{
    const probe=probeExtension(loadExtensionClass(bundledExtensionIds().get('arcade')),stubRuntime());
    assert.equal(probe.error,null);
    const info=probe.instance.getInfo();assert.ok(info.menus.spriteProperties.items.includes('fx'));assert.ok(info.menus.spriteProperties.items.includes('fy'));
});
