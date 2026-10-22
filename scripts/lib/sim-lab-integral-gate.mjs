// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openFile} from './sim-lab-scale-gate.mjs';
import {judgeIntegral} from './sim-lab-integral-judge.mjs';

export async function integralRoundtrip(page,opts){
 assert.match(await page.locator('input[class*="project-title"]').inputValue(),/Integral/);
 await page.getByTestId('bw-sim-lab-reset').click();
 await page.waitForFunction(()=>window.__bwSimLab.status==='ready');
 const record=await page.evaluate(()=>window.__bwSimLab.projectRecord);
 assert.match(record.ldraw,/^0 Author: CrispStrobe$/m);
 await page.getByText('File',{exact:true}).click();
 const downloading=page.waitForEvent('download');
 await page.getByText('Save to your computer',{exact:true}).click();
 const project=resolve(opts.shotsDir,'integral.sb3');await(await downloading).saveAs(project);
 const source=readFileSync('overlay/scratch-gui/static/sim-lab/models/integral.ldr','utf8');
 for(const [name,text]of [['integral.ldr',source],['integral.mpd','0 FILE integral.ldr\n'+source+'\n0 NOFILE\n']]){
  await openFile(page,{name,buffer:Buffer.from(text)});
  const model=await page.evaluate(()=>{const p=window.__bwSimLab._pane;return {status:p.state.status,parts:p.session.model.parts,mechanism:p.session.mechanism};});
  assert.equal(model.status,'ready');assert.equal(model.parts.length,154);
  assert.deepEqual(model.mechanism.actuators.map(a=>a.port),['A','B']);
  assert.ok(model.mechanism.joints.filter(j=>j.type==='hinge'&&!j.motor).every(j=>!j.frictionNm),'raw imports preserve free passive bearings');
 }
 const reopened=await page.context().browser().newPage({viewport:{width:1600,height:1050},serviceWorkers:'block'});
 const errors=[];reopened.on('pageerror',e=>errors.push(e.message));reopened.on('dialog',d=>d.accept());
 try{
  await opts.openSimLab(reopened,{program:null});
  await reopened.getByText('File',{exact:true}).click();await reopened.getByText('Load from your computer',{exact:true}).click();
  await reopened.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(project);
  await reopened.waitForFunction(()=>document.querySelector('input[class*="project-title"]')?.value.includes('Integral'));
  await reopened.getByRole('tab',{name:/^(Robots|Robot Lab)$/}).click();
  await reopened.waitForFunction(()=>window.__bwSimLab?.status==='ready'&&window.__bwSimLab._pane.session.model.parts.length===154);
  assert.deepEqual(await reopened.evaluate(()=>window.__bwSimLab.projectRecord),record,'actual saved model survives a fresh-context project reopen');
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
 }finally{await reopened.close();}
}
