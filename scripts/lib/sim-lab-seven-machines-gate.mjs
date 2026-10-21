// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {openManualControls} from './sim-lab-manual-controls.mjs';
import {judgeSevenMachinesRun} from './sim-lab-seven-machines-judge.mjs';
export const SEVEN_MODELS=[['mean-machine',212,26000],['stepworks',240,30000],['stride-lab',75,36000],['twinpoint',117,90000],['butterfly',224,40000],['tempo-loop',85,36000],['tilt-lab',161,40000],['axis-plotter',256,110000]];
export const sevenMachinesInteractions=async(page,opts)=>{
 page.setDefaultTimeout(90000);const results={};
 for(const [id,,ms]of SEVEN_MODELS)Object.assign(results,await mechanicsInteractions(page,{...opts,models:[id],simulatedMs:ms,speed:4,judge:judgeSevenMachinesRun}));
 await checkPlotterInk(page,opts);
 await manualMechanicsInteractions(page,{...opts,models:SEVEN_MODELS.map(([id])=>id).filter(id=>id!=='tilt-lab')});
 await page.getByTestId('bw-sim-lab-model').selectOption('tilt-lab.ldr');await page.waitForFunction(()=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.state.modelFile==='tilt-lab.ldr');
 await page.getByTestId('bw-sim-lab-speed').selectOption('1');await openManualControls(page,{override:true,motors:true});
 await page.getByTestId('bw-sim-lab-mixer-stop-all').click();
 for(const port of ['A','B']){
  const angle=()=>page.evaluate(port=>{const s=window.__bwSimLab._pane.session;return s.core.jointState(s.mechanism.actuators.find(a=>a.port===port).joint).angle;},port);
  const before=await angle(),slider=page.locator(`[data-testid="bw-sim-lab-mixer-slider"][data-port="${port}"]`);
  await slider.focus();await page.keyboard.press('ArrowRight');
  await page.evaluate(()=>new Promise(done=>{const s=window.__bwSimLab._pane.session,t=s.time;const off=s.onAdvance(()=>{if(s.time-t>=100){off();done();}});}));
  await page.locator(`[data-testid="bw-sim-lab-mixer-stop"][data-port="${port}"]`).click();
  assert.ok(Math.abs(await angle()-before)>.025,`Tilt Lab ${port} short jog responds`);assert.equal(await slider.inputValue(),'0');
 }
 await page.getByTestId('bw-sim-lab-mixer-stop-all').click();await page.screenshot({path:resolve(opts.shotsDir,'tilt-lab-manual.png')});
 for(const [id,pieces]of SEVEN_MODELS){
  await page.getByTestId('bw-sim-lab-model').selectOption(id+'.ldr');await page.waitForFunction(file=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.state.modelFile===file,id+'.ldr');
  await page.getByTestId('bw-sim-lab-lesson').click();const lesson=page.getByTestId('bw-sim-lesson');
  await page.waitForFunction(id=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson===id,id);
  await lesson.getByRole('button',{name:'Show explanation',exact:true}).click();assert.ok((await lesson.getByTestId('bw-sim-lesson-answer').textContent()).length>70);
  await lesson.screenshot({path:resolve(opts.shotsDir,id+'-lesson.png')});await lesson.getByRole('button',{name:'Close lesson',exact:true}).click();
  await page.getByTestId('bw-sim-lab-instructions').click();const dialog=page.getByTestId('bw-sim-instructions');await dialog.waitFor();await page.waitForFunction(()=>window.__bwSimLabInstructions?.status==='ready'&&window.__bwSimLabInstructions.stats?.step===0);
  const plan=await page.evaluate(()=>window.__bwSimLabInstructions.plan);assert.equal(plan.steps.flatMap(s=>s.parts).length,pieces);
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>window.__bwSimLabInstructions.stats?.step===1);await page.keyboard.press('End');await page.waitForFunction(()=>window.__bwSimLabInstructions.page===window.__bwSimLabInstructions.steps);
  const bom=page.getByTestId('bw-sim-instructions-bom');await bom.waitFor();assert.equal(await bom.getByTestId('bw-sim-instructions-part').evaluateAll(es=>es.reduce((n,e)=>n+Number(e.dataset.count),0)),pieces);
  await dialog.screenshot({path:resolve(opts.shotsDir,id+'-bom.png')});await page.keyboard.press('Home');await page.waitForFunction(()=>window.__bwSimLabInstructions.stats?.step===0);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  console.log(`PASS ${id}: EN lesson/reveal, first/next/Home/End/BOM, ${pieces} pieces, ${plan.steps.length} planned pages`);
 }
 return results;
};
export const sevenGermanLessons=async(page,opts)=>{
 await opts.openSimLab(page,{program:null});
 for(const [id]of SEVEN_MODELS){
  await page.getByTestId('bw-sim-lab-examples').click();const gallery=page.getByTestId('bw-sim-examples');await gallery.getByRole('searchbox').fill(id);
  await gallery.locator(`[data-model="${id}.ldr"]`).getByRole('button',{name:/^Lektion lesen:/}).click();await gallery.waitFor({state:'hidden'});
  const lesson=page.getByTestId('bw-sim-lesson');await page.waitForFunction(id=>document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson===id,id);await lesson.getByRole('button',{name:'Erklärung zeigen',exact:true}).click();assert.ok((await lesson.getByTestId('bw-sim-lesson-answer').textContent()).length>70);
  await lesson.screenshot({path:resolve(opts.shotsDir,id+'-lesson-de.png')});await lesson.getByRole('button',{name:'Lektion schließen',exact:true}).click();console.log('PASS German lesson '+id);
 }
};

