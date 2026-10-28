import test from 'node:test';
import assert from 'node:assert/strict';
import {kindPrograms} from './fixtures/arcade-sprite-kind-programs.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {TEXT_SPRITE_SOURCE_TEXT} from '../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const observations={order:['player','projectile','food','enemy','beforeKind','between','later','alias','afterKind','calls','dynamicKind','done'],numeric:['hits','negativeKind','negativeCount','positiveKind','positiveCount','unchangedKind','omittedKind','nullKind','done'],text:['textKind','customKind','observed','next','done']};
const variables=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
const withOriginal=(files,text)=>{const cfg=JSON.parse(files['pxt.json']);if(text){delete cfg.dependencies['arcade-text'];cfg.files=['text.ts',...cfg.files];}return {...files,...(text?{'text.ts':TEXT_SPRITE_SOURCE_TEXT}:{}),'pxt.json':JSON.stringify(cfg)};};
for(const [name,source] of Object.entries(kindPrograms))test('actual SpriteKind original/native/Code/SB3/export/reimport: '+name,async()=>{
 const text=name==='text';const files={'main.ts':source,'pxt.json':JSON.stringify({name:'owned-kind-'+name,dependencies:{device:'*',...(text?{'arcade-text':'github:microsoft/arcade-text#v1.3.0'}:{})},files:['main.ts']})};
 const original=await runPxtArcade(withOriginal(files,text),{fakeClock:true});
 const input=text?prepareArcadeDependencyInputs(files,{packages:{'arcade-text':{files:{'text.ts':TEXT_SPRITE_SOURCE_TEXT}}},sourceOrder:[{id:'arcade-text',file:'text.ts'}],jres:{}}).files:files;
 const imported=arcadeToPseudocode(input);assert.deepEqual(imported.unsupported,[]);
 const runs=[];const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const actual=variables(run);for(const key of observations[name])assert.equal(actual[key],original[key],key);};
 try{
  const native=await runProgram(imported.code,{frames:30,uploads:imported.costumes,storage:true});runs.push(native);check(native);
  const archive=Buffer.from(await(await native.vm.saveProjectSb3()).arrayBuffer());await native.vm.loadProject(archive);native.vm.greenFlag();await stepFrames(native.vm,30);check(native);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,30);check(fresh);
  const code=await runProgram(native.creator.decompile(),{frames:30,uploads:imported.costumes,storage:true});runs.push(code);check(code);
  const exported=projectToArcade(native.creator.project,{costumeSvg:(target,costume)=>native.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
  const exportedOriginal=await runPxtArcade(withOriginal(exported.files,text),{fakeClock:true});for(const key of observations[name])assert.equal(exportedOriginal[key]??exportedOriginal['Game_'+key],original[key],key+' exported');
  const preparedExport=text?prepareArcadeDependencyInputs(exported.files,{packages:{'arcade-text':{files:{'text.ts':TEXT_SPRITE_SOURCE_TEXT}}},sourceOrder:[{id:'arcade-text',file:'text.ts'}],jres:{}}).files:exported.files;
  const reimported=arcadeToPseudocode(preparedExport);assert.deepEqual(reimported.unsupported,[]);const roundtrip=await runProgram(reimported.code,{frames:30,uploads:reimported.costumes,storage:true});runs.push(roundtrip);check(roundtrip);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
