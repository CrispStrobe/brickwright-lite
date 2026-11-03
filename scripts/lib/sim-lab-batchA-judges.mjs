// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions judge observed, passive bodies; they never drive their poses.
// Batch A (2026-10-28, landed 2026-11-02): Bend Ripple, Offset Relay, Rack Decoder, Remote Pivot and Schmidt Shift are
// promoted. Kestrel, Meridian, Lumen and Tangent Table judges are registered; those models stay experimental (see the checkpoint).
// Each law is derived from the model's documented mechanism and the compiled joints and gears, never fitted
// to the recorded motion. Failing assertions carry their measured values.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>scale(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const deg=x=>x*180/Math.PI,max=(s,k)=>Math.max(...s.map(k)),span=a=>Math.max(...a)-Math.min(...a);
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
const inPlane=(v,a)=>sub(v,scale(a,dot(v,a)));
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};
const qmul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=q=>[-q[0],-q[1],-q[2],q[3]],rotq=(q,v)=>qmul(qmul(q,[...v,0]),conj(q)).slice(0,3);
const ids=j=>[j.body1,j.body2];
const vars=f=>f.extra.variables;

function healthy(r,native,{couplings=[]}={}){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
 check(r.mechanism.couplings.every(c=>couplings.includes(c.kind)),'only declared physical couplings',{kinds:r.mechanism.couplings.map(c=>c.kind),couplings});
}
function foundation(r,o){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id];
 const frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=max(frames,f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000),tiltDeg=max(frames,f=>o.tilt(f));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});
 const gapMm=max(r.track,f=>o.gap(f)),axisDeg=max(r.track,f=>o.axisGap(f));
 check(gapMm<=.5&&axisDeg<=1,'true hinge closure and aligned axes',{gapMm,axisDeg});return{horizontalMm,tiltDeg,gapMm,axisDeg};
}
const done=(r,stage)=>{const v=vars(r.track.at(-1));check(Number(v.completed)===1&&Number(v.failed)===0&&(stage===undefined||String(v.stage)===String(stage)),'program completes without fault',{completed:v.completed,failed:v.failed,stage:v.stage});};
/** A compiled point carried with a body, in the saved chassis frame. */
const carried=(r,o,f,bodyId,p)=>{const b=r.mechanism.bodies.find(b=>b.id===bodyId),fb=f.bodies[bodyId],base=o.base,fbase=f.bodies[base.id];
 const w=add(fb.position,rotq(fb.rotation,rotq(conj(b.rotation),sub(p,b.position))));return add(base.position,rotq(base.rotation,rotq(conj(fbase.rotation),sub(w,fbase.position))));};
const hingeBetween=(m,a,b)=>m.joints.find(j=>j.type==='hinge'&&ids(j).includes(a)&&ids(j).includes(b));
const heading=(r,o,part,axis)=>unwrap(r.track.map(f=>o.angle(f,part,axis,unit(inPlane(Math.abs(axis[0])>.9?[0,0,1]:[1,0,0],axis))))).map(deg);

