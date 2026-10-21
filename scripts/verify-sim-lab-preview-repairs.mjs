#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Cold browser check of automatic Blocks, drawing, resolver and camera following.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openRobotLabTab} from './lib/sim-lab-toolbar-gate.mjs';
import {judgeAxisPlotter} from './lib/sim-lab-axis-plotter-judge.mjs';
const url=process.env.BW_PREVIEW_URL||'http://127.0.0.1:8767/';
const dir=resolve('artifacts/preview-repairs');mkdirSync(dir,{recursive:true});
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true,...(name==='chromium'?{args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']}: {})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(90000);
  const errors=[],missing=[],warnings=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.dat(?:$|\?)/.test(r.url()))missing.push(r.url());});
  page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('bw-starter-v1-complete','1');localStorage.setItem('bw-right-pane-hidden','1');});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await openRobotLabTab(page);await page.waitForFunction(()=>window.__bwSimLab?.status==='ready');
  const select=async id=>{
   await page.getByTestId('bw-sim-lab-examples').click();const gallery=page.getByTestId('bw-sim-examples');await gallery.getByRole('searchbox').fill(id);
   await gallery.locator(`[data-model="${id}.ldr"]`).getByRole('button',{name:/^Open model \+ program:/}).click();
   await page.waitForFunction(file=>{const p=window.__bwSimLab?._pane;return p?.state.modelFile===file&&p.state.status==='ready'&&!p.state.programLoading&&p.props.vm.runtime.targets.some(t=>t.blocks.getScripts().length);},id+'.ldr');
   await page.getByTestId('bw-sim-lab-3d-canvas').waitFor();
  };
  await page.evaluate(()=>{const p=window.__bwCold={last:performance.now(),maxGap:0,blankSamples:0,seen:false};p.timer=setInterval(()=>{const now=performance.now();p.maxGap=Math.max(p.maxGap,now-p.last);p.last=now;const el=document.querySelector('[data-testid="bw-sim-lab-3d-canvas"]');const pane=window.__bwSimLab?._pane;if(pane?.state.modelFile==='axis-plotter.ldr'&&pane.state.view3d==='webgl'&&el?.getBoundingClientRect().height>20)p.seen=true;else if(p.seen)p.blankSamples++;},50);});
  const start=Date.now();await select('axis-plotter');const elapsed=Date.now()-start;
  const cold=await page.evaluate(()=>{const p=window.__bwCold;clearInterval(p.timer);const pane=window.__bwSimLab._pane;return {maxGap:p.maxGap,blankSamples:p.blankSamples,blocks:pane.props.vm.runtime.targets.reduce((n,t)=>n+Object.keys(t.blocks._blocks).length,0),view3d:pane.state.view3d,worker:Boolean(pane.session.worker)};});
  assert.equal(cold.view3d,'webgl');assert.ok(cold.worker);assert.ok(cold.blocks<250,JSON.stringify(cold));assert.ok(elapsed<20000,`cold selection ${elapsed} ms`);assert.equal(cold.blankSamples,0,'model stays visible through automatic project conversion');
  await page.evaluate(()=>{const p=window.__bwSimLab._pane,s=p.session,m=s.mechanism;window.__bwRepairRun={mechanism:m,track:[]};s.onAdvance(()=>window.__bwRepairRun.track.push({t:s.time,bodies:Object.fromEntries(m.bodies.filter(b=>b.motion==='dynamic').map(b=>[b.id,s.core.bodyPose(b.id)])),joints:Object.fromEntries(m.joints.filter(j=>['hinge','slider'].includes(j.type)).map(j=>[j.id,s.core.jointState(j.id)]))}));});
  await page.getByTestId('bw-sim-lab-speed').selectOption('4');await page.getByTestId('bw-sim-lab-run').click();
  await page.waitForFunction(()=>window.__bwSimLab._pane.session.time>=90000,null,{timeout:180000});
  const drawing=judgeAxisPlotter(await page.evaluate(()=>window.__bwRepairRun));
  const ink=await page.evaluate(()=>window.__bwSimLab._pane.view.penStrokes());assert.equal(ink.length,2);assert.ok(ink[0].length>200&&ink[1].length>40);await page.waitForFunction(()=>document.querySelectorAll('[data-testid="bw-sim-drawing-preview"] svg path').length===2);assert.equal(await page.getByTestId('bw-sim-drawing-preview').locator('svg').getAttribute('aria-label'),'Live drawing');
  const preview=page.getByTestId('bw-sim-drawing-preview');await preview.locator('summary').click();assert.equal(await preview.locator('svg').isVisible(),false);await preview.locator('summary').click();assert.equal(await preview.locator('svg').isVisible(),true);
  await page.screenshot({path:resolve(dir,name+'-axis-drawing.png')});
  await select('orbital-loom');const notes=await page.getByTestId('bw-sim-lab-issues').textContent();assert.match(notes,/other joints can still turn/);assert.match(notes,/4 ×/);
  await select('centrifugal-governor');
  await page.evaluate(()=>{const p=window.__bwSimLab._pane;window.__bwCameraSamples=[];p.session.onAdvance(()=>window.__bwCameraSamples.push(p.view.camera));});
  await page.getByTestId('bw-sim-lab-speed').selectOption('4');await page.getByTestId('bw-sim-lab-run').click();
  await page.waitForFunction(()=>window.__bwSimLab._pane.session.time>14000,null,{timeout:90000});
  const cameras=await page.evaluate(()=>window.__bwCameraSamples);const first=cameras[0];
  const cameraTravel=Math.max(...cameras.map(c=>Math.hypot(...c.position.map((v,k)=>v-first.position[k]))));
  assert.ok(cameraTravel<.0005,`governor camera moves only with tiny frame settling: ${cameraTravel} m`);
  await page.screenshot({path:resolve(dir,name+'-governor.png')});assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(warnings.filter(w=>w.includes('overwrites prior definition')),[], 'refreshing extension menus must not redefine unchanged blocks');
  const result={browser:name,coldSelectionMs:elapsed,...cold,drawing,inkPoints:ink.map(s=>s.length),cameraTravelM:cameraTravel,errors,missing,warnings};
  writeFileSync(resolve(dir,name+'-browser.json'),JSON.stringify(result,null,2)+'\n');console.log('PASS',JSON.stringify({...result,warnings:warnings.length}));
 }finally{await browser.close();}
}
