// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Serialized by Playwright into the real application page. Extended mode reads
// native encoders and observes actual API calls; it never drives a motor itself.
export function installBrowserMechanicsRecorder({recordKey,captureKey,extended=false,observeProgram=true}){
 window.__bwRestoreMechanicsRecorder?.();
 const pane=window.__bwSimLab._pane,s=pane.session,m=s.mechanism,vm=pane.props.vm;
 const r=window[recordKey]={start:s.time,runModel:s.runModel,model:s.model,mechanism:m,hubId:s.bridge.hubBody,issues:pane.state.issues,unsupported:[],track:[]};
 const api=vm.runtime.robotLab;
 const targets=()=>vm.runtime.targets.map(t=>({name:t.getName(),variables:Object.fromEntries(Object.values(t.variables||{}).map(v=>[v.name,v.value]))}));
 const variables=()=>Object.assign({},...targets().map(t=>t.variables));
 let started=false;
 if(extended){
  r.controlledMotors=api.motors();r.apiEvents=[];r.refusals=[];const originals={};
  for(const name of ['start','stopMotor','runMotorDegrees','setMotorPower','setMotorSpeed','motorAngle','motorSpeed']){
   const original=api[name];originals[name]=original;
   api[name]=function(...args){
    const event=name==='motorAngle'||name==='motorSpeed'?null:{name,args,t:s.time,variables:variables(),...(name==='runMotorDegrees'?{encoderAtCall:api.encoder(args[0])}:{})};
    if(event)r.apiEvents.push(event);
    const observe=result=>{
     if(result?.ok===false||(name==='runMotorDegrees'&&result!=='completed'))r.refusals.push({name,args,result,t:s.time});
     if(event)Object.assign(event,{result,resolvedAt:s.time,...(name==='runMotorDegrees'?{encoderAtResolution:api.encoder(args[0])}:{})});
    };
    const result=original.apply(this,args);
    if(result&&typeof result.then==='function')result.then(observe,error=>r.refusals.push({name,args,error:String(error),t:s.time}));else observe(result);
    return result; // Preserve the exact original result and Promise identity.
   };
  }
  window.__bwRestoreMechanicsRecorder=()=>{for(const[name,original]of Object.entries(originals))api[name]=original;};
 }
 const capture=()=>{
  if(observeProgram&&!r.finishedAt&&s.time-r.start>1000&&!vm.runtime.threads.some(t=>t.status!==4))r.finishedAt=s.time;
  const extra=observeProgram?{ropes:s.core.ropeState(),variables:variables()}:null;
  const frame={t:s.time,bodies:Object.fromEntries(m.bodies.filter(b=>b.motion==='dynamic').map(b=>[b.id,s.core.bodyPose(b.id)])),
   joints:Object.fromEntries(m.joints.filter(j=>['hinge','slider'].includes(j.type)).map(j=>[j.id,s.core.jointState(j.id)])),
   busy:Object.fromEntries(m.actuators.map(a=>[a.port,pane.hub.motors.busy(a.port)])),...(extra?{extra}:{})};
  if(extended){
   const groups=targets();r.programVariables=groups;
   Object.assign(frame,{phase:!started?'cold':r.finishedAt&&s.time>r.finishedAt?'after':'program',variables:groups,
    encoder:Object.fromEntries(r.controlledMotors.map(a=>[a.port,api.encoder(a.port)]))});
   frame.extra.modes=Object.fromEntries(m.actuators.map(a=>[a.port,pane.hub.motors._controllers[a.port.charCodeAt(0)-65].mode]));
  }
  // An explicit final read can share a physics timestamp with onAdvance.
  // Keep its freshest observation without inventing a zero-duration step.
  if(extended&&r.track.at(-1)?.t===frame.t)r.track[r.track.length-1]=frame;else r.track.push(frame);
 };
 window[captureKey]=capture;
 if(extended){capture();started=true;} // Real paused initial snapshot, not a cold-duration claim.
 s.onAdvance(capture);
}
