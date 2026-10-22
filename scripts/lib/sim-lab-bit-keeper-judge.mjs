// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const deg=x=>x*180/Math.PI,mean=a=>a.reduce((s,x)=>s+x,0)/a.length,median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],sub=(a,b)=>a.map((x,i)=>x-b[i]),norm=a=>Math.hypot(...a),max=a=>Math.max(...a);
export function measureBit(r){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);
 assert.deepEqual(r.mechanism.actuators.map(a=>a.port),['A']);assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,3);
 const o=observeAddon(r),j=r.mechanism.joints.find(j=>j.motor),rows=r.track.map(f=>{const point=o.point(f,'bob_gear'),v=sub(point,o.point(f,'pivot'));return{t:f.t,theta:deg(Math.atan2(v[2],-v[1])),encoder:deg(f.joints[j.id].angle),point};});
 const maximum=max(rows.map(p=>p.encoder)),positive=rows.findIndex(p=>p.encoder===maximum),minimum=Math.min(...rows.map(p=>p.encoder)),negative=rows.findIndex(p=>p.encoder===minimum);
 assert.ok(positive<negative&&rows[positive].encoder>=7&&minimum<=-7);
 const quiet=(lo,hi)=>{const groups=[];let group=[];for(let i=lo;i<hi;i++){if(Math.abs(rows[i].encoder)<=.3)group.push(rows[i]);else if(group.length){groups.push(group);group=[];}}if(group.length)groups.push(group);
  const selected=groups.find(a=>a.at(-1).t-a[0].t>=5900);assert.ok(selected,'six-second held neutral region after each write');
  const end=selected[0].t+Math.min(6000,selected.at(-1).t-selected[0].t);return selected.filter(p=>p.t>=end-4000&&p.t<=end);
 };
 const windows=[quiet(positive,negative),quiet(negative,rows.length)],stats=windows.map(a=>({samples:a.length,duration:(a.at(-1).t-a[0].t)/1000,mean:mean(a.map(p=>p.theta)),minimum:Math.min(...a.map(p=>p.theta)),maximum:max(a.map(p=>p.theta)),encoderMedian:median(a.map(p=>p.encoder)),encoderMax:max(a.map(p=>Math.abs(p.encoder))),point:[0,1,2].map(k=>mean(a.map(p=>p.point[k]))),crossings:a.slice(1).filter((p,i)=>p.theta*a[i].theta<0).length}));
 const start=r.track[0].bodies[o.base.id].position,drift=max(r.track.map(f=>norm(sub(f.bodies[o.base.id].position,start))*1000)),tilt=max(r.track.map(f=>o.tilt(f))),closure=max(r.track.map(f=>o.gap(f)));
 assert.ok(drift<=2&&tilt<=1&&closure<=1);assert.ok(rows.every(p=>Number.isFinite(p.theta)&&Math.abs(p.theta)<=50&&Math.abs(p.encoder)<=10));
 return{windows:stats,separationDegrees:stats[0].mean-stats[1].mean,neutralDifferenceDegrees:Math.abs(stats[0].encoderMedian-stats[1].encoderMedian),bobSeparationMm:norm(sub(stats[0].point,stats[1].point))*1000,driftMm:drift,tiltDegrees:tilt,closureMm:closure};
}
export function judgeBitStartup(r){
 const start=r.start||0,j=r.mechanism.joints.find(j=>j.motor),early=r.track.find(f=>f.t-start>=1500),o=observeAddon(r);
 const angle=f=>{const p=o.point(f,'bob_gear'),q=o.point(f,'pivot');return deg(Math.atan2(p[2]-q[2],q[1]-p[1]));};
 assert.ok(early&&Math.abs(deg(early.joints[j.id].angle))>=1,'input moves within the first 1.5 simulated seconds');
 assert.ok(angle(r.track[0])<-8,'saved output starts in the negative state');
 const firstSwitch=r.track.find(f=>f.t-start<=5000&&angle(f)>8);
 assert.ok(firstSwitch,'passive output switches away from its saved state within five seconds');
 assert.ok(r.finishedAt&&r.finishedAt-start<35000,'two-state demonstration completes within 35 simulated seconds');
 const variables=r.track.at(-1).extra?.variables;
 if(variables){assert.equal(variables.complete,1);assert.equal(variables.fault,0);}
 return{inputAt1_5s:deg(early.joints[j.id].angle),firstSwitchMs:firstSwitch.t-start,finishedMs:r.finishedAt-start};
}
export function judgeBit(_id,r){const result=measureBit(r);const startup=judgeBitStartup(r);for(const [i,w]of result.windows.entries()){assert.ok(w.samples>=100&&w.duration>=3.9);assert.ok((i===0?w.minimum:-w.maximum)>=8&&w.crossings===0,JSON.stringify(result));assert.ok(w.encoderMax<=.3);}assert.ok(result.separationDegrees>=20&&result.neutralDifferenceDegrees<=.15&&result.bobSeparationMm>=10,JSON.stringify(result));return{...result,startup};}
