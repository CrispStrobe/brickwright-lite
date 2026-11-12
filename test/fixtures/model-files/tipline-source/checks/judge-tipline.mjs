// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Independent observations of recorded native body poses. The static formulas
// are comparisons only; they never generate observed motion or event times.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const repoRoot=resolve(process.env.BW_REPO_ROOT || fileURLToPath(new URL('../brickwright-lite',import.meta.url)));
const {observeAddon}=await import(pathToFileURL(resolve(repoRoot,'scripts/lib/sim-lab-addon-judge.mjs')));
const add=(a,b)=>a.map((x,i)=>x+b[i]), sub=(a,b)=>a.map((x,i)=>x-b[i]);
const scale=(a,s)=>a.map(x=>x*s), dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm=a=>Math.hypot(...a), unit=a=>scale(a,1/norm(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const conj=([x,y,z,w])=>[-x,-y,-z,w];
const rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const clamp=x=>Math.max(-1,Math.min(1,x)), deg=x=>x*180/Math.PI;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const vec=x=>Array.isArray(x)&&x.length===3&&x.every(finite);
const pose=x=>x&&vec(x.position)&&Array.isArray(x.rotation)&&x.rotation.length===4&&x.rotation.every(finite);
const max=a=>a.length?Math.max(...a):null, min=a=>a.length?Math.min(...a):null;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const rms=a=>a.length?Math.sqrt(mean(a.map(x=>x*x))):null;
const absmax=a=>max(a.map(Math.abs));
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const contractOf=x=>typeof x==='string'?JSON.parse(readFileSync(x,'utf8')):x;
const variable=(f,k)=>f.extra?.[k]??f.extra?.variables?.[k];
const required=(ok,message)=>{if(!ok)throw new Error(`Tipline observer input: ${message}`);};
const isOne=x=>x===1||x===true||x==='1';
const duration=rows=>rows.length>1?(rows.at(-1).t-rows[0].t)/1000:0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function firstPersistent(rows,predicate,persistenceMs) {
    let start=null;
    for(let i=0;i<rows.length;i++) {
        if(!predicate(rows[i])) {start=null;continue;}
        if(start===null)start=i;
        if(rows[i].t-rows[start].t+1e-7>=persistenceMs) {
            const a=rows[start],b=rows[i];
            return {index:a.index,tMs:a.t,deckSlopeDeg:a.deckSlopeDeg,
                confirmationIndex:b.index,confirmationTimeMs:b.t};
        }
    }
    return null;
}

function angularDifference(q0,q1,dt) {
    let q=mul(q1,conj(q0));
    if(q[3]<0)q=q.map(v=>-v);
    const s=norm(q.slice(0,3));
    return s<1e-12?[0,0,0]:scale(q.slice(0,3),2*Math.atan2(s,q[3])/(s*dt));
}

/** Bounds of the real compiled primitive colliders in the observed deck frame. */
function bodyBounds(body,bodyPose,origin,axes) {
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const c of body.colliders) {
        const center=add(bodyPose.position,rot(bodyPose.rotation,c.position||[0,0,0]));
        const q=mul(bodyPose.rotation,c.rotation||[0,0,0,1]);
        const localAxes=[[1,0,0],[0,1,0],[0,0,1]].map(a=>rot(q,a));
        for(let k=0;k<3;k++) {
            const p=dot(sub(center,origin),axes[k]);
            let radius;
            if(c.shape==='box')radius=c.halfExtents.reduce((s,h,j)=>s+h*Math.abs(dot(axes[k],localAxes[j])),0);
            else if(c.shape==='sphere')radius=c.radius;
            else if(c.shape==='cylinder') {
                const along=clamp(dot(axes[k],localAxes[1]));
                radius=c.halfHeight*Math.abs(along)+c.radius*Math.sqrt(Math.max(0,1-along*along));
            } else throw new Error(`Unsupported observed collider ${c.shape}`);
            lo[k]=Math.min(lo[k],p-radius);hi[k]=Math.max(hi[k],p+radius);
        }
    }
    return {acrossMinMm:lo[0]*1000,acrossMaxMm:hi[0]*1000,
        normalMinMm:lo[1]*1000,normalMaxMm:hi[1]*1000,
        downhillMinMm:lo[2]*1000,downhillMaxMm:hi[2]*1000};
}

function velocitySummary(samples,linear=true) {
    const errors=samples.map(x=>x.error),speeds=samples.map(x=>x.speed);
    return {samples:samples.length,rmsError:rms(errors),maxError:max(errors),
        rmsObservedSpeed:rms(speeds),maxObservedSpeed:max(speeds),
        units:linear?'m/s':'deg/s',timeRangeMs:samples.length?[samples[0].t,samples.at(-1).t]:null};
}

/**
 * Required recording fields beyond runRobotLabProgram's standard result:
 * setup.bodyDynamics[bodyId], setup.bodyPoses[bodyId] at the admitted initial pose.
 * track.extra.{stage,completed,failed,motorAngleDeg,controllerMode,drive,motorDynamics,
 *   velocities:{[payloadBodyId]:{linear:[x,y,z],angular:[x,y,z]}},contacts:[[bodyId,bodyId],...]}
 * motorDynamics.t is seconds on the completed native-step clock. track.t is milliseconds.
 * Program SHA may be r.programSha256 or r.provenance.programSha256.
 */
export function measureTipline(r,{variant='main',contract:input}={}) {
    const c=contractOf(input);
    required(c?.nativeGates&&c?.eventDefinitions&&c?.markers,'the frozen contract object or path');
    required(c.variants[variant],`known variant ${variant}`);
    required(r.mechanism&&r.runModel&&Array.isArray(r.track)&&r.track.length>2,'mechanism, runModel and nonempty native track');
    const o=observeAddon(r,c.markers.chassis),m=r.mechanism,frames=r.track,marks=c.markers;
    const base=o.base,deck=o.body(marks.deck),motor=m.joints.find(j=>j.motor?.port===c.topology.motorPort);
    required(motor,'motor A hinge');
    const laneDefs=Object.fromEntries(['left','right'].map(lane=>[lane,{lane,
        configuration:c.variants[variant][lane],basePart:marks[`${lane}Base`],roofPart:marks[`${lane}Roof`],
        body:o.body(marks[`${lane}Base`])}]));
    required(new Set([base.id,deck.id,...Object.values(laneDefs).map(x=>x.body.id)]).size===4,'four distinct chassis/deck/free-load owners');
    for(const d of Object.values(laneDefs)) {
        required(o.body(d.roofPart).id===d.body.id,`${d.lane} base and roof share one rigid load body`);
        d.dynamics=r.setup?.bodyDynamics?.[d.body.id]??r.setup?.payloadDynamics?.[d.lane];
        d.initialPose=r.setup?.bodyPoses?.[d.body.id]??{position:d.body.position,rotation:d.body.rotation};
        required(d.dynamics&&vec(d.dynamics.centerOfMassWorld)&&finite(d.dynamics.solverMassKg),`${d.lane} native body dynamics`);
        required(pose(d.initialPose),`${d.lane} admitted native body pose`);
        d.localCom=rot(conj(d.initialPose.rotation),sub(d.dynamics.centerOfMassWorld,d.initialPose.position));
    }
    const dynamic=m.bodies.filter(b=>b.motion==='dynamic');
    for(let i=0;i<frames.length;i++) {
        required(finite(frames[i].t)&&(i===0||frames[i].t>frames[i-1].t),'strictly increasing frame times');
        for(const b of dynamic)required(pose(frames[i].bodies?.[b.id]),`actual finite pose for ${b.id} at ${frames[i].t}`);
    }
    const localPoint=(id,p)=>{
        const b=o.body(id);return {body:b.id,local:rot(conj(b.rotation),sub(o.initial(id,p),b.position))};
    };
    const carry=(f,p)=>add(f.bodies[p.body].position,rot(f.bodies[p.body].rotation,p.local));
    const deckPoints=[marks.deckOriginLocalLdu,marks.deckAcrossPointLocalLdu,marks.deckNormalPointLocalLdu,
        marks.deckDownhillPointLocalLdu].map(p=>localPoint(marks.deck,p));
    for(const d of Object.values(laneDefs)) {
        d.bottom=localPoint(d.basePart,marks.baseBottomLocalLdu);
        d.roof=localPoint(d.roofPart,marks.roofLocalLdu);
        d.edgeDown=localPoint(d.basePart,marks.baseDownhillEdgeLocalLdu);
        d.edgeUp=localPoint(d.basePart,marks.baseUphillEdgeLocalLdu);
    }
    const gravity=r.setup?.gravity||m.gravity;
    required(vec(gravity)&&norm(gravity)>0,'actual finite gravity vector');
    const downGravity=unit(gravity),baseStart=frames[0].bodies[base.id].position;
    const initialNormal=unit(sub(o.initial(marks.deck,marks.deckNormalPointLocalLdu),o.initial(marks.deck,marks.deckOriginLocalLdu)));
    const initialDown=unit(sub(o.initial(marks.deck,marks.deckDownhillPointLocalLdu),o.initial(marks.deck,marks.deckOriginLocalLdu)));
    const rows=frames.map((f,index)=>{
        const [origin,pa,pn,pd]=deckPoints.map(p=>carry(f,p));
        const across=unit(sub(pa,origin)),normal=unit(sub(pn,origin)),downhill=unit(sub(pd,origin));
        const deckSlopeDeg=deg(Math.atan2(dot(downGravity,downhill),-dot(downGravity,normal)));
        const relativeNormal=o.vector(f,marks.deck,initialNormal),relativeDown=o.vector(f,marks.deck,initialDown);
        const contacts=f.extra?.contacts;
        required(Array.isArray(contacts)&&contacts.every(x=>Array.isArray(x)&&x.length===2),`native contact pairs at ${f.t}`);
        const nativeTime=f.extra?.motorDynamics?.t??(f.t===0?0:null);
        required(finite(nativeTime),`completed native-step clock at ${f.t}`);
        const lanes={};
        for(const [lane,d]of Object.entries(laneDefs)) {
            const bottom=carry(f,d.bottom),roof=carry(f,d.roof),up=unit(sub(roof,bottom));
            const velocity=f.extra?.velocities?.[d.body.id]??f.extra?.velocities?.[lane];
            required(vec(velocity?.linear)&&vec(velocity?.angular),`${lane} native linear/angular velocities at ${f.t}`);
            const com=add(f.bodies[d.body.id].position,rot(f.bodies[d.body.id].rotation,d.localCom));
            const bounds=bodyBounds(d.body,f.bodies[d.body.id],origin,[across,normal,downhill]);
            const pairContacts=contacts.filter(p=>p.includes(d.body.id));
            const otherContacts=pairContacts.filter(p=>!p.includes(deck.id));
            lanes[lane]={configuration:d.configuration,bodyId:d.body.id,
                baseWorld:bottom,roofWorld:roof,comWorld:com,
                baseDeckMm:[across,normal,downhill].map(a=>1000*dot(sub(bottom,origin),a)),
                signedTipDeg:deg(Math.atan2(dot(up,downhill),dot(up,normal))),
                relativeTiltDeg:deg(Math.acos(clamp(dot(up,normal)))),
                sidewaysTiltDeg:deg(Math.atan2(dot(up,across),dot(up,normal))),
                edgeHeightDifferenceMm:1000*dot(sub(carry(f,d.edgeUp),carry(f,d.edgeDown)),normal),
                comHeightFromBaseMm:1000*dot(sub(com,bottom),normal),
                linearVelocity:velocity.linear,angularVelocity:velocity.angular,
                linearSpeedMS:norm(velocity.linear),angularSpeedRadS:norm(velocity.angular),
                rotation:f.bodies[d.body.id].rotation,bounds,
                catchClearanceMm:c.geometry.catchWallUphillFaceMm-bounds.downhillMaxMm,
                deckContact:pairContacts.some(p=>p.includes(deck.id)),otherContacts};
        }
        return {index,t:f.t,nativeTime,phase:f.phase,stage:Number(variable(f,'stage')),
            completed:Number(variable(f,'completed')),failed:Number(variable(f,'failed')),
            held:isOne(variable(f,'held')),targetA:Number(variable(f,'targetA')),
            motorAngleDeg:Number(f.extra?.motorAngleDeg??deg(f.joints[motor.id].angle)),
            motorBusy:Boolean(f.busy?.A),controllerMode:f.extra?.controllerMode??null,
            drive:f.extra?.drive??null,motorDynamics:f.extra?.motorDynamics??null,
            deckSlopeDeg,deckRelativeChassisDeg:deg(Math.atan2(dot(downGravity,relativeDown),-dot(downGravity,relativeNormal))),
            chassisTiltDeg:o.tilt(f),chassisTranslationMm:1000*norm(sub(f.bodies[base.id].position,baseStart)),
            hingeGapMm:o.gap(f),hingeAxisMismatchDeg:o.axisGap(f),lanes};
    });
    for(let i=1;i<rows.length;i++)required(rows[i].nativeTime>rows[i-1].nativeTime,'strictly increasing completed native-step times');
    const stage=c.program.stages;
    const outward=rows.filter(x=>x.phase==='program'&&x.stage===stage.outward);
    const active=rows.filter(x=>x.phase==='program'&&[stage.outward,stage.topDwell].includes(x.stage));
    const startup=rows.filter(x=>x.phase==='program'&&x.stage===stage.startup);
    const cold=rows.filter(x=>x.phase==='cold');
    const settled=startup.length?startup.filter(x=>x.t>=startup.at(-1).t-250):[];
    const baselineRows=settled.length?settled:[rows[0]];
    const summaries={};
    for(const [lane,d]of Object.entries(laneDefs)) {
        const datum=[0,1,2].map(k=>mean(baselineRows.map(x=>x.lanes[lane].baseDeckMm[k])));
        const coldDatum=rows[0].lanes[lane].baseDeckMm;
        for(const row of rows) {
            const x=row.lanes[lane];
            x.slideMm=x.baseDeckMm[2]-datum[2];x.acrossDriftMm=x.baseDeckMm[0]-datum[0];
            x.coldShiftMm=norm(sub(x.baseDeckMm,coldDatum));
        }
        const tip=firstPersistent(active,x=>x.lanes[lane].signedTipDeg>=c.eventDefinitions.tipSignedTiltDeg,c.eventDefinitions.persistenceMs);
        const slide=firstPersistent(active,x=>x.lanes[lane].slideMm>=c.eventDefinitions.slideDownhillDisplacementMm&&
            x.lanes[lane].relativeTiltDeg<=c.eventDefinitions.slideRelativeTiltDegMax,c.eventDefinitions.persistenceMs);
        const first=tip&&slide?(tip.tMs<slide.tMs?'tip':'slide'):(tip?'tip':slide?'slide':null);
        const event=d.configuration==='high'?tip:slide;
        const throughEvent=event?active.filter(x=>x.t<=event.tMs):[];
        const freeActive=active.filter(x=>x.lanes[lane].catchClearanceMm>=c.nativeGates.preEventCatchClearanceMmMin&&x.lanes[lane].otherContacts.length===0);
        const usefulSlide=freeActive.find(x=>x.lanes[lane].slideMm>=c.nativeGates.lowUsefulFreeSlideMmMin&&
            x.lanes[lane].relativeTiltDeg<=c.nativeGates.lowTiltUntilUsefulSlideDegMax);
        const untilUseful=usefulSlide?active.filter(x=>x.t<=usefulSlide.t):[];
        const nativeHeight=rows[0].lanes[lane].comHeightFromBaseMm;
        const b=c.geometry.baseHalfWidthDownhillMm,round=c.geometry.baseNativeCornerRadiusMm;
        const friction=Math.sqrt(deck.friction*d.body.friction);
        const prediction={nativeComHeightMm:nativeHeight,baseHalfWidthMm:b,baseCornerRadiusMm:round,
            tipSharpDeg:deg(Math.atan(b/nativeHeight)),tipRoundedDeg:deg(Math.atan((b-round)/(nativeHeight-round))),
            pairFriction:friction,slideDeg:deg(Math.atan(friction))};
        const linearSamples=[],angularSamples=[];
        // Observer v2, declared before the v4 machine run: a centered
        // difference uses both neighboring records. All three records must
        // satisfy the same original free-contact rule; otherwise a close
        // arrest-wall impact could contaminate a nominally free sample.
        // Thresholds and minimum sample counts are unchanged.
        const velocityFrameIsFree=x=>[stage.outward,stage.topDwell].includes(x.stage)&&x.phase==='program'&&
            x.lanes[lane].otherContacts.length===0&&
            x.lanes[lane].catchClearanceMm>=c.nativeGates.preEventCatchClearanceMmMin;
        for(let i=1;i<rows.length-1;i++) {
            const a=rows[i-1],q=rows[i],z=rows[i+1],p=q.lanes[lane];
            if(![a,q,z].every(velocityFrameIsFree))continue;
            const dt=z.nativeTime-a.nativeTime;
            const v=scale(sub(z.lanes[lane].comWorld,a.lanes[lane].comWorld),1/dt);
            const nativeV=scale(add(a.lanes[lane].linearVelocity,z.lanes[lane].linearVelocity),.5);
            if(d.configuration==='low'&&p.slideMm>=c.nativeGates.smoothSlideWindowMm[0]&&p.slideMm<=c.nativeGates.smoothSlideWindowMm[1]&&
                p.relativeTiltDeg<=c.eventDefinitions.slideRelativeTiltDegMax&&norm(v)>=c.nativeGates.smoothSlideNativeSpeedMSMin) {
                linearSamples.push({t:q.t,error:norm(sub(v,nativeV)),speed:norm(v),observed:v,native:nativeV});
            }
            if(d.configuration==='high'&&p.signedTipDeg>=c.nativeGates.smoothTipWindowDeg[0]&&p.signedTipDeg<=c.nativeGates.smoothTipWindowDeg[1]) {
                const w=angularDifference(a.lanes[lane].rotation,z.lanes[lane].rotation,dt);
                const nativeW=scale(add(a.lanes[lane].angularVelocity,z.lanes[lane].angularVelocity),.5);
                angularSamples.push({t:q.t,error:deg(norm(sub(w,nativeW))),speed:deg(norm(w)),observed:w,native:nativeW});
            }
        }
        const bodyRows=rows.map(x=>x.lanes[lane]);
        summaries[lane]={configuration:d.configuration,bodyId:d.body.id,partCount:d.body.parts.length,
            dynamics:d.dynamics,bodyFriction:d.body.friction,prediction,baselineDeckMm:datum,
            firstInstability:first,tip,slide,
            expectedEvent:event,
            referenceErrorDeg:event?event.deckSlopeDeg-(d.configuration==='high'?prediction.tipRoundedDeg:prediction.slideDeg):null,
            highPreTipBaseTravelMm:tip?absmax(active.filter(x=>x.t<=tip.tMs).map(x=>x.lanes[lane].slideMm)):null,
            maxFreeSignedTipDeg:max(freeActive.map(x=>x.lanes[lane].signedTipDeg)),
            usefulSlideAtMs:usefulSlide?.t??null,
            maxFreeSlideMm:max(freeActive.filter(x=>x.lanes[lane].relativeTiltDeg<=c.nativeGates.lowTiltUntilUsefulSlideDegMax).map(x=>x.lanes[lane].slideMm)),
            maxTiltUntilUsefulSlideDeg:untilUseful.length?max(untilUseful.map(x=>x.lanes[lane].relativeTiltDeg)):null,
            preEventCatchClearanceMm:min(throughEvent.map(x=>x.lanes[lane].catchClearanceMm)),
            preEventOtherContactFrames:throughEvent.filter(x=>x.lanes[lane].otherContacts.length).length,
            preEventSidewaysTiltDeg:absmax(throughEvent.map(x=>x.lanes[lane].sidewaysTiltDeg)),
            coldShiftMm:max(cold.map(x=>x.lanes[lane].coldShiftMm)),
            coldRelativeTiltDeg:max(cold.map(x=>x.lanes[lane].relativeTiltDeg)),
            settledShiftMm:max(baselineRows.map(x=>norm(sub(x.lanes[lane].baseDeckMm,datum)))),
            settledRelativeTiltDeg:max(baselineRows.map(x=>x.lanes[lane].relativeTiltDeg)),
            settledLinearSpeedMS:max(baselineRows.map(x=>x.lanes[lane].linearSpeedMS)),
            settledAngularSpeedRadS:max(baselineRows.map(x=>x.lanes[lane].angularSpeedRadS)),
            maxAcrossDriftMm:absmax(bodyRows.map(x=>x.acrossDriftMm)),
            minAcrossMm:min(bodyRows.map(x=>x.bounds.acrossMinMm)),maxAcrossMm:max(bodyRows.map(x=>x.bounds.acrossMaxMm)),
            minDownhillMm:min(bodyRows.map(x=>x.bounds.downhillMinMm)),maxDownhillMm:max(bodyRows.map(x=>x.bounds.downhillMaxMm)),
            maxBelowDeckMm:Math.max(0,-min(bodyRows.map(x=>x.bounds.normalMinMm))),
            maxNativeLinearSpeedMS:max(bodyRows.map(x=>x.linearSpeedMS)),maxNativeAngularSpeedRadS:max(bodyRows.map(x=>x.angularSpeedRadS)),
            laterOtherContactFrames:rows.filter(x=>x.lanes[lane].otherContacts.length).map(x=>({tMs:x.t,contacts:x.lanes[lane].otherContacts})),
            linearVelocityConsistency:velocitySummary(linearSamples,true),angularVelocityConsistency:velocitySummary(angularSamples,false),
            velocitySamples:{linear:linearSamples,angular:angularSamples}};
    }
    const top=rows.filter(x=>x.phase==='program'&&x.stage===stage.topDwell);
    const complete=rows.filter(x=>x.phase==='program'&&x.stage===stage.complete&&x.completed===1);
    const after=rows.filter(x=>x.phase==='after');
    const returnRows=rows.filter(x=>x.completed===1);
    const last=rows.at(-1),high=Object.values(summaries).find(x=>x.configuration==='high'),low=Object.values(summaries).find(x=>x.configuration==='low');
    const summary={observerRevision:'tipline-observer-v2',variant,contractRevision:c.revision,
        programSha256:r.programSha256??r.provenance?.programSha256??null,
        modelSha256:r.modelSha256??r.provenance?.modelSha256??null,
        frameCount:rows.length,nativeTimeRangeSeconds:[rows[0].nativeTime,last.nativeTime],
        coldSeconds:duration(cold),startupSeconds:duration(startup),outwardSeconds:duration(outward),topDwellSeconds:duration(top),
        afterSeconds:duration(after),completeSamples:complete.length,
        chassisBodyId:base.id,deckBodyId:deck.id,motorJointId:motor.id,
        motorPorts:m.actuators.map(x=>x.port),dynamicBodies:dynamic.map(x=>({id:x.id,parts:x.parts.length,role:x.role??null})),
        placedParts:r.runModel.parts.length,deckFriction:deck.friction,
        maxMotorAbsDeg:absmax(rows.map(x=>x.motorAngleDeg)),maxChassisTiltDeg:max(rows.map(x=>x.chassisTiltDeg)),
        maxChassisTranslationMm:max(rows.map(x=>x.chassisTranslationMm)),maxHingeGapMm:max(rows.map(x=>x.hingeGapMm)),
        maxHingeAxisMismatchDeg:max(rows.map(x=>x.hingeAxisMismatchDeg)),
        deckSlopeRangeDeg:[min(rows.map(x=>x.deckSlopeDeg)),max(rows.map(x=>x.deckSlopeDeg))],
        topArrivalErrorDeg:top.length?absmax(top.map(x=>x.deckRelativeChassisDeg-c.program.physicalDeckTargetsDeg[1])):null,
        finalEncoderErrorDeg:Math.abs(last.motorAngleDeg),finalDeckRelativeChassisDeg:last.deckRelativeChassisDeg,
        finalDeckGravityDeg:last.deckSlopeDeg,returnHeldEncoderErrorDeg:absmax(returnRows.map(x=>x.motorAngleDeg)),
        finalMotorBusy:last.motorBusy,finalControllerMode:last.controllerMode,completed:last.completed,failed:last.failed,
        anyFailed:rows.some(x=>x.failed===1),allProgramDrivesPwm:rows.filter(x=>x.phase==='program').every(x=>x.drive?.mode==='pwm'),
        tipBeforeSlideMarginDeg:high.tip&&low.slide?low.slide.deckSlopeDeg-high.tip.deckSlopeDeg:null,
        lanes:summaries,commandLog:r.commandLog??r.commandCompletions??null,
        nativeScope:'Actual exported model/program recording, independent body markers, first instability and contact/velocity evidence. App and hardware not assessed.'};
    return {summary,rows,context:{c,o,m,base,deck,motor,laneDefs,frames}};
}

function addGate(gates,id,pass,observed,expected,scope='native') {
    gates.push({id,status:pass?'PASS':'FAIL',observed,expected,scope});
}
const le=(x,y)=>finite(x)&&x<=y+1e-9, ge=(x,y)=>finite(x)&&x+1e-9>=y;

export function evaluateTipline(r,options={}) {
    let measured;
    try {measured=measureTipline(r,options);} catch(error) {
        return {status:'FAIL',gates:[{id:'observer_input',status:'FAIL',observed:String(error.message),expected:'Complete actual native recording'}],summary:null,rows:[]};
    }
    const {summary:s,rows,context:{c,m,base,deck,motor,laneDefs}}=measured;
    const n=c.nativeGates,e=c.qualifiedEnvelope,gates=[];
    const g=(id,pass,observed,expected,scope)=>addGate(gates,id,pass,observed,expected,scope);
    g('issues_empty',Array.isArray(r.issues)&&r.issues.length===0,r.issues,'[]');
    g('reported_vm_errors_empty',!r.vmErrors||r.vmErrors.length===0,r.vmErrors??'Separately captured by execution harness','No reported VM errors; absence is not a coverage claim');
    g('program_finished',finite(r.finishedAt)&&r.finishedAt>0,r.finishedAt,'Finite native harness completion');
    g('placed_part_count',s.placedParts===c.geometry.placedParts,s.placedParts,c.geometry.placedParts,'export');
    g('one_hub_one_motor',m.hubs.length===1&&m.actuators.length===1&&m.actuators[0].port==='A',
        {hubs:m.hubs.length,actuators:s.motorPorts},'One hub, only motor A');
    g('four_dynamic_assemblies',s.dynamicBodies.length===4,s.dynamicBodies,'Chassis, deck and two independent payloads');
    g('no_frozen_placed_assemblies',m.bodies.filter(x=>x.parts?.length).every(x=>x.motion==='dynamic'),
        m.bodies.filter(x=>x.parts?.length).map(x=>[x.id,x.motion]),'Every assembly containing placed parts is dynamic');
    const hingeOkay=m.joints.every(j=>j.type==='hinge'&&new Set([j.body1,j.body2]).size===2&&[j.body1,j.body2].every(id=>[base.id,deck.id].includes(id)));
    g('only_chassis_deck_hinges',hingeOkay,m.joints.map(j=>({id:j.id,type:j.type,body1:j.body1,body2:j.body2})),'Only actual chassis/deck hinges');
    g('no_couplings',m.couplings.length===0,m.couplings,'No payload or transmission couplings');
    g('real_pwm_hub_drive',s.allProgramDrivesPwm,s.allProgramDrivesPwm,'Actual hub reports PWM drives throughout program');
    g('cold_interval',ge(s.coldSeconds,c.nativeSampling.coldSeconds-0.02),s.coldSeconds,c.nativeSampling.coldSeconds);
    g('initial_held_interval',ge(s.startupSeconds,c.program.initialHoldSecondsMin-0.02),s.startupSeconds,c.program.initialHoldSecondsMin);
    g('slow_outward_coverage',ge(s.outwardSeconds,n.programOutwardDurationSecondsMin),s.outwardSeconds,`>=${n.programOutwardDurationSecondsMin} s`);
    g('top_dwell_present',ge(s.topDwellSeconds,c.program.topDwellSeconds-0.04),s.topDwellSeconds,c.program.topDwellSeconds);
    g('top_deck_arrival',le(s.topArrivalErrorDeg,n.deckTopArrivalErrorDegMax),s.topArrivalErrorDeg,`<=${n.deckTopArrivalErrorDegMax} deg`);
    g('complete_success',s.completed===1&&!s.anyFailed&&s.failed===0,{completed:s.completed,failed:s.failed,anyFailed:s.anyFailed},'completed=1; failed always0');
    g('returned_encoder',le(s.finalEncoderErrorDeg,n.encoderArrivalErrorDegMax)&&le(s.returnHeldEncoderErrorDeg,n.encoderArrivalErrorDegMax),
        {final:s.finalEncoderErrorDeg,held:s.returnHeldEncoderErrorDeg},`<=${n.encoderArrivalErrorDegMax} deg`);
    g('returned_deck',le(Math.abs(s.finalDeckRelativeChassisDeg),n.deckReturnRelativeChassisDegMax)&&le(Math.abs(s.finalDeckGravityDeg),n.deckReturnGravityDegMax),
        {chassis:s.finalDeckRelativeChassisDeg,gravity:s.finalDeckGravityDeg},{chassisMax:n.deckReturnRelativeChassisDegMax,gravityMax:n.deckReturnGravityDegMax});
    g('final_motor_hold_idle',s.finalControllerMode==='hold'&&s.finalMotorBusy===false,{mode:s.finalControllerMode,busy:s.finalMotorBusy},'Actual hub hold, no pending move');
    g('after_interval',ge(s.afterSeconds,c.nativeSampling.afterSeconds-0.02),s.afterSeconds,c.nativeSampling.afterSeconds);
    g('motor_envelope',le(s.maxMotorAbsDeg,e.motorAbsDegMax),s.maxMotorAbsDeg,e.motorAbsDegMax);
    g('deck_envelope',ge(s.deckSlopeRangeDeg[0],e.deckGravitySlopeDegMin)&&le(s.deckSlopeRangeDeg[1],e.deckGravitySlopeDegMax),s.deckSlopeRangeDeg,[e.deckGravitySlopeDegMin,e.deckGravitySlopeDegMax]);
    g('chassis_stability',le(s.maxChassisTiltDeg,e.chassisTiltDegMax)&&le(s.maxChassisTranslationMm,e.chassisTranslationMmMax),
        {tiltDeg:s.maxChassisTiltDeg,translationMm:s.maxChassisTranslationMm},{tiltDeg:e.chassisTiltDegMax,translationMm:e.chassisTranslationMmMax});
    g('physical_hinge_closure',le(s.maxHingeGapMm,e.hingeGapMmMax)&&le(s.maxHingeAxisMismatchDeg,e.hingeAxisMismatchDegMax),
        {gapMm:s.maxHingeGapMm,axisDeg:s.maxHingeAxisMismatchDeg},{gapMm:e.hingeGapMmMax,axisDeg:e.hingeAxisMismatchDegMax});
    g('tip_precedes_slide',ge(s.tipBeforeSlideMarginDeg,n.tipBeforeSlideDeckAngleMarginDegMin),s.tipBeforeSlideMarginDeg,n.tipBeforeSlideDeckAngleMarginDegMin);
    for(const [lane,d]of Object.entries(laneDefs)) {
        const q=s.lanes[lane],prefix=`${lane}_${q.configuration}_`,parts=r.runModel.parts.filter(p=>d.body.parts.includes(p.id));
        g(prefix+'free_declared_load',parts.length===c.geometry.payloadPartsEach&&parts.every(p=>p.load===true)&&d.body.role==='load',
            {parts:parts.length,allLoad:parts.every(p=>p.load===true),role:d.body.role},'22 declared LOAD parts, one wholly free load island');
        const blocked=(m.noCollide||[]).some(p=>p.includes(d.body.id)&&p.includes(deck.id));
        g(prefix+'deck_contact_admitted',!blocked||Boolean(m.noCollideParts),{bodyPairBlocked:blocked,localPartFilter:Boolean(m.noCollideParts)},'Payload/deck contact not suppressed; actual contact separately observed');
        g(prefix+'mass_and_com',le(Math.abs(q.dynamics.solverMassKg-c.geometry.payloadCatalogueMassKg),n.payloadMassErrorKgMax)&&
            le(Math.abs(q.prediction.nativeComHeightMm-c.geometry.calculatedComHeightMm[q.configuration]),n.payloadComHeightErrorMmMax),
            {massKg:q.dynamics.solverMassKg,comHeightMm:q.prediction.nativeComHeightMm},
            {massKg:c.geometry.payloadCatalogueMassKg,comHeightMm:c.geometry.calculatedComHeightMm[q.configuration]});
        g(prefix+'unmodified_friction',Math.abs(q.bodyFriction-.4)<1e-12&&Math.abs(s.deckFriction-.4)<1e-12,
            {payload:q.bodyFriction,deck:s.deckFriction},'Both actual body friction coefficients0.4');
        g(prefix+'cold_supported',le(q.coldShiftMm,n.coldPayloadShiftMmMax)&&le(q.coldRelativeTiltDeg,n.coldPayloadRelativeTiltDegMax),
            {shiftMm:q.coldShiftMm,tiltDeg:q.coldRelativeTiltDeg},{shiftMm:n.coldPayloadShiftMmMax,tiltDeg:n.coldPayloadRelativeTiltDegMax});
        g(prefix+'settled_before_tilt',le(q.settledShiftMm,n.preTiltHeldPayloadShiftMmMax)&&le(q.settledRelativeTiltDeg,n.preTiltHeldPayloadRelativeTiltDegMax)&&
            le(q.settledLinearSpeedMS,n.preTiltNativeLinearSpeedMSMax)&&le(q.settledAngularSpeedRadS,n.preTiltNativeAngularSpeedRadSMax),
            {shiftMm:q.settledShiftMm,tiltDeg:q.settledRelativeTiltDeg,linearMS:q.settledLinearSpeedMS,angularRadS:q.settledAngularSpeedRadS},
            {shiftMm:n.preTiltHeldPayloadShiftMmMax,tiltDeg:n.preTiltHeldPayloadRelativeTiltDegMax,linearMS:n.preTiltNativeLinearSpeedMSMax,angularRadS:n.preTiltNativeAngularSpeedRadSMax});
        const expected=q.configuration==='high'?'tip':'slide';
        g(prefix+'first_instability',q.firstInstability===expected,{first:q.firstInstability,tip:q.tip,slide:q.slide},expected);
        g(prefix+'threshold_reference',le(Math.abs(q.referenceErrorDeg??Infinity),q.configuration==='high'?n.tipReferenceErrorDegMax:n.slideReferenceErrorDegMax),
            {event:q.expectedEvent,prediction:q.prediction,errorDeg:q.referenceErrorDeg},`Within${q.configuration==='high'?n.tipReferenceErrorDegMax:n.slideReferenceErrorDegMax} deg`);
        g(prefix+'unobstructed_first_event',q.expectedEvent!==null&&ge(q.preEventCatchClearanceMm,n.preEventCatchClearanceMmMin)&&q.preEventOtherContactFrames===0&&le(q.preEventSidewaysTiltDeg,e.payloadSidewaysTiltBeforeFirstEventDegMax),
            {catchClearanceMm:q.preEventCatchClearanceMm,otherContactFrames:q.preEventOtherContactFrames,sidewaysTiltDeg:q.preEventSidewaysTiltDeg},'First event precedes catch/other-body contact and sideways tip');
        if(q.configuration==='high') {
            g(prefix+'useful_tip_before_slide',le(q.highPreTipBaseTravelMm,n.highBaseTravelBeforeTipMmMax)&&ge(q.maxFreeSignedTipDeg,n.highUsefulSignedTiltDegMin),
                {preTipTravelMm:q.highPreTipBaseTravelMm,maxFreeTipDeg:q.maxFreeSignedTipDeg},{preTipTravelMaxMm:n.highBaseTravelBeforeTipMmMax,tipMinDeg:n.highUsefulSignedTiltDegMin});
            const v=q.angularVelocityConsistency;
            g(prefix+'native_angular_velocity_consistency',ge(v.samples,n.smoothTipSamplesMin)&&le(v.rmsError,n.angularVelocityRmsAbsoluteAllowanceDegS+n.angularVelocityRmsRelativeAllowance*(v.rmsObservedSpeed??0))&&
                le(v.maxError,n.angularVelocityMaxAbsoluteAllowanceDegS+n.angularVelocityMaxRelativeAllowance*(v.maxObservedSpeed??0)),v,
                {samplesMin:n.smoothTipSamplesMin,rms:'5 deg/s +10% of observed RMS',max:'15 deg/s +20% of observed maximum'});
        } else {
            g(prefix+'useful_upright_slide',ge(q.maxFreeSlideMm,n.lowUsefulFreeSlideMmMin)&&q.usefulSlideAtMs!==null&&le(q.maxTiltUntilUsefulSlideDeg,n.lowTiltUntilUsefulSlideDegMax),
                {travelMm:q.maxFreeSlideMm,usefulAtMs:q.usefulSlideAtMs,tiltDeg:q.maxTiltUntilUsefulSlideDeg},
                {travelMinMm:n.lowUsefulFreeSlideMmMin,tiltMaxDeg:n.lowTiltUntilUsefulSlideDegMax});
            const v=q.linearVelocityConsistency;
            g(prefix+'native_linear_velocity_consistency',ge(v.samples,n.smoothVelocitySamplesMin)&&le(v.rmsError,n.linearVelocityRmsAbsoluteAllowanceMS+n.linearVelocityRmsRelativeAllowance*(v.rmsObservedSpeed??0))&&
                le(v.maxError,n.linearVelocityMaxAbsoluteAllowanceMS+n.linearVelocityMaxRelativeAllowance*(v.maxObservedSpeed??0)),v,
                {samplesMin:n.smoothVelocitySamplesMin,rms:'0.002 m/s +5% of observed RMS',max:'0.005 m/s +10% of observed maximum'});
        }
        g(prefix+'retained_on_deck',ge(q.minAcrossMm,c.geometry.deckSurfaceAcrossBoundsMm[0]-e.payloadSupportBoundaryToleranceMm)&&
            le(q.maxAcrossMm,c.geometry.deckSurfaceAcrossBoundsMm[1]+e.payloadSupportBoundaryToleranceMm)&&
            ge(q.minDownhillMm,c.geometry.retainingStructureDownhillBoundsMm[0]-e.payloadSupportBoundaryToleranceMm)&&
            le(q.maxDownhillMm,c.geometry.retainingStructureDownhillBoundsMm[1]+e.payloadSupportBoundaryToleranceMm)&&le(q.maxAcrossDriftMm,e.payloadAcrossDriftMmMax),
            {acrossMm:[q.minAcrossMm,q.maxAcrossMm],downhillMm:[q.minDownhillMm,q.maxDownhillMm],acrossDriftMm:q.maxAcrossDriftMm},
            {across:c.geometry.deckSurfaceAcrossBoundsMm,downhill:c.geometry.retainingStructureDownhillBoundsMm,toleranceMm:e.payloadSupportBoundaryToleranceMm,acrossDriftMaxMm:e.payloadAcrossDriftMmMax},'native retention');
        g(prefix+'no_deck_tunneling',le(q.maxBelowDeckMm,e.payloadColliderBelowDeckMmMax),q.maxBelowDeckMm,e.payloadColliderBelowDeckMmMax,'native retention');
    }
    return {status:gates.every(x=>x.status==='PASS')?'PASS':'FAIL',summary:s,gates,rows};
}

export function judgeTipline(r,options={}) {
    const report=evaluateTipline(r,options);
    if(report.status!=='PASS') {const error=new Error(`Tipline failed: ${report.gates.filter(x=>x.status==='FAIL').map(x=>x.id).join(', ')}`);error.report=report;throw error;}
    return report;
}

function placementComparison(a,b,c) {
    const aa=new Map(a.runModel.parts.map(p=>[p.id,p])),bb=new Map(b.runModel.parts.map(p=>[p.id,p]));
    const changed=[],errors=[];
    if(aa.size!==bb.size)errors.push('part count differs');
    for(const [id,p]of aa) {
        const q=bb.get(id);if(!q){errors.push(`missing ${id}`);continue;}
        for(const k of ['part','color','rotation','load','port'])if(!same(p[k],q[k]))errors.push(`${id}.${k} differs`);
        const delta=sub(q.position,p.position);
        const ballast=/^(left|right)_load_ballast_[0-7]$/.test(id);
        if(ballast) {
            const sign=id.startsWith('left_')?-1:1;
            if(norm(sub(delta,[0,sign*c.geometry.ballastHeightChangeLdu,0]))>1e-9)errors.push(`${id} wrong ballast translation`);
            changed.push({id,deltaLdu:delta});
        } else if(norm(delta)>1e-9)errors.push(`${id} moved outside the ballast comparison`);
    }
    if(changed.length!==16)errors.push('expected exactly16 ballast placements');
    return {pass:errors.length===0,changed,errors,partCount:aa.size,
        normalizedNonBallastSha256:sha([...aa.values()].filter(p=>!/_load_ballast_/.test(p.id)).map(p=>({id:p.id,part:p.part,color:p.color,position:p.position,rotation:p.rotation,load:p.load??false})).sort((p,q)=>p.id.localeCompare(q.id)))};
}

export function evaluateTiplinePair(main,swapped,{contract,...options}={}) {
    const c=contractOf(contract),a=evaluateTipline(main,{...options,variant:'main',contract:c}),b=evaluateTipline(swapped,{...options,variant:'swapped',contract:c}),gates=[];
    addGate(gates,'both_complete_native_runs',a.status==='PASS'&&b.status==='PASS',{main:a.status,swapped:b.status},'Both pass their unchanged per-run gates');
    const placement=placementComparison(main,swapped,c);
    addGate(gates,'only_ballast_heights_changed',placement.pass,placement,'Exactly16 vertical ballast translations; all other placements identical','causal comparison');
    const programA=a.summary?.programSha256,programB=b.summary?.programSha256;
    addGate(gates,'identical_program_bytes',typeof programA==='string'&&programA.length===64&&programA===programB,{main:programA,swapped:programB},'Matching SHA256 of actual executed program bytes','causal comparison');
    for(const configuration of ['low','high']) {
        const p=a.summary&&Object.values(a.summary.lanes).find(x=>x.configuration===configuration),q=b.summary&&Object.values(b.summary.lanes).find(x=>x.configuration===configuration);
        const massDifference=p&&q?Math.abs(p.dynamics.solverMassKg-q.dynamics.solverMassKg):null;
        const heightDifference=p&&q?Math.abs(p.prediction.nativeComHeightMm-q.prediction.nativeComHeightMm):null;
        const eventDifference=p?.expectedEvent&&q?.expectedEvent?Math.abs(p.expectedEvent.deckSlopeDeg-q.expectedEvent.deckSlopeDeg):null;
        const expected=configuration==='high'?'tip':'slide';
        addGate(gates,`${configuration}_follows_ballast_in_both_lanes`,p?.firstInstability===expected&&q?.firstInstability===expected&&
            le(massDifference,c.pairGates.matchedConfigurationMassDifferenceKgMax)&&le(heightDifference,c.pairGates.matchedConfigurationComHeightDifferenceMmMax)&&
            le(eventDifference,c.pairGates.matchedConfigurationEventAngleDifferenceDegMax),
            {first:[p?.firstInstability,q?.firstInstability],massDifferenceKg:massDifference,comHeightDifferenceMm:heightDifference,eventAngleDifferenceDeg:eventDifference},
            {first:expected,massDifferenceKgMax:c.pairGates.matchedConfigurationMassDifferenceKgMax,
                comHeightDifferenceMmMax:c.pairGates.matchedConfigurationComHeightDifferenceMmMax,eventAngleDifferenceDegMax:c.pairGates.matchedConfigurationEventAngleDifferenceDegMax},'causal comparison');
    }
    return {status:gates.every(x=>x.status==='PASS')?'PASS':'FAIL',contractRevision:c.revision,gates,runs:{main:a,swapped:b}};
}

export function judgeTiplinePair(main,swapped,options={}) {
    const report=evaluateTiplinePair(main,swapped,options);
    if(report.status!=='PASS'){const error=new Error('Tipline pair failed; see report.gates and report.runs');error.report=report;throw error;}
    return report;
}

export function frozenPayloadChallenge(record,{variant='main',contract}={}) {
    const c=contractOf(contract),copy=structuredClone(record);
    const ids=[c.markers.leftBase,c.markers.rightBase].map(part=>copy.mechanism.bodies.find(b=>b.parts.includes(part)).id);
    const initial=copy.track[0];
    for(const f of copy.track)for(const id of ids) {
        f.bodies[id]=structuredClone(initial.bodies[id]);
        if(f.extra?.velocities?.[id])f.extra.velocities[id]={linear:[0,0,0],angular:[0,0,0]};
    }
    // Native velocity may be keyed by lane in a diagnostic recording.
    for(const f of copy.track)for(const lane of ['left','right'])if(f.extra?.velocities?.[lane])f.extra.velocities[lane]={linear:[0,0,0],angular:[0,0,0]};
    const report=evaluateTipline(copy,{variant,contract:c});
    const motionFailures=report.gates.filter(x=>x.status==='FAIL'&&/(first_instability|useful_tip|useful_upright_slide|tip_precedes_slide)/.test(x.id));
    return {status:report.status==='FAIL'&&motionFailures.length>=2?'PASS':'FAIL',
        scope:'Altered-recording observer challenge; no physics was executed.',recordingExpectedStatus:'FAIL',
        recordingActualStatus:report.status,motionFailures:motionFailures.map(x=>x.id),
        allFailedGates:report.gates.filter(x=>x.status==='FAIL').map(x=>x.id)};
}
