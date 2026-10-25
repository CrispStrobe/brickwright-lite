import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {CAMERA_SOURCE} from './fixtures/arcade-camera.mjs';
const names=['followX','followY','followLeft','followRight','followTop','followBottom','movedX','movedY','detachedX','detachedY','centeredX','centeredY','stillCentered','clampLeft','clampTop','clampRight','unknownIsUndefined','smallX','smallY','freeX','freeY','retainedHeroX','retainedHeroY','retainedHudX','retainedHudY','cameraDone'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('camera follows, centering, properties and clamps match original PXT through editable Code, SB3 and executed export',async()=>{
    const expected=await runPxtArcade(CAMERA_SOURCE,{waitForGlobals:{cameraDone:true}});
    assert.equal(expected.followX,200);assert.equal(expected.followY,98);assert.equal(expected.unknownIsUndefined,true);
    const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(CAMERA_SOURCE),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/scene\.centerCameraAt\(/);assert.match(exported.ts,/scene\.cameraFollowSprite\(/);assert.match(exported.ts,/scene\.cameraProperty\(/);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{cameraDone:true}});for(const name of names)assert.equal(again[name],expected[name],name+' in exported PXT');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,100);check(run);
});

test('native camera dropdowns decompile and export the same selected properties',async()=>{
    const source='scene.centerCameraAt(240,100)\nlet left=scene.cameraProperty(CameraProperty.Left)\nlet bottom=scene.cameraProperty(CameraProperty.Bottom)';
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:30,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    // Scratch's extension dropdown creates menu reporter shadows, whereas the
    // Code parser initially creates literal shadows. Verify the actual GUI shape.
    for(const target of run.creator.project.targets)for(const [id,block] of Object.entries(target.blocks))if(block.opcode==='arcade_cameraProperty'){
        const literal=block.inputs.PROPERTY[1],menu=id+'-camera-menu';
        const property=Array.isArray(literal)?literal[1]:target.blocks[literal].fields.NUM[0];
        target.blocks[menu]={opcode:'arcade_menu_cameraProperties',next:null,parent:id,inputs:{},fields:{cameraProperties:[String(property),null]},shadow:true,topLevel:false};
        block.inputs.PROPERTY=[1,menu];
    }
    const code=run.creator.decompile();assert.match(code,/arcade camera property \(+2\)+/);assert.match(code,/arcade camera property \(+5\)+/);
    const roundtrip=await runProgram(code,{frames:30,storage:true});assert.deepEqual(roundtrip.creator.warnings,[]);assert.equal(values(roundtrip).left,160);assert.equal(values(roundtrip).bottom,160);
    const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
    const result=await runPxtArcade(exported.ts,{waitForGlobals:{left:160,bottom:160}});assert.equal(result.left,160);assert.equal(result.bottom,160);
});
