import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {admitArcadeNativeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-source-admission.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const revision='a8df7de6f7073b553976b9e47fbfadebcdc4f0ec';
const source=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/legacy-character-source/main.ts',import.meta.url),'utf8');
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const withOriginal=files=>{const cfg=JSON.parse(files['pxt.json']);delete cfg.dependencies['arcade-character-animations'];cfg.files=['legacy-character.ts',...cfg.files];return {...files,'legacy-character.ts':source,'pxt.json':JSON.stringify(cfg)};};
const config=ref=>JSON.stringify({name:'owned-character-test',dependencies:{device:'*','arcade-character-animations':ref},files:['main.ts']});
test('old original fifth predicate and rule text survive source admission, Code, SB3 and original export',async()=>{
 const main='let hero=sprites.create(img`4`,SpriteKind.Player);let rule=characterAnimations.rule(Predicate.NotMoving,Predicate.FacingRight,Predicate.HittingWallUp,Predicate.HittingWallLeft,Predicate.Moving);let description=characterAnimations.ruleToString(rule);let negative=characterAnimations.ruleToString(-1.5);characterAnimations.setCharacterState(hero,rule);let matched=characterAnimations.matchesRule(hero,rule);let packageValue=packageInitialized;let done=1;done+=0;';
 const files={'main.ts':main,'pxt.json':config('github:microsoft/arcade-character-animations#v0.0.2')};
 const resolved={packages:{'arcade-character-animations':{files:{'main.ts':source,'extra.ts':'let packageInitialized=7;'}}},sourceOrder:[{id:'arcade-character-animations',file:'main.ts'},{id:'arcade-character-animations',file:'extra.ts'}],jres:{}};
 const before=JSON.stringify(files),prepared=prepareArcadeDependencyInputs(files,resolved);assert.equal(JSON.stringify(files),before);assert.equal(prepared.provenance[0].nativeAdapter.libraryVersion,revision);assert.ok(Object.values(prepared.files).includes('let packageInitialized=7;'));
 const originalFiles=withOriginal({...files,'extra.ts':'let packageInitialized=7;'});const cfg=JSON.parse(originalFiles['pxt.json']);cfg.files.splice(1,0,'extra.ts');originalFiles['pxt.json']=JSON.stringify(cfg);
 const expected=await runPxtArcade(originalFiles);assert.equal(expected.rule,9225,'fifth predicate ignored by unchanged original');assert.equal(expected.packageValue,7);
 const imported=arcadeToPseudocode(prepared.files);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade use character animation version/);
 const names=['rule','description','negative','matched','packageValue','done'];const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of names)assert.equal(values(run)[name],expected[name],name);};
 const runs=[];try{
  const run=await runProgram(imported.code,{frames:30,uploads:imported.costumes,storage:true});runs.push(run);check(run);
  const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(archive);run.vm.greenFlag();await stepFrames(run.vm,30);check(run);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,30);check(fresh);
  const code=await runProgram(run.creator.decompile(),{frames:30,uploads:imported.costumes,storage:true});runs.push(code);check(code);
  const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-character-animations'],`github:microsoft/arcade-character-animations#${revision}`);assert.match(exported.ts,/characterAnimations.ruleToString/);
  const oracle=await runPxtArcade(withOriginal(exported.files));for(const name of names)assert.equal(oracle[name]??oracle['Game_'+name],expected[name],name+' exported');
  const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);const again=await runProgram(reimported.code,{frames:30,uploads:reimported.costumes,storage:true});runs.push(again);check(again);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
test('exact source receipt and additional files remain bounded; modern-only operations are explicit',()=>{
 const receipt=admitArcadeNativeSource({packageId:'arcade-character-animations',filename:'main.ts',source});assert.equal(receipt.libraryVersion,revision);assert.ok(Object.isFrozen(receipt));assert.ok(Object.isFrozen(receipt.apis));
 for(const candidate of [{source:source+'\n// changed'},{filename:'extra.ts'},{packageId:'fake-character'}])assert.equal(admitArcadeNativeSource({packageId:'arcade-character-animations',filename:'main.ts',source,...candidate}),null);
 for(const operation of ['setController(hero,true)','lockFacingDirection(hero,characterAnimations.FacingDirection.Right)','unlockFacingDirection(hero)']){
 const files={'main.ts':`let hero=sprites.create(img\`4\`,SpriteKind.Player);characterAnimations.${operation}`,'pxt.json':config(`github:microsoft/arcade-character-animations#${revision}`)};assert.ok(arcadeToPseudocode(files).unsupported.some(message=>message.includes('v0.0.2')),operation);
 }
});
test('export refuses dynamic, late, duplicate selectors and old-library modern-only opcodes',()=>{
 const selector=version=>({opcode:'arcade_setCharacterAnimationVersion',parent:'flag',next:'controller',inputs:{VERSION:[1,[10,version]]},fields:{}});
 const project=blocks=>({targets:[{isStage:true,name:'Stage',variables:{},lists:{},costumes:[],blocks:{flag:{opcode:'event_whenflagclicked',topLevel:true,parent:null,next:'select',inputs:{},fields:{}},select:selector(revision),...blocks}}]});
 for(const opcode of ['arcade_setCharacterController','arcade_lockCharacterFacing','arcade_unlockCharacterFacing']){
  const exported=projectToArcade(project({controller:{opcode,parent:'select',inputs:{},fields:{DIRECTION:['Right',null]}}}));assert.ok(exported.unsupported.some(message=>message.includes('Legacy character animations')),opcode);
 }
 for(const blocks of [
  {select:selector('unknown')},
  {select:{...selector(revision),inputs:{VERSION:[2,'variable']}},variable:{opcode:'data_variable',fields:{VARIABLE:['version','version']},inputs:{},parent:'select'}},
  {select:{...selector(revision),parent:'after'},after:{opcode:'control_wait',parent:'flag',inputs:{}}},
  {duplicate:{...selector(revision),parent:'flag'}}
 ])assert.ok(projectToArcade(project(blocks)).unsupported.some(message=>message.includes('character animation version')));
});
