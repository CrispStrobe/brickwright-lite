// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions judge observed, passive bodies; they never drive their poses.
// Second promotion batch (2026-10-26): Cross Ratio, Foldback, Ghost Pivot, Travel Dial, Carry Ratio,
// Obliquity Orrery and Air Budget, each reviewed natively and in the browser as an experimental entry first.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),deg=x=>x*180/Math.PI,rad=x=>x*Math.PI/180;
const span=a=>Math.max(...a)-Math.min(...a),max=(s,k)=>Math.max(...s.map(k));
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};
const sameIssues=(actual,expected=[])=>{
 const key=i=>i.code+':'+[...(i.parts||[])].sort().join(',');
 assert.deepEqual(actual.map(key).sort(),expected.map(key).sort(),'compiler issues are exactly the reviewed, declared ones');
};
function healthy(r,native,expectedIssues){
 sameIssues(r.issues,expectedIssues);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
}
function foundation(r,o,{horizontalMm:hMax=2,tiltDeg:tMax=2,gapMm:gMax=.5,axisDeg:aMax=1}={}){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id];
 const frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=max(frames,f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000),tiltDeg=max(frames,f=>o.tilt(f));
 assert.ok(horizontalMm<=hMax&&tiltDeg<=tMax,'upright stationary chassis in world coordinates');
 const gapMm=max(r.track,f=>o.gap(f)),axisDeg=max(r.track,f=>o.axisGap(f));
 assert.ok(gapMm<=gMax&&axisDeg<=aMax,'true hinge closure and aligned axes');return{horizontalMm,tiltDeg,gapMm,axisDeg};
}
const done=(r,{completed='completed',failed='failed',stage,stageValue})=>{
 const v=r.track.at(-1).extra.variables;assert.equal(Number(v[completed]),1,'program reports completion');
 if(failed)assert.equal(Number(v[failed]),0,'program reports no fault');if(stage)assert.equal(String(v[stage]),String(stageValue),'final stage');
};
const heading=(r,o,part,axis)=>unwrap(r.track.map(f=>o.angle(f,part,axis,[1,0,0]))).map(deg);
// Input sense from the program's declared encoder convention (sign only); laws come from bodies.
const inputSense=(r,inDeg,motorSign)=>{const j=r.mechanism.joints.find(j=>j.motor?.port==='A');const a=r.track.map(f=>deg(f.joints[j.id].angle));
 const c=inDeg.reduce((s,x,i)=>s+(x-inDeg[0])*(a[i]-a[0])*motorSign,0);assert.ok(Math.abs(c)>0,'input moves');return Math.sign(c);};

// Crossed four-bar half-angle law tan(φ/2) = k·tan(θ/2) (Cross Ratio k = 3, Foldback k = −5).
function halfAngleLaw(r,{native,inputPart,outputPart,axis,theta0,k,motorSign,minSpan,tolDeg,vars}){
 healthy(r,native,[]);assert.equal(r.mechanism.actuators.length,1);
 const o=observeAddon(r),inDeg=heading(r,o,inputPart,axis),outDeg=heading(r,o,outputPart,axis),s=inputSense(r,inDeg,motorSign);
 const law=t=>2*deg(Math.atan(k*Math.tan(rad(t)/2)));const phi0=law(theta0);
 let prev=phi0;const rows=inDeg.map((x,i)=>{const th=theta0+s*(x-inDeg[0]);let p=law(th);while(p-prev>180)p-=360;while(prev-p>180)p+=360;prev=p;return{th,pred:p,meas:phi0+s*(outDeg[i]-outDeg[0])};});
 done(r,vars);
 const inSpan=span(rows.map(x=>x.th)),outSpan=span(rows.map(x=>x.meas)),err=max(rows,x=>Math.abs(x.meas-x.pred));
 assert.ok(inSpan>=minSpan,'input sweeps its declared sector');assert.ok(outSpan>=10,'passive output turns');
 assert.ok(err<=tolDeg,'passive output follows the half-angle law');
 const last=rows.at(-1);assert.ok(Math.abs(last.th-theta0)<=1.5&&Math.abs(last.meas-phi0)<=1.5,'input and output return to the saved datum');
 return{inputSpanDeg:inSpan,outputSpanDeg:outSpan,lawErrorDeg:err,foundation:foundation(r,o)};
}
export const judgeCrossRatio=(r,{native=false}={})=>halfAngleLaw(r,{native,inputPart:'input_beam',outputPart:'output_beam',axis:[0,1,0],theta0:60,k:3,motorSign:1,minSpan:115,tolDeg:.1,vars:{stage:'stage',stageValue:10}});
export const judgeFoldback=(r,{native=false}={})=>halfAngleLaw(r,{native,inputPart:'input_arm',outputPart:'output_arm',axis:[0,-1,0],theta0:90,k:-5,motorSign:-1,minSpan:85,tolDeg:.2,vars:{stage:'stage',stageValue:7}});

