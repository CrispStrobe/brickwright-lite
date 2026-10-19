import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ARCADE_SCENE_CONSTANTS,ARCADE_SCENE_SOURCE_SHA256} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-scene-constants.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
const entries=Object.entries(ARCADE_SCENE_CONSTANTS);
const source='namespace Pri { export enum Value {'+entries.map(([name],i)=>'C'+i+'='+name).join(',')+'} }\n'+entries.map(([name],i)=>`let direct${i}=${name};direct${i}+=0;let enum${i}=Pri.Value.C${i};enum${i}+=0;`).join('\n');
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('generated constants bind every public numeric Scene constant to exact original bundled source',()=>{
 const target=JSON.parse(readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/target.json',import.meta.url)));
 const original=target.bundledpkgs.game['scene.ts'];assert.equal(createHash('sha256').update(original).digest('hex'),ARCADE_SCENE_SOURCE_SHA256);
 const declarations=Object.fromEntries([...original.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g)].map(m=>['scene.'+m[1],Number(m[2])]));
 assert.deepEqual(ARCADE_SCENE_CONSTANTS,declarations);assert.equal(entries.length,20);
});

test('direct and numeric enum Scene constants survive original, native, Code, original export and reimport',async()=>{
 const oracle=await runPxtArcade(source);const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const [,value] of entries)assert.ok(Number.isFinite(value));for(const [i,[,value]] of entries.entries()){assert.equal(vars(run)['direct'+i],value);assert.equal(vars(run)['enum'+i],value);assert.equal(oracle['direct'+i],value);assert.equal(oracle['enum'+i],value);}};
 let run;try{run=await runProgram(imported.code,{frames:100,storage:true});check(run);check(await runProgram(run.creator.decompile(),{frames:100}));const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files);for(const [i,[,value]] of entries.entries()){assert.equal(original['direct'+i]??original['Game_direct'+i],value);assert.equal(original['enum'+i]??original['Game_enum'+i],value);}const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);check(await runProgram(restored.code,{frames:100}));}finally{run?.vm.quit?.();clearStrayTimers();}
});

test('shadowed, unknown and mutable Scene constants keep source diagnostics',()=>{
 for(const source of ['let scene=7;enum E { A=scene.UPDATE_PRIORITY }','namespace Custom {const scene=7;export enum E {A=scene.UPDATE_PRIORITY}}','enum E { A=scene.NOT_A_PRIORITY }'])assert.ok(lowerNamespaceBindings(parseMakeCodeTs(source)).unsupported.length,source);
 for(const source of ['function f(scene:number){return scene.UPDATE_PRIORITY}let n=f(7)','scene.UPDATE_PRIORITY=7'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
