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
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const entries=Object.entries(ARCADE_SCENE_CONSTANTS);
const source='namespace Pri { export enum Value {'+entries.map(([name],i)=>'C'+i+'='+name).join(',')+'} }\n'+entries.map(([name],i)=>`let direct${i}=${name};direct${i}+=0;let enum${i}=Pri.Value.C${i};enum${i}+=0;`).join('\n');
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('generated constants bind every public numeric Scene constant to exact original bundled source',()=>{
 const target=JSON.parse(readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/target.json',import.meta.url)));
 const original=target.bundledpkgs.game['scene.ts'];assert.equal(createHash('sha256').update(original).digest('hex'),ARCADE_SCENE_SOURCE_SHA256);
 const declarations=Object.fromEntries([...original.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g)].map(m=>['scene.'+m[1],Number(m[2])]));
 const flagBody=original.match(/export enum Flag\s*\{([^}]*)\}/)[1];
 for(const match of flagBody.matchAll(/(\w+)\s*=\s*(\d+)\s*<<\s*(\d+)/g))declarations['scene.Flag.'+match[1]]=Number(match[2])<<Number(match[3]);
 assert.deepEqual(ARCADE_SCENE_CONSTANTS,declarations);assert.equal(entries.length,23);
});

test('direct and numeric enum Scene constants survive original, native, Code, original export and reimport',async()=>{
 const oracle=await runPxtArcade(source);const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const [,value] of entries)assert.ok(Number.isFinite(value));for(const [i,[,value]] of entries.entries()){assert.equal(vars(run)['direct'+i],value);assert.equal(vars(run)['enum'+i],value);assert.equal(oracle['direct'+i],value);assert.equal(oracle['enum'+i],value);}};
 const runs=[];let run;try{run=await runProgram(imported.code,{frames:100,storage:true});runs.push(run);check(run);const code=await runProgram(run.creator.decompile(),{frames:100});runs.push(code);check(code);const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files);for(const [i,[,value]] of entries.entries()){assert.equal(original['direct'+i]??original['Game_direct'+i],value);assert.equal(original['enum'+i]??original['Game_enum'+i],value);}const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);const reimport=await runProgram(restored.code,{frames:100});runs.push(reimport);check(reimport);
 const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,100);check(run);
 const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,100);check(fresh);
 }finally{for(const current of runs)current.vm.quit();clearStrayTimers();}
});

test('shadowed, unknown and mutable Scene constants keep source diagnostics',()=>{
 for(const source of ['let scene=7;enum E { A=scene.UPDATE_PRIORITY }','namespace Custom {const scene=7;export enum E {A=scene.UPDATE_PRIORITY}}','enum E { A=scene.NOT_A_PRIORITY }'])assert.ok(lowerNamespaceBindings(parseMakeCodeTs(source)).unsupported.length,source);
 for(const source of ['function f(scene:number){return scene.UPDATE_PRIORITY}let n=f(7)','scene.UPDATE_PRIORITY=7'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});


test('nested SDK Scene flag aliases retain earlier constants and sequential enum arithmetic',()=>{
 const source='const first=scene.Flag.NeedsSorting;enum Masks{A=first,B=A<<1,C=B|scene.Flag.IsRendering,D}let c=Masks.C;let d=Masks.D';
 const lowered=lowerNamespaceBindings(parseMakeCodeTs(source));assert.deepEqual(lowered.unsupported,[]);
 const declarations=lowered.program.body.filter(n=>n.type==='Declaration').flatMap(n=>n.decls);
 assert.equal(declarations.find(d=>d.name==='c').init.value,6);assert.equal(declarations.find(d=>d.name==='d').init.value,7);
 assert.deepEqual(arcadeToPseudocode(source).unsupported,[]);
 for(const invalid of [
  'enum E{A=scene.Flag.Unknown}',
  'enum E{A=scene.Unknown.NeedsSorting}',
  'let scene=7;enum E{A=scene.Flag.NeedsSorting}',
  'enum E{A=scene.Flag.NeedsSorting}let scene=7',
  'namespace Inner{const scene=7;export enum E{A=scene.Flag.NeedsSorting}}',
  'namespace Inner{namespace scene{export const Flag=7}export enum E{A=scene.Flag.NeedsSorting}}',
  'enum E{A=later,B}const later=scene.Flag.NeedsSorting'
 ])assert.ok(lowerNamespaceBindings(parseMakeCodeTs(invalid)).unsupported.some(m=>/finite numeric constant initializer/.test(m)),invalid);
});
