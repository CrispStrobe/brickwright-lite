// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installBrowserMechanicsRecorder} from '../scripts/lib/sim-lab-browser-recorder.mjs';

test('browser observer preserves the original API receiver, arguments, result and Promise identity',async()=>{
 const previous=globalThis.window,calls=[],result={actual:'controller-result'},promise=Promise.resolve(result);
 const api={motors:()=>[{port:'A',hub:'hub',direct:true}],encoder:()=>({ok:true,angleDeg:7})};
 for(const name of ['start','stopMotor','runMotorDegrees','setMotorPower','setMotorSpeed','motorAngle','motorSpeed'])api[name]=function(...args){calls.push({name,args,receiver:this});return name==='runMotorDegrees'?promise:result;};
 const originals={...api},pose={position:[0,0,0],rotation:[0,0,0,1]},mechanism={bodies:[{id:'body',motion:'dynamic'}],joints:[{id:'joint',type:'hinge'}],actuators:[{port:'A',joint:'joint'}]};
 const session={time:0,model:{parts:[]},runModel:{parts:[]},mechanism,bridge:{hubBody:'hub'},core:{bodyPose:()=>pose,jointState:()=>({angle:0}),ropeState:()=>[]},onAdvance:()=>{}};
 const pane={session,state:{issues:[]},hub:{motors:{busy:()=>false,_controllers:[{mode:'hold'}]}},props:{vm:{runtime:{robotLab:api,threads:[{status:0}],targets:[{getName:()=> 'Stage',variables:{completed:{name:'completed',value:0}}}]}}}};
 globalThis.window={__bwSimLab:{_pane:pane}};
 try{
  installBrowserMechanicsRecorder({recordKey:'record',captureKey:'capture',extended:true});assert.equal(calls.length,0,'installing an observer issues no controller command');
  assert.equal(api.runMotorDegrees('A',42,25),promise,'the actual controller Promise is returned unchanged');await promise;await Promise.resolve();
  assert.equal(calls.length,1);assert.equal(calls[0].receiver,api);assert.deepEqual(calls[0].args,['A',42,25]);assert.equal(window.record.apiEvents[0].result,result);
  assert.equal(api.stopMotor('A','hold'),result,'synchronous API result retains its identity');
  window.capture();assert.equal(window.record.track.length,1,'an explicit read does not invent a second time step');
  session.time=25;window.capture();assert.deepEqual(window.record.track.map(f=>f.t),[0,25]);
  window.__bwRestoreMechanicsRecorder();for(const name of Object.keys(originals))assert.equal(api[name],originals[name]);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
