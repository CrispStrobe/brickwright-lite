// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';
const ready=async(page,id)=>{
 const lesson=page.getByTestId('bw-sim-lesson');await lesson.waitFor();
 await page.waitForFunction(want=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson===want,id);
 return lesson;
};
export const lessonInteractions=async(page,{openSimLab,shotsDir})=>{
 mkdirSync(shotsDir,{recursive:true});const requests=[];
 page.on('request',r=>{if(r.url().includes('/sim-lab/lessons/'))requests.push(r.url());});
 await openSimLab(page,{program:null});assert.equal(requests.length,0,'lessons stay out of initial loading');
 const before=await page.evaluate(()=>window.__bwSimLab._pane.state.shipped);
 await page.getByTestId('bw-sim-lab-examples').click();const gallery=page.getByTestId('bw-sim-examples');
 await gallery.getByRole('searchbox').fill('pulse-percussion');
 await gallery.getByRole('button',{name:/^Read lesson:/}).click();await gallery.waitFor({state:'hidden'});
 let lesson=await ready(page,'pulse-percussion');
 assert.equal(await page.evaluate(()=>window.__bwSimLab._pane.state.shipped),before,'reading does not replace the current model');
 for(const name of ['What you see','Try this','What is going on','Why it matters','Predict first','Go further'])assert.equal(await lesson.getByRole('heading',{name,exact:true}).count(),1);
 assert.ok(await lesson.getByTestId('bw-sim-lesson-steps').locator('li').count()>=3);
 await lesson.getByRole('button',{name:'Show explanation',exact:true}).click();
 assert.match(await lesson.getByTestId('bw-sim-lesson-answer').textContent(),/angular spacing|angle|spacing/);
 await lesson.screenshot({path:resolve(shotsDir,'pulse-lesson.png')});
 await lesson.getByRole('button',{name:'Open model + program',exact:true}).click();
 await page.waitForFunction(()=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.state.modelFile==='pulse-percussion.ldr').catch(async error=>{
  console.error('Lesson model readiness failure',await page.evaluate(()=>{const p=window.__bwSimLab._pane;return{model:p.state.modelFile,status:p.state.status,programLoading:p.state.programLoading,message:p.state.message,info:p.state.info,target:!!p.props.vm.editingTarget,threads:p.props.vm.runtime.threads.length};}));
  throw error;
 });
 await page.getByTestId('bw-sim-lab-run').click();
 await page.waitForFunction(()=>window.__bwSimLab._pane.session.time>2500);
 assert.equal(await lesson.isVisible(),true,'lesson stays readable while the actual worker runs');
 await page.getByTestId('bw-sim-lab-pause').click();
 await lesson.getByRole('button',{name:'Close lesson',exact:true}).focus();
 await page.keyboard.press('Escape');await lesson.waitFor({state:'hidden'});
 assert.equal(await page.getByTestId('bw-sim-lab-lesson').evaluate(e=>e===document.activeElement),true);
 // A failed local lesson request is visible and retry uses the real bundled file.
 let failed=false;
 await page.route('**/static/sim-lab/lessons/orbital-loom.en.json',async route=>{
  if(!failed){failed=true;await route.fulfill({status:503,body:'test unavailable'});}else await route.continue();
 });
 await page.getByTestId('bw-sim-lab-model').selectOption('orbital-loom.ldr');
 await page.waitForFunction(()=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.state.modelFile==='orbital-loom.ldr');
 await page.getByTestId('bw-sim-lab-lesson').click();lesson=page.getByTestId('bw-sim-lesson');
 await lesson.getByRole('alert').waitFor();assert.match(await lesson.getByRole('alert').textContent(),/503/);
 await lesson.getByRole('button',{name:'Try again',exact:true}).click();await ready(page,'orbital-loom');
 await page.getByTestId('bw-sim-lab-model').selectOption('orbital-loom-sevenfold');
 await ready(page,'orbital-loom-sevenfold');assert.match(await lesson.textContent(),/7 pen turns/);
 await page.setViewportSize({width:1024,height:900});
 await page.getByRole('button',{name:'Show right panel',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.overlay==='true');
 const rect=await lesson.boundingBox(),lab=await page.getByTestId('bw-sim-lab').boundingBox();
 assert.ok(lab.width<900&&rect.x>=lab.x&&rect.x+rect.width<=lab.x+lab.width+1&&rect.height>150);
 await page.screenshot({path:resolve(shotsDir,'lesson-narrow.png')});
 await lesson.getByRole('button',{name:'Close lesson',exact:true}).click();
 await page.getByTestId('bw-sim-lab-mode-build').click();
 await page.getByTestId('bw-sim-lab-lesson').click();await ready(page,'orbital-loom-sevenfold');
 console.log('PASS lessons: lazy loading, authored content, prediction reveal, real model/program loading, reading during worker motion, failure/retry, preset following and narrow Build reader');
};
export const germanLessonInteractions=async(page,{openSimLab,shotsDir})=>{
 await openSimLab(page,{program:null});
 await page.getByTestId('bw-sim-lab-examples').click();const gallery=page.getByTestId('bw-sim-examples');
 await gallery.getByRole('searchbox').fill('centrifugal-governor');
 await gallery.getByRole('button',{name:/^Lektion lesen:/}).click();await gallery.waitFor({state:'hidden'});
 const lesson=await ready(page,'centrifugal-governor');
 for(const name of ['Was du siehst','Probiere es aus','Was dahintersteckt','Wozu das wichtig ist','Erst vorhersagen','Weiterforschen'])assert.equal(await lesson.getByRole('heading',{name,exact:true}).count(),1);
 await lesson.getByRole('button',{name:'Erklärung zeigen',exact:true}).click();assert.match(await lesson.getByTestId('bw-sim-lesson-answer').textContent(),/Quadrat/);

 assert.match(await lesson.textContent(),/Punktmassen-Näherung/);
 await page.screenshot({path:resolve(shotsDir,'lesson-german.png')});
 await lesson.locator('[data-related-model="survey-rover.ldr"]').click();await ready(page,'survey-rover');
 assert.match(await lesson.textContent(),/Schwerkraft/);
 await lesson.getByRole('button',{name:'Lektion schließen',exact:true}).click();
 console.log('PASS German authored model lesson and prediction explanation');
};
