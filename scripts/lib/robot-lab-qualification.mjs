// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {judgeReviewedIntake} from './sim-lab-six-intake-judge.mjs';
import {SIX_INTAKES} from './sim-lab-six-intake-contracts.mjs';
import {judgeCableCompass} from './sim-lab-cable-compass-judge.mjs';
import {judgeRiseRatio} from './sim-lab-rise-ratio-judge.mjs';
import {judgeCascade} from './sim-lab-cascade-judge.mjs';
import {judgeWaveMaker} from './sim-lab-wavemaker-judge.mjs';
import {judgeSineShuttle,judgeQuartermaster} from './sim-lab-sine-quarter-judge.mjs';
import {judgeToggleLever,judgeThirdline} from './sim-lab-toggle-thirdline-judge.mjs';
import {judgeSamebeat} from './sim-lab-batch3-judges.mjs';
import {judgeCrossRatio,judgeFoldback,judgeGhostPivot,judgeTravelDial,judgeCarryRatio,judgeObliquityOrrery,judgeAirBudget} from './sim-lab-batch2-judges.mjs';
import {judgePhasorTwin,judgePivotExchange} from './sim-lab-hubless-judges.mjs';
import {BATCH_E_CONTRACTS,judgePromotionTipline,judgePromotionTwistspan,judgePromotionSwayShift} from './sim-lab-batchE-judges.mjs';
// This registry and the judges are reviewer-owned. A model-building agent owns
// its candidate pack, never this acceptance boundary or the physical test gates.
const SIX_FAMILIES=Object.freeze({"rod-ratio": "rod-ratio-v1", "vernier-drive": "vernier-drive-v1", "line-turner": "scott-russell-v1", "dune-strider": "paired-jansen-v1", "atlas-six": "stewart-platform-v1", "oblique": "oblique-trammel-v1"});
const INTERNAL_COMPARISONS=Object.freeze({"rod-ratio": "two-connecting-rod-lengths", "vernier-drive": "opposing-differential-branches", "line-turner": "perpendicular-input-output-lines", "dune-strider": "opposed-jansen-legs", "atlas-six": "six-independent-platform-axes", "oblique": "two-real-guide-settings"});
export const QUALIFICATION_JUDGES=Object.freeze({'tip-versus-slide-v1':judgePromotionTipline,'bifilar-torsion-v1':judgePromotionTwistspan,'timed-sway-cancellation-v1':judgePromotionSwayShift,...Object.fromEntries(SIX_INTAKES.map(id=>[SIX_FAMILIES[id],r=>judgeReviewedIntake(id,r,{native:true})])),'cable-winch-v1':judgeCableCompass,'scissor-rack-v1':judgeRiseRatio,'scotch-yoke-v1':judgeSineShuttle,'toggle-dead-centre-v1':judgeToggleLever,'neusis-trisector-v1':judgeThirdline,'compound-pendulum-v1':judgeSamebeat,'crossed-four-bar-v1':judgeCrossRatio,'antiparallelogram-v1':judgeFoldback,'remote-centre-v1':judgeGhostPivot,'rolling-odometer-v1':judgeTravelDial,'rolling-carry-v1':judgeCarryRatio,'obliquity-orrery-v1':judgeObliquityOrrery,'air-pump-budget-v1':judgeAirBudget,'stirling-quadrature-v1':judgePhasorTwin,'compound-pendulum-exchange-v1':judgePivotExchange,'latched-indexer-v1':judgeQuartermaster,'cardan-differential-v1':judgeWaveMaker,'serial-pendulum-v1':judgeCascade});
export const QUALIFICATION_NATIVE_TESTS=Object.freeze({...Object.fromEntries(SIX_INTAKES.map(id=>[id,'test/bw-sim-six-technic-intakes.test.mjs'])),'cable-compass':'test/bw-sim-cable-compass.test.mjs','rise-ratio':'test/bw-sim-rise-ratio.test.mjs',wavemaker:'test/bw-sim-wavemaker.test.mjs',cascade:'test/bw-sim-cascade.test.mjs'});
export function qualificationContracts(requested){
 const data=JSON.parse(readFileSync(new URL('../../docs/data/robot-lab-qualification.json',import.meta.url)));
 assert.equal(data.version,1);assert.ok(Array.isArray(data.models)&&data.models.length>0);
 const seen=new Set();for(const c of data.models){
  assert.match(c.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.ok(!seen.has(c.id),'unique model');seen.add(c.id);
  assert.ok(Object.hasOwn(QUALIFICATION_JUDGES,c.judge),'A new principle needs an independently reviewed judge');
  assert.ok(Number.isInteger(c.parts)&&c.parts>50);
  // A hubless model is driven by the Robot Lab's own lab-direct controller and names the frame part its
  // observations are taken from (there is no 'hub' part). A motorless model declares no ports at all.
  if(c.hubless!==undefined){assert.equal(c.hubless,true,'hubless is declared true');assert.ok(typeof c.observeBase==='string'&&c.observeBase&&c.observeBase!=='hub','a hubless model names its observation base part');assert.ok(!c.motorless,'lab-direct needs a motor');assert.ok(!c.withSpike,'a hubless model has no SPIKE hub');}
  else assert.equal(c.observeBase,undefined,'only a hubless model replaces the hub observation base');
  if(c.id==='atlas-six')assert.deepEqual(c.ports,[...'ABCDEF'],'Only the reviewed Atlas Six contract has six ports');else if(c.motorless!==undefined){assert.equal(c.motorless,true,'motorless is declared true');assert.deepEqual(c.ports,[],'a motorless model has no ports');assert.equal(c.disconnectInputDeg,undefined,'no input to turn');}else assert.ok(c.ports.length>=1&&c.ports.length<=3&&new Set(c.ports).size===c.ports.length);assert.ok(c.ports.every(p=>/^[A-F]$/.test(p)));
  // withSpike runs the program on the same virtual SPIKE hub as the toolbar Run; disconnectLaw names a judge-measured law loss.
  if(c.withSpike!==undefined)assert.equal(c.withSpike,true,'withSpike connects the virtual SPIKE hub');if(c.disconnectLaw!==undefined)assert.equal(c.disconnectLaw,true,'disconnectLaw names a measured law loss');
  // Reviewed exceptions only: a designed free payload ('loose-part') or a closed loop the compiler locks
  // ('locked-hinges'), each listed with its exact parts. Any other or undeclared compiler issue still refuses.
  if(c.expectedIssues!==undefined){assert.ok(Array.isArray(c.expectedIssues)&&c.expectedIssues.length>0,'declared issues are a non-empty list');
   for(const i of c.expectedIssues){
    // A motorless model declares the compiler's partless 'no-motor' warning, and only that model can.
    if(i.code==='no-motor'){assert.equal(c.motorless,true,'only a motorless model declares no-motor');assert.deepEqual(i.parts,[],'no-motor names no parts');continue;}
    assert.ok(['loose-part','locked-hinges'].includes(i.code),'only loose-part and locked-hinges can be declared');
    assert.ok(Array.isArray(i.parts)&&i.parts.length>0&&i.parts.every(x=>typeof x==='string'&&x)&&new Set(i.parts).size===i.parts.length,'declared issue parts');}}
  if(c.observeAir!==undefined)assert.equal(c.observeAir,true,'observeAir records the air networks');if(c.disconnectMeasure!==undefined)assert.equal(c.disconnectMeasure,true,'disconnectMeasure names a measured law loss');
  for(const k of ['coldMs','timeLimitMs','afterMs','frameMs'])assert.ok(Number.isFinite(c[k])&&c[k]>0,k);
  if(c.secondFrameMs!==undefined){assert.ok(['tipline','twistspan','swayshift'].includes(c.id),'reviewed second cadence only');assert.ok(Number.isFinite(c.secondFrameMs)&&c.secondFrameMs>0&&c.secondFrameMs<=25&&c.secondFrameMs!==c.frameMs,'distinct supported second cadence');if(c.id==='swayshift')assert.ok(c.secondFrameMs<=1000*BATCH_E_CONTRACTS.swayshift.calibration.periodSeconds/BATCH_E_CONTRACTS.swayshift.gates.residualWindowSamplesPerPeriodMin,'at least forty SwayShift observations per period');}
  assert.ok(c.frameMs<=25&&(c.id==='atlas-six'?c.timeLimitMs===490000:c.timeLimitMs<=180000)&&c.coldMs>=500);if(c.nativeSuite){assert.ok(Object.hasOwn(QUALIFICATION_NATIVE_TESTS,c.nativeSuite));assert.equal(c.id,c.nativeSuite);if(Object.hasOwn(INTERNAL_COMPARISONS,c.id)){assert.equal(c.internalComparison,INTERNAL_COMPARISONS[c.id]);assert.ok(!c.physicalControl);}else{assert.equal(c.physicalControl,c.id+'-control.ldr');assert.ok(!c.internalComparison);}assert.equal(c.judge,{...SIX_FAMILIES,'cable-compass':'cable-winch-v1','rise-ratio':'scissor-rack-v1',wavemaker:'cardan-differential-v1',cascade:'serial-pendulum-v1'}[c.id]);}else assert.ok(c.disconnect.length>0&&new Set(c.disconnect).size===c.disconnect.length);assert.ok(c.frozenOutput);
 }
 if(!requested)return data.models;
 assert.ok(requested.length>0&&new Set(requested).size===requested.length);for(const id of requested)assert.ok(seen.has(id),`No reviewed qualification contract: ${id}`);
 return data.models.filter(c=>requested.includes(c.id));
}
/** Compiler issues as order-free keys, to compare with a contract's declared expectedIssues. */
export const issueKeys=issues=>issues.map(i=>i.code+':'+[...(i.parts||[])].sort().join(',')).sort();
export function disconnectedSource(source,ids){
 for(const id of ids)assert.equal(source.split('\n').filter(line=>line==='0 !BW ID '+id).length,1,'exactly one removed physical part '+id);
 return source.split(/(?=^0 !BW ID )/m).filter(b=>!ids.some(id=>b.startsWith('0 !BW ID '+id+'\n'))).join('');
}
/**
 * Who drives the model's motors, read from the session itself: the Robot Lab's own lab-direct
 * controller of a hubless model (its per-port mode and pending moves), or a hub. Recorded per frame.
 */
export function actuatorState(session){
 const lab=(session.hubs||[]).find(h=>h.profile==='lab-direct');
 if(!lab)return{driver:(session.hubs||[]).length?'hub':'none'};
 const motors=[...lab.hub.motors];
 return{driver:'lab-direct',modes:Object.fromEntries(motors.map(([p,s])=>[p,s.mode])),busy:Object.fromEntries(motors.map(([p,s])=>[p,lab.hub.waiters.has(p)||s.mode==='position']))};
}
/**
 * The post-run hold check. Hub models keep exactly their reviewed check (hub controller mode 'hold',
 * port not busy). A hubless model must be driven by lab-direct and leave every contract port in 'hold'
 * there, not busy. A motorless model has nothing to hold, and must have no driven port.
 */
export function assertFinalHold(c,last){
 const a=last.extra.actuators;assert.ok(a&&typeof a.driver==='string','actuator state recorded');
 if(c.hubless){
  assert.equal(a.driver,'lab-direct','a hubless contract is driven by the lab-direct controller');
  assert.deepEqual(Object.keys(a.modes).sort(),[...c.ports].sort(),'lab-direct drives exactly the contract ports');
  for(const port of c.ports){assert.equal(a.busy[port],false,'port '+port+' finished');assert.equal(a.modes[port],'hold','port '+port+' held');}
  return;
 }
 assert.notEqual(a.driver,'lab-direct','a model with a hub is not driven by lab-direct');
 if(c.motorless){assert.deepEqual(c.ports,[]);assert.deepEqual(Object.keys(last.busy),[],'no driven port');return;}
 for(const port of c.ports){assert.equal(last.busy[port],false);assert.equal(last.extra.modes[port.charCodeAt(0)-65],'hold');}
}
