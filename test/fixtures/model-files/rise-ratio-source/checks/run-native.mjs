#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Calls the repository's actual parser/compiler, Scratch VM, Robot Lab API,
// SPIKE controller and Jolt physics. Predictions never drive the recorded poses.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createPhysicalHingeObserver} from './physical-hinge-observer.mjs';
const addon=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:d;};
const repo=path.resolve(arg('--repo',process.env.BW_REPO||path.join(addon,'..','brickwright-baseline'))),out=path.resolve(arg('--out',path.join(addon,'evidence','native')));
mkdirSync(out,{recursive:true});
const modelPath=path.resolve(arg('--model',path.join(addon,'models','rise-ratio.ldr'))),programPath=path.resolve(arg('--program',path.join(addon,'programs','rise-ratio.bw')));
const markerBytes=readFileSync(arg('--markers',path.join(addon,'markers.json'))),markers=JSON.parse(markerBytes);
const model=readFileSync(modelPath),program=readFileSync(programPath),contractBytes=readFileSync(path.join(addon,'docs','contract.json')),checkBytes=readFileSync(fileURLToPath(import.meta.url));
const [{runRobotLabProgram},{observeAddon}]=await Promise.all([
 import(pathToFileURL(path.join(repo,'test/helpers/robot-lab-direct-vm.mjs')).href),
 import(pathToFileURL(path.join(repo,'scripts/lib/sim-lab-addon-judge.mjs')).href)
]);
const coldMs=Number(arg('--cold','1000')),afterMs=Number(arg('--after','1000')),timeLimitMs=Number(arg('--limit','90000')),frameMs=1000/30;
const r=await runRobotLabProgram(program.toString(),{modelText:model.toString(),autoPorts:false,timeLimitMs,frameMs,coldMs,afterMs,observeFrame:({vm,session})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value]))),time:session.time})});
const rawPath=path.join(out,'recording.json.gz');writeFileSync(rawPath,gzipSync(Buffer.from(JSON.stringify(r)),{level:9}));
const sub=(a,b)=>a.map((x,k)=>x-b[k]),norm=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=v=>v.map(x=>x/norm(v)),deg=x=>x*180/Math.PI,span=a=>Math.max(...a)-Math.min(...a),clamp=x=>Math.max(-1,Math.min(1,x));
const physical=await createPhysicalHingeObserver(r,{repo});
function measure(run){
 const o=observeAddon(run,markers.basePart),motor=run.mechanism.joints.find(j=>j.motor?.port==='A');
 const named=[markers.origin,markers.bottom,markers.deck,markers.topSlider];
 for(const m of named){if(!m)continue;const matches=run.mechanism.bodies.filter(b=>b.parts.includes(m.part));if(matches.length!==1)throw Error('Marker ownership is ambiguous: '+m.part);}
 const pt=(f,m)=>o.point(f,m.part,m.local||[0,0,0]);
 // prepareModel may rotate the complete source onto the mat. Build the
 // measurement basis from a fixed chassis part's actual imported axes, not
 // from source-world X or from the moving output/prediction being checked.
 const cf=markers.coordinateFrame||{part:'bottom_housing',horizontalLocal:[1,0,0],upLocal:[0,-1,0],lateralLocal:[0,0,-1]};
 if(run.mechanism.bodies.filter(b=>b.parts.includes(cf.part)).length!==1||o.body(cf.part).id!==o.base.id)throw Error('Measurement basis must uniquely belong to the observed chassis');
 const zero=o.initial(cf.part),axis=v=>unit(sub(o.initial(cf.part,v),zero));
 const horizontal=axis(cf.horizontalLocal),up=axis(cf.upLocal),lateral=axis(cf.lateralLocal);
 if([dot(horizontal,up),dot(horizontal,lateral),dot(up,lateral)].some(x=>Math.abs(x)>1e-8))throw Error('Measurement basis is not orthogonal');
 return run.track.map(f=>{
  const O=pt(f,markers.origin),B=pt(f,markers.bottom),D=pt(f,markers.deck),T=markers.topSlider?pt(f,markers.topSlider):null;
  const w=dot(sub(B,O),horizontal)*1000,h=dot(sub(D,O),up)*1000;
  const predicted=Math.sqrt(Math.max(0,80**2-w**2));
  const deckUp=o.vector(f,markers.deck.part,up);
  const original=physical.measure(f),compiledGap=o.gap(f),compiledAxis=o.axisGap(f);
  const row={t:f.t,phase:f.phase,widthMm:w,heightMm:h,idealHeightMm:predicted,lawErrorMm:h-predicted,deckXmm:dot(sub(D,O),horizontal)*1000,deckZmm:dot(sub(D,O),lateral)*1000,topWidthMm:T?dot(sub(T,D),horizontal)*1000:null,encoderDeg:deg(f.joints[motor.id].angle),encoderSpeedDegPerSec:deg(f.joints[motor.id].velocity||0),hingeGapMm:Math.max(compiledGap,original.gapMm),axisMismatchDeg:Math.max(compiledAxis,original.axisMismatchDeg),originalInterfaceGapMm:original.gapMm,compiledHingeGapMm:compiledGap,baseTiltDeg:o.tilt(f),deckTiltDeg:deg(Math.acos(clamp(dot(deckUp,up)))),variables:f.extra?.variables||{}};
  row.finite=Object.values(f.bodies).every(p=>[...p.position,...p.rotation].every(Number.isFinite))&&Object.values(f.joints).every(j=>Object.values(j).filter(v=>typeof v==='number').every(Number.isFinite))&&Object.values(row).filter(v=>typeof v==='number').every(Number.isFinite);
  return row;
 });
}
function judge(run,rows){
 const failures=[],gate=(ok,message)=>{if(!ok)failures.push(message);};
 gate(rows.length>200,'More than 200 measured pose frames');
 gate(run.mechanism.hubs.length===1&&run.mechanism.actuators.length===1&&run.mechanism.actuators[0].port==='A','Exactly one hub and one useful motor on A');
 const issueKey=i=>i.code+':'+[...(i.parts||[])].sort().join('|');
 gate(run.issues.every(i=>(markers.approvedIssues||[]).includes(issueKey(i))),'No unresolved import/compile issue beyond explicitly reviewed exact issue/part sets');
 gate((run.mechanism.diagnostics||[]).length===0,'No unresolved compiled-mechanism diagnostics');
 gate(run.mechanism.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'),'All bodies containing placed parts are dynamic; chassis is not frozen');
 gate(run.mechanism.joints.every(j=>j.type!=='ball'),'No unmeasured hinge-to-ball substitution');
 gate(rows.every(s=>s.finite),'All observed body poses finite');
 gate(run.finishedAt!==null&&run.finishedAt<90000+coldMs,'Native VM completes inside the predeclared 90 second program limit');
 const last=rows.at(-1),first=rows[0],vars=last.variables,programRows=rows.filter(s=>s.phase==='program'),cold=rows.filter(s=>s.phase==='cold'),after=rows.filter(s=>s.phase==='after');
 gate(coldMs===1000&&cold.length>=31&&cold.at(-1).t-cold[0].t>=999.9,'Declared full 1000 ms unpowered cold interval is recorded');
 gate(afterMs===1000&&after.length>=30&&after.at(-1).t-run.finishedAt>=999.9,'Declared full 1000 ms after interval is recorded');
 gate(Number(vars.completed)===1&&Number(vars.failed)===0,'Program completion requires completed=1 and failed=0');
 const max=(key,list=rows)=>Math.max(...list.map(s=>Math.abs(s[key])));
 const rise=span(rows.map(s=>s.heightMm)),rackTravel=span(rows.map(s=>s.widthMm)),returnError=Math.hypot(last.heightMm-first.heightMm,last.deckXmm-first.deckXmm,last.deckZmm-first.deckZmm);
 gate(Math.abs(first.heightMm-48)<.5&&Math.abs(first.widthMm-64)<.5,'Observed saved datum agrees with nominal 48 mm height and 64 mm width within 0.5 mm');
 gate(rise>=15,'Useful actual rise at least 15 mm');
 gate(rackTravel>=15,'Useful actual rack travel at least 15 mm');
 gate(rows.every(s=>s.widthMm>=46.4&&s.widthMm<=65.6),'Full recorded width stays in predeclared 116–164 LDU qualification envelope');
 gate(max('lawErrorMm')<1,'Measured h agrees with sqrt(80² - measured width²) within 1 mm');
 gate(rows.every(s=>Number.isFinite(s.topWidthMm)&&Math.abs(s.topWidthMm-s.widthMm)<.5),'Upper and lower independently measured pivot widths agree within 0.5 mm');
 gate(span(rows.map(s=>s.deckXmm))<1&&span(rows.map(s=>s.deckZmm))<1,'Measured deck transverse drift below 1 mm on both axes');
 gate(max('deckTiltDeg')<2&&max('baseTiltDeg')<2,'Deck and freestanding chassis tilt below 2 degrees');
 gate(max('hingeGapMm')<.5,'Every physical hinge closes within 0.5 mm');
 gate(max('axisMismatchDeg')<2,'Physical hinge axes align within 2 degrees');
 gate(returnError<1,'Deck returns within 1 mm of the saved lower pose');
 gate(Math.abs(last.encoderDeg)<1.5,'Final encoder returns within 1.5 degrees');
 gate(cold.length>0&&span(cold.map(s=>s.heightMm))<.5,'Unpowered cold deck height drifts less than 0.5 mm');
 const routeWidths=[64,60,56,52,48,52,56,60,64];
 const stageOrder=programRows.filter(s=>Number(s.variables.arrived)===1&&Number(s.variables.stage)>=0&&Number(s.variables.stage)<=8).map(s=>Number(s.variables.stage)).filter((s,i,a)=>i===0||s!==a[i-1]);
 gate(JSON.stringify(stageOrder)===JSON.stringify([0,1,2,3,4,5,6,7,8]),'Settled stages occur once in the complete declared chronological route');
 const stages=Array.from({length:9},(_,stage)=>{
  const all=programRows.filter(s=>Number(s.variables.stage)===stage&&Number(s.variables.arrived)===1),end=all.at(-1)?.t??-1,frames=all.filter(s=>s.t>=end-500.0001);
  gate(frames.length>=15,'Stage '+stage+' has at least 15 settled observations');
  if(!frames.length)return {stage,frames:0};
  const mean=key=>frames.reduce((a,s)=>a+s[key],0)/frames.length,s=frames.at(-1),maxError=Math.max(...frames.map(s=>Math.abs(Number(s.variables.target)-s.encoderDeg)));
  gate(maxError<=1.5,'Stage '+stage+' reaches its commanded encoder target within 1.5 degrees');
  const target=Number(s.variables.target),direction=Number(s.variables.direction),widthTarget=routeWidths[stage],expectedTarget=-(64-widthTarget)/6*180/Math.PI,widthError=Math.max(...frames.map(s=>Math.abs(s.widthMm-widthTarget)));
  gate(frames.every(s=>Number(s.variables.direction)===-1&&Math.abs(Number(s.variables.target)-expectedTarget)<1e-8),'Stage '+stage+' uses the independently declared signed encoder target and direction');
  gate(widthError<=.5,'Stage '+stage+' independently measured rack width reaches its commanded width within 0.5 mm');
  return {stage,frames:frames.length,t:s.t,widthMm:mean('widthMm'),heightMm:mean('heightMm'),encoderDeg:mean('encoderDeg'),target,maxSettledErrorDeg:maxError,widthTargetMm:widthTarget,maxSettledWidthErrorMm:widthError};
 });
 const increments=stages.slice(1,5).map((s,i)=>s.heightMm-stages[i].heightMm);
 gate(increments.every((x,i)=>x>0&&(i===0||x<increments[i-1])),'Four independently measured rises are positive and progressively smaller');
 gate(stages[4].heightMm-stages[0].heightMm>=15,'Settled stage 0 to stage 4 rise is at least 15 mm');
 return {failures,metrics:{frames:rows.length,programFrames:programRows.length,coldFrames:cold.length,afterFrames:after.length,finishedAtMs:run.finishedAt,programDurationMs:run.finishedAt-coldMs,riseMm:rise,rackTravelMm:rackTravel,widthRangeMm:[Math.min(...rows.map(s=>s.widthMm)),Math.max(...rows.map(s=>s.widthMm))],heightRangeMm:[Math.min(...rows.map(s=>s.heightMm)),Math.max(...rows.map(s=>s.heightMm))],maxLawErrorMm:max('lawErrorMm'),maxTopBottomWidthDifferenceMm:Math.max(...rows.map(s=>Math.abs(s.topWidthMm-s.widthMm))),verticalPathXDriftMm:span(rows.map(s=>s.deckXmm)),verticalPathZDriftMm:span(rows.map(s=>s.deckZmm)),maxDeckTiltDeg:max('deckTiltDeg'),maxBaseTiltDeg:max('baseTiltDeg'),maxHingeGapMm:max('hingeGapMm'),maxOriginalInterfaceGapMm:max('originalInterfaceGapMm'),maxCompiledHingeGapMm:max('compiledHingeGapMm'),maxAxisMismatchDeg:max('axisMismatchDeg'),returnErrorMm:returnError,finalEncoderDeg:last.encoderDeg,coldHeightDriftMm:cold.length?span(cold.map(s=>s.heightMm)):null,stageOrder,finalVariables:vars,stages,heightIncrementsMm:increments}};
}
let rows=[],result,negativeControl;
try{
 rows=measure(r);result=judge(r,rows);
 const frozen=structuredClone(r),body=frozen.mechanism.bodies.find(b=>b.parts.includes(markers.deck.part));
 for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);
 const bad=judge(frozen,measure(frozen));negativeControl={kind:'Altered recording with frozen deck; observer test only, not a physical run',rejected:bad.failures.length>0,failures:bad.failures};
 if(!negativeControl.rejected)result.failures.push('Frozen deck recording was not rejected');
}catch(e){result={failures:[e.stack],metrics:null};}
const sha=x=>createHash('sha256').update(x).digest('hex');
const receipt={status:result.failures.length?'FAIL':'PASS',scope:'Exported native program through registered compiler, Scratch VM, Robot Lab API, SPIKE controller and Jolt; free chassis, default contacts, no pose replacement',modelSha256:sha(model),programSha256:sha(program),contractSha256:sha(contractBytes),markersSha256:sha(markerBytes),checkSha256:sha(checkBytes),physicalHingeObserverSha256:sha(readFileSync(path.join(addon,'checks','physical-hinge-observer.mjs'))),runtime:{node:process.version,BW_INTEGRATED_ROOT:process.env.BW_INTEGRATED_ROOT||null,frameMs,physicsStepMs:5,coldMs,afterMs,timeLimitMs,autoPorts:false,rescueLoose:false,breakLoops:true},topology:{dynamicModelBodies:r.mechanism.bodies.filter(b=>b.parts.length&&b.motion==='dynamic').length,joints:r.mechanism.joints,couplings:r.mechanism.couplings,bodyFriction:r.mechanism.bodies.map(b=>({id:b.id,friction:b.friction})),freeHingeFrictionNm:r.mechanism.joints.filter(j=>j.type==='hinge'&&!j.motor).map(j=>({id:j.id,frictionNm:j.frictionNm??0})),originalHingeInterfaces:physical.interfaces},markers,issues:r.issues,mechanismDiagnostics:r.mechanism.diagnostics,literalUnsupportedFieldIsNotEvidence:true,completedLifecycleScope:'Fixed-session host; scene reset/load/stop, browser UI and hardware transport untested',...result,negativeControl,recordingSha256:sha(readFileSync(rawPath))};
writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');
if(rows.length){
 const cols=['t','phase','widthMm','heightMm','idealHeightMm','lawErrorMm','deckXmm','deckZmm','topWidthMm','encoderDeg','hingeGapMm','originalInterfaceGapMm','compiledHingeGapMm','axisMismatchDeg','baseTiltDeg','deckTiltDeg'];
 writeFileSync(path.join(out,'observations.csv'),cols.join(',')+',stage,target,completed,failed\n'+rows.map(s=>cols.map(k=>s[k]).concat(['stage','target','completed','failed'].map(k=>s.variables[k]??'')).join(',')).join('\n')+'\n');
}
console.log(JSON.stringify(receipt,null,2));if(result.failures.length)process.exitCode=1;
