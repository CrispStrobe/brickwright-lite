// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Join touching collinear strips only on the same rigid body and facing the
// same way. A gap, offset, different width or different body ends a run.
import {vecDot,vecSub,vecScale,vecLen,COS_1_DEG} from '../mech/vec.js';
const normal=s=>s.c.normal||s.data?.normal;
export const continuousStrip = (seed,strips) => {
 const u=seed.c.axis,centre=vecDot(seed.c.position,u);let lo=centre-seed.c.length/2,hi=centre+seed.c.length/2;
 const members=new Set([seed]);let changed=true;
 while(changed){changed=false;for(const s of strips){
  if(members.has(s)||s.islandId!==seed.islandId||s.c.type!==seed.c.type||Math.abs(vecDot(u,s.c.axis))<COS_1_DEG)continue;
  const n=normal(seed),other=normal(s);
  if(Boolean(n)!==Boolean(other)||(n&&vecDot(n,other)<COS_1_DEG)||(s.data?.widthLdu||0)!==(seed.data?.widthLdu||0))continue;
  const delta=vecSub(s.c.position,seed.c.position),along=vecDot(delta,u);
  if(vecLen(vecSub(delta,vecScale(u,along)))>.5)continue;
  const at=vecDot(s.c.position,u),a=at-s.c.length/2,b=at+s.c.length/2;
  if(a>hi+.5||b<lo-.5)continue;
  lo=Math.min(lo,a);hi=Math.max(hi,b);members.add(s);changed=true;
 }}
 return {...seed,c:{...seed.c,position:seed.c.position.map((v,k)=>v+u[k]*((lo+hi)/2-centre)),length:hi-lo},members:[...members]};
};
export const continuousStrips = strips => {
 const remaining=new Set(strips),runs=[];
 for(const seed of strips){if(!remaining.has(seed))continue;const run=continuousStrip(seed,strips);runs.push(run);for(const member of run.members)remaining.delete(member);}
 return runs;
};
