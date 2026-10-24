// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reviewed intake oracle: actual passive body markers, original geometry and
// force limits. Predictions check recorded poses; they never set them.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeAddon} from './sim-lab-addon-judge.mjs';
import {createCableHingeObserver} from './sim-lab-cable-compass-hinges.mjs';
import {judgeRopeImpulses} from './sim-lab-rope-impulses.mjs';
const fixture=new URL('../../test/fixtures/model-files/cable-compass-source/',import.meta.url);
const contract=JSON.parse(readFileSync(new URL('contract.json',fixture))),markers=JSON.parse(readFileSync(new URL('markers.json',fixture)));
const coldMs=1000;
const sub=(a,b)=>a.map((x,k)=>x-b[k]),norm=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0);
const unit=v=>v.map(x=>x/norm(v)),deg=r=>r*180/Math.PI,span=a=>Math.max(...a)-Math.min(...a);
const average=a=>a.reduce((s,x)=>s+x,0)/a.length,range=a=>[Math.min(...a),Math.max(...a)];
const dimensions=contract.dimensions,A=dimensions.anchorHalfSpacingMm,B=dimensions.anchorHalfDepthMm,H=dimensions.homeDownMm;
const radius=dimensions.windingRadiusMm,ratio=dimensions.wormRatioDenominator,homeLength=Math.hypot(A,B,H);
const route=contract.route.map((p,i)=>({stage:i,x:p.xMm,down:p.downMm,depth:0})),windSigns=contract.datum.motorWindSigns;
const targetFor=(p,port)=>windSigns[port]*(homeLength-Math.hypot(p.x+(port==='A'?A:-A),p.down,B))/radius*ratio*180/Math.PI;
export function measureCableCompass(recording){
 const physical=createCableHingeObserver(recording);
 const o=observeAddon(recording,markers.basePart),cf=markers.coordinateFrame;
 const defs=[markers.tiePoint,...markers.anchors,{part:cf.part}];
 for(const m of defs){
  if(recording.mechanism.bodies.filter(b=>b.parts.includes(m.part)).length!==1)throw Error('Marker must have unique body ownership: '+m.part);
 }
 if(o.body(cf.part).id!==o.base.id)throw Error('Coordinate frame must belong to the observed chassis');
 const zero=o.initial(cf.part),axis=v=>unit(sub(o.initial(cf.part,v),zero));
 const axes=[axis(cf.horizontalLocal),axis(cf.downLocal),axis(cf.depthLocal)];
 if([dot(axes[0],axes[1]),dot(axes[0],axes[2]),dot(axes[1],axes[2])].some(x=>Math.abs(x)>1e-8))throw Error('Coordinate frame is not orthogonal');
 const motors=Object.fromEntries(['A','B'].map(port=>[port,recording.mechanism.joints.find(j=>j.motor?.port===port)]));
 if(!motors.A||!motors.B)throw Error('Both native motor joints are required');
 const ropes=recording.mechanism.couplings.filter(c=>c.kind==='rope');
 if(ropes.length!==4||markers.anchors.length!==4)throw Error('Exactly four actual rope couplings and marker anchors required');
 const anchorIndex=markers.anchors.map(m=>{
  const index=ropes.findIndex(c=>c.parts[0]===m.part&&c.parts.at(-1)===markers.tiePoint.part);
  if(index<0)throw Error('No exact direct rope coupling for '+m.part);
  return index;
 });
 if(new Set(anchorIndex).size!==4)throw Error('Anchor markers must name four distinct ropes');
 const first=recording.track[0];
 const point=(f,m)=>o.point(f,m.part,m.local||[0,0,0]);
 return recording.track.map(f=>{
  const anchors=markers.anchors.map(m=>point(f,m)),origin=[0,1,2].map(k=>average(anchors.map(a=>a[k])));
  const P=point(f,markers.tiePoint),xyz=axes.map(a=>dot(sub(P,origin),a)*1000);
  const rps=markers.anchors.map((m,k)=>{
   const c=ropes[anchorIndex[k]],state=f.extra?.ropes?.[anchorIndex[k]];
   if(!state)throw Error('Actual native rope observation missing');
   const drumAngle=f.joints[c.drumJoint].angle-first.joints[c.drumJoint].angle;
   const expectedFree=(c.lengthM-c.radiusM*c.drumSign*drumAngle)*1000;
   const distance=norm(sub(P,anchors[k]))*1000;
   return {id:c.id,part:m.part,side:m.side,depth:m.depth,freeMm:state.free*1000,distanceMm:distance,
    slackMm:state.free*1000-distance,tensionN:state.tension,drumAngleDeg:deg(drumAngle),
    windingErrorMm:state.free*1000-expectedFree};
  });
  const group=(key,val)=>rps.filter(r=>r[key]===val);
  for(const [key,vals]of [['side',['left','right']],['depth',['front','rear']]]){
   if(vals.some(val=>group(key,val).length!==2))throw Error('Two front/rear anchors per side required');
  }
  // This is a prediction from the paid-out lengths, compared only after actual
  // marker coordinates were independently measured above. Front is depth -B.
  const meanSq=rs=>average(rs.map(r=>r.freeMm*r.freeMm));
  const predictedX=(meanSq(group('side','left'))-meanSq(group('side','right')))/(4*A);
  const predictedDepth=(meanSq(group('depth','front'))-meanSq(group('depth','rear')))/(4*B);
  const radicand=meanSq(rps)-A*A-B*B-predictedX*predictedX-predictedDepth*predictedDepth;
  const predictedDown=radicand>=0?Math.sqrt(radicand):NaN;
  const connector=physical.measure(f);
  const anchorError=Math.max(...anchors.map((p,k)=>{
   const v=axes.map(a=>dot(sub(p,origin),a)*1000),m=markers.anchors[k];
   return Math.hypot(v[0]-(m.side==='left'?-A:A),v[1],v[2]-(m.depth==='front'?-B:B));
  }));
  const row={t:f.t,phase:f.phase,xMm:xyz[0],downMm:xyz[1],depthMm:xyz[2],
   predictedXmm:predictedX,predictedDownMm:predictedDown,predictedDepthMm:predictedDepth,
   lawErrorMm:Math.hypot(xyz[0]-predictedX,xyz[1]-predictedDown,xyz[2]-predictedDepth),
   encoderADeg:deg(f.joints[motors.A.id].angle),encoderBDeg:deg(f.joints[motors.B.id].angle),
   tensionLeftN:group('side','left').reduce((s,r)=>s+r.tensionN,0),tensionRightN:group('side','right').reduce((s,r)=>s+r.tensionN,0),
   maxRopeExtensionMm:Math.max(...rps.map(r=>-r.slackMm)),maxRopeSlackMm:Math.max(...rps.map(r=>r.slackMm)),
   maxWindingErrorMm:Math.max(...rps.map(r=>Math.abs(r.windingErrorMm))),
   anchorErrorMm:anchorError,hingeGapMm:Math.max(o.gap(f),connector.gapMm),originalHingeGapMm:connector.gapMm,
   axisMismatchDeg:Math.max(o.axisGap(f),connector.axisMismatchDeg),baseTiltDeg:o.tilt(f),
   ropes:rps,variables:f.extra?.variables||{}};
  row.finite=Object.values(f.bodies).every(p=>[...p.position,...p.rotation].every(Number.isFinite))&&
   Object.values(f.joints).every(j=>Object.values(j).filter(x=>typeof x==='number').every(Number.isFinite))&&
   Object.values(row).filter(x=>typeof x==='number').every(Number.isFinite)&&
   rps.every(r=>Object.values(r).filter(x=>typeof x==='number').every(Number.isFinite));
  return row;
 });
}

