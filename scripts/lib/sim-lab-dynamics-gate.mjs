// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {resolve} from 'node:path';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {tidalInstructionsInteractions} from './sim-lab-tidal-gate.mjs';
import {judgeDynamicsRun} from './sim-lab-dynamics-judge.mjs';
const models=['pulse-percussion','centrifugal-governor'];
export const dynamicsInteractions=async(page,opts)=>{
 const r=await mechanicsInteractions(page,{...opts,models,judge:judgeDynamicsRun,simulatedMs:48000});
 await manualMechanicsInteractions(page,{...opts,models});
 for(const [id,pieces] of [['pulse-percussion',130],['centrifugal-governor',34]]){
  await page.getByTestId('bw-sim-lab-model').selectOption(`${id}.ldr`);
  await page.waitForFunction(file=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.state.modelFile===file,`${id}.ldr`);
  await tidalInstructionsInteractions(page,{...opts,pieces,prefix:id,minSteps:5});
  await page.screenshot({path:resolve(opts.shotsDir,`${id}-instructions-closed.png`)});
 }
 return r;
};
