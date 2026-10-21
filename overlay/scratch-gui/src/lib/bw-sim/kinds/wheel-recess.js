// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// 39367's central hub ends at z=+/-10 LDU. Beyond either face the
// recursive official mesh has no material within radius 53.3178 LDU.
// Its full-width cylindrical tyre proxy therefore overstates plastic next
// to the hub. Admit seated coaxial bushes there, while retaining the hub,
// tyre and off-axis collision checks. This does not weld or move any part.
import {mat3MulVec3,vecSub,vecDot,vecLen,vecScale} from '../mech/vec.js';
const bushes=new Map([['3713.dat',10],['4265c.dat',5],['32123b.dat',5]]);
export const wheelRecessContains=(wheel,wm,bush,bm)=>{
 if(wheel.part!=='39367p01.dat'||!bushes.has(bush.part)||!wm?.connectors?.length||!bm?.connectors?.length)return false;
 const axis=mat3MulVec3(wheel.rotation,wm.connectors[0].axis),other=mat3MulVec3(bush.rotation,bm.connectors[0].axis);
 if(Math.abs(vecDot(axis,other))<1-1e-9)return false;
 const d=vecSub(bush.position,wheel.position),axial=vecDot(d,axis),radial=vecLen(vecSub(d,vecScale(axis,axial))),inner=Math.abs(axial)-bushes.get(bush.part);
 return radial<=.5&&radial+9.001<=52&&inner>=10-1e-9&&inner<17.5;
};
export const WHEEL_RECESS={id:'wheel-recess',kind:'wheel-recess',detect:()=>({couplings:[]}),placedMesh:(a,ma,b,mb)=>wheelRecessContains(a,ma,b,mb)||wheelRecessContains(b,mb,a,ma)};
