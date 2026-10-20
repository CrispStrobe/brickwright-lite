import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {CAPTURED_PROOF_SOURCE,capturedProofExpected,editCapturedProofSeed}from'./fixtures/arcade/console-captured-proof.mjs';
import{arcadeToPseudocode}from'../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';import{projectToArcade}from'../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import{runArcadeSourceCode}from'./helpers/arcade-source-program.mjs';import{stepFrames,clearStrayTimers}from'./helpers/bw-vm.mjs';
const observed=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(value=>[value.name,value.value]));
test('frozen two-tick captured proof keeps actual Number/String mutation and initializer once through a connected edit',async()=>{
 const imported=arcadeToPseudocode(CAPTURED_PROOF_SOURCE);assert.deepEqual(imported.unsupported,[]);const runs=[],observations=[];
 const tick=async(run,route,initial)=>{await stepFrames(run.vm,1,0);await stepFrames(run.vm,10,20);const result=observed(run),expected=capturedProofExpected(initial);assert.deepEqual(run.errors,[]);for(const[name,value]of Object.entries(expected))assert.equal(result[name],value,route+':'+name);observations.push({route,...expected});};
 const execute=async(code,route,initial)=>{const run=await runArcadeSourceCode(code,{frames:0});runs.push(run);await tick(run,route,initial);return run;};
 try{const run=await execute(imported.code,'source',2),project=structuredClone(run.creator.project),edit=editCapturedProofSeed(project);run.creator.project=project;const edited=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(edited);run.vm.runtime.bwArcadeFrameAuthority='manual';run.vm.greenFlag();await tick(run,'native-current-edit',7);
 const current=JSON.parse(run.vm.toJSON());for(const target of project.targets)target.blocks=current.targets.find(value=>value.isStage===target.isStage&&value.name===target.name).blocks;run.creator.project=structuredClone(project);await execute(run.creator.decompile(),'Code-current-edit',7);
 const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.runtime.bwArcadeFrameAuthority='manual';run.vm.greenFlag();await tick(run,'same-SB3',7);
 const fresh=await runArcadeSourceCode('SPRITE Empty:\nWHEN flag clicked:\n  hide',{frames:0});runs.push(fresh);await fresh.vm.loadProject(saved);fresh.vm.runtime.bwArcadeFrameAuthority='manual';fresh.vm.greenFlag();await tick(fresh,'fresh-SB3',7);
 const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[],exported.ts);await execute(again.code,'edited-export-reimport',7);
 if(process.env.BW_CAPTURED_PROOF_PACKET){const dir=process.env.BW_CAPTURED_PROOF_PACKET;fs.writeFileSync(dir+'/native-observations.json',JSON.stringify({observations,edit},null,2)+'\n');fs.writeFileSync(dir+'/export-files.json',JSON.stringify(exported.files,null,2)+'\n');fs.writeFileSync(dir+'/edited-project.json',JSON.stringify(project,null,2)+'\n');fs.writeFileSync(dir+'/edited.sb3',edited);}
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
