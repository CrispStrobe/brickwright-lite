// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {captureRenderedModel} from './sim-lab-rendered-model-gate.mjs';
import {openFile} from './sim-lab-scale-gate.mjs';
import {exportedProject} from './sim-lab-integral-gate.mjs';

export async function intakeRoundtrip(page,opts,id,judge){
 await page.getByTestId('bw-sim-lab-reset').click();
 await page.waitForFunction(()=>window.__bwSimLab.status==='ready');
 const record=await page.evaluate(()=>window.__bwSimLab.projectRecord);
 const expected=await page.evaluate(()=>window.__bwSimLab._pane.session.model.parts);
 assert.match(record.ldraw,/^0 Author: (?:CrispStrobe|Christian Ströbele)/m);
 const project=resolve(opts.shotsDir,id+'.sb3');
 await page.getByText('File',{exact:true}).click();await exportedProject(page,project);
 const source=readFileSync('overlay/scratch-gui/static/sim-lab/models/'+id+'.ldr','utf8');
 for(const [name,text]of [[id+'.ldr',source],[id+'.mpd','0 FILE '+id+'.ldr\n'+source+'\n0 NOFILE\n']]){
  await openFile(page,{name,buffer:Buffer.from(text)});
  const actual=await page.evaluate(()=>({status:window.__bwSimLab.status,parts:window.__bwSimLab._pane.session.model.parts}));
  assert.equal(actual.status,'ready');assert.deepEqual(actual.parts,expected);
 }
 const reopened=await page.context().browser().newPage({viewport:{width:1600,height:1050},serviceWorkers:'block'}),errors=[];
 reopened.on('pageerror',e=>errors.push(e.message));reopened.on('dialog',d=>d.accept());
 try{
  await opts.openSimLab(reopened,{program:null});
  await reopened.getByText('File',{exact:true}).click();await reopened.getByText('Load from your computer',{exact:true}).click();
  await reopened.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(project);
  await reopened.getByRole('tab',{name:/^(Robots|Robot Lab)$/}).click();
  await reopened.waitForFunction(count=>window.__bwSimLab?.status==='ready'&&window.__bwSimLab._pane.session.model.parts.length===count,expected.length);
  assert.deepEqual(await reopened.evaluate(()=>window.__bwSimLab.projectRecord),record);
  await reopened.evaluate(()=>{
   const p=window.__bwSimLab._pane,s=p.session,m=s.mechanism;
   const r=window.__bwIntakeReopened={start:s.time,runModel:s.runModel,mechanism:m,issues:p.state.issues,unsupported:[],track:[]};
   const capture=()=>{
    if(!r.finishedAt&&s.time-r.start>1000&&!p.props.vm.runtime.threads.some(t=>t.status!==4))r.finishedAt=s.time;
    r.track.push({t:s.time,bodies:Object.fromEntries(m.bodies.filter(b=>b.motion==='dynamic').map(b=>[b.id,s.core.bodyPose(b.id)])),joints:Object.fromEntries(m.joints.filter(j=>['hinge','slider'].includes(j.type)).map(j=>[j.id,s.core.jointState(j.id)])),extra:{variables:Object.fromEntries(p.props.vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value])))}});
   };
   window.__bwCaptureIntakeReopened=capture;s.onAdvance(capture);
  });
  await reopened.getByTestId('bw-sim-lab-speed').selectOption('4');await reopened.getByTestId('bw-sim-lab-run').click();
  await reopened.waitForFunction(()=>{
   const p=window.__bwSimLab._pane;return p.session.time>1000&&!p.props.vm.runtime.threads.some(t=>t.status!==4);
  },null,{timeout:opts.timeout});
  // Completion alone does not observe passive support after the motors stop.
  // Keep the ordinary simulation advancing for the declared hold interval.
  await reopened.waitForFunction(()=>{
   const r=window.__bwIntakeReopened;
   return Number.isFinite(r.finishedAt)&&r.track.at(-1)?.t-r.finishedAt>=1000;
  },null,{timeout:opts.timeout});
  await reopened.evaluate(()=>window.__bwCaptureIntakeReopened());
  const r=await reopened.evaluate(()=>window.__bwIntakeReopened);
  writeFileSync(resolve(opts.shotsDir,id+'-reopened-track.json'),JSON.stringify(r));judge(id,r);
  assert.deepEqual(errors,[]);
  // Capture the accepted final state after the full hold has been recorded.
  if(await reopened.evaluate(()=>window.__bwSimLab.status==='running'))await reopened.getByTestId('bw-sim-lab-pause').click();
  await captureRenderedModel(reopened,resolve(opts.shotsDir,id+'-reopened.png'));
  console.log(`PASS ${id}: raw LDR/MPD, actual project save, fresh-context reopen and complete saved program`);
 }finally{await reopened.close();}
}