// Ghost Pivot: double-parallelogram remote centre. The tool's far hole (tool_link local [0,0,−100]) stays fixed
// in the chassis frame while the tool heading equals the input heading.
export function judgeGhostPivot(r,{native=false}={}){
 healthy(r,native,[]);assert.equal(r.mechanism.actuators.length,1);
 const o=observeAddon(r),inDeg=heading(r,o,'drive_link',[0,-1,0]),toolDeg=heading(r,o,'tool_link',[0,-1,0]);
 const R0=o.point(r.track[0],'tool_link',[0,0,-100]);
 const rows=r.track.map((f,i)=>{const d=sub(o.point(f,'tool_link',[0,0,-100]),R0);return{input:inDeg[i]-inDeg[0],tool:toolDeg[i]-toolDeg[0],planarMm:Math.hypot(d[0],d[2])*1000};});
 done(r,{stage:'stage',stageValue:7});
 const inSpan=span(rows.map(x=>x.input)),toolErr=max(rows,x=>Math.abs(x.tool-x.input)),rMove=max(rows,x=>x.planarMm),toolSpan=span(rows.map(x=>x.tool));
 assert.ok(inSpan>=69,'input sweeps ±35°');assert.ok(toolSpan>=69,'passive tool turns with it');
 assert.ok(toolErr<=.1,'tool heading equals input heading');assert.ok(rMove<=.25,'remote centre stays fixed in the chassis plane');
 assert.ok(Math.abs(rows.at(-1).input)<=1,'input returns to the saved datum');
 return{inputSpanDeg:inSpan,toolMinusInputDeg:toolErr,remoteCentreMoveMm:rMove,foundation:foundation(r,o)};
}

// Travel Dial: a free wheel on a gravity-loaded arm rolls on the driven sled without slipping:
// sled travel relative to the wheel centre = −R·(wheel rotation about +x), R = 28 mm.
export function judgeTravelDial(r,{native=false}={}){
 healthy(r,native,[]);assert.equal(r.mechanism.actuators.length,1);
 const o=observeAddon(r);
 const ang=unwrap(r.track.map(f=>o.angle(f,'wheel',[1,0,0],[0,0,1])));
 const S0=o.point(r.track[0],'sled_clevis'),W0=o.point(r.track[0],'wheel');
 const rows=r.track.map((f,i)=>{const S=sub(o.point(f,'sled_clevis'),S0),W=sub(o.point(f,'wheel'),W0);return{srel:(S[2]-W[2])*1000,sled:S[2]*1000,circ:28*ang[i]};});
 done(r,{stage:'stage',stageValue:7});
 const travel=span(rows.map(x=>x.sled)),res=max(rows,x=>Math.abs(x.srel+x.circ)),num=rows.reduce((s,x)=>s+x.srel*x.circ,0),den=rows.reduce((s,x)=>s+x.circ*x.circ,0),fit=-28*num/den;
 assert.ok(travel>=20,'sled travels');assert.ok(Math.abs(fit-28)<=1,'fitted rolling radius equals the 28 mm wheel');
 assert.ok(res<=.6,'no-slip rolling: relative travel equals −R·θ');
 assert.ok(Math.abs(rows.at(-1).sled)<=.5,'sled returns to the saved datum');
 return{sledTravelMm:travel,rollingResidualMm:res,fittedRadiusMm:fit,foundation:foundation(r,o)};
}

