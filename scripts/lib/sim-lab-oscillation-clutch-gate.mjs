// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {tidalInstructionsInteractions} from './sim-lab-tidal-gate.mjs';
import {judgeOscillationClutchRun} from './sim-lab-oscillation-clutch-judge.mjs';
const models=['pendulum-array','clutch-bench'];
export const oscillationClutchInteractions=async(page,opts)=>{
 const result=await mechanicsInteractions(page,{...opts,models,judge:judgeOscillationClutchRun,simulatedMs:24000});
 await manualMechanicsInteractions(page,{...opts,models});
 for(const [id,pieces]of [['pendulum-array',54],['clutch-bench',26]]){
  await page.getByTestId('bw-sim-lab-model').selectOption(id+'.ldr');
  await page.waitForFunction(file=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.state.modelFile===file,id+'.ldr');
  await page.getByTestId('bw-sim-lab-lesson').click();const lesson=page.getByTestId('bw-sim-lesson');
  await page.waitForFunction(id=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson===id,id);
  assert.match(await lesson.textContent(),id==='pendulum-array'?/square root|48, 80 and 96/:/0.0375/);
  await lesson.getByRole('button',{name:'Show explanation',exact:true}).click();
  assert.match(await lesson.getByTestId('bw-sim-lesson-answer').textContent(),id==='pendulum-array'?/1.41/:/lost during slip/);
  await lesson.screenshot({path:resolve(opts.shotsDir,id+'-lesson.png')});
  await lesson.getByRole('button',{name:'Close lesson',exact:true}).click();
  await tidalInstructionsInteractions(page,{...opts,pieces,prefix:id,minSteps:5});
 }
 return result;
};