// ---------------------------------------------------------------------------------------------
// Kestrel: a Grashof crank-rocker. Crank O→A (r), coupler A→B (c), rocker C→B (k), ground O→C (g), all read from
// the compiled hinges. For the observed crank angle the rocker pin B is the circle intersection |B−A| = c,
// |B−C| = k on the branch continuous from the saved pose; the passive rocker must follow it.
export function judgeKestrel(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);done(r,5);
 const m=r.mechanism,o=observeAddon(r,'column_-60_40'),crank=o.body('crank'),rocker=o.body('rocker'),cpl=o.body('coupler'),base=o.base;
 const jO=m.joints.find(j=>j.motor?.port==='A'),jC=hingeBetween(m,base.id,rocker.id),jA=hingeBetween(m,crank.id,cpl.id),jB=hingeBetween(m,rocker.id,cpl.id);assert.ok(jO&&jC&&jA&&jB,'four-bar hinges');
 const a=unit(jO.axis),P=v=>{const w=inPlane(v,a),e1=unit(inPlane([0,0,1],a)),e2=cross(a,e1);return[dot(w,e1),dot(w,e2)];};
 const O=P(jO.point),C=P(jC.point),A0=P(jA.point),B0=P(jB.point),rr=Math.hypot(A0[0]-O[0],A0[1]-O[1]),c=Math.hypot(B0[0]-A0[0],B0[1]-A0[1]),k=Math.hypot(B0[0]-C[0],B0[1]-C[1]),g=Math.hypot(C[0]-O[0],C[1]-O[1]);
 const L=[rr,c,k,g].sort((x,y)=>x-y);check(L[0]+L[3]<L[1]+L[2]&&rr===L[0],'Grashof crank-rocker: the crank is the shortest link',{rr,c,k,g});
 let prev=B0;const side=(A,B)=>Math.sign((C[0]-A[0])*(B[1]-A[1])-(C[1]-A[1])*(B[0]-A[0]));const s0=side(A0,B0);
 const rows=r.track.map(f=>{const A=P(carried(r,o,f,crank.id,jA.point)),d=Math.hypot(C[0]-A[0],C[1]-A[1]);check(d<=c+k&&d>=Math.abs(c-k),'closable four-bar',{d});
  const x=(c*c-k*k+d*d)/(2*d),h=Math.sqrt(Math.max(0,c*c-x*x)),ux=(C[0]-A[0])/d,uy=(C[1]-A[1])/d,cands=[[A[0]+x*ux-h*uy,A[1]+x*uy+h*ux],[A[0]+x*ux+h*uy,A[1]+x*uy-h*ux]];
  const pred=cands.find(B=>side(A,B)===s0)||cands[0];prev=pred;
  const Bobs=P(carried(r,o,f,rocker.id,jB.point));return{f,err:Math.hypot(pred[0]-Bobs[0],pred[1]-Bobs[1])*1000,rockDeg:deg(Math.atan2(Bobs[1]-C[1],Bobs[0]-C[0])),crankDeg:deg(Math.atan2(A[1]-O[1],A[0]-O[0]))};});
 const err=max(rows,x=>x.err);check(err<=.3,'passive rocker pin follows the four-bar closure from the observed crank',{err});
 const crankTurn=span(unwrap(rows.map(x=>x.crankDeg*Math.PI/180)).map(deg)),swing=span(rows.map(x=>x.rockDeg));
 check(crankTurn>=700,'the crank makes full turns',{crankTurn});
 // Extreme rocker angles of a crank-rocker occur where crank and coupler line up: |B−C|=k with |A−... | = c ± r from O.
 const ext=[c-rr,c+rr].map(l=>{const cosv=(l*l+g*g-k*k)/(2*l*g);return Math.acos(cosv);});const predictedSwing=deg(Math.abs(Math.acos((g*g+k*k-(c+rr)**2)/(2*g*k))-Math.acos((g*g+k*k-(c-rr)**2)/(2*g*k))));void ext;
 check(Math.abs(swing-predictedSwing)<=.3,'rocker swing equals the toggle-position prediction',{swing,predictedSwing});
 const last=rows.at(-1),first=rows[0];check(Math.abs(last.rockDeg-first.rockDeg)<=.3,'rocker returns to its saved pose',{first:first.rockDeg,last:last.rockDeg});
 return{linksMm:[rr,c,k,g].map(x=>x*1000),lawErrorMm:err,swingDeg:swing,predictedSwingDeg:predictedSwing,crankTurnDeg:crankTurn,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Remote Pivot: two linked parallelograms. The output beam turns by exactly the input angle about a point C with
// no bearing: C lies 16 mm beyond the follower bearing B (source header), on the line from the proximal link's
// input pin P through the input bearing A, i.e. C = B + (A − P)/2 with A, B, P from the compiled hinges.
export function judgeRemotePivot(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);done(r,8);
 const m=r.mechanism,o=observeAddon(r,'hub'),inp=o.body('input_beam'),fol=o.body('follower_beam'),out=o.body('output_beam'),prox=o.body('proximal_L'),base=o.base;
 const jA=m.joints.find(j=>j.motor?.port==='A'),jB=hingeBetween(m,base.id,fol.id),jP=hingeBetween(m,prox.id,inp.id);assert.ok(jA&&jB&&jP,'bearings and proximal pin');
 const a=unit(jA.axis),C=add(jB.point,scale(inPlane(sub(jA.point,jP.point),a),.5));
 check(Math.abs(norm(inPlane(sub(C,jB.point),a))-.016)<1e-6,'C is 16 mm beyond the follower bearing',{dMm:norm(inPlane(sub(C,jB.point),a))*1000});
 const hin=heading(r,o,'input_beam',a),hout=heading(r,o,'output_beam',a);
 const turn=max(r.track.map((f,i)=>i),i=>Math.abs((hout[i]-hout[0])-(hin[i]-hin[0])));check(turn<=.1,'output turns by the input angle',{turn});
 const drift=max(r.track,f=>norm(inPlane(sub(carried(r,o,f,out.id,C),C),a))*1000);check(drift<=.2,'the empty centre C stays fixed',{drift});
 const sweep=span(hin);check(sweep>=55,'the input sweeps its sector',{sweep});
 return{centreMm:C.map(x=>x*1000),turnErrorDeg:turn,centreDriftMm:drift,inputSweepDeg:sweep,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Meridian: Peaucellier–Lipkin inversor. Long links from the fixed pivot O to B and D (length l) and the rhombus
// (side s) make O, P and Q collinear with OP·OQ = l² − s². The crank turns P on a circle through O (radius ρ about
// its bearing), so Q is driven along the straight line at distance (l² − s²)/(2ρ) from O. All lengths come from the
// compiled hinges; P is observed on the crank and Q on the passive output.
export function judgeMeridian(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);done(r,7);
 const m=r.mechanism,o=observeAddon(r,'hub'),crank=o.body('crank'),base=o.base,out=o.body('marker_output');
 const jM=m.joints.find(j=>j.motor?.port==='A'),longs=['long_OB','long_OD'].map(id=>o.body(id)),jO=longs.map(b=>hingeBetween(m,base.id,b.id));assert.ok(jO.every(Boolean),'long links pivot on the base');
 const a=unit(jM.axis),O=jO[0].point;check(norm(inPlane(sub(jO[1].point,O),a))<1e-6,'both long links share O',{});
 const cellP=m.joints.find(j=>j.type==='hinge'&&ids(j).includes(crank.id)&&!j.motor),pBody=ids(cellP).find(id=>id!==crank.id);
 const jLB=m.joints.find(j=>j.type==='hinge'&&ids(j).includes(longs[0].id)&&!ids(j).includes(base.id)),Bbody=ids(jLB).find(id=>id!==longs[0].id);
 const l=norm(inPlane(sub(jLB.point,O),a)),sJ=hingeBetween(m,Bbody,pBody),s=norm(inPlane(sub(jLB.point,cellP.point),a));void sJ;
 const rho=norm(inPlane(sub(cellP.point,jM.point),a)),through=norm(inPlane(sub(O,jM.point),a));check(Math.abs(rho-through)<1e-6,'the crank circle passes through O',{rho,through});
 const kk=l*l-s*s,d=kk/(2*rho),jQ=m.joints.find(j=>j.type==='hinge'&&ids(j).includes(out.id)&&!ids(j).includes(Bbody)),Q0=jQ.point;
 const nrm=unit(inPlane(sub(jM.point,O),a));
 const rows=r.track.map(f=>{const Pp=carried(r,o,f,crank.id,cellP.point),v=inPlane(sub(Pp,O),a),Qp=add(O,scale(v,kk/dot(v,v))),Qo=carried(r,o,f,out.id,Q0);return{err:norm(inPlane(sub(Qo,Qp),a))*1000,line:Math.abs(dot(inPlane(sub(Qo,O),a),nrm)-d)*1000,along:dot(inPlane(sub(Qo,O),a),unit(cross(a,nrm)))*1000};});
 const err=max(rows,x=>x.err),line=max(rows,x=>x.line),travel=span(rows.map(x=>x.along));
 check(err<=.3,'output is the inversion of the crank pin, OP·OQ = l² − s²',{err});
 check(line<=.3,'output stays on the straight line at distance (l² − s²)/(2ρ)',{line,dMm:d*1000});
 check(travel>=50,'output traverses the line',{travel});
 return{lMm:l*1000,sMm:s*1000,rhoMm:rho*1000,lineDistanceMm:d*1000,inversionErrorMm:err,lineErrorMm:line,travelMm:travel,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Schmidt Shift: Schmidt coupling. Three equal parallel links per stage join input, middle disc and output; with
// the compiled pins forming congruent link triangles, every carrier turns through the same angle: middle and output
// headings equal the input heading at all times.
export function judgeSchmidt(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);done(r,4);
 const o=observeAddon(r,'hub'),a=unit(r.mechanism.joints.find(j=>j.motor?.port==='A').axis);
 const hin=heading(r,o,'input_frame',a),hmid=heading(r,o,'middle_back_frame',a),hout=heading(r,o,'output_frame',a);
 const err=max(r.track.map((f,i)=>i),i=>Math.max(Math.abs((hmid[i]-hmid[0])-(hin[i]-hin[0])),Math.abs((hout[i]-hout[0])-(hin[i]-hin[0]))));
 check(err<=.2,'middle and output turn with the input (1:1)',{err});const turn=span(hin);check(turn>=1000,'input turns through its route',{turn});
 const last=Math.abs(hout.at(-1)-hout[0]);check(last<=.5,'output returns to the saved datum',{last});
 return{inputTurnDeg:turn,syncErrorDeg:err,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Offset Relay: a two-stage Schmidt-type relay. Motor B moves the output bearing on a rack carriage, changing the
// offset e between input and output axes; the middle body must stay at h = √(L² − e²/4) from each and all three
// headings stay equal. L (link length) is read from the compiled pins.
export function judgeOffsetRelay(r,{native=false}={}){
 healthy(r,native,{couplings:['rackAndPinion']});assert.equal(r.mechanism.actuators.length,2);done(r,9);
 const m=r.mechanism,o=observeAddon(r,'hub'),inp=o.body('input_beam_x'),mid=o.body('middle_cross_front'),out=o.body('output_beam_x');
 const jIn=m.joints.find(j=>j.motor?.port==='A'),jOut=m.joints.find(j=>j.type==='hinge'&&ids(j).includes(out.id)&&m.bodies.find(b=>b.id===ids(j).find(x=>x!==out.id)).parts.includes('adjustment_rack'));assert.ok(jIn&&jOut,'input and output bearings');
 const a=unit(jIn.axis),link=m.joints.filter(j=>j.type==='hinge'&&ids(j).includes(inp.id)&&j!==jIn)[0],lb=ids(link).find(x=>x!==inp.id),other=m.joints.find(j=>j!==link&&j.type==='hinge'&&ids(j).includes(lb));
 const L=norm(inPlane(sub(other.point,link.point),a));
 const hin=heading(r,o,'input_beam_x',a),hmid=heading(r,o,'middle_cross_front',a),hout=heading(r,o,'output_beam_x',a);
 const sync=max(r.track.map((f,i)=>i),i=>Math.max(Math.abs((hmid[i]-hmid[0])-(hin[i]-hin[0])),Math.abs((hout[i]-hout[0])-(hin[i]-hin[0]))));
 check(sync<=.2,'middle and output headings equal the input heading at every offset',{sync});
 const midJ=m.joints.filter(j=>j.type==='hinge'&&ids(j).includes(mid.id));void midJ;
 const rows=r.track.filter(f=>f.phase!=='cold').map(f=>{const I=jIn.point,Ou=carried(r,o,f,ids(jOut).find(x=>x!==out.id),jOut.point),e=norm(inPlane(sub(Ou,I),a));return{e:e*1000};});
 const eSpan=span(rows.map(x=>x.e));check(eSpan>=20,'the offset really changes',{eSpan});
 const turn=span(hin);check(turn>=1000,'input turns at each offset',{turn});
 return{linkMm:L*1000,offsetSpanMm:eSpan,syncErrorDeg:sync,inputTurnDeg:turn,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Lumen: six-leaf iris. The input gear drives leaf 0; a ring gear meshes all six leaf gears, so every leaf turns by
// the same angle, leaf/input = −z_in/z_leaf and ring/leaf = −z_leaf/z_ring, from the compiled gear ratios.
export function judgeLumen(r,{native=false}={}){
 healthy(r,native,{couplings:['gear']});assert.equal(r.mechanism.actuators.length,1);done(r,11);
 const m=r.mechanism,o=observeAddon(r,'hex_edge_0'),jIn=m.joints.find(j=>j.motor?.port==='A'),a=unit(jIn.axis);
 const g0=m.couplings.find(c=>[c.joint1,c.joint2].includes(jIn.id)),leafJ=[g0.joint1,g0.joint2].find(x=>x!==jIn.id),kLeaf=g0.joint1===jIn.id?g0.ratio:1/g0.ratio;
 const ringJ=m.joints.find(j=>j.type==='hinge'&&m.bodies.find(b=>b.parts.includes('ring_top')).id===ids(j).find(x=>x!==o.base.id)&&ids(j).includes(o.base.id));
 const gr=m.couplings.find(c=>[c.joint1,c.joint2].includes(ringJ.id)&&[c.joint1,c.joint2].includes(leafJ));const kRing=kLeaf*(gr.joint1===leafJ?gr.ratio:1/gr.ratio);
 const hin=heading(r,o,'input_gear',a),leaves=[0,1,2,3,4,5].map(i=>heading(r,o,'leaf_plate_'+i,a)),ring=heading(r,o,'ring_top',a);
 const idx=r.track.map((f,i)=>i),din=i=>hin[i]-hin[0];
 const sign=x=>x;// headings are measured about the input axis for every body (all parallel)
 const leafErr=max(idx,i=>Math.max(...leaves.map(l=>Math.abs(sign(l[i]-l[0])-kLeaf*din(i))))),ringErr=max(idx,i=>Math.abs((ring[i]-ring[0])-kRing*din(i)));
 check(leafErr<=.2,'all six leaves follow leaf/input from the gear teeth',{leafErr,kLeaf});check(ringErr<=.2,'ring follows ring/input',{ringErr,kRing});
 const sweep=span(hin);check(sweep>=50,'input sweeps its travel',{sweep});
 return{leafPerInput:kLeaf,ringPerInput:kRing,leafErrorDeg:leafErr,ringErrorDeg:ringErr,inputSweepDeg:sweep,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Rack Decoder: a pinion carried between two parallel racks. Whatever the tooth pitch, rolling contact on both
// sides makes the carrier translate by the mean of the two rack displacements, c = (a + b)/2, and turn by an
// amount proportional to (a − b). Rack and carrier displacements are observed along the compiled guide axis.
export function judgeRackDecoder(r,{native=false}={}){
 healthy(r,native,{couplings:['rackAndPinion']});assert.equal(r.mechanism.actuators.length,2);done(r,9);
 const m=r.mechanism,o=observeAddon(r,'hub'),g=m.joints.find(j=>j.type==='slider'&&ids(j).includes(o.body('rack_A').id)&&ids(j).includes(o.base.id)),u=unit(g.axis);
 const d0=['rack_A','rack_B','carrier_bearing'].map(p=>o.initial(p)),disp=(f,i,p)=>dot(sub(o.point(f,p),d0[i]),u)*1000;
 const ax=unit(m.joints.find(j=>j.type==='hinge'&&ids(j).includes(o.body('passive_pointer').id)).axis);
 const turn=heading(r,o,'passive_pointer',ax);
 const rows=r.track.map((f,i)=>{const a=disp(f,0,'rack_A'),b=disp(f,1,'rack_B'),c=disp(f,2,'carrier_bearing');return{a,b,c,err:Math.abs(c-(a+b)/2),diff:a-b,t:turn[i]-turn[0]};});
 const err=max(rows,x=>x.err);check(err<=.1,'carrier translates by the mean of the rack displacements',{err});
 const both=Math.min(span(rows.map(x=>x.a)),span(rows.map(x=>x.b)));check(both>=20,'both racks really move',{both});
 // rotation: proportional to (a − b); compare the observed slope with its own sign-consistency over the route
 const big=rows.filter(x=>Math.abs(x.diff)>5),k=big.map(x=>x.t/x.diff);check(big.length>10&&span(k)<=.02*Math.max(...k.map(Math.abs)),'pointer turn stays proportional to the rack difference',{kMin:Math.min(...k),kMax:Math.max(...k)});
 return{meanLawErrorMm:err,rackTravelMm:both,degPerMm:k.reduce((s,x)=>s+x,0)/k.length,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Tangent Table: motor A sets a guide angle θ about pivot O; motor B's spindle sets the reach d of a cross-slide
// line from O. The passive output pin sits on both the guide and the cross-slide, so its transverse offset is
// y = d·tan θ, with θ observed on the guide body and d and y observed on the piston and output bodies.
export function judgeTangentTable(r,{native=false}={}){
 healthy(r,native,{couplings:['screw']});assert.equal(r.mechanism.actuators.length,2);done(r,8);
 const m=r.mechanism,o=observeAddon(r,'hub'),jA=m.joints.find(j=>j.motor?.port==='A'),a=unit(jA.axis),O=jA.point;
 const reachJ=m.joints.find(j=>j.type==='slider'&&ids(j).includes(o.body('la_piston').id)&&ids(j).includes(o.base.id)),along=unit(inPlane(reachJ.axis,a)),side=unit(cross(a,along));
 const outJ=m.joints.find(j=>j.type==='hinge'&&ids(j).includes(o.body('output_carriage').id)),P0=outJ.point;
 const hz=heading(r,o,'angle_hub',a),out=o.body('output_carriage'),pis=o.body('la_piston');
 const th0=Math.atan2(dot(sub(P0,O),side),dot(sub(P0,O),along));
 const rows=r.track.map((f,i)=>{const P=carried(r,o,f,out.id,P0),d=dot(inPlane(sub(P,O),a),along),y=dot(inPlane(sub(P,O),a),side),th=th0+(a[1]>0?1:1)*(hz[i]-hz[0])*Math.PI/180;
  return{d:d*1000,y:y*1000,thDeg:deg(th),pred:d*Math.tan(th)*1000};});
 // sign of the heading about a matches atan2(side, along) when side = a × along
 const err=max(rows,x=>Math.abs(x.y-x.pred));check(err<=.3,'transverse output follows y = d·tan θ',{err});
 const thSpan=span(rows.map(x=>x.thDeg)),dSpan=span(rows.map(x=>x.d)),ySpan=span(rows.map(x=>x.y));
 check(thSpan>=20&&dSpan>=12&&ySpan>=10,'angle, reach and output all really change',{thSpan,dSpan,ySpan});void pis;
 return{lawErrorMm:err,thetaSpanDeg:thSpan,reachSpanMm:dSpan,outputSpanMm:ySpan,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Bend Ripple: one Cardan joint at bend β. With input angle θ measured from the input fork plane, the output turns
// ψ = atan2(sin θ, cos β·cos θ) relative to its carrier. β is the compiled shaft angle plus the observed carrier
// turn; θ and ψ are observed on the input and passive output bodies.
export function judgeBendRipple(r,{native=false}={}){
 healthy(r,native,{couplings:['universalJoint']});assert.equal(r.mechanism.actuators.length,2);done(r,8);
 const m=r.mechanism,o=observeAddon(r,'A_ground_bearing'),uj=m.couplings.find(c=>c.kind==='universalJoint');
 const s1=unit(scale(uj.shaft1,-1)),s2=unit(uj.shaft2),beta0=Math.acos(Math.min(1,dot(s1,s2)));
 const jB=m.joints.find(j=>j.motor?.port==='B'),car=o.body('bend_lower_axle'),bAx=unit(jB.axis);
 const hin=heading(r,o,'input_fork',s1),hcar=heading(r,o,'bend_lower_axle',bAx);
 const outB=o.body('output_fork'),inB=o.body('input_fork');void inB;
 // output turn relative to the carrier, about the carrier-carried shaft axis
 const psi=unwrap(r.track.map(f=>{const vb=f.bodies[car.id],cb=m.bodies.find(b=>b.id===car.id),qrel=qmul(conj(qmul(vb.rotation,conj(cb.rotation))),qmul(f.bodies[outB.id].rotation,conj(outB.rotation)));const s=dot(qrel.slice(0,3),s2);return 2*Math.atan2(s,qrel[3]);})).map(deg);
 const rows=r.track.map((f,i)=>{const th=(hin[i]-hin[0])*Math.PI/180,be=beta0+(hcar[i]-hcar[0])*Math.PI/180;let p=Math.atan2(Math.sin(th),Math.cos(be)*Math.cos(th));const k=Math.round((th-p)/(2*Math.PI));p+=2*Math.PI*k;return{thDeg:deg(th),betaDeg:deg(be),pred:deg(p),meas:psi[i]-psi[0]};});
 const err=max(rows,x=>Math.abs(x.meas-x.pred));check(err<=.2,'passive output follows the Cardan law',{err});
 const bSpan=span(rows.map(x=>x.betaDeg)),ripple=max(rows,x=>Math.abs(x.meas-x.thDeg));check(bSpan>=15&&ripple>=1,'the bend changes and the output really leads and lags',{bSpan,ripple});
 return{beta0Deg:deg(beta0),bendSpanDeg:bSpan,maxRippleDeg:ripple,lawErrorDeg:err,foundation:foundation(r,o)};
}

const syncLoss=(r,base,parts,inPart)=>{const o=observeAddon(r,base),a=unit(r.mechanism.joints.find(j=>j.motor?.port==='A').axis),hin=heading(r,o,inPart,a),hs=parts.map(p=>heading(r,o,p,a));
 return max(r.track.map((f,i)=>i),i=>Math.max(...hs.map(h=>Math.abs((h[i]-h[0])-(hin[i]-hin[0])))));};
/** Measured loss of each batch-A law after its physical disconnection (the judge itself must also refuse). */
export function batchADisconnectionLoss(id,r){
 if(id==='remote-pivot'){const v=syncLoss(r,'hub',['output_beam'],'input_beam');return{metric:'outputTurnErrorDeg',value:v,lost:v>5};}// distal_L removed
 if(id==='schmidt-shift'){const v=syncLoss(r,'hub',['middle_back_frame','output_frame'],'input_frame');return{metric:'syncErrorDeg',value:v,lost:v>5};}// stage-1 links removed
 if(id==='offset-relay'){const v=syncLoss(r,'hub',['middle_cross_front','output_beam_x'],'input_beam_x');return{metric:'syncErrorDeg',value:v,lost:v>5};}// stage-1 links removed
 if(id==='rack-decoder'){// passive_pinion removed: nothing makes the carrier average the racks
  const m=r.mechanism,o=observeAddon(r,'hub'),g=m.joints.find(j=>j.type==='slider'&&ids(j).includes(o.body('rack_A').id)&&ids(j).includes(o.base.id)),u=unit(g.axis),d0=['rack_A','rack_B','carrier_bearing'].map(p=>o.initial(p));
  const v=max(r.track,f=>{const [a,b,c]=['rack_A','rack_B','carrier_bearing'].map((p,i)=>dot(sub(o.point(f,p),d0[i]),u)*1000);return Math.abs(c-(a+b)/2);});return{metric:'meanLawErrorMm',value:v,lost:v>2};}
 if(id==='tangent-table'){// follower_axle removed: the output pin no longer rides the guide
  const m=r.mechanism,o=observeAddon(r,'hub'),jA=m.joints.find(j=>j.motor?.port==='A'),a=unit(jA.axis),O=jA.point,reachJ=m.joints.find(j=>j.type==='slider'&&ids(j).includes(o.body('la_piston').id)&&ids(j).includes(o.base.id)),along=unit(inPlane(reachJ.axis,a)),side=unit(cross(a,along));
  const P0=o.initial('output_carriage'),hz=heading(r,o,'angle_hub',a),th0=Math.atan2(dot(sub(P0,O),side),dot(sub(P0,O),along));
  const v=max(r.track.map((f,i)=>i),i=>{const P=o.point(r.track[i],'output_carriage'),d=dot(inPlane(sub(P,O),a),along),y=dot(inPlane(sub(P,O),a),side);return Math.abs(y-d*Math.tan(th0+(hz[i]-hz[0])*Math.PI/180))*1000;});return{metric:'lawErrorMm',value:v,lost:v>2};}
 if(id==='bend-ripple'){// output_fork removed: nothing imposes the Cardan law on the output shaft
  const m=r.mechanism,o=observeAddon(r,'A_ground_bearing'),jA=m.joints.find(j=>j.motor?.port==='A'),jB=m.joints.find(j=>j.motor?.port==='B'),car=o.body('bend_lower_axle'),outB=o.body('output_axle');
  const jO=m.joints.find(j=>j.type==='hinge'&&ids(j).includes(car.id)&&ids(j).includes(outB.id)),s1=unit(jA.axis),s2=unit(jO.axis),beta0=Math.acos(Math.min(1,Math.abs(dot(s1,s2))));
  const hin=heading(r,o,'input_axle',s1),hcar=heading(r,o,'bend_lower_axle',unit(jB.axis)),cb=m.bodies.find(b=>b.id===car.id);
  const psi=unwrap(r.track.map(f=>{const qrel=qmul(conj(qmul(f.bodies[car.id].rotation,conj(cb.rotation))),qmul(f.bodies[outB.id].rotation,conj(outB.rotation)));return 2*Math.atan2(dot(qrel.slice(0,3),s2),qrel[3]);})).map(deg);
  const v=max(r.track.map((f,i)=>i),i=>{const th=(hin[i]-hin[0])*Math.PI/180,be=beta0+(hcar[i]-hcar[0])*Math.PI/180;let p=Math.atan2(Math.sin(th),Math.cos(be)*Math.cos(th));p+=2*Math.PI*Math.round((th-p)/(2*Math.PI));return Math.abs(psi[i]-psi[0]-deg(p));});
  return{metric:'cardanLawErrorDeg',value:v,lost:v>5};}
 assert.fail('no batch-A disconnection measure for '+id);
}