// Measurement only (no assertions), for the physical-disconnection controls: the size of the loss of each law.
export function batch2DisconnectionLoss(id,r){
 const o=observeAddon(r);
 if(id==='cross-ratio'||id==='foldback'){
  const c=id==='cross-ratio'?{inputPart:'input_beam',outputPart:'output_beam',axis:[0,1,0],theta0:60,k:3,motorSign:1}:{inputPart:'input_arm',outputPart:'output_arm',axis:[0,-1,0],theta0:90,k:-5,motorSign:-1};
  const inDeg=heading(r,o,c.inputPart,c.axis),outDeg=heading(r,o,c.outputPart,c.axis),s=inputSense(r,inDeg,c.motorSign),law=t=>2*deg(Math.atan(c.k*Math.tan(rad(t)/2))),phi0=law(c.theta0);
  let prev=phi0;const err=Math.max(...inDeg.map((x,i)=>{const th=c.theta0+s*(x-inDeg[0]);let p=law(th);while(p-prev>180)p-=360;while(prev-p>180)p+=360;prev=p;return Math.abs(phi0+s*(outDeg[i]-outDeg[0])-p);}));
  return{metric:'lawErrorDeg',value:err,lost:err>2};
 }
 if(id==='ghost-pivot'){const inDeg=heading(r,o,'drive_link',[0,-1,0]),toolDeg=heading(r,o,'tool_link',[0,-1,0]),R0=o.point(r.track[0],'tool_link',[0,0,-100]);
  const move=Math.max(...r.track.map(f=>{const d=sub(o.point(f,'tool_link',[0,0,-100]),R0);return Math.hypot(d[0],d[2])*1000;})),err=Math.max(...inDeg.map((x,i)=>Math.abs((toolDeg[i]-toolDeg[0])-(x-inDeg[0]))));
  return{metric:'remoteCentreMoveMm',value:move,toolMinusInputDeg:err,lost:move>2||err>2};}
 if(id==='travel-dial'){const S0=o.point(r.track[0],'sled_clevis'),travel=span(r.track.map(f=>(o.point(f,'sled_clevis')[2]-S0[2])*1000));return{metric:'sledTravelMm',value:travel,lost:travel<20};} // a free sled can drift; it must lose most of its 42 mm stroke
 // Rolling carries the ball 2/7 of ANY tray motion, so removing the drive is no control: the control removes the
  // deck the ball rolls on, and the ball is no longer carried.
 if(id==='carry-ratio'){const {k,tray,ball,stage}=carryRows(r,o),idx=stage.map((s,i)=>['2','3','4','5'].includes(s)?i:-1).filter(i=>i>=0);
  const x=idx.map(i=>tray[i][k]),y=idx.map(i=>ball[i][k]),mx=x.reduce((a,b)=>a+b,0)/x.length,my=y.reduce((a,b)=>a+b,0)/y.length;
  const lambda=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/x.reduce((s,v)=>s+(v-mx)**2,0);return{metric:'carriedRatio',value:lambda,lost:Math.abs(lambda-2/7)>.1};}
 if(id==='obliquity-orrery'){const {rows}=orreryRows(r),err=max(rows,x=>Math.abs(x.delta-x.law));return{metric:'declinationErrorDeg',value:err,lost:err>2};}
 if(id==='air-budget'){const {p}=airRows(r),rise=p.at(-1)-p[0];return{metric:'pressureRiseKpa',value:rise,lost:rise<6.4};} // an undriven crank can still rattle the pump: it must lose over half of the 12.9 kPa
 throw new Error('no disconnection measure for '+id);
}

// Carry Ratio: a free solid ball on a slider-crank tray is carried λ = I/(I + M r²) = 2/7 of each stroke.
// The ball is a designed free payload: the contract declares its 'loose-part' issue.
const carryRows=(r,o)=>{const T0=o.point(r.track[0],'carriage'),B0=o.point(r.track[0],'roller_ball');
 const tray=r.track.map(f=>sub(o.point(f,'carriage'),T0)),ball=r.track.map(f=>sub(o.point(f,'roller_ball'),B0));
 const k=[0,1,2].reduce((b,i)=>span(tray.map(p=>p[i]))>span(tray.map(p=>p[b]))?i:b,0);
 return{k,tray,ball,stage:r.track.map(f=>String(f.extra.variables.stage))};};
export function judgeCarryRatio(r,{native=false,contract}={}){
 healthy(r,native,contract?.expectedIssues??[{code:'loose-part',parts:['roller_ball']}]);assert.equal(r.mechanism.actuators.length,1);
 const o=observeAddon(r),{k,tray,ball,stage}=carryRows(r,o);done(r,{stage:'stage',stageValue:7});
 const lambdas=['2','3','4','5'].map(st=>{const idx=stage.map((s,i)=>s===st?i:-1).filter(i=>i>=0);assert.ok(idx.length>20,'stage '+st+' recorded');
  const x=idx.map(i=>tray[i][k]),y=idx.map(i=>ball[i][k]),mx=x.reduce((a,b)=>a+b,0)/x.length,my=y.reduce((a,b)=>a+b,0)/y.length;
  return{stage:st,strokeMm:span(x)*1000,lambda:x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/x.reduce((s,v)=>s+(v-mx)**2,0)};});
 for(const l of lambdas){assert.ok(l.strokeMm>=15.5,'full 16 mm tray stroke');assert.ok(Math.abs(l.lambda-2/7)<=.008,'ball carried 2/7 of the stroke');}
 const lift=max(ball,p=>Math.abs(p[1]))*1000;assert.ok(lift<=1,'the ball stays on the deck');
 return{lambdas,ballLiftMm:lift,foundation:foundation(r,o)};
}

