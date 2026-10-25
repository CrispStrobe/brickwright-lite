import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runTimedArcadeProgram,restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {bundledExtensionIds,loadExtensionClass,probeExtension,stubRuntime} from './helpers/bw-extensions.mjs';
import {FRICTION_VALUES_SOURCE,FRICTION_MOTION_SOURCE} from './fixtures/arcade-friction.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
async function verify(source,names,done,{milliseconds}={}){
    const expected=await runPxtArcade(source,{waitForGlobals:{[done]:true}});
    const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const options={uploads:imported.costumes,storage:true};const run=milliseconds===undefined?await runProgram(imported.code,{...options,frames:300}):await runTimedArcadeProgram(imported.code,{...options,milliseconds});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    const properties=run.creator.project.targets.flatMap(target=>Object.values(target.blocks)).filter(block=>['arcade_setSpriteProperty','arcade_spriteProperty'].includes(block.opcode)).map(block=>block.fields.PROPERTY[0]);
    assert.ok(properties.includes('fx'));assert.ok(properties.includes('fy'));
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/\.fx/);assert.match(exported.ts,/\.fy/);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{[done]:true}});for(const name of names)assert.equal(again[name],expected[name],name+' in exported PXT');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));if(milliseconds===undefined){run.vm.greenFlag();await stepFrames(run.vm,300);}else await restartTimedArcadeRun(run,milliseconds);check(run);
    return {expected,exported};
}
test('friction values, computed receivers, typed numeric returns and retained sprites match original across all paths',async()=>{
    const {expected,exported}=await verify(FRICTION_VALUES_SOURCE,['negativeClamp','fractionalFy','compoundFx','incrementFy','receiverCalls','amountCalls','numericProcedure','aliasFx','suspendedFy','restoredFy','frictionValuesDone'],'frictionValuesDone');
    assert.equal(expected.fractionalFy,315/256);assert.equal(expected.incrementFy,571/256);
    assert.match(exported.ts,/function (?:Game_)?friction[^\n]*Sprite[^\n]*number/);
});
test('friction stops both axes and acceleration overrides friction through Code/SB3 and executed PXT export',async()=>{
    const {expected}=await verify(FRICTION_MOTION_SOURCE,['horizontalStopped','verticalStopped','horizontalMoved','verticalMoved','accelerationOverridesFriction','horizontalFriction','verticalFriction','frictionMotionDone'],'frictionMotionDone',{milliseconds:2000});
    assert.equal(expected.horizontalStopped,true);assert.equal(expected.verticalStopped,true);assert.equal(expected.accelerationOverridesFriction,true);
});
test('Blocks expose both friction axes through the existing real sprite property menu',()=>{
    const probe=probeExtension(loadExtensionClass(bundledExtensionIds().get('arcade')),stubRuntime());
    assert.equal(probe.error,null);
    const info=probe.instance.getInfo();assert.ok(info.menus.spriteProperties.items.includes('fx'));assert.ok(info.menus.spriteProperties.items.includes('fy'));
});

// Pause continuations and physical updates share the same actual timer platform.
test('native friction motion completes real pause deadlines across editable routes',async()=>{
    const names=['horizontalStopped','verticalStopped','horizontalMoved','verticalMoved','accelerationOverridesFriction','horizontalFriction','verticalFriction','frictionMotionDone'];
    const expected=[true,true,true,true,true,200,200,true];
    const runs=[];
    const check=run=>{
        assert.deepEqual(names.map(name=>values(run)[name]),expected);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runTimedArcadeProgram(imported.code,{milliseconds:2000,uploads:imported.costumes,storage:true});
        runs.push(run);check(run);return run;
    };
    try{
        const imported=arcadeToPseudocode(FRICTION_MOTION_SOURCE);
        const run=await execute(imported);
        await execute({...imported,code:run.creator.decompile()});
        const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported,[]);
        await execute(arcadeToPseudocode(exported.files));
        const sb3=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(sb3);await restartTimedArcadeRun(run,2000);check(run);
        const fresh=await execute(imported);
        await fresh.vm.loadProject(sb3);await restartTimedArcadeRun(fresh,2000);check(fresh);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
