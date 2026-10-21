// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';import {resolve} from 'node:path';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {judgeScaleEcho,judgeTurnwise} from './sim-lab-scaling-steering-judge.mjs';
export async function scalingSteeringInteractions(page,opts){
 const {id}=opts,n=id==='scale-echo'?148:127;
 await mechanicsInteractions(page,{...opts,models:[id],simulatedMs:id==='scale-echo'?70000:90000,speed:4,judge:id==='scale-echo'?judgeScaleEcho:judgeTurnwise});
 await manualMechanicsInteractions(page,{...opts,models:[id],jogSign:()=>id==='turnwise'?-1:1});
 await scalingSteeringLesson(page,opts,'en');
 await page.getByTestId('bw-sim-lab-instructions').click();const dialog=page.getByTestId('bw-sim-instructions');await page.waitForFunction(()=>window.__bwSimLabInstructions?.status==='ready',null,{timeout:120000});
 const plan=await page.evaluate(()=>window.__bwSimLabInstructions.plan);assert.equal(plan.steps.flatMap(s=>s.parts).length,n);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
 await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>window.__bwSimLabInstructions.stats?.step===1);await page.keyboard.press('End');await page.waitForFunction(()=>window.__bwSimLabInstructions.page===window.__bwSimLabInstructions.steps);
 const bom=page.getByTestId('bw-sim-instructions-bom');assert.equal(await bom.getByTestId('bw-sim-instructions-part').evaluateAll(es=>es.reduce((count,e)=>count+Number(e.dataset.count),0)),n);await dialog.screenshot({path:resolve(opts.shotsDir,id+'-bom.png')});await page.keyboard.press('Escape');
 console.log(`PASS ${id}: native worker, manual controls, lesson and ${plan.steps.length}-page connected instructions/${n}-piece BOM`);
}
export async function scalingSteeringLesson(page,opts,language){
 const {id}=opts;
 if(language==='de'){
  await opts.openSimLab(page,{program:null});await page.getByTestId('bw-sim-lab-examples').click();const gallery=page.getByTestId('bw-sim-examples');await gallery.getByRole('searchbox').fill(id);await gallery.locator(`[data-model="${id}.ldr"]`).getByRole('button',{name:/Modell/}).click();await gallery.waitFor({state:'hidden'});
 }
 await page.getByTestId('bw-sim-lab-lesson').click();const lesson=page.getByTestId('bw-sim-lesson');await page.waitForFunction(id=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson===id,id);
 await lesson.getByRole('button',{name:language==='de'?'Erklärung zeigen':'Show explanation',exact:true}).click();assert.ok((await lesson.getByTestId('bw-sim-lesson-answer').textContent()).length>100);await lesson.screenshot({path:resolve(opts.shotsDir,id+'-lesson-'+language+'.png')});await lesson.getByRole('button',{name:language==='de'?'Lektion schließen':'Close lesson',exact:true}).click();
}
