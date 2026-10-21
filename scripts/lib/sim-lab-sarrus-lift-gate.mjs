// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';import {resolve} from 'node:path';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {judgeSarrusLift} from './sim-lab-sarrus-lift-judge.mjs';
export const sarrusLiftInteractions=async(page,opts)=>{
 await mechanicsInteractions(page,{...opts,models:['sarrus-lift'],simulatedMs:36000,speed:4,judge:judgeSarrusLift});
 await manualMechanicsInteractions(page,{...opts,models:['sarrus-lift']});
 await sarrusLiftLesson(page,opts,'en');
 await page.getByTestId('bw-sim-lab-instructions').click();const dialog=page.getByTestId('bw-sim-instructions');await page.waitForFunction(()=>window.__bwSimLabInstructions?.status==='ready',null,{timeout:120000});
 const plan=await page.evaluate(()=>window.__bwSimLabInstructions.plan);assert.equal(plan.steps.flatMap(s=>s.parts).length,144);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
 await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>window.__bwSimLabInstructions.stats?.step===1);await page.keyboard.press('End');await page.waitForFunction(()=>window.__bwSimLabInstructions.page===window.__bwSimLabInstructions.steps);
 const bom=page.getByTestId('bw-sim-instructions-bom');assert.equal(await bom.getByTestId('bw-sim-instructions-part').evaluateAll(es=>es.reduce((n,e)=>n+Number(e.dataset.count),0)),144);await dialog.screenshot({path:resolve(opts.shotsDir,'sarrus-lift-bom.png')});await page.keyboard.press('Escape');
 console.log(`PASS Sarrus Lift: native worker, manual controls, lesson and ${plan.steps.length}-page connected instructions/144-piece BOM`);
};
export const sarrusLiftLesson=async(page,opts,language)=>{
 if(language==='de'){
  await opts.openSimLab(page,{program:null});await page.getByTestId('bw-sim-lab-examples').click();const gallery=page.getByTestId('bw-sim-examples');await gallery.getByRole('searchbox').fill('sarrus-lift');await gallery.locator('[data-model="sarrus-lift.ldr"]').getByRole('button',{name:/Modell/}).click();await gallery.waitFor({state:'hidden'});
 }
 await page.getByTestId('bw-sim-lab-lesson').click();const lesson=page.getByTestId('bw-sim-lesson');await page.waitForFunction(()=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson==='sarrus-lift');
 await lesson.getByRole('button',{name:language==='de'?'Erklärung zeigen':'Show explanation',exact:true}).click();assert.ok((await lesson.getByTestId('bw-sim-lesson-answer').textContent()).length>100);await lesson.screenshot({path:resolve(opts.shotsDir,'sarrus-lift-lesson-'+language+'.png')});await lesson.getByRole('button',{name:language==='de'?'Lektion schließen':'Close lesson',exact:true}).click();
};
