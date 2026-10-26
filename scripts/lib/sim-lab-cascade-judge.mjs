// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v)),span=v=>Math.max(...v)-Math.min(...v),deg=x=>x*180/Math.PI;
const qm=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],qi=q=>[-q[0],-q[1],-q[2],q[3]],qr=(q,v)=>qm(qm(q,[...v,0]),qi(q)).slice(0,3);
function reversals(values){let direction=0,anchor=values[0],extreme=anchor,count=0;for(const x of values.slice(1)){
 if(!direction){if(Math.abs(x-anchor)>=.25){direction=x>anchor?1:-1;extreme=x;}}
 else if(direction>0){if(x>extreme)extreme=x;else if(extreme-x>=.25){count++;direction=-1;extreme=x;}}
 else if(x<extreme)extreme=x;else if(x-extreme>=.25){count++;direction=1;extreme=x;}
}return count;}
export function judgeCascade(r,{control=false,native=false}={}){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported||[],[]);assert.ok(r.finishedAt>0,'finite program completes');
 assert.equal(r.runModel.parts.length,control?76:70);assert.deepEqual(r.mechanism.actuators.map(a=>a.port),['A']);assert.equal(r.mechanism.couplings.length,0);
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,4);assert.equal(r.mechanism.joints.filter(j=>j.type==='hinge').length,3);
 const o=observeAddon(r),axis=unit(sub(o.initial('hub',[0,0,1]),o.initial('hub'))),down=unit(sub(o.initial('upper_link',[0,0,1]),o.initial('upper_link')));
 assert.equal(o.body('upper_link').id===o.body('lower_link').id,control,'physical brace controls the actual rigid ownership');
 const angles={};for(const part of ['crank','upper_link','lower_link']){let last=0,total=0;angles[part]=r.track.map(f=>{const a=o.angle(f,part,axis,down);total+=Math.atan2(Math.sin(a-last),Math.cos(a-last));last=a;return deg(total);});}
 const carry=(f,b,p)=>{const d=qr(qm(f.bodies[b.id].rotation,qi(b.rotation)),sub(p,b.position));return f.bodies[b.id].position.map((v,i)=>v+d[i]);};
 const motor=r.mechanism.joints.find(j=>j.motor?.port==='A'),ground=r.mechanism.bodies.find(b=>b.role==='ground'),floorY=ground.position[1]+ground.colliders[0].halfExtents[1];
 const rows=r.track.map((f,i)=>{
  for(const p of Object.values(f.bodies))assert.ok([...p.position,...p.rotation].every(Number.isFinite),'finite native poses');
  const feet=['base_runner_left','base_runner_right'].flatMap(id=>[-140,140].map(z=>carry(f,o.body(id),o.initial(id,[0,10,z]))));
  return{t:f.t,phase:f.phase,vars:f.extra?.variables||{},motor:deg(f.joints[motor.id].angle),crank:angles.crank[i],upper:angles.upper_link[i],lower:angles.lower_link[i],elbow:angles.lower_link[i]-angles.upper_link[i],gap:o.gap(f),axis:o.axisGap(f),tilt:o.tilt(f),drift:norm(sub(f.bodies[o.base.id].position,o.base.position))*1000,footError:Math.max(...feet.map(v=>Math.abs(v[1]-floorY)*1000)),pivotFrame:o.point(f,'crank',[0,0,40]),pivotWorld:carry(f,o.body('crank'),o.initial('crank',[0,0,40]))};
 });
 const final=rows.at(-1),flags={completed:1,failed:0,homed:1,supportHeld:1,observing:0,stage:4};for(const [k,v]of Object.entries(flags))assert.equal(Number(final.vars[k]),v,k);
 assert.ok(Math.abs(final.motor)<.5,'support motor returns and holds');assert.ok(Math.max(...rows.map(p=>p.motor))>89.5,'motor really excites the support');
 if(native){const cold=rows.filter(p=>p.phase==='cold');assert.ok(cold.length>=20);assert.ok(Math.max(...cold.map(p=>Math.abs(p.motor)))<=1,'strict saved datum before commands');}
 const held=rows.filter(p=>Number(p.vars.observing)===1);assert.ok(held.length>100,'physical hold window observed');assert.ok(held.at(-1).t-held[0].t>=12000,'full 12 seconds of observation');
 const window=held.filter(p=>p.t>=held[0].t+250),tail=held.filter(p=>p.t>=held.at(-1).t-3000),ranges=ps=>Object.fromEntries(['crank','upper','lower','elbow'].map(k=>[k,span(ps.map(p=>p[k]))]));
 const rangesHeld=ranges(window),rangesTail=ranges(tail),turns=reversals(window.map(p=>p.elbow));
 const max=(ps,key)=>Math.max(...ps.map(p=>p[key]));
 const gap=max(rows,'gap'),axisError=max(rows,'axis'),drift=max(rows,'drift'),tilt=max(rows,'tilt'),feet=max(rows,'footError');
 const worldTravel=Math.max(...window.map(p=>norm(sub(p.pivotWorld,window[0].pivotWorld))*1000)),frameTravel=Math.max(...window.map(p=>norm(sub(p.pivotFrame,window[0].pivotFrame))*1000));
 assert.ok(gap<.5&&axisError<.5,'original hinge closure and axes');assert.ok(drift<1&&tilt<1&&feet<1,'stationary chassis and ground support');
 assert.ok(rangesHeld.crank<.5&&worldTravel<.5&&frameTravel<.3,'held support is physically stationary');
 assert.ok(rangesHeld.upper>=5,'the upper joint remains free');
 if(control)assert.ok(rangesHeld.elbow<=.1,'real brace removes relative elbow motion');
 else{assert.ok(rangesHeld.lower>=10&&rangesHeld.elbow>=5,'both independent passive links move');assert.ok(rangesTail.upper>=2&&rangesTail.lower>=4&&rangesTail.elbow>=2,'motion persists through the final three observation seconds');assert.ok(turns>=3,'multiple real elbow reversals');}
 return{control,pieces:control?76:70,heldSpansDeg:rangesHeld,final3sSpansDeg:rangesTail,elbowReversals:turns,maxHingeGapMm:gap,maxAxisErrorDeg:axisError,maxFrameDriftMm:drift,maxFrameTiltDeg:tilt,maxFootPlaneDeviationMm:feet,maxHeldPivotWorldTravelMm:worldTravel,maxHeldPivotFrameTravelMm:frameTravel};
}
