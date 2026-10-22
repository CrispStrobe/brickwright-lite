// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openFile} from './sim-lab-scale-gate.mjs';
import {judgeIntegral} from './sim-lab-integral-judge.mjs';

export async function exportedProject(page,project){
 // WebKit uses the real system-share API instead of an anchor download. Observe
 // the exact File passed to that API, forwarding identical arguments and its
 // original return value. This verifies serialization, not recipient delivery.
 await page.evaluate(()=>{
  if(typeof navigator.share!=='function')return;
  const state=window.__bwProjectShareObservation={original:navigator.share,own:Object.getOwnPropertyDescriptor(navigator,'share'),files:[]};
  Object.defineProperty(navigator,'share',{configurable:true,value:function(data){
   for(const file of data.files||[])if(/\.sb3$/i.test(file.name))file.arrayBuffer().then(bytes=>state.files.push({name:file.name,bytes:Array.from(new Uint8Array(bytes))}));
   return Reflect.apply(state.original,this,[data]);
  }});
 });
 const download=page.waitForEvent('download',{timeout:30000}).then(async d=>{await d.saveAs(project);return 'browser download';});
 const shared=page.waitForFunction(()=>window.__bwProjectShareObservation?.files.length>0,null,{timeout:30000}).then(async()=>{
  const file=await page.evaluate(()=>window.__bwProjectShareObservation.files[0]);writeFileSync(project,Buffer.from(file.bytes));return 'file handed to real system-share API';
 });
 try{
  await page.getByText('Save to your computer',{exact:true}).click();
  const route=await Promise.any([download,shared]);console.log('PASS Integral GUI export: '+route);
  await page.keyboard.press('Escape');
 }finally{
  await page.evaluate(()=>{const state=window.__bwProjectShareObservation;if(!state)return;if(state.own)Object.defineProperty(navigator,'share',state.own);else delete navigator.share;delete window.__bwProjectShareObservation;});
 }
}

export async function integralRoundtrip(page,opts){
 assert.match(await page.locator('input[class*="project-title"]').inputValue(),/Integral/);
 await page.getByTestId('bw-sim-lab-reset').click();
 await page.waitForFunction(()=>window.__bwSimLab.status==='ready');
 const record=await page.evaluate(()=>window.__bwSimLab.projectRecord);
 assert.match(record.ldraw,/^0 Author: CrispStrobe$/m);
 await page.getByText('File',{exact:true}).click();
 const project=resolve(opts.shotsDir,'integral.sb3');await exportedProject(page,project);
 const source=readFileSync('overlay/scratch-gui/static/sim-lab/models/integral.ldr','utf8');
 for(const [name,text]of [['integral.ldr',source],['integral.mpd','0 FILE integral.ldr\n'+source+'\n0 NOFILE\n']]){
  await openFile(page,{name,buffer:Buffer.from(text)});
  const model=await page.evaluate(()=>{const p=window.__bwSimLab._pane;return {status:p.state.status,parts:p.session.model.parts,mechanism:p.session.mechanism};});
  console.log('PASS Integral raw import: '+name);
  assert.equal(model.status,'ready');assert.equal(model.parts.length,155);
  assert.deepEqual(model.mechanism.actuators.map(a=>a.port),['A','B']);
  assert.ok(model.mechanism.joints.filter(j=>j.type==='hinge'&&!j.motor).every(j=>!j.frictionNm),'raw imports preserve free passive bearings');
 }
 const reopened=await page.context().browser().newPage({viewport:{width:1600,height:1050},serviceWorkers:'block'});
 const errors=[];reopened.on('pageerror',e=>errors.push(e.message));reopened.on('dialog',d=>d.accept());
 try{
  await opts.openSimLab(reopened,{program:null});
  await reopened.getByText('File',{exact:true}).click();await reopened.getByText('Load from your computer',{exact:true}).click();
  await reopened.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(project);
  await reopened.waitForFunction(()=>document.querySelector('input[class*="project-title"]')?.value.toLowerCase().includes('integral'));
  await reopened.getByRole('tab',{name:/^(Robots|Robot Lab)$/}).click();
  await reopened.waitForFunction(()=>window.__bwSimLab?.status==='ready'&&window.__bwSimLab._pane.session.model.parts.length===155);
  assert.deepEqual(await reopened.evaluate(()=>window.__bwSimLab.projectRecord),record,'actual saved model survives a fresh-context project reopen');
  console.log('PASS Integral: exact saved record restored in a fresh browser context');
  await reopened.evaluate(()=>{
   const p=window.__bwSimLab._pane,s=p.session,m=s.mechanism;
   const r=window.__bwIntegralReopened={start:s.time,runModel:s.runModel,mechanism:m,issues:p.state.issues,unsupported:[],track:[]};
   s.onAdvance(()=>{
    if(!r.finishedAt&&s.time-r.start>1000&&!p.props.vm.runtime.threads.some(t=>t.status!==4))r.finishedAt=s.time;
    r.track.push({t:s.time,bodies:Object.fromEntries(m.bodies.filter(b=>b.motion==='dynamic').map(b=>[b.id,s.core.bodyPose(b.id)])),joints:Object.fromEntries(m.joints.filter(j=>['hinge','slider'].includes(j.type)).map(j=>[j.id,s.core.jointState(j.id)])),extra:{variables:Object.fromEntries(p.props.vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value])))}});
   });
  });
  await reopened.getByTestId('bw-sim-lab-speed').selectOption('4');await reopened.getByTestId('bw-sim-lab-run').click();
  await reopened.waitForFunction(()=>window.__bwSimLab._pane.session.time-window.__bwIntegralReopened.start>=45000,null,{timeout:opts.timeout});
  const r=await reopened.evaluate(()=>window.__bwIntegralReopened);
  writeFileSync(resolve(opts.shotsDir,'integral-reopened-track.json'),JSON.stringify(r));
  const result=judgeIntegral('integral',r);
  assert.deepEqual(errors,[]);console.log('PASS Integral raw LDR/MPD, GUI save/fresh-context reopen and complete passive-output program: '+JSON.stringify(result));
 }catch(error){
  await reopened.screenshot({path:resolve(opts.shotsDir,'integral-reopen-failure.png')}).catch(()=>{});
  throw error;
 }finally{await reopened.close();}
}