function judgeGeometry(recording,rows,{native=false}={}){
 const failures=[],gate=(ok,reason)=>{if(!ok)failures.push(reason);};
 const max=(key,list=rows)=>Math.max(...list.map(r=>Math.abs(r[key])));
 const first=rows[0],last=rows.at(-1),programRows=rows.filter(r=>native?r.phase==='program':r.t<=recording.finishedAt);
 const cold=rows.filter(r=>r.phase==='cold'),after=rows.filter(r=>native?r.phase==='after':r.t>recording.finishedAt);
 const modelBodies=recording.mechanism.bodies.filter(b=>b.parts.length);
 const ropes=recording.mechanism.couplings.filter(c=>c.kind==='rope'),worms=recording.mechanism.couplings.filter(c=>c.kind==='worm');
 gate(rows.length>=500,'At least500 observed pose frames');
 gate(recording.mechanism.hubs.length===1&&recording.mechanism.actuators.length===2&&['A','B'].every(p=>recording.mechanism.actuators.some(a=>a.port===p)),'One hub and exactly two motors on A/B');
 gate(ropes.length===4&&ropes.every(c=>c.points.length===1&&Math.abs(c.radiusM*1000-radius)<1e-8),'Four direct native ropes with the declared winding radius');
 gate(worms.length===2&&worms.every(c=>Math.abs(Math.abs(c.ratio)-1/ratio)<1e-10),'Two actual24:1 worm meshes');
 gate(modelBodies.length===contract.expectedTopology.dynamicModelBodies&&modelBodies.every(b=>b.motion==='dynamic'),'Exact declared dynamic assemblies; free chassis and payload');
 gate(recording.mechanism.joints.length===contract.expectedTopology.joints&&recording.mechanism.joints.every(j=>j.type==='hinge'),'Exact declared physical hinges, no hidden ball/slider/fixed joints');
 const issueKey=i=>i.code+':'+[...(i.parts||[])].sort().join('|');
 gate(recording.issues.every(i=>(contract.approvedIssues||[]).includes(issueKey(i))),'No unresolved import issue');
 gate((recording.mechanism.diagnostics||[]).length===0,'No unresolved mechanism diagnostic');
 gate(rows.every(r=>r.finite),'Every body, joint, rope and derived observation is finite');
 gate(recording.finishedAt!==null&&recording.finishedAt-(native?coldMs:recording.start||0)<150000,'Actual native VM finishes before the150second watchdog');
 if(native)gate(cold.length>=31&&cold.at(-1).t-cold[0].t>=999.9,'Full1000ms unpowered cold interval observed');
 gate(after.length>=30&&after.at(-1).t-recording.finishedAt>=999.9,'Full1000ms after interval observed');
 gate(Number(last.variables.completed)===1&&Number(last.variables.failed)===0,'Normal completion: completed=1 and failed=0');
 gate(Math.hypot(first.xMm,first.downMm-H,first.depthMm)<=.5,'Saved tiepoint datum agrees within0.5mm');
 gate(rows.every(r=>r.xMm>=-18&&r.xMm<=18&&r.downMm>=82&&r.downMm<=102&&Math.abs(r.depthMm)<=2),'Actual route stays inside declared Cartesian bounds, including transients');
 gate(max('lawErrorMm')<=2,'Actual tiepoint agrees with independent paid-out-length geometry within2mm throughout');
 gate(max('maxWindingErrorMm')<=.1,'Actual rope free length agrees with drum winding law within0.1mm');
 gate(max('anchorErrorMm')<=.5,'Actual four anchors remain on the declared rectangle within0.5mm');
 gate(Math.max(...rows.map(r=>r.maxRopeExtensionMm))<=1,'No recorded rope exceeds its paid-out length by more than1mm');
 gate(rows.every(r=>r.ropes.every(p=>p.tensionN>=0&&p.freeMm>100&&p.freeMm<135)),'All rope tensions nonnegative and free lengths finite within safe recorded bounds');
 gate(max('hingeGapMm')<=.5&&max('axisMismatchDeg')<=2,'All original bearing interfaces close within0.5mm and2degrees');
 gate(max('baseTiltDeg')<=2,'Freestanding chassis tilt stays within2degrees');
 gate(['encoderADeg','encoderBDeg'].every(k=>span(rows.map(r=>r[k]))>=1000),'Both useful motors independently travel at least1000unwrapped degrees');
 const coldDrift=cold.length?Math.max(...cold.map(r=>Math.hypot(r.xMm-first.xMm,r.downMm-first.downMm,r.depthMm-first.depthMm))):null;
 if(native)gate(coldDrift<=1,'Unpowered cold tiepoint drift at most1mm with native worm holding');
 const returnError=Math.hypot(last.xMm-first.xMm,last.downMm-first.downMm,last.depthMm-first.depthMm);
 gate(returnError<=2,'Observed tiepoint returns within2mm of saved datum');
 gate(Math.abs(last.encoderADeg)<=2&&Math.abs(last.encoderBDeg)<=2,'Both final encoders return within2degrees');
 const order=programRows.filter(r=>Number(r.variables.arrived)===1).map(r=>Number(r.variables.stage)).filter((s,i,a)=>!i||s!==a[i-1]);
 gate(JSON.stringify(order)===JSON.stringify(route.map(p=>p.stage)),'All declared settled stages occur in the exact chronological route');
 const stages=route.map(p=>{
  const all=programRows.filter(r=>Number(r.variables.stage)===p.stage&&Number(r.variables.arrived)===1);
  const end=all.at(-1)?.t??-Infinity,frames=all.filter(r=>r.t>=end-500.0001);
  gate(all.length>0&&end-all[0].t>=2900,'Stage '+p.stage+' records at least2.9seconds of its declared3second dwell');
  gate(frames.length>=15,'Stage '+p.stage+' has at least15 settled pose observations');
  gate(frames.length>0&&frames.at(-1).t-frames[0].t>=466.5,'Stage '+p.stage+' final measurement window covers at least0.4665seconds');
  if(!frames.length)return {stage:p.stage,frames:0};
  const error=r=>Math.hypot(r.xMm-p.x,r.downMm-p.down,r.depthMm-p.depth);
  const expectedA=targetFor(p,'A'),expectedB=targetFor(p,'B');
  gate(frames.every(r=>Math.abs(Number(r.variables.targetA)-expectedA)<1e-6&&Math.abs(Number(r.variables.targetB)-expectedB)<1e-6),'Stage '+p.stage+' uses independently declared inverse-geometry motor targets');
  gate(frames.every(r=>Math.abs(r.encoderADeg-expectedA)<=2&&Math.abs(r.encoderBDeg-expectedB)<=2),'Stage '+p.stage+' reaches both fresh encoder targets within2degrees');
  gate(frames.every(r=>error(r)<=2),'Stage '+p.stage+' actual tiepoint reaches its Cartesian target within2mm');
  // r1's instantaneous positivity gate remains FAIL in its preserved receipt.
  // r2 separately tests complete 5ms integrated support; instantaneous minima
  // remain visible below and must not be reported as continuously positive.
  gate(frames.every(r=>r.maxRopeSlackMm<=2),'Stage '+p.stage+' each rope has at most2mm geometric slack');
  return {stage:p.stage,frames:frames.length,endMs:end,arrivedCoverageMs:end-all[0].t,settledCoverageMs:frames.at(-1).t-frames[0].t,target:{xMm:p.x,downMm:p.down,depthMm:p.depth},
   meanXmm:average(frames.map(r=>r.xMm)),meanDownMm:average(frames.map(r=>r.downMm)),meanDepthMm:average(frames.map(r=>r.depthMm)),
   maxPositionErrorMm:Math.max(...frames.map(error)),targetADeg:expectedA,targetBDeg:expectedB,
   maxMotorErrorDeg:Math.max(...frames.flatMap(r=>[Math.abs(r.encoderADeg-expectedA),Math.abs(r.encoderBDeg-expectedB)])),
   minLeftPairTensionN:Math.min(...frames.map(r=>r.tensionLeftN)),minRightPairTensionN:Math.min(...frames.map(r=>r.tensionRightN)),
   maxIndividualSlackMm:Math.max(...frames.map(r=>r.maxRopeSlackMm))};
 });
 gate(stages[1]?.meanXmm<=-14&&stages[4]?.meanXmm>=14,'Useful signed left/right excursions are each at least14mm');
 gate(stages[0]?.meanDownMm-stages[3]?.meanDownMm>=14,'Useful settled lift is at least14mm');
 return {failures,metrics:{frames:rows.length,coldFrames:cold.length,programFrames:programRows.length,afterFrames:after.length,
  finishedAtMs:recording.finishedAt,programDurationMs:recording.finishedAt-coldMs,
  xRangeMm:range(rows.map(r=>r.xMm)),downRangeMm:range(rows.map(r=>r.downMm)),depthRangeMm:range(rows.map(r=>r.depthMm)),
  maxLawErrorMm:max('lawErrorMm'),maxWindingErrorMm:max('maxWindingErrorMm'),maxAnchorErrorMm:max('anchorErrorMm'),
  maxRopeExtensionMm:Math.max(...rows.map(r=>r.maxRopeExtensionMm)),maxRopeSlackMm:Math.max(...rows.map(r=>r.maxRopeSlackMm)),
  maxHingeGapMm:max('hingeGapMm'),maxOriginalHingeGapMm:max('originalHingeGapMm'),maxAxisMismatchDeg:max('axisMismatchDeg'),
  maxBaseTiltDeg:max('baseTiltDeg'),coldDriftMm:coldDrift,returnErrorMm:returnError,
  finalEncoderADeg:last.encoderADeg,finalEncoderBDeg:last.encoderBDeg,stageOrder:order,stages,finalVariables:last.variables}};
}

