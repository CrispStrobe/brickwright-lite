import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {bundledExtensionIds,loadExtensionClass,probeExtension,stubRuntime} from './helpers/bw-extensions.mjs';
import {SCALING_VALUES_SOURCE,SCALING_VALUE_NAMES} from './fixtures/arcade-scaling.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
async function verify(source,names,done){
    const expected=await runPxtArcade(source,{waitForGlobals:{[done]:true}});
    const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:250,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    const nativeOps=run.creator.project.targets.flatMap(target=>Object.values(target.blocks)).map(block=>block.opcode);
    assert.ok(nativeOps.includes('arcade_setSpriteScale'));assert.ok(nativeOps.includes('arcade_changeSpriteScale'));assert.ok(nativeOps.includes('arcade_setSpriteScaleCore'));
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/\.setScale\(/);assert.match(exported.ts,/\.setScaleCore\(/);
    const again=await runPxtArcade(exported.ts,{waitForGlobals:{[done]:true}});for(const name of names)assert.equal(again[name],expected[name],name+' in exported PXT');
    await execute(arcadeToPseudocode(exported.files));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,250);check(run);
    return {expected,exported};
}
test('sprite scaling, anchors, fractions, optional core parameters and typed numeric procedures roundtrip through every execution path',async()=>{
 const {expected,exported}=await verify(SCALING_VALUES_SOURCE,SCALING_VALUE_NAMES,'scaleDone');
 assert.equal(expected.ownerCalls,1);assert.equal(expected.amountCalls,1);assert.equal(expected.clampedX,0);
 assert.match(exported.ts,/function (?:Game_)?sizeOf[^\n]*Sprite[^\n]*number/);
});
test('Blocks expose sx/sy/scale and anchored scaling operations',()=>{
 const probe=probeExtension(loadExtensionClass(bundledExtensionIds().get('arcade')),stubRuntime());assert.equal(probe.error,null);
 const info=probe.instance.getInfo();
 for(const name of ['setSpriteScale','changeSpriteScale','setSpriteScaleCore'])assert.ok(info.blocks.some(block=>block.opcode===name),name);
 for(const name of ['sx','sy','scale'])assert.ok(info.menus.spriteProperties.items.includes(name),name);
});

test('scale core exports an actual Boolean fourth argument including literal and reporter forms',async()=>{
 const {SB3Creator}=await import('./helpers/bw-vm.mjs');
 for(const [input,expected] of [['1','true'],['0','false'],['(0 < 1)','(0 < 1)']]) {
  const creator=new SB3Creator();creator.parse(`DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  arcade scale core of (null value) x (undefined value) y (2) anchor (0) proportional ${input}`);
  assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);
  const exported=projectToArcade(creator.project);
  assert.deepEqual(exported.unsupported,[]);
  assert.ok(exported.ts.includes(`.setScaleCore(undefined, 2, 0, ${expected})`),exported.ts);
 }
});

test('actual Blocks anchor dropdown shadows preserve top-left and bottom-right through Code and executed PXT export',async()=>{
 const source='let actor=sprites.create(img`55\n55`,SpriteKind.Player);actor.setPosition(40,50);actor.setScale(2,ScaleAnchor.TopLeft);let leftAfter=actor.left;let topAfter=actor.top;actor.changeScale(1,ScaleAnchor.BottomRight);let rightAfter=actor.right;let bottomAfter=actor.bottom';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:30,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const anchors=[];
 for(const target of run.creator.project.targets)for(const [id,block] of Object.entries(target.blocks))if(['arcade_setSpriteScale','arcade_changeSpriteScale'].includes(block.opcode)){
  const literal=block.inputs.ANCHOR[1],menu=id+'-scale-anchor';
  const anchor=Array.isArray(literal)?literal[1]:target.blocks[literal].fields.NUM[0];anchors.push(Number(anchor));
  target.blocks[menu]={opcode:'arcade_menu_scaleAnchors',next:null,parent:id,inputs:{},fields:{scaleAnchors:[String(anchor),null]},shadow:true,topLevel:false};
  block.inputs.ANCHOR=[1,menu];
 }
 assert.deepEqual(anchors.sort((a,b)=>a-b),[3,12]);
 const code=run.creator.decompile();assert.match(code,/anchor \(+3\)+/);assert.match(code,/anchor \(+12\)+/);
 const roundtrip=await runProgram(code,{frames:30,uploads:imported.costumes,storage:true});assert.deepEqual(roundtrip.errors,[]);assert.deepEqual(roundtrip.creator.warnings,[]);
 for(const name of ['leftAfter','topAfter','rightAfter','bottomAfter'])assert.equal(values(roundtrip)[name],values(run)[name],name);
 const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const result=await runPxtArcade(exported.ts,{waitForGlobals:{leftAfter:values(run).leftAfter,bottomAfter:values(run).bottomAfter}});
 for(const name of ['leftAfter','topAfter','rightAfter','bottomAfter'])assert.equal(result[name],values(run)[name],name);
});
