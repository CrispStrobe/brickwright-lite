// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {judgeStraightEightRun} from './sim-lab-straight-eight-judge.mjs';
import {judgeArmLiftRun} from './sim-lab-arm-lift-judge.mjs';
export const armLiftInteractions=async(page,opts)=>{
 page.setDefaultTimeout(90000);
 const models=['atlas-arm','switchback-lift'];
 const result=await mechanicsInteractions(page,{...opts,models,judge:judgeArmLiftRun,simulatedMs:30000});
 await manualMechanicsInteractions(page,{...opts,models,jogSign:id=>id==='switchback-lift'?-1:1});
 for(const [id,pieces]of [['atlas-arm',237],['switchback-lift',341]]){
  await page.getByTestId('bw-sim-lab-model').selectOption(id+'.ldr');
  await page.waitForFunction(file=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.state.modelFile===file,id+'.ldr');
  await page.getByTestId('bw-sim-lab-lesson').click();const lesson=page.getByTestId('bw-sim-lesson');
  await page.waitForFunction(id=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson===id,id);
  assert.match(await lesson.textContent(),id==='atlas-arm'?/24:1/:/611.155/);
  await lesson.getByRole('button',{name:'Show explanation',exact:true}).click();
  assert.match(await lesson.getByTestId('bw-sim-lesson-answer').textContent(),id==='atlas-arm'?/600/:/62.83/);
  await lesson.screenshot({path:resolve(opts.shotsDir,id+'-lesson.png')});
  await lesson.getByRole('button',{name:'Close lesson',exact:true}).click();
  await page.getByTestId('bw-sim-lab-instructions').click();const dialog=page.getByTestId('bw-sim-instructions');await dialog.waitFor();
  await page.waitForFunction(()=>window.__bwSimLabInstructions?.status==='ready'&&window.__bwSimLabInstructions.stats?.step===0);
  const plan=await page.evaluate(()=>window.__bwSimLabInstructions.plan);assert.ok(plan.steps.length>50);
  assert.deepEqual(plan.steps.flatMap(s=>s.parts).length,pieces);
  await dialog.screenshot({path:resolve(opts.shotsDir,id+'-instructions-first.png')});
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>window.__bwSimLabInstructions.stats?.step===1);
  await page.keyboard.press('End');await page.waitForFunction(()=>window.__bwSimLabInstructions.page===window.__bwSimLabInstructions.steps);
  const bom=page.getByTestId('bw-sim-instructions-bom');await bom.waitFor();
  assert.equal(await bom.getByTestId('bw-sim-instructions-part').evaluateAll(es=>es.reduce((n,e)=>n+Number(e.dataset.count),0)),pieces);
  await dialog.screenshot({path:resolve(opts.shotsDir,id+'-instructions-bom.png')});
  await page.keyboard.press('Home');await page.waitForFunction(()=>window.__bwSimLabInstructions.page===0&&window.__bwSimLabInstructions.stats?.step===0);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  console.log(`PASS ${id} instructions: ${plan.steps.length} planned pages; first/next/Home/End/BOM browser checks, ${pieces} pieces`);
 }
 const straightOpts={...opts,shotsDir:resolve(opts.shotsDir,'straight-eight-release'),models:['straight-eight']};
 Object.assign(result,await mechanicsInteractions(page,{...straightOpts,judge:(_id,r)=>judgeStraightEightRun(r),simulatedMs:14000}));
 await manualMechanicsInteractions(page,straightOpts);
 return result;
};
