import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {bundledExtensionIds,loadExtensionClass,probeExtension,stubRuntime} from './helpers/bw-extensions.mjs';
import {PHYSICS_ENGINE_VALUES_SOURCE,PHYSICS_ENGINE_MEMBERSHIP_SOURCE} from './fixtures/arcade-physics-engine.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
async function verify(source,names,done){
    const expected=await runPxtArcade(source,{waitForGlobals:{[done]:true}});
    const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:250,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    const nativeOps=run.creator.project.targets.flatMap(target=>Object.values(target.blocks)).map(block=>block.opcode);
    assert.ok(nativeOps.includes('arcade_currentScene'));assert.ok(nativeOps.includes('arcade_createPhysicsEngine'));assert.ok(nativeOps.includes('arcade_setScenePhysicsEngine'));
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/as ArcadePhysicsEngine/);assert.match(exported.ts,/new ArcadePhysicsEngine\(/);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{[done]:true}});for(const name of names)assert.equal(again[name],expected[name],name+' in exported PXT');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,250);check(run);
    return {expected,exported};
}
test('real Scene/PhysicsEngine identity, defaults, property aliases, arrays and typed procedures roundtrip through all paths',async()=>{
    const {expected,exported}=await verify(PHYSICS_ENGINE_VALUES_SOURCE,['defaultSpeed','defaultMin','defaultMax','oneSpeed','oneMin','twoMax','explicitSpeed','explicitMin','explicitMax','roundedSpeed','roundedMin','roundedMax','receiverCalls','amountCalls','compoundSpeed','incrementMin','assignedSpeed','assignedIdentity','arrayIdentity','differentScene','hiddenAssigned','childUnchanged','restoredScene','restoredEngine','originalRestored','engineValuesDone'],'engineValuesDone');
    assert.equal(expected.defaultSpeed,500);assert.equal(expected.defaultMin,2);assert.equal(expected.defaultMax,4);assert.equal(expected.receiverCalls,1);assert.equal(expected.amountCalls,1);
    assert.match(exported.ts,/function (?:Game_)?engineOf[^\n]*scene\.Scene[^\n]*ArcadePhysicsEngine/);
    assert.match(exported.ts,/function (?:Game_)?speedOf[^\n]*ArcadePhysicsEngine[^\n]*number/);
    assert.match(exported.ts,/let engines: ArcadePhysicsEngine\[\]/);assert.match(exported.ts,/let scenes: scene\.Scene\[\]/);
});
test('engine replacement preserves membership, clamps existing engine movers, and restores suspended membership across all paths',async()=>{
    const {expected}=await verify(PHYSICS_ENGINE_MEMBERSHIP_SOURCE,['capped','replacementFrozen','replacementMoves','restoredFrozen','restoredMoves','engineMembershipDone'],'engineMembershipDone');
    for(const name of ['capped','replacementFrozen','replacementMoves','restoredFrozen','restoredMoves','engineMembershipDone'])assert.equal(expected[name],true,name);
});

test('Blocks expose real Scene/Engine identity and all three settings in their existing native menus',()=>{
    const probe=probeExtension(loadExtensionClass(bundledExtensionIds().get('arcade')),stubRuntime());
    assert.equal(probe.error,null);
    const info=probe.instance.getInfo();
    assert.deepEqual(info.menus.physicsEngineProperties.items,['maxSpeed','minStep','maxStep']);
    for(const name of ['currentScene','scenePhysicsEngine','createPhysicsEngine','physicsEngineProperty','setScenePhysicsEngine','setPhysicsEngineProperty'])assert.ok(info.blocks.some(block=>block.opcode===name),name);
});
