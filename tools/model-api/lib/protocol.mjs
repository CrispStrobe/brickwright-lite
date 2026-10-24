// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
export const LIMITS=Object.freeze({bodyBytes:1048576,modelBytes:786432,programBytes:65536,compressedBytes:45000,parts:2000,dynamicBodies:64,joints:256,measurements:64,programMs:120000,recordedSamples:2001,physicsRecordingTotalMs:15000,physicsRecordingSamples:3001,physicsRecordingMeasurements:24,poseBodies:4,resultBytes:4*1024*1024,wallMs:180000});
export const KINDS=Object.freeze(['mass','weight','speed','angularSpeed','distance','angle','jointAngle','jointSpeed','travel','tension','normalLoad','pointCoordinate','signedAngle','hingeGap','programVariable']);
export class ApiError extends Error{constructor(status,code,message,details){super(message);this.status=status;this.code=code;if(details!==undefined)this.details=details;}}
const bad=m=>{throw new ApiError(422,'invalid-submission',m);};
export const object=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))bad('Unexpected or malformed object fields');return v;};
const text=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const number=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
const marker=v=>{object(v,['part','localLdu']);if(!text(v.part,128))bad('A marker needs a part id');const p=v.localLdu??[0,0,0];if(!Array.isArray(p)||p.length!==3||!p.every(x=>number(x,-100000,100000)))bad('Invalid local LDraw marker point');return{part:v.part,localLdu:p.slice()};};
export function validateSubmission(input){
 object(input,['model','program','settings','measurements']);
 const file=(v,extension,max)=>{object(v,['name','text']);if(!text(v.name,128)||/[\\/]/.test(v.name)||v.name.includes('..')||!extension.test(v.name))bad('Invalid file name or extension');if(typeof v.text!=='string'||!v.text.trim()||Buffer.byteLength(v.text)>max||v.text.includes('\0'))bad('File is empty or too large');return{name:v.name,text:v.text};};
 const model=file(input.model,/\.(ldr|mpd)$/i,LIMITS.modelBytes),program=input.program===undefined?null:file(input.program,/\.bw$/i,LIMITS.programBytes);
 const settings=object(input.settings??{},['programMs','coldMs','afterMs','sampleMs','physicsSamples','poseParts']);
 if(settings.physicsSamples!==undefined&&typeof settings.physicsSamples!=='boolean')bad('physicsSamples must be boolean');
 const s={programMs:settings.programMs??10000,coldMs:settings.coldMs??250,afterMs:settings.afterMs??500,sampleMs:settings.sampleMs??(settings.physicsSamples?5:50),physicsSamples:settings.physicsSamples??false,poseParts:settings.poseParts??[]};
 if(!Array.isArray(s.poseParts)||s.poseParts.length>LIMITS.poseBodies||new Set(s.poseParts).size!==s.poseParts.length||!s.poseParts.every(id=>text(id,128)))bad('Choose at most four distinct pose part IDs');
 if(s.programMs%25||s.coldMs%25||s.afterMs%25||!Number.isInteger(s.programMs)||!number(s.programMs,250,LIMITS.programMs)||!Number.isInteger(s.coldMs)||!number(s.coldMs,0,2000)||!Number.isInteger(s.afterMs)||!number(s.afterMs,0,30000)||s.programMs+s.afterMs>150000||!Number.isInteger(s.sampleMs)||!number(s.sampleMs,s.physicsSamples?5:25,5000)||s.sampleMs%(s.physicsSamples?5:25))bad('Invalid simulation or sampling bounds');
 if(s.physicsSamples&&(s.sampleMs!==5||s.programMs+s.coldMs+s.afterMs>LIMITS.physicsRecordingTotalMs))bad('Physics-step recording requires 5 ms samples and at most 15 s total observation time');
 const measurements=input.measurements??[];if(!Array.isArray(measurements)||measurements.length>(s.physicsSamples?LIMITS.physicsRecordingMeasurements:LIMITS.measurements))bad('Too many measurements');const ids=new Set();
 const normalized=measurements.map(m=>{
  object(m,['id','kind','label','targets','joint','port','rope','point','reference','axis','vectorLdu','variable']);
  if(!text(m.id,128)||ids.has(m.id)||!KINDS.includes(m.kind))bad('Invalid measurement id or kind');ids.add(m.id);
  const specific=['pointCoordinate','signedAngle'].includes(m.kind)?['point','reference','axis',...(m.kind==='signedAngle'?['vectorLdu']:[])]:['jointAngle','jointSpeed','travel'].includes(m.kind)?['joint','port']:m.kind==='tension'?['rope']:m.kind==='hingeGap'?[]:m.kind==='programVariable'?['variable']:['targets'];object(m,['id','kind','label',...specific]);
  const out={id:m.id,kind:m.kind,label:m.label??m.id};if(!text(out.label,80))bad('Invalid measurement label');
  if(['pointCoordinate','signedAngle'].includes(m.kind)){
   out.point=marker(m.point);if(m.reference!==undefined)out.reference=marker(m.reference);if(!['x','y','z'].includes(m.axis??'x'))bad('Invalid measurement axis');out.axis=m.axis??'x';
   if(m.kind==='signedAngle'){const v=m.vectorLdu??[1,0,0];if(!Array.isArray(v)||v.length!==3||!v.every(x=>number(x,-100000,100000))||Math.hypot(...v)<1e-9)bad('Invalid angle marker vector');out.vectorLdu=v.slice();}
  }else if(['jointAngle','jointSpeed','travel'].includes(m.kind)){
   if((m.joint===undefined)===(m.port===undefined))bad('Choose a joint id or a motor port');if(m.joint!==undefined){if(!text(m.joint,128))bad('Invalid joint id');out.joint=m.joint;}else{if(!/^[A-F]$/.test(m.port))bad('Invalid motor port');out.port=m.port;}
  }else if(m.kind==='programVariable'){if(!text(m.variable,128))bad('Invalid program variable name');out.variable=m.variable;
  }else if(m.kind==='tension'){if(!text(m.rope,128))bad('Invalid rope id');out.rope=m.rope;
  }else if(m.kind!=='hingeGap'){
   const n=m.kind==='distance'?2:m.kind==='angle'?3:1;if(!Array.isArray(m.targets)||m.targets.length!==n||!m.targets.every(x=>text(x,128)))bad('Invalid measurement part targets');out.targets=m.targets.slice();
  }
  return out;
 });
 if(program){
  if(!/^DEVICE\s+SPIKE\s*$/im.test(program.text))bad('This endpoint accepts Robot Lab DEVICE SPIKE programs');
  for(const line of program.text.split(/\r?\n/)){
   if(line.length>4096)bad('Program line too long');const t=line.trim();if(!t||t.startsWith('#')||t.startsWith('//'))continue;
   if(!/^(?:DEVICE\b|GLOBAL\b|WHEN\b|IF\b|ELSE\b|REPEAT\b|FOREVER\b|WHILE\b|UNTIL\b|set\b|change\b|broadcast\b|wait\b|lab\b|say\b|think\b|stop\b|reset timer\b)/i.test(t))bad('Unsupported program statement');
   if(/^lab\s+(?:load|reset)\b/i.test(t)||/^lab\s+stop\s*$/i.test(t))bad('A submitted run starts fresh; scene replacement/reset is not allowed inside the program');
  }
 }
 return{version:1,model,program,settings:s,measurements:normalized};
}

/** Stable normalized data packet shared by the trusted gateway/controller. */
export const submissionPayload=input=>({model:input.model,...(input.program?{program:input.program}:{}),settings:input.settings,measurements:input.measurements});
