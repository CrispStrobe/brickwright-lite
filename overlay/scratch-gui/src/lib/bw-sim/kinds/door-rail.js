// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// The 4510 door rail fits the side groove in 2653. Their opposed open faces
// and collinear strips form a rectangular slider, with finite engagement.
import {shaftEngagement} from './pin-axle.js';
import {vecDot,vecSub,vecScale,vecLen,COS_1_DEG} from '../mech/vec.js';
import {placedTooth,toothConnectors} from './tooth-parts.js';
import {continuousStrips} from './continuous-strip.js';
const valid=c=>{
 const n=c.data?.normal;
 return Number.isFinite(c.length)&&c.length>0&&Array.isArray(n)&&n.length===3&&n.every(Number.isFinite)&&Math.abs(Math.hypot(...n)-1)<1e-6&&Math.abs(vecDot(n,c.axis))<1e-6?[]:['a door guide needs its length and a perpendicular unit data.normal'];
};
export const doorRailMatch=(groove,rail)=>{
 const delta=vecSub(groove.position,rail.position);
 return Boolean(groove.normal&&rail.normal&&vecDot(groove.normal,rail.normal)<-COS_1_DEG&&
  vecLen(vecSub(delta,vecScale(rail.axis,vecDot(delta,rail.axis))))<=.5&&shaftEngagement(rail,groove)!==null);
};
export const DOOR_GROOVE={kind:'door-groove',validate:valid,pairs:[{with:'door-rail',edge:()=> 'slider',match:doorRailMatch}]};
export const DOOR_RAIL={kind:'door-rail',validate:valid};
export const DOOR_NEST={id:'door-rail',kind:'door-rail',detect:()=>({}),collisionPairs:({nodes,islands})=>{
 const rails=continuousStrips(toothConnectors(nodes,islands,'door-rail',['normal']));
 const grooves=toothConnectors(nodes,islands,'door-groove',['normal']),pairs=[];
 for(const g of grooves)for(const r of rails)if(g.islandId!==r.islandId&&doorRailMatch({...g.c,normal:g.data.normal},{...r.c,normal:r.data.normal}))for(const member of r.members)pairs.push([g.partId,member.partId]);
 return pairs;
},placedMesh(a,ma,b,mb){
 return [[a,ma,b,mb],[b,mb,a,ma]].some(([p,mp,q,mq])=>placedTooth(p,mp,'door-groove',['normal']).some(g=>placedTooth(q,mq,'door-rail',['normal']).some(r=>doorRailMatch({...g.c,normal:g.data.normal},{...r.c,normal:r.data.normal}))));
}};
