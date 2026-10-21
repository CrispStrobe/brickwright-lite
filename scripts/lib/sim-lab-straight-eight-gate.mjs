// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {tidalInstructionsInteractions} from './sim-lab-tidal-gate.mjs';
import {judgeStraightEightRun} from './sim-lab-straight-eight-judge.mjs';
export const straightEightInteractions=async(page,opts)=>{
 page.setDefaultTimeout(90000);
 const models=['straight-eight'];
 const result=await mechanicsInteractions(page,{...opts,models,judge:(_id,r)=>judgeStraightEightRun(r),simulatedMs:14000});
 await manualMechanicsInteractions(page,{...opts,models});
 await page.getByTestId('bw-sim-lab-lesson').click();const lesson=page.getByTestId('bw-sim-lesson');
 await page.waitForFunction(()=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson==='straight-eight');
 assert.match(await lesson.textContent(),/Peaucellier/);
 await lesson.getByRole('button',{name:'Show explanation',exact:true}).click();
 assert.match(await lesson.getByTestId('bw-sim-lesson-answer').textContent(),/tan/);
 await lesson.screenshot({path:resolve(opts.shotsDir,'straight-eight-lesson.png')});
 await lesson.getByRole('button',{name:'Close lesson',exact:true}).click();
 await tidalInstructionsInteractions(page,{...opts,pieces:113,prefix:'straight-eight',minSteps:5});
 return result;
};
