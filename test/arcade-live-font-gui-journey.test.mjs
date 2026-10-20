import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fontAuthoringFiles,fontAuthoringSample,fontOriginalSample} from './fixtures/arcade-live-font-authoring-game.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {makeCodeProjectFile,readMakeCodeProjectText} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';

test('GUI font fixture has exact metric variants and six direct FIELD reporters',async()=>{
 assert.throws(()=>fontAuthoringFiles('unknown'));assert.throws(()=>fontAuthoringSample('unknown'));
 for(const variant of ['baseline','blocks','code']){
  const files=fontAuthoringFiles(variant),wrapped=makeCodeProjectFile(files,{target:'arcade'}),decoded=await readMakeCodeProjectText(wrapped.toString(),'mkcd');assert.deepEqual(decoded.files,files);
  const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
  const blocks=creator.project.targets.flatMap(t=>Object.values(t.blocks)).filter(b=>b.opcode==='arcade_fontMetric');assert.equal(blocks.length,6);for(const block of blocks)assert.deepEqual(block.inputs,{});
  const h5=variant==='baseline'?'font5': 'font8',property=variant==='blocks'?'charWidth':'charHeight';assert.match(creator.decompile(),new RegExp(`set h5 to \\(arcade font "${h5}" metric "${property}"\\)`));assert.equal(fontAuthoringSample(variant).h5,variant==='baseline'?5:variant==='blocks'?6:8);
  assert.ok(files['main.ts'].endsWith('scene.setBackgroundImage(surface);'));assert.deepEqual(fontOriginalSample(files,variant),fontAuthoringSample(variant));
  const qualified={...files,'main.ts':files['main.ts'].replace(/\blet (early|w5|h5|w8|h8|w12|h12)\b/g,'let Game_$1')};assert.deepEqual(fontOriginalSample(qualified,variant),Object.fromEntries(Object.entries(fontAuthoringSample(variant)).map(([k,v])=>['Game_'+k,v])));
 }
});
test('hosted journey retains sole-artifact admission, actual dropdown actions, all frames and SDK compilation artifacts',()=>{
 const script=readFileSync(new URL('../scripts/verify-arcade-live-font-authoring-gui.mjs',import.meta.url),'utf8');
 for(const required of ['BW_GUI_BUILD_RECEIPT','BW_GUI_BUILD_ARCHIVE','inspectGuiHarnessSource','inspectGuiArtifactResponse','workerSha256','menuitemcheckbox','page.mouse.click','page.keyboard.insertText','waitForArcadeStageFrame','assert.equal(screen.length,19200)','onCompilation','fresh-SB3-reopen','actual-export-reimport'])assert.ok(script.includes(required),required);
 assert.doesNotMatch(script,/\.setFieldValue\(|\.setValue\(|runtime\._step\(|\.greenFlag\(|\.postIOData\(/);
 const workflow=readFileSync(new URL('../.github/workflows/build.yml',import.meta.url),'utf8');assert.ok(workflow.includes('scripts/verify-arcade-live-font-authoring-gui.mjs'));assert.ok(workflow.includes('test-results/arcade-live-font-authoring-gui'));
});
