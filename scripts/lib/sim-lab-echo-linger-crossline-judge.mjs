// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// All points follow measured native bodies. Predictions never set a pose.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
import {linkage} from './sim-lab-linger-kinematics.mjs';
const sub=(a,b)=>a.map((x,i)=>x-b[i]), add=(a,b)=>a.map((x,i)=>x+b[i]), norm=a=>Math.hypot(...a), deg=x=>x*180/Math.PI, rad=x=>x*Math.PI/180, span=a=>Math.max(...a)-Math.min(...a), max=a=>Math.max(...a), wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const unwrap=xs=>{let p=xs[0],s=p;return xs.map(x=>{s+=wrap(x-p);p=x;return s;});};
const ry=(q,v)=>[Math.cos(q)*v[0]+Math.sin(q)*v[2],v[1],-Math.sin(q)*v[0]+Math.cos(q)*v[2]];
function health(r){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.deepEqual(r.mechanism.actuators.map(a=>a.port),['A']);
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 const o=observeAddon(r),start=r.track[0].bodies[o.base.id].position;
 const drift=max(r.track.map(f=>norm(sub(f.bodies[o.base.id].position,start))*1000)),tilt=max(r.track.map(f=>o.tilt(f))),closure=max(r.track.map(f=>o.gap(f))),axis=max(r.track.map(f=>o.axisGap(f)));
 assert.ok(drift<=5&&tilt<=2&&closure<=.8,JSON.stringify({drift,tilt,closure,axis}));
 return{o,j:r.mechanism.joints.find(j=>j.motor),drift,tilt,closure,axis};
}
export function judgeCrossline(r){
 const {o,j,...stability}=health(r);assert.ok(stability.axis<=1);const O=o.initial('sun_16t',[0,0,120]),c0=sub(o.initial('output_8t',[0,0,120]),O),v0=sub(o.initial('marker_plus'),o.initial('output_8t',[0,0,120])),v1=sub(o.initial('marker_minus'),o.initial('output_8t',[0,0,120]));
 const q=unwrap(r.track.map(f=>o.angle(f,'carrier_cross',[0,1,0],[1,0,0]))),s=unwrap(r.track.map(f=>o.angle(f,'output_bar',[0,1,0],[1,0,0])));
 const P=r.track.map(f=>sub(o.point(f,'marker_plus'),o.point(f,'sun_16t',[0,0,120]))),Q=r.track.map(f=>sub(o.point(f,'marker_minus'),o.point(f,'sun_16t',[0,0,120])));
 const error=max(r.track.map((f,i)=>Math.max(norm(sub(P[i],add(ry(q[i],c0),ry(-q[i],v0)))),norm(sub(Q[i],add(ry(q[i],c0),ry(-q[i],v1)))))*1000));
 const phase=max(q.map((x,i)=>Math.abs(deg(wrap(x+s[i])))));
 assert.ok(error<=1&&phase<=2,JSON.stringify({error,phase}));
 const travel=a=>({forward:a.slice(1).reduce((n,x,i)=>n+Math.max(0,deg(x-a[i])),0),reverse:a.slice(1).reduce((n,x,i)=>n+Math.max(0,deg(a[i]-x)),0)});
 for(const t of [travel(q),travel(s)])assert.ok(t.forward>=700&&t.reverse>=700,'two turns each direction');
 const spans=[span(P.map(p=>p[2]))*1000,span(Q.map(p=>p[0]))*1000],transverse=[span(P.map(p=>p[0]))*1000,span(Q.map(p=>p[2]))*1000];
 assert.ok(spans.every(x=>x>=78)&&transverse.every(x=>x<=1),JSON.stringify({spans,transverse}));
 const returnMm=Math.max(norm(sub(P.at(-1),P[0])),norm(sub(Q.at(-1),Q[0])))*1000;
 assert.ok(returnMm<=1&&Math.abs(deg(r.track.at(-1).joints[j.id].angle))<=1.5);
 return{...stability,markerErrorMm:error,phaseDegrees:phase,spansMm:spans,transverseMm:transverse,travel:travel(q),returnMm};
}
export function measureEcho(r){
 const {o,j,...stability}=health(r);
 const rows=r.track.map(f=>{
  const vectors=['left','right'].map(side=>sub(o.point(f,'bob_wheel_'+side),o.point(f,'pivot_'+side)));
  return{t:f.t,angles:vectors.map(v=>deg(Math.atan2(v[2],-v[1]))),receiver:o.point(f,'bob_wheel_right'),encoder:deg(f.joints[j.id].angle)};
 });
 // The observed return fixes the window; no receiver-output selection or smoothing.
 const lastOffDatum=rows.findLastIndex(p=>Math.abs(p.encoder)>.3),observationStart=rows[lastOffDatum].t+250;
 const rows20=rows.filter(p=>p.t>=observationStart&&p.t<observationStart+20000),receiverSpan=span(rows20.map(p=>p.receiver[2]))*1000;
 let previous=0,switches=0;const windows=[];
 for(let k=0;k<20;k++){
  const a=rows20.filter(p=>p.t>=rows20[0].t+k*1000&&p.t<rows20[0].t+(k+1)*1000);if(a.length<25)continue;
  const rms=[0,1].map(i=>{const mean=a.reduce((s,p)=>s+p.angles[i],0)/a.length;return Math.sqrt(a.reduce((s,p)=>s+(p.angles[i]-mean)**2,0)/a.length);});
  const side=Math.hypot(...rms)<.5?0:rms[0]>1.2*rms[1]?1:rms[1]>1.2*rms[0]?-1:0;
  if(side&&previous&&side!==previous)switches++;if(side)previous=side;windows.push(rms);
 }
 return{...stability,receiverSpanMm:receiverSpan,switches,windows,observationSamples:rows20.length,maxAngleDegrees:max(rows.flatMap(p=>p.angles.map(Math.abs))),heldErrorDegrees:max(rows20.map(p=>Math.abs(p.encoder))),motorExcursionDegrees:max(rows.map(p=>Math.abs(p.encoder)))};
}
export function judgeEcho(r){
 const result=measureEcho(r);
 assert.ok(result.receiverSpanMm>=5&&result.switches>=2&&result.observationSamples>=500,JSON.stringify(result));
 assert.ok(result.maxAngleDegrees<=8&&result.heldErrorDegrees<=.3&&result.motorExcursionDegrees<=90,JSON.stringify(result));
 assert.ok(result.drift<=2&&result.tilt<=1);
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,4);
 return result;
}
export function judgeLinger(r){
 const {o,j,...stability}=health(r);
 // Real zero-based stock connectors h1/h3 (5L) and h1/h3/h5/h6 (7L).
 // prepareModel rotates the saved source 90 degrees: source X/Z map to native Z/X.
 assert.ok(stability.axis<=1);
 const O=f=>o.point(f,'crank_OA',[0,0,-20]),A=f=>o.point(f,'crank_OA',[0,0,20]),D=f=>o.point(f,'intermediate_DB',[0,0,-40]),B=f=>o.point(f,'intermediate_DB',[0,0,40]),E=f=>o.point(f,'output_EP',[0,0,-40]),P=f=>o.point(f,'output_EP'),Q=f=>o.point(f,'output_EP',[0,0,60]);
 const xy=(a,b)=>{const d=sub(a,b);return[d[2]*1000,d[0]*1000];},angle=v=>Math.atan2(v[1],v[0]);
 const rows=r.track.map(f=>({t:f.t,theta:angle(xy(A(f),O(f))),phi:angle(xy(P(f),E(f))),beta:angle(xy(B(f),D(f))),q:xy(Q(f),O(f)),p:xy(P(f),O(f)),b:xy(B(f),O(f)),encoder:f.joints[j.id].angle}));
 const th=unwrap(rows.map(p=>p.theta)),phi=unwrap(rows.map(p=>p.phi));
 const error=max(rows.map((p,i)=>{const k=linkage(th[i]);return Math.max(norm(sub(p.q,k.Q.map(v=>v*.4))),norm(sub(p.p,k.P.map(v=>v*.4))),norm(sub(p.b,k.B.map(v=>v*.4))));})),angleError=max(rows.map((p,i)=>Math.abs(deg(wrap(p.phi-linkage(th[i]).outputRadians))))),encoderError=max(rows.map((p,i)=>Math.abs(deg(wrap(th[i]+p.encoder)))));
 assert.ok(error<=.5&&angleError<=1&&encoderError<=.5,JSON.stringify({error,angleError,encoderError}));
 assert.ok(rows.length>=4300&&span(th.map(deg))>=718&&span(phi.map(deg))>=65);
 const turning=th.indexOf(Math.max(...th));const windows=[];
 for(const [lo,hi]of [[0,turning],[turning,rows.length]])for(let cycle=0;cycle<2;cycle++){
  const indices=rows.map((p,i)=>i).filter(i=>i>=lo&&i<hi&&deg(th[i])>=cycle*360+186&&deg(th[i])<=cycle*360+276),a=indices.map(i=>rows[i]),out=indices.map(i=>deg(phi[i]));
  assert.ok(a.length>=250,'dwell samples');const dwell=span(out),stroke=Math.hypot(...[0,1].map(k=>span(a.map(p=>p.q[k])))),duration=(a.at(-1).t-a[0].t)/1000,coverage=span(indices.map(i=>deg(th[i])));
  assert.ok(dwell<=1&&stroke<=1&&duration>=8.5&&coverage>=89,JSON.stringify({dwell,stroke,duration,coverage}));windows.push({dwellDegrees:dwell,tipStrokeMm:stroke,durationSeconds:duration,inputDegrees:coverage});
 }
 assert.ok(Math.abs(deg(rows.at(-1).encoder))<=2&&norm(sub(rows.at(-1).q,rows[0].q))<=1);
 return{...stability,pointErrorMm:error,outputErrorDegrees:angleError,inputEncoderErrorDegrees:encoderError,outputSpanDegrees:span(phi.map(deg)),dwellWindows:windows};
}
export const judgeEchoLingerCrossline=(id,r)=>id==='echo-bridge'?judgeEcho(r):id==='linger'?judgeLinger(r):judgeCrossline(r);