// Verify the distributable files through the actual file input, then assert
// that the rendered pen layer agrees with the physical calibration run.
export const fixedMachinesInteractions=async(page,opts)=>{
 const {readFileSync}=await import('node:fs');
 assert.ok(opts.fixedModelsDir,'exported library directory is required');
 await opts.openSimLab(page,{program:null});
 for(const [id,pieces]of SEVEN_MODELS)for(const ext of ['ldr','mpd']){
  await page.evaluate(()=>{window.__bwFixedOldSession=window.__bwSimLab._pane.session;});
  await page.getByTestId('bw-sim-lab-file').setInputFiles({name:id+'.'+ext,mimeType:'text/plain',buffer:readFileSync(resolve(opts.fixedModelsDir,'models',id+'.'+ext))});
  await page.waitForFunction(({pieces,id})=>window.__bwSimLab?.status==='ready'&&window.__bwSimLab._pane.session!==window.__bwFixedOldSession&&window.__bwSimLab._pane.session?.model.parts.length===pieces&&window.__bwSimLab._pane.session.model.parts.some(p=>p.id===(id==='axis-plotter'?'z_pen_proxy':id==='tilt-lab'?'maze_ball':id==='tempo-loop'?'outputCrank':id==='butterfly'?'wing_left_spine':id==='twinpoint'?'hingeP':id==='stride-lab'?'coupler':id==='stepworks'?'pallet_rung_front':'mean_pointer')),{pieces,id});
  const model=await page.evaluate(()=>window.__bwSimLab._pane.session.model);
  if(id==='axis-plotter')assert.ok(model.parts.find(p=>p.id==='z_pen_proxy').pen,'file import retains pen');
  if(id==='butterfly')assert.equal(model.parts.filter(p=>p.slides?.length).length,2,'file import retains per-instance slides');
  console.log(`PASS fixed ${id}.${ext}: ${pieces} pieces`);
 }
 await mechanicsInteractions(page,{...opts,models:['axis-plotter'],simulatedMs:110000,speed:4,judge:judgeSevenMachinesRun});
 await checkPlotterInk(page,opts);
};

const checkPlotterInk=async(page,opts)=>{
 const ink=await page.evaluate(()=>window.__bwSimLab._pane.view.penStrokes());
 writeFileSync(resolve(opts.shotsDir,'axis-plotter-ink.json'),JSON.stringify(ink));
 console.log('Axis Plotter sampled stroke sizes: '+ink.map(s=>s.length).join('/'));
 assert.equal(ink.length,2,'rendered pen lifts between square and diagonal');assert.ok(ink[0].length>200&&ink[1].length>40,'rendered drawing has full-length strokes');
 console.log(`PASS Axis Plotter rendered ink: ${ink.map(s=>s.length).join('/')} points in two strokes`);
};
