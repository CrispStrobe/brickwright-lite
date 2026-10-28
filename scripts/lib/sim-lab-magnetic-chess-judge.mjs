// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),len=v=>Math.hypot(...v);
export function judgeMagneticChess(id,r){
 const capture=id.endsWith('capture'),{mechanism:m,track}=r,body=new Map(m.bodies.map(b=>[b.id,b])),fields=m.couplings.filter(c=>c.kind==='magneticField');
 assert.deepEqual(r.unsupported,[]);assert.ok(r.issues.every(i=>i.code==='locked-hinges'));assert.equal(fields.length,32);assert.ok(track.length>1000);
 const board=m.bodies.find(b=>b.parts.includes('custom_glass_insert'));assert.equal(board.motion,'dynamic','a board override cannot qualify transport');
 const byPiece=new Map(fields.map(c=>[c.parts[1],c]));
 for(const c of fields){assert.equal(body.get(c.body2).role,'load');assert.ok(!m.joints.some(j=>j.body1===c.body2||j.body2===c.body2),'pieces stay independent');}
 const carry=(f,id,p)=>{const b=body.get(id),pose=f.bodies[id];return add(pose.position,rot(pose.rotation,rot(conj(b.rotation||[0,0,0,1]),sub(p,b.position))));};
 const local=(f,p)=>rot(conj(f.bodies[board.id].rotation),sub(p,f.bodies[board.id].position));
 const start=id=>sub(byPiece.get(id).point2,board.position),a1=start('w_rook_a1_base'),h1=start('w_rook_h1_base'),a8=start('b_rook_a8_base');
 const square=(file,rank)=>a1.map((v,k)=>v+file*(h1[k]-v)/7+rank*(a8[k]-v)/7);
 const destinations=capture?[['w_knight_g1_base',square(5,2)],['w_pawn_e2_base',square(4,3)],['b_pawn_d7_base',square(3,4)],['b_pawn_d7_base',square(8.5,7.25)],['w_pawn_e2_base',square(3,4)]]:[['w_knight_g1_base',square(5,2)]];
 const cj=m.actuators.find(a=>a.port==='C').joint;let engaged=false;const releases=[];
 for(const f of track){
  for(const p of Object.values(f.bodies))assert.ok([...p.position,...p.rotation].every(Number.isFinite),'finite body poses');
  const angle=f.joints[cj].angle;if(angle>175*Math.PI/180)engaged=true;if(engaged&&angle<2*Math.PI/180){releases.push(f);engaged=false;}
 }
 assert.equal(releases.length,destinations.length,'each transfer engages then physically retracts the head');
 let transferErrorMm=0,untouchedTravelMm=0;
 for(let k=0;k<destinations.length;k++){const [id,target]=destinations[k],f=releases[k],c=byPiece.get(id),actual=local(f,carry(f,c.body2,c.point2));const error=len(sub(actual,target))*1000;transferErrorMm=Math.max(transferErrorMm,error);assert.ok(error<2,`${id} actual release position is within 2 mm of its independently measured board target (${error} mm)`);}
 const moved=new Set(destinations.map(([id])=>id));for(const [id,c]of byPiece)if(!moved.has(id))for(const f of track)untouchedTravelMm=Math.max(untouchedTravelMm,len(sub(local(f,carry(f,c.body2,c.point2)),start(id)))*1000);
 assert.ok(untouchedTravelMm<.5,'uncommanded pieces stay on their squares');
 const last=track.at(-1),first=fields[0];assert.ok(Math.abs(last.joints[cj].angle)<2*Math.PI/180,'head ends retracted');
 assert.ok(len(sub(local(last,carry(last,first.body1,first.point1)),sub(first.point1,board.position)))*1000<.5,'head returns home');
 assert.ok(fields.every(c=>len(sub(carry(last,c.body1,c.point1),carry(last,c.body2,c.point2)))>=c.field.rangeM),'retraction/parking removes all magnetic forces');
 return {transfers:releases.length,transferErrorMm,untouchedTravelMm};
}