function inputAndFoundation(r){
 const o=observeAddon(r,markers.basePart),inputs={};
 for(const [port,part]of [['A','left_worm_axle'],['B','right_worm_axle']]){
  const joint=r.mechanism.joints.find(j=>j.motor?.port===port);assert.ok(joint);
  const axis=unit(joint.axis),v=Math.abs(axis[0])<.9?[1,0,0]:[0,1,0],ref=unit(v.map((x,k)=>x-axis[k]*dot(v,axis)));
  let previous=0,total=0;const angles=r.track.map(f=>{const a=o.angle(f,part,axis,ref);total+=Math.atan2(Math.sin(a-previous),Math.cos(a-previous));previous=a;return deg(total);});
  const encoders=r.track.map(f=>deg(f.joints[joint.id].angle)),maxError=Math.max(...angles.map((a,i)=>Math.abs(a-encoders[i])));
  assert.ok(maxError<1,`independent ${port} input shaft follows its actual encoder: ${maxError}`);
  assert.ok(span(encoders)>=1000,`real ${port} input turns at least 1000 degrees`);
  inputs[port]={spanDeg:span(encoders),maxShaftErrorDeg:maxError};
 }
 const maxFrameDriftMm=Math.max(...r.track.map(f=>norm(sub(f.bodies[o.base.id].position,o.base.position))*1000));
 // The supplied experiment is relative to a free chassis, not a prescribed
 // stationary world frame. Check its saved world registration independently,
 // retain the original tilt/support gates, and report its actual reaction motion.
 const initialFrameErrorMm=norm(sub(r.track[0].bodies[o.base.id].position,o.base.position))*1000;
 assert.ok(initialFrameErrorMm<.5,'saved foundation world-frame datum agrees within 0.5 mm');
 return {inputs,maxFrameDriftMm,initialFrameErrorMm};
}

