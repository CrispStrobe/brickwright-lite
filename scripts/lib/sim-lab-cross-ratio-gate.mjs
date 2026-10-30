// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import JSZip from 'jszip';
import {judgeCrossRatio,crossRatioProgramGraph,assertCrossRatioBrowserProgram} from './sim-lab-cross-ratio-judge.mjs';
import {observeAddon} from './sim-lab-addon-judge.mjs';
import {bindSixBrowserSource} from './sim-lab-six-browser-judge.mjs';
import {captureIntakeProject,projectProgramReady} from './sim-lab-intake-roundtrip.mjs';
import {installBrowserMechanicsRecorder} from './sim-lab-browser-recorder.mjs';
import {continueCompletedIntake} from './sim-lab-intake-continuation.mjs';
import {captureRenderedModel} from './sim-lab-rendered-model-gate.mjs';
import {readIntakeReceipt,intakeIdentity} from './sim-lab-intake-receipt.mjs';
const crossRatioContract=JSON.parse(readFileSync(new URL('../../test/fixtures/bw-sim/cross-ratio/contract.json',import.meta.url),'utf8'));
export function judgeCrossRatioBrowser(record){
 assertCrossRatioBrowserProgram(record,{...crossRatioContract.timing,routeLength:crossRatioContract.route.length});
 const binding=bindSixBrowserSource('cross-ratio',record);
 assert.ok(record.track.length>=100,'actual browser observations');
 let previous=-Infinity;
 for(const f of record.track){
  assert.ok(Number.isFinite(f.t)&&f.t>previous,'increasing actual browser time');previous=f.t;
  for(const b of Object.values(f.bodies)){
   assert.ok([...b.position,...b.rotation].every(Number.isFinite));
   assert.ok(Math.abs(Math.hypot(...b.rotation)-1)<=1e-5);
  }
 }
 const metrics=judgeCrossRatio(record),observer=observeAddon(record,'motor_rail_-40_-140');
 const closureMm=Math.max(...record.track.map(f=>observer.gap(f)));
 const axisDeg=Math.max(...record.track.map(f=>observer.axisGap(f)));
 assert.ok(closureMm<=.5&&axisDeg<=1,'actual browser hinges close and align');
 console.log('PASS cross-ratio: actual browser passive law '+JSON.stringify({...metrics,closureMm,axisDeg,sourceBinding:binding.sourceBinding}));
 return {...metrics,closureMm,axisDeg,sourceBinding:binding.sourceBinding,scope:'Actual Chromium law and closure; native cold cases are separate'};
}
export async function crossRatioRoundtrip(page,opts){
 const expectedProgram=crossRatioProgramGraph(await page.evaluate(()=>JSON.parse(window.__bwSimLab._pane.props.vm.toJSON())));
 const id='cross-ratio',receiptPath=await captureIntakeProject(page,opts,id);
 const receipt=readIntakeReceipt(receiptPath,{id,identity:intakeIdentity(id,opts.buildDir)});
 const bytes=readFileSync(receipt.project);
 assert.ok(bytes.length>0&&bytes.length<=8*1024*1024,'bounded actual saved project');
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
 const sidecar=zip.file('brickwright/state.json'),project=zip.file('project.json');
 assert.ok(sidecar&&project,'actual model sidecar and Scratch project');
 const [stateText,projectText]=await Promise.all([sidecar.async('text'),project.async('text')]);
 assert.ok(Buffer.byteLength(stateText)<=2*1024*1024&&Buffer.byteLength(projectText)<=2*1024*1024);
 assert.deepEqual(JSON.parse(stateText).state.simLab,receipt.record,'exported bytes preserve exact saved model before real reopen');
 const savedProgram=crossRatioProgramGraph(JSON.parse(projectText));
 assert.deepEqual(savedProgram,expectedProgram,'actual saved full program graph and data BEFORE real reopen');
 console.log('PASS cross-ratio: actual SB3 CRC, model content and full program graph checked BEFORE real fresh-context reopen');
 const reopened=await page.context().browser().newPage({viewport:{width:1600,height:1050},serviceWorkers:'block'}),errors=[];
 reopened.on('pageerror',e=>errors.push(e.message));reopened.on('dialog',d=>d.accept());
 try{
  await opts.openSimLab(reopened,{program:null});
  await reopened.evaluate(()=>{window.__bwIntakeProjectVm=window.__bwSimLab._pane.props.vm;});
  await reopened.getByText('File',{exact:true}).click();
  await reopened.getByText('Load from your computer',{exact:true}).click();
  await reopened.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(receipt.project);
  // The shared histogram is only a readiness condition. Admission compares
  // every stored block/input/field/edge/data item before pressing actual Run.
  await reopened.waitForFunction(projectProgramReady,receipt.program,{timeout:120000});
  const actualProgram=crossRatioProgramGraph(await reopened.evaluate(()=>JSON.parse(window.__bwIntakeProjectVm.toJSON())));
  assert.deepEqual(actualProgram,savedProgram,'fresh context restores the full saved program BEFORE Run');
  await reopened.getByRole('tab',{name:/^(Robots|Robot Lab)$/}).click();
  await reopened.waitForFunction(count=>window.__bwSimLab?.status==='ready'&&window.__bwSimLab._pane.session.model.parts.length===count,receipt.expected.length,{timeout:60000});
  assert.deepEqual(await reopened.evaluate(()=>window.__bwSimLab.projectRecord),receipt.record);
  await reopened.evaluate(installBrowserMechanicsRecorder,{recordKey:'__bwCrossRatioReopened',captureKey:'__bwCaptureCrossRatioReopened',extended:true,observeProgram:true});
  await reopened.getByTestId('bw-sim-lab-speed').selectOption('4');
  await reopened.getByTestId('bw-sim-lab-run').click();
  await reopened.waitForFunction(()=>{const p=window.__bwSimLab._pane;return p.session.time>1000&&!p.props.vm.runtime.threads.some(t=>t.status!==4);},null,{timeout:opts.timeout});
  // Reuse the established ordinary continuation; it advances the real world,
  // never a synthesized observation. The Cross Ratio recorder has its own key.
  await reopened.evaluate(()=>{window.__bwIntakeReopened=window.__bwCrossRatioReopened;window.__bwCaptureIntakeReopened=window.__bwCaptureCrossRatioReopened;});
  await reopened.evaluate(continueCompletedIntake);
  await reopened.waitForFunction(()=>{const r=window.__bwCrossRatioReopened;return Number.isFinite(r.finishedAt)&&r.track.at(-1)?.t-r.finishedAt>=500;},null,{timeout:opts.timeout});
  await reopened.evaluate(()=>window.__bwCaptureCrossRatioReopened());
  const record=await reopened.evaluate(()=>window.__bwCrossRatioReopened);
  writeFileSync(resolve(opts.shotsDir,id+'-reopened-track.json'),JSON.stringify(record));
  writeFileSync(resolve(opts.shotsDir,id+'-program-graph.json'),JSON.stringify({expectedProgram,savedProgram,actualProgram}));
  judgeCrossRatioBrowser(record);assert.deepEqual(errors,[]);
  if(await reopened.evaluate(()=>window.__bwSimLab.status==='running'))await reopened.getByTestId('bw-sim-lab-pause').click();
  await captureRenderedModel(reopened,resolve(opts.shotsDir,id+'-reopened.png'));
 }finally{await reopened.close();}
 console.log('PASS cross-ratio: actual fresh-context saved-project replay and passive law');
}
