// SPDX-License-Identifier: BSD-3-Clause
// Copyright 2026 Brickwright contributors.
import test from 'node:test';
import assert from 'node:assert/strict';
import {privateEvidenceSkip,readPrivateSpikeEvidence} from './helpers/private-spike-evidence.mjs';
import Backend,{MAX_DEG_PER_S,RESULT} from '../overlay/scratch-gui/src/lib/spike-sim/independent-backend.js';
const fixture=(options={})=>{let changes=0;const hub={data:{motors:Array.from({length:6},()=>({position:0,speed:0})),sensors:Array(6).fill(null),classicPorts:Array.from({length:6},()=>[0,[]]),display:Array(25).fill(0),imu:{yaw:5,pitch:6,roll:7,acceleration:[1,2,3],angularVelocity:[4,5,6]},buttons:{left:true,center:false,right:false},volume:50,centerLight:0,distanceLights:Array(6).fill(null)},changed(){changes++;}};return {hub,b:new Backend(hub,options),get changes(){return changes;}};};
const near=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} vs ${expected}, tolerance ${tolerance}`);
test('validates atomically, signed degrees, absolute speed sign and limits',async()=>{
 const {hub,b}=fixture();const snapshot=structuredClone(hub.data);
 for(const port of [-1,6,'AA',null])assert.throws(()=>b.runAtSpeed(port,100),RangeError);
 for(const v of [NaN,Infinity,'100'])assert.throws(()=>b.runAtSpeed(0,v),TypeError);
 assert.throws(()=>b.step(-1),RangeError);assert.throws(()=>b.runForTime(0,-1,3),RangeError);
 await assert.rejects(b.wait(NaN),TypeError);await assert.rejects(b.runToPosition(0,1,0),RangeError);assert.deepEqual(hub.data,snapshot);
 for(const [id,limit] of Object.entries(MAX_DEG_PER_S)){hub.data.sensors[0]={kind:'motor',deviceId:Number(id)};assert.equal(b.maxSpeed('a'),limit);assert.equal(b.percentToDps('A',200),limit);}
 const p=b.runForDegrees(0,-60,-200);b.step(1000);assert.equal(await p,RESULT.COMPLETED);near(hub.data.motors[0].position,60,.01);
 const q=b.runToPosition(0,-30,-200);b.step(1000);assert.equal(await q,'completed');assert.equal(hub.data.motors[0].position,-30);
});
test('ramps, finite settling, different ports and replacement',async()=>{
 const {hub,b}=fixture();b.runAtSpeed(0,300);assert.equal(b.done(0),false);b.step(100);assert.equal(hub.data.motors[0].degPerSec,150);b.step(100);assert.equal(b.done(0),true);assert.equal(b.busy(0),true);
 const p=b.runToPosition(1,-90,200),q=b.runToPosition(2,90,200);b.step(100);assert.equal(b.busy(1),true);b.runAtSpeed(1,100);assert.equal(await p,'interrupted');b.step(1000);assert.equal(await q,'completed');
 const interrupted=b.runForTime(0,500,300);b.stop(0);assert.equal(await interrupted,'interrupted');assert.ok(hub.data.motors[0].degPerSec>0);b.step(100);assert.equal(b.done(0),true);
});
test('stop actions coast farther than brake; hold returns and retains captured position',()=>{
 const outcomes={};for(const action of ['brake','coast','hold']){const {hub,b}=fixture();b.runAtSpeed(0,300);b.step(500);const captured=hub.data.motors[0].position;b.stop(0,action);assert.equal(hub.data.motors[0].lastStopAction,action);assert.equal(b.done(0),false);b.step(2000);assert.equal(hub.data.motors[0].degPerSec,0);assert.equal(b.done(0),true);outcomes[action]=hub.data.motors[0].position-captured;if(action==='hold'){near(outcomes[action],0,.001);hub.data.motors[0].position+=5;b.step(1000);near(hub.data.motors[0].position,captured,.001);}}
 assert.ok(outcomes.coast>outcomes.brake);
});
test('timed duration includes deceleration; zero distance and zero speed',async()=>{
 const {hub,b}=fixture();assert.equal(await b.runToPosition(0,0,300),'completed');const p=b.runForTime(0,500,300);b.step(499);assert.equal(b.done(0),false);b.step(1);assert.equal(await p,'completed');assert.equal(hub.data.motors[0].degPerSec,0);near(hub.data.motors[0].position,90,.2);
 const q=b.runForTime(0,100,0);b.step(99);assert.equal(b.done(0),false);b.step(1);assert.equal(await q,'completed');
});
test('load and stall behavior; configuration validation',async()=>{
 const {hub,b}=fixture();b.configure(0,{stallMs:100,acceleration:2000});assert.throws(()=>b.configure(0,{acceleration:0}),RangeError);assert.throws(()=>b.setLoad(0,1.1),RangeError);
 b.setLoad(0,.5);b.runAtSpeed(0,300);b.step(500);assert.equal(hub.data.motors[0].degPerSec,150);
 b.stopAll();b.setLoad(0,1);const p=b.runToPosition(0,100,300);b.step(99);assert.equal(b.busy(0),true);b.step(1);assert.equal(await p,'stalled');assert.equal(hub.data.motors[0].stalled,true);b.runAtSpeed(0,300);b.step(500);assert.equal(b.busy(0),true);assert.equal(hub.data.motors[0].stalled,true);
});
test('waits, signals, cancel, disposal and asynchronous pace',async()=>{
 const {hub,b}=fixture();const a=b.wait(100),c=b.wait(200);const signal=new AbortController();const d=b.wait(300,{signal:signal.signal});b.step(100);assert.equal(await a,'completed');signal.abort();assert.equal(await d,'interrupted');b.cancel();assert.equal(await c,'interrupted');assert.equal(await b.wait(5,{signal:signal.signal}),'interrupted');
 const motion=b.runForTime(0,100,300),wait=b.wait(100);b.dispose();assert.equal(await motion,'interrupted');assert.equal(await wait,'interrupted');assert.equal(hub.data.motors[0].degPerSec,0);
 const paced=fixture();assert.equal(await paced.b.pace(25),'completed');assert.equal(paced.b.simulatedMs,25);const ongoing=paced.b.pace(1000);await assert.rejects(paced.b.pace(10),/already active/);setTimeout(()=>paced.b.cancel(),2);assert.equal(await ongoing,'interrupted');const handover=fixture();const pace=handover.b.pace(1000);setTimeout(()=>{handover.hub.clockOwner='external';},2);assert.equal(await pace,'interrupted');
});
test('shared data and idle preservation; outputs and copies',()=>{
 const {hub,b}=fixture();hub.data.sensors[1]={kind:'distance',deviceId:62,distance:456};hub.data.motors[1]={position:17,speed:23,degPerSec:42};const idle=structuredClone(hub.data.motors[1]);b.runAtSpeed(0,300);b.step(100);b.stopAll();assert.deepEqual(hub.data.motors[1],idle);assert.equal(hub.data.sensors[1].kind,'distance');assert.equal(b.readSensor(1,'distance').distance,456);const sensor=b.readSensor(1,'distance');sensor.distance=0;assert.equal(hub.data.sensors[1].distance,456);assert.throws(()=>b.readSensor(1,'color'));const imu=b.imu();imu.acceleration[0]=99;assert.equal(hub.data.imu.acceleration[0],1);
 b.setPixels(Array(25).fill(12));assert.equal(hub.data.display[0],9);b.setPixel(2,3,4);assert.equal(hub.data.display[17],4);assert.throws(()=>b.setPixel(5,0,4),RangeError);b.setLight(11);b.setVolume(200);b.setDistanceLights(1,[0,2,4,12]);assert.equal(hub.data.volume,100);assert.deepEqual(hub.data.distanceLights[1],[0,2,4,9]);
 b.runAtSpeed(0,300);b.step(200);const m=hub.data.motors[0];assert.deepEqual(hub.data.classicPorts[0],[48,[Math.round(m.speed),Math.round(m.position),0,Math.round(m.speed)]]);b.resetPosition(0,100);assert.equal(m.degPerSec,300);
});
test('deterministic physics under arbitrary chunking',()=>{
 const one=fixture(),many=fixture();for(const {b} of [one,many]){b.runToPosition(0,180,300);b.runForTime(1,500,-200);b.beep(440,600);}
 one.b.step(712.5);for(let i=0;i<2850;i++)many.b.step(.25);assert.deepEqual(one.hub.data,many.hub.data);assert.equal(one.b.simulatedMs,many.b.simulatedMs);
});
test('external clock ownership prevents native motion and stepping',async()=>{
 const {hub,b}=fixture();hub.clockOwner='external';assert.throws(()=>b.runAtSpeed(0,100),Error);await assert.rejects(b.pace(100),Error);await assert.rejects(b.wait(100),Error);assert.equal(b._waits.size,0);assert.equal(b.step(100),false);assert.equal(b.simulatedMs,0);b.cancel();hub.clockOwner='native';b.runAtSpeed(0,100);assert.equal(b.step(100),true);
});
test('synthetic black-box observation comparisons',{skip:privateEvidenceSkip},async()=>{
 const observations=readPrivateSpikeEvidence('implementer-observations.json');
 for(const record of observations.records){const {hub,b}=fixture();const id=record.id;
 if(id.startsWith('speed-'))b.runAtSpeed(0,id==='speed-positive'?300:-300);
 else if(id.startsWith('target-'))b.runToPosition(0,id==='target-positive'?180:-90,300);
 else if(id==='timed')b.runForTime(0,500,300);
 else if(id==='concurrent'){b.runToPosition(0,180,300);b.runToPosition(1,-90,200);}
 else if(id==='zero-target')b.runToPosition(0,0,300);
 else if(id==='zero-speed')b.runForTime(0,100,0);
 else {b.runAtSpeed(0,300);b.step(500);if(id==='reverse')b.runAtSpeed(0,-300);else b.stop(0,id);}
 let elapsed=0;for(let j=0;j<record.times.length;j++){const t=record.times[j];b.step(t-elapsed);elapsed=t;const sample=record.samples[j];
 if(['brake','coast','hold'].includes(id)){if(t>=500)assert.equal(hub.data.motors[0].degPerSec,0);continue;}
 for(const [port,angleKey,speedKey,doneKey] of [[0,'angle','speed','done'],[1,'bAngle','bSpeed','bDone']]){const motor=hub.data.motors[port];const settled=sample[doneKey]&&Math.abs(sample[speedKey])<=5;const tolerance=id==='reverse'?15:settled?2:12;near(motor.position,sample[angleKey],tolerance);near(motor.degPerSec||0,sample[speedKey],settled||Math.abs(sample[speedKey])>=295&&t>=500?5:110);}
 }
 }
});

test('finite observation completion boundaries allow 150 ms discrepancy',{skip:privateEvidenceSkip},async()=>{
 const observations=readPrivateSpikeEvidence('implementer-observations.json');
 for(const id of ['target-positive','target-negative','timed','concurrent','zero-speed']){
  const record=observations.records.find(r=>r.id===id),{b}=fixture();
  if(id==='target-positive'||id==='concurrent')b.runToPosition(0,180,300);
  if(id==='target-negative')b.runToPosition(0,-90,300);
  if(id==='concurrent')b.runToPosition(1,-90,200);
  if(id==='timed')b.runForTime(0,500,300);
  if(id==='zero-speed')b.runForTime(0,100,0);
  const completed=[null,null];
  for(let ms=1;ms<=1500;ms++){b.step(1);for(let port=0;port<(id==='concurrent'?2:1);port++)if(completed[port]===null&&b.done(port))completed[port]=ms;}
  for(let port=0;port<(id==='concurrent'?2:1);port++){
   const key=port===0?'done':'bDone';let lower=0,upper=Infinity;
   for(let i=0;i<record.samples.length;i++){if(record.samples[i][key]){upper=record.times[i];break;}lower=record.times[i];}
   assert.ok(completed[port]>=lower-150&&completed[port]<=upper+150,`${id}/${port}: completion ${completed[port]}, observed interval ${lower}..${upper}`);
  }
 }
});

test('step leaves publication to world owner; standalone pace publishes; quiet safety reset',async()=>{
 const f=fixture();f.b.runAtSpeed(0,300);const commanded=f.changes;f.b.step(100);assert.equal(f.changes,commanded);f.b.stopAll({notify:false});assert.equal(f.changes,commanded);assert.equal(f.hub.data.motors[0].degPerSec,0);f.b.runAtSpeed(0,300);const beforePace=f.changes;await f.b.pace(25);assert.equal(f.changes,beforePace+3);const beforeCancel=f.changes;f.b.cancel({notify:false});assert.equal(f.changes,beforeCancel);
 assert.equal(RESULT.completed,'completed');assert.equal(RESULT.interrupted,'interrupted');assert.equal(RESULT.stalled,'stalled');assert.ok(Number.isInteger(f.hub.data.motors[0].speed));
});

test('configured stop defaults apply to omitted stop and finite completion',async()=>{
 for(const action of ['coast','brake','hold']){
  const f=fixture();f.b.setStopAction('a',action);assert.equal(f.hub.data.motors[0].stopAction,action);assert.equal(f.hub.data.sensors[0],null);
  const snapshot=structuredClone(f.hub.data);assert.throws(()=>f.b.setStopAction(0,'bad'),RangeError);assert.throws(()=>f.b.setStopAction(6,'hold'),RangeError);assert.deepEqual(f.hub.data,snapshot);
  f.b.runAtSpeed(0,300);f.b.step(500);f.b.stop(0);assert.equal(f.hub.data.motors[0].lastStopAction,action);f.b.step(2000);assert.equal(f.b.done(0),true);
  f.b.stop(0,'brake');assert.equal(f.hub.data.motors[0].stopAction,action);f.b.step(100);
  const target=f.b.runToPosition(0,200,300);f.b.step(2000);assert.equal(await target,'completed');assert.equal(f.b.done(0),true);f.hub.data.motors[0].position+=10;f.b.step(1000);near(f.hub.data.motors[0].position,action==='hold'?200:210,.001);
  const timed=f.b.runForTime(0,500,300);f.b.step(500);assert.equal(await timed,'completed');const captured=f.hub.data.motors[0].position;assert.equal(f.b.done(0),true);f.hub.data.motors[0].position+=10;f.b.step(1000);near(f.hub.data.motors[0].position,action==='hold'?captured:captured+10,.001);
 }
 const z=fixture();z.b.setStopAction(0,'hold');assert.equal(await z.b.runToPosition(0,0,300),'completed');z.hub.data.motors[0].position=10;z.b.step(1000);near(z.hub.data.motors[0].position,0,.001);assert.equal(await z.b.runForTime(0,0,300),'completed');assert.equal(z.b.done(0),true);
});
test('beep validates before mutation, supports waveforms and preserves shared metadata',async()=>{
 const events=[];const f=fixture({onBeep:frequency=>events.push(frequency)});f.hub.data.speaker={frequency:0,volume:42,waveform:'sin',beeps:0};const initial=structuredClone(f.hub.data);
 for(const [freq,ms,waveform,error] of [[NaN,10,'sin',TypeError],[440,Infinity,'sin',TypeError],[-1,10,'sin',RangeError],[440,-1,'sin',RangeError],[440,10,'noise',RangeError]])await assert.rejects(f.b.beep(freq,ms,{waveform}),error);
 assert.deepEqual(f.hub.data,initial);assert.deepEqual(events,[]);
 for(const waveform of ['sin','square','triangle','sawtooth']){const p=f.b.beep(440,10,{waveform});assert.equal(f.hub.data.speaker.waveform,waveform);assert.equal(f.hub.data.speaker.frequency,440);assert.equal(f.hub.data.speaker.volume,42);f.b.step(9.5);assert.equal(f.hub.data.speaker.frequency,440);const before=f.changes;f.b.step(.5);assert.equal(await p,'completed');assert.equal(f.hub.data.speaker.frequency,0);assert.equal(f.changes,before);}
 assert.equal(f.hub.data.speaker.beeps,4);assert.deepEqual(events,[440,0,440,0,440,0,440,0]);
});
test('beep replacement, stop, cancellation and disposal resolve exactly once',async()=>{
 const f=fixture();let resolved=0;const first=f.b.beep(440,100).then(result=>{resolved++;return result;});f.b.step(20);const second=f.b.beep(880,200);assert.equal(await first,'interrupted');assert.equal(resolved,1);assert.equal(f.hub.data.speaker.beeps,2);f.b.stopSound();assert.equal(await second,'interrupted');assert.equal(f.hub.data.speaker.frequency,0);f.b.step(1000);assert.equal(resolved,1);
 const third=f.b.beep(330,100);const wait=f.b.wait(100);const before=f.changes;f.b.cancel({notify:false});assert.equal(await third,'interrupted');assert.equal(await wait,'interrupted');assert.equal(f.hub.data.speaker.frequency,0);assert.equal(f.changes,before);
 const fourth=f.b.beep(550,100);f.b.dispose();assert.equal(await fourth,'interrupted');assert.equal(f.hub.data.speaker.frequency,0);await assert.rejects(f.b.beep(550,10),Error);
});
test('silent beep cases and simultaneous motor/wait/speaker scheduling',async()=>{
 const f=fixture();assert.equal(await f.b.beep(440,0),'completed');assert.equal(f.hub.data.speaker.frequency,0);assert.equal(f.hub.data.speaker.beeps,1);const silent=f.b.beep(0,100);f.b.step(99);assert.notEqual(f.b._sound,null);assert.equal(f.hub.data.speaker.frequency,0);f.b.step(1);assert.equal(await silent,'completed');
 const tone=f.b.beep(440,100),wait=f.b.wait(50),motion=f.b.runForTime(0,200,300);f.b.step(50);assert.equal(await wait,'completed');assert.equal(f.hub.data.speaker.frequency,440);f.b.step(50);assert.equal(await tone,'completed');assert.equal(f.b.busy(0),true);f.b.step(100);assert.equal(await motion,'completed');
 f.hub.clockOwner='external';const snapshot=structuredClone(f.hub.data);await assert.rejects(f.b.beep(440,10),Error);assert.deepEqual(f.hub.data,snapshot);const empty=fixture();empty.b.stopSound();assert.equal(empty.hub.data.speaker.frequency,0);
});
