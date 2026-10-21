// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {judgePhaseBridge} from './sim-lab-phase-bridge-judge.mjs';
export const PHASE_MODELS=['phase-bridge','phase-bridge-misphased'];
export const phaseBridgeInteractions=async(page,opts)=>{
 await mechanicsInteractions(page,{...opts,models:PHASE_MODELS,simulatedMs:32000,speed:4,judge:judgePhaseBridge});
 await manualMechanicsInteractions(page,{...opts,models:PHASE_MODELS});
 for(const id of PHASE_MODELS){
  await page.getByTestId('bw-sim-lab-model').selectOption(id+'.ldr');await page.waitForFunction(id=>{const p=window.__bwSimLab._pane;return p.state.status==='ready'&&p.state.modelFile===id+'.ldr'&&!p.state.programLoading;},id);
  await page.getByTestId('bw-sim-lab-lesson').click();const lesson=page.getByTestId('bw-sim-lesson');await page.waitForFunction(id=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson===id,id);
  await lesson.getByRole('button',{name:'Show explanation',exact:true}).click();assert.ok((await lesson.getByTestId('bw-sim-lesson-answer').textContent()).length>100);await lesson.screenshot({path:resolve(opts.shotsDir,id+'-lesson-en.png')});await lesson.getByRole('button',{name:'Close lesson',exact:true}).click();
  await page.getByTestId('bw-sim-lab-instructions').click();const dialog=page.getByTestId('bw-sim-instructions');await page.waitForFunction(()=>window.__bwSimLabInstructions?.status==='ready');
  const plan=await page.evaluate(()=>window.__bwSimLabInstructions.plan);assert.equal(plan.steps.flatMap(s=>s.parts).length,144);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>window.__bwSimLabInstructions.stats?.step===1);await page.keyboard.press('End');await page.waitForFunction(()=>window.__bwSimLabInstructions.page===window.__bwSimLabInstructions.steps);
  const bom=page.getByTestId('bw-sim-instructions-bom');assert.equal(await bom.getByTestId('bw-sim-instructions-part').evaluateAll(es=>es.reduce((n,e)=>n+Number(e.dataset.count),0)),144);await dialog.screenshot({path:resolve(opts.shotsDir,id+'-bom.png')});await page.keyboard.press('Escape');
  console.log(`PASS ${id}: native worker, manual A, EN lesson and ${plan.steps.length}-page connected instructions/144-placement BOM`);
 }
};
export const phaseBridgeGermanLessons=async(page,opts)=>{
 await opts.openSimLab(page,{program:null});
 for(const id of PHASE_MODELS){
  await page.getByTestId('bw-sim-lab-examples').click();const gallery=page.getByTestId('bw-sim-examples');await gallery.getByRole('searchbox').fill(id);await gallery.locator(`[data-model="${id}.ldr"]`).getByRole('button',{name:/Modell/}).click();await gallery.waitFor({state:'hidden'});
  await page.getByTestId('bw-sim-lab-lesson').click();const lesson=page.getByTestId('bw-sim-lesson');await page.waitForFunction(id=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson===id,id);
  await lesson.getByRole('button',{name:'Erklärung zeigen',exact:true}).click();assert.ok((await lesson.getByTestId('bw-sim-lesson-answer').textContent()).length>100);await lesson.screenshot({path:resolve(opts.shotsDir,id+'-lesson-de.png')});await lesson.getByRole('button',{name:'Lektion schließen',exact:true}).click();
 }
};