// Obliquity Orrery: a parallelogram carries a 22.5°-tilted Earth round the Sun marker without turning it:
// sin δ = sin 22.5° · cos(λ − 45°), orbit radius 16 mm. Its two-crank loop (and two rigid frame loops) are
// locked by the compiler: the contract declares those 'locked-hinges' issues.
// δ is a dot product, so any frame works. λ is 45° (the saved pose) plus the signed turn of the Sun→Earth
// vector about the vertical; the law is even in λ − 45°, so the turning sense does not matter.
const orreryRows=r=>{const o=observeAddon(r);const raw=r.track.map(f=>{
 const e=o.point(f,'earth',[0,2,0]),p=o.point(f,'earth',[0,-18,0]),u=o.point(f,'sun_marker'),n=sub(p,e),s=sub(u,e);
 return{delta:deg(Math.asin(dot(n,s)/norm(n)/norm(s))),az:Math.atan2(e[2]-u[2],e[0]-u[0]),radiusMm:Math.hypot(e[0]-u[0],e[2]-u[2])*1000};});
 const az=unwrap(raw.map(x=>x.az));
 return{o,rows:raw.map((x,i)=>{const lam=45+deg(az[i]-az[0]);return{...x,lam,law:deg(Math.asin(Math.sin(rad(22.5))*Math.cos(rad(lam-45))))};})};};
export function judgeObliquityOrrery(r,{native=false,contract}={}){
 healthy(r,native,contract?.expectedIssues??[]);assert.equal(r.mechanism.actuators.length,1);
 const {o,rows}=orreryRows(r);done(r,{stage:'stage',stageValue:99});
 const lamSpan=span(rows.map(x=>x.lam)),err=max(rows,x=>Math.abs(x.delta-x.law)),rad16=max(rows,x=>Math.abs(x.radiusMm-16));
 assert.ok(lamSpan>=85,'Earth travels a quarter orbit');assert.ok(err<=.25,'declination follows the obliquity law');assert.ok(rad16<=.4,'16 mm orbit');
 assert.ok(Math.abs(rows.at(-1).lam-rows[0].lam)<=1,'Earth returns to the saved position');
 return{longitudeSpanDeg:lamSpan,declinationErrorDeg:err,orbitRadiusErrorMm:rad16,foundation:foundation(r,o)};
}

// Air Budget: each inward pump stroke adds the swept outside air to the tank:
// Δp = p_atm · A · S_in / V, A = π·(4 mm)², V = 38 cm³ (37 cm³ tank + 1 cm³ network). Needs contract.observeAir.
const PUMP_KPA_PER_MM=101.325*Math.PI*16/38000;
// Pump stroke from body poses: the distance from the rod to the pump body's hinged origin shortens on compression.
const airRows=r=>{const o=observeAddon(r);
 const x=r.track.map(f=>norm(sub(o.point(f,'pump_rod'),o.point(f,'pump_body')))),p=r.track.map(f=>{const a=f.extra.air;assert.ok(Array.isArray(a)&&a.length===1&&Number.isFinite(a[0].kPa),'recorded air network');return a[0].kPa;});
 const up=x.slice(1).reduce((s,v,i)=>s+(p[i+1]>p[i]+1e-9?v-x[i]:0),0),sgn=up>=0?1:-1;
 const inward=x.slice(1).reduce((s,v,i)=>s+Math.max(0,sgn*(v-x[i])),0)*1000;return{x,p,inward};};
export function judgeAirBudget(r,{native=false,contract}={}){
 healthy(r,native,contract?.expectedIssues??[]);assert.equal(r.mechanism.actuators.length,1);
 const o=observeAddon(r),{p,inward}=airRows(r);done(r,{completed:'complete',failed:'fault',stage:'stage',stageValue:2});
 const rise=p.at(-1)-p[0],pred=PUMP_KPA_PER_MM*inward,maxDrop=Math.max(...p.slice(1).map((v,i)=>p[i]-v));
 assert.ok(inward>=90,'six full compression strokes');assert.ok(rise>=10,'stored pressure rises');
 assert.ok(Math.abs(rise/pred-1)<=.015,'pressure rise equals p_atm·A·S/V');assert.ok(maxDrop<=.01,'the one-way pump never loses stored air');
 const j=r.mechanism.joints.find(j=>j.motor?.port==='A');assert.ok(Math.abs(deg(r.track.at(-1).joints[j.id].angle))<=1.5,'motor returns to its start');
 return{inwardTravelMm:inward,pressureRiseKpa:rise,predictedKpa:pred,maxDropKpa:maxDrop,foundation:foundation(r,o)};
}