export function evaluateCableCompass(r,{native=false}={}){
 const rows=measureCableCompass(r),result=judgeGeometry(r,rows,{native});
 if(r.runModel.parts.length!==175)result.failures.push('exact original 175 rigid placements');
 if(native){const support=judgeRopeImpulses(r,contract.forceObservation);result.forceSupport=support;result.failures.push(...support.failures);}
 return {...result,rows};
}

export function judgeCableCompass(r,{native=false,control=false}={}){
 const rows=measureCableCompass(r),m=r.mechanism;
 assert.equal(r.runModel.parts.length,control?174:175);assert.equal(m.hubs.length,1);
 assert.deepEqual(m.actuators.map(a=>a.port).sort(),['A','B']);assert.deepEqual(r.issues,[]);assert.deepEqual(m.diagnostics||[],[]);
 assert.ok(m.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'));
 assert.equal(m.joints.length,4);assert.ok(m.joints.every(j=>j.type==='hinge'),'retain all actual revolute bearings');
 assert.equal(m.couplings.filter(c=>c.kind==='rope').length,4);
 const worms=m.couplings.filter(c=>c.kind==='worm');assert.equal(worms.length,control?1:2);
 if(control)assert.deepEqual(worms[0].parts,['right_worm','right_wheel']);
 const input=inputAndFoundation(r);
 assert.ok(r.track.length>=500&&r.track.every(f=>Object.values(f.bodies).every(p=>[...p.position,...p.rotation].every(Number.isFinite))));
 if(!control){
  const result=evaluateCableCompass(r,{native});assert.deepEqual(result.failures,[],'original route, winding, support, closure and force limits');
  return {control,pieces:175,...input,maxLawErrorMm:result.metrics.maxLawErrorMm,returnErrorMm:result.metrics.returnErrorMm,
   maxHingeGapMm:result.metrics.maxHingeGapMm,maxAxisErrorDeg:result.metrics.maxAxisMismatchDeg,
   stages:result.metrics.stages.map(s=>({stage:s.stage,xMm:s.meanXmm,downMm:s.meanDownMm,errorMm:s.maxPositionErrorMm})),
   ...(native?{forceSupport:result.forceSupport.metrics.stages.map(s=>({stage:s.stage,relativeResidual:s.relativeResidual,supportFraction:s.verticalSupportFraction}))}:{})};
 }
 const first=rows[0],last=rows.at(-1);
 assert.ok(input.maxFrameDriftMm<1,'disconnected control foundation remains within its declared 1 mm envelope');
 assert.ok(Number.isFinite(r.finishedAt)&&r.finishedAt-(native?1000:r.start||0)<150000);
 assert.equal(Number(last.variables.completed),1);assert.equal(Number(last.variables.failed),0);assert.equal(Number(last.variables.stage),6);
 assert.ok(rows.every(s=>s.hingeGapMm<=.5&&s.axisMismatchDeg<=2&&s.baseTiltDeg<=2),'all six original bearing interfaces remain closed and aligned');
 const after=rows.filter(s=>native?s.phase==='after':s.t>r.finishedAt);
 assert.ok(after.length>=30&&after.at(-1).t-r.finishedAt>=999.9,'full one-second after interval');
 if(native){const cold=rows.filter(s=>s.phase==='cold');assert.ok(cold.length>=31&&cold.at(-1).t-cold[0].t>=999.9,'full unpowered cold interval');}
 const settled=rows.filter(s=>Number(s.variables.arrived)===1),order=settled.map(s=>Number(s.variables.stage)).filter((s,i,a)=>!i||s!==a[i-1]);
 assert.deepEqual(order,[0,1,2,3,4,5]);
 const errors=route.map(p=>{
  const all=settled.filter(s=>Number(s.variables.stage)===p.stage),end=all.at(-1)?.t,frames=all.filter(s=>s.t>=end-500.0001);
  assert.ok(frames.length>=15);
  assert.ok(frames.every(s=>Math.abs(s.encoderADeg-targetFor(p,'A'))<=2&&Math.abs(s.encoderBDeg-targetFor(p,'B'))<=2),'both actual motor arrivals remain successful');
  return average(frames.map(s=>Math.hypot(s.xMm-p.x,s.downMm-p.down,s.depthMm)));
 });
 const returnErrorMm=Math.hypot(last.xMm-first.xMm,last.downMm-first.downMm,last.depthMm-first.depthMm);
 assert.ok(returnErrorMm>=4||Math.max(...errors)>=4,'disconnected left drum cannot reproduce the commanded passive route');
 const main=evaluateCableCompass(r,{native:false});assert.ok(main.failures.some(s=>s.includes('actual tiepoint reaches its Cartesian target')||s.includes('returns within2mm')),'main position oracle independently rejects the physical disconnection');
 return {control,pieces:174,...input,meanWaypointErrorsMm:errors,returnErrorMm,maxHingeGapMm:Math.max(...rows.map(s=>s.hingeGapMm))};
}
