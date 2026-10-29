// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Independent observations from actual recorded body poses. Predictions never
// supply output positions, angles, crossings, or periods.
// Observer revision 2 distinguishes the unstepped constraint initialization
// from the fixed cord length commanded before native integration. See the
// retained observer-diagnostic.json; no physical threshold is relaxed.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

import {observeAddon} from './sim-lab-addon-judge.mjs';

const add = (a,b) => a.map((x,i) => x+b[i]);
const sub = (a,b) => a.map((x,i) => x-b[i]);
const scale = (a,s) => a.map(x => x*s);
const dot = (a,b) => a.reduce((s,x,i) => s+x*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a,1/norm(a));
const clamp = x => Math.max(-1,Math.min(1,x));
const deg = x => x*180/Math.PI;
const rad = x => x*Math.PI/180;
const wrap = x => Math.atan2(Math.sin(x),Math.cos(x));
const mid = (a,b) => scale(add(a,b),0.5);
const mul = ([x,y,z,w],[a,b,c,d]) => [w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const conj = ([x,y,z,w]) => [-x,-y,-z,w];
const rot = (q,v) => mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const maximum = xs => xs.length ? Math.max(...xs) : null;
const minimum = xs => xs.length ? Math.min(...xs) : null;
const mean = xs => xs.length ? xs.reduce((s,x)=>s+x,0)/xs.length : null;
const span = xs => xs.length ? maximum(xs)-minimum(xs) : null;
const absmax = xs => maximum(xs.map(Math.abs));
const median = xs => {
    if (!xs.length) return null;
    const s=xs.slice().sort((a,b)=>a-b),i=Math.floor(s.length/2);
    return s.length%2 ? s[i] : (s[i-1]+s[i])/2;
};
const unwrap = xs => {
    if (!xs.length) return [];
    let previous=xs[0],total=previous;
    return xs.map(x=>{total+=wrap(x-previous);previous=x;return total;});
};
const sha = x => createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const readContract = value => typeof value==='string' ? JSON.parse(readFileSync(value,'utf8')) : value;
const varOf = (frame,name) => frame.extra?.[name] ?? frame.extra?.variables?.[name];
const isHeld = value => value===true || value===1 || value==='1';

function required(condition,message) {
    if (!condition) throw new Error(`TwistSpan observer input: ${message}`);
}

function sameDirectionCrossings(rows,hysteresisDeg=0.1) {
    // Hysteresis suppresses zero-level numerical chatter. No expected period
    // participates in selecting, generating, or interpolating a crossing.
    const times=[];
    let armed=false;
    for (let i=0;i<rows.length;i++) {
        const current=rows[i];
        if (current.relativeYawDeg<=-hysteresisDeg) armed=true;
        if (!armed || i===0) continue;
        const previous=rows[i-1];
        if (previous.relativeYawDeg<0 && current.relativeYawDeg>=0) {
            const fraction=-previous.relativeYawDeg/(current.relativeYawDeg-previous.relativeYawDeg);
            times.push(previous.t+(current.t-previous.t)*fraction);
            armed=false;
        }
    }
    return times;
}

function finitePose(pose) {
    return pose && Array.isArray(pose.position) && pose.position.length===3 &&
        Array.isArray(pose.rotation) && pose.rotation.length===4 &&
        [...pose.position,...pose.rotation].every(finite);
}

/**
 * Expected result extras:
 * r.setup.payloadDynamics / baseDynamics from core.bodyDynamics(...).
 * f.extra.{stage,held,completed,failed,motorAngleDeg,ropes,controllerMode}.
 * The four program variables may instead be under f.extra.variables.
 * f.t and r.finishedAt use the native harness's milliseconds.
 */
export function measureTwistspan(r,{variant='outer',contract:contractInput}={}) {
    const contract=readContract(contractInput);
    required(contract?.nativeGates && contract?.qualifiedEnvelope,'pass the frozen contract object or its path');
    required(variant==='outer' || variant==='inner','variant must be outer or inner');
    required(Array.isArray(r.track) && r.track.length>1,'nonempty native track with at least two frames');
    required(r.mechanism && r.runModel,'mechanism and runModel');
    const o=observeAddon(r,'hub'), m=r.mechanism;
    const payload=o.body('payload_bar'),upper=o.body('upper_bar'),base=o.base;
    const owns=id=>m.bodies.filter(b=>b.parts.includes(id));
    for (const id of ['hub','upper_bar','payload_bar']) required(owns(id).length===1,`unambiguous owner of ${id}`);
    required(new Set([payload.id,upper.id,base.id]).size===3,'chassis, upper rotor and passive payload are separate bodies');
    const ropes=m.couplings.filter(c=>c.kind==='rope');
    required(ropes.length===2,'exactly two rope couplings are required for measurement');
    const motor=m.joints.find(j=>j.motor?.port==='A');
    required(motor,'motor A hinge');
    const pd=r.setup?.payloadDynamics;
    required(pd && finite(pd.solverMassKg) && pd.solverMassKg>0,'setup.payloadDynamics.solverMassKg');
    required(Array.isArray(pd.inertiaKgM2) && pd.inertiaKgM2.length===3 && pd.inertiaKgM2.every(row=>Array.isArray(row)&&row.length===3&&row.every(finite)), 'setup.payloadDynamics.inertiaKgM2');
    const frames=r.track;
    for(let i=0;i<frames.length;i++) {
        required(finite(frames[i].t)&&frames[i].t>=0,'finite nonnegative frame time');
        if(i) required(frames[i].t>frames[i-1].t,'strictly increasing frame times');
        for(const b of m.bodies.filter(b=>b.motion==='dynamic')) required(finitePose(frames[i].bodies?.[b.id]),`finite actual pose for ${b.id} at ${frames[i].t}`);
    }
    const bodyWorldPoint=(frame,attachment)=>add(frame.bodies[attachment.body].position,rot(frame.bodies[attachment.body].rotation,attachment.local));
    const chassisPoint=(frame,point)=>add(base.position,rot(base.rotation,rot(conj(frame.bodies[base.id].rotation),sub(point,frame.bodies[base.id].position))));
    const ropeEnds=frame=>ropes.map(c=>({upper:chassisPoint(frame,bodyWorldPoint(frame,c.points.at(-1))),lower:chassisPoint(frame,bodyWorldPoint(frame,c.hook))}));
    const initialRopeEnds=ropeEnds(frames[0]);
    const upperHalfSpacingM=norm(sub(initialRopeEnds[0].upper,initialRopeEnds[1].upper))/2;
    const lowerHalfSpacingM=norm(sub(initialRopeEnds[0].lower,initialRopeEnds[1].lower))/2;
    const lengthM=mean(ropes.map(c=>c.lengthM));
    const verticalDatumM=Math.sqrt(lengthM**2-(upperHalfSpacingM-lowerHalfSpacingM)**2);
    required(finite(lengthM)&&lengthM>0 && finite(verticalDatumM)&&verticalDatumM>0,'positive cord length and vertical datum');
    const gravity=r.setup?.gravity || m.gravity || [0,-9.81,0];
    const gravityFactor=finite(pd.gravityFactor)?pd.gravityFactor:1;
    const g=norm(gravity)*gravityFactor;
    const payloadInitialRotation=r.setup?.payloadPose?.rotation || payload.rotation;
    const verticalLocal=rot(conj(payloadInitialRotation),[0,1,0]);
    const inertiaYawKgM2=dot(verticalLocal,pd.inertiaKgM2.map(row=>dot(row,verticalLocal)));
    required(inertiaYawKgM2>0 && g>0,'positive yaw inertia and effective gravity');
    const predictedPeriodSeconds=2*Math.PI*Math.sqrt(inertiaYawKgM2*verticalDatumM/(pd.solverMassKg*g*upperHalfSpacingM*lowerHalfSpacingM));
    const upperVectors=frames.map(f=>sub(o.point(f,'upper_bar',[0,0,120]),o.point(f,'upper_bar',[0,0,-120])));
    const payloadVectors=frames.map(f=>sub(o.point(f,'payload_bar',[0,0,120]),o.point(f,'payload_bar',[0,0,-120])));
    const initialPayloadAxis=unit(sub(o.initial('payload_bar',[0,0,120]),o.initial('payload_bar',[0,0,-120])));
    const horizontalMarkerAxis=unit([initialPayloadAxis[0],0,initialPayloadAxis[2]]);
    const initialTransverse=unit(cross([0,1,0],horizontalMarkerAxis));
    required(initialTransverse.every(finite)&&Math.abs(dot(initialPayloadAxis,initialTransverse))<1e-10,
        'independent perpendicular transverse observation axis');
    const upperYaw=unwrap(upperVectors.map(v=>Math.atan2(-v[2],v[0])));
    const payloadYaw=unwrap(payloadVectors.map(v=>Math.atan2(-v[2],v[0])));
    const initialUpperCenter=mid(initialRopeEnds[0].upper,initialRopeEnds[1].upper);
    const initialLowerCenter=mid(initialRopeEnds[0].lower,initialRopeEnds[1].lower);
    const initialOffset=sub(initialLowerCenter,initialUpperCenter);
    const baseStart=frames[0].bodies[base.id].position;
    const rows=frames.map((f,i)=>{
        const ends=ropeEnds(f),upperCenter=mid(ends[0].upper,ends[1].upper),lowerCenter=mid(ends[0].lower,ends[1].lower);
        const relativeYaw=payloadYaw[i]-upperYaw[i];
        const verticalSeparationM=upperCenter[1]-lowerCenter[1];
        const expectedVerticalM=Math.sqrt(lengthM**2-upperHalfSpacingM**2-lowerHalfSpacingM**2+2*upperHalfSpacingM*lowerHalfSpacingM*Math.cos(relativeYaw));
        const offset=sub(lowerCenter,upperCenter),offsetDrift=sub(offset,initialOffset);
        const payloadAxis=unit(payloadVectors[i]);
        const payloadTransverse=unit(o.vector(f,'payload_bar',initialTransverse));
        const payloadUp=unit(o.vector(f,'payload_bar',[0,1,0]));
        const ropeTelemetry=f.extra?.ropes;
        const ropeRows=ends.map((e,k)=>{
            const distanceM=norm(sub(e.lower,e.upper));
            const telemetry=ropeTelemetry?.[k];
            return {id:ropes[k].id,upper:e.upper,lower:e.lower,distanceMm:distanceM*1000,
                declaredLengthMm:ropes[k].lengthM*1000,
                lengthErrorMm:(distanceM-ropes[k].lengthM)*1000,
                freeMm:finite(telemetry?.free)?telemetry.free*1000:null,
                freeLengthErrorMm:finite(telemetry?.free)?(telemetry.free-ropes[k].lengthM)*1000:null,
                tensionN:finite(telemetry?.tension)?telemetry.tension:null};
        });
        const motorAngle=Number(f.extra?.motorAngleDeg ?? f.extra?.motorAngle ?? f.extra?.angle ?? deg(f.joints[motor.id].angle));
        return {t:f.t,phase:f.phase,stage:Number(varOf(f,'stage')),held:isHeld(varOf(f,'held')),
            completed:Number(varOf(f,'completed')),failed:Number(varOf(f,'failed')),
            motorAngleDeg:motorAngle,upperYawDeg:deg(upperYaw[i]-upperYaw[0]),
            payloadYawDeg:deg(payloadYaw[i]-payloadYaw[0]),relativeYawDeg:deg(relativeYaw),
            upperCenter,lowerCenter,payloadCenter:o.point(f,'payload_bar',[0,0,0]),
            riseMm:(verticalDatumM-verticalSeparationM)*1000,
            predictedRiseMm:(verticalDatumM-expectedVerticalM)*1000,
            riseEquationErrorMm:(expectedVerticalM-verticalSeparationM)*1000,
            horizontalCentreDriftMm:Math.hypot(offsetDrift[0],offsetDrift[2])*1000,
            payloadLongitudinalTiltDeg:deg(Math.asin(clamp(payloadAxis[1]))),
            payloadTransverseTiltDeg:deg(Math.asin(clamp(payloadTransverse[1]))),
            payloadTiltDeg:deg(Math.acos(clamp(payloadUp[1]))),
            chassisTiltDeg:o.tilt(f),chassisTranslationMm:norm(sub(f.bodies[base.id].position,baseStart))*1000,
            motorHingeGapMm:o.gap(f),motorAxisMismatchDeg:o.axisGap(f),
            motorBusy:Boolean(f.busy?.A),controllerMode:f.extra?.controllerMode ?? null,ropes:ropeRows};
    });
    const holdRows=rows.filter(x=>x.phase==='program' && x.stage===1 && x.held);
    // Motor controller settling is excluded from period estimation. This fixed
    // 0.5 s rule is declared before any native output is examined.
    const fitRows=holdRows.length?holdRows.filter(x=>x.t>=holdRows[0].t+500):[];
    const crossingsMs=sameDirectionCrossings(fitRows);
    const periodsSeconds=crossingsMs.slice(1).map((t,i)=>(t-crossingsMs[i])/1000);
    const periodSeconds=median(periodsSeconds);
    const periodMean=mean(periodsSeconds);
    const cycleScatter=periodMean===null?null:Math.sqrt(mean(periodsSeconds.map(x=>(x-periodMean)**2)))/periodMean;
    const programRows=rows.filter(x=>x.phase==='program');
    const final=rows.at(-1);
    const allRopeRows=rows.flatMap(x=>x.ropes);
    const activeRopeRows=programRows.flatMap(x=>x.ropes);
    // At t=0, createRopes has only initialized DistanceConstraint from the
    // float32 measured endpoint separation. beforeStep has not yet assigned
    // the declared commanded free length. Every actual integrated snapshot
    // has t>0; preserve initialization explicitly instead of changing its
    // value or excluding it from any physical geometry/envelope measurement.
    const advancedRopeRows=rows.filter(x=>x.t>0).flatMap(x=>x.ropes);
    const freeLengthInitializationFrames=rows.map((x,frameIndex)=>({x,frameIndex})).filter(({x})=>x.t===0).map(({x,frameIndex})=>({
        frameIndex,t:x.t,phase:x.phase,reason:'Unstepped DistanceConstraint initialization; commanded length applies from first native advance',
        ropes:x.ropes.map(c=>({id:c.id,freeMm:c.freeMm,declaredLengthMm:c.declaredLengthMm,initializationErrorMm:c.freeLengthErrorMm}))
    }));
    const deltasMs=rows.slice(1).map((x,i)=>x.t-rows[i].t);
    const ropeSupport=ropes.map((c,k)=>{
        const values=programRows.map(x=>x.ropes[k].tensionN);
        const windowSize=Math.max(1,Math.ceil(100/(median(deltasMs)||1)));
        const means=[];
        for(let i=0;i+windowSize<=values.length;i++) {
            const w=values.slice(i,i+windowSize);
            if(w.every(finite)) means.push(mean(w));
        }
        let zeroRun=0,longestZeroRun=0;
        for(const value of values) {zeroRun=value===0?zeroRun+1:0;longestZeroRun=Math.max(longestZeroRun,zeroRun);}
        return {id:c.id,min100msMeanTensionN:minimum(means),zeroSamples:values.filter(x=>x===0).length,
            longestZeroRunMs:longestZeroRun*(median(deltasMs)||0),minimumTensionN:minimum(values.filter(finite)),maximumTensionN:maximum(values.filter(finite))};
    });
    const summary={
        variant,observerRevision:'twistspan-observer-v2',contractRevision:contract.revision,contractSha256:sha(contract),
        programSha256:r.programSha256 || r.setup?.programSha256 || null,samples:rows.length,
        programSamples:programRows.length,holdSamples:holdRows.length,fitSamples:fitRows.length,
        observedStartMs:rows[0].t,observedEndMs:final.t,frameIntervalMs:{min:minimum(deltasMs),median:median(deltasMs),max:maximum(deltasMs)},
        coldDurationMs:rows.filter(x=>x.phase==='cold').length?maximum(rows.filter(x=>x.phase==='cold').map(x=>x.t))-minimum(rows.filter(x=>x.phase==='cold').map(x=>x.t)):0,
        afterDurationMs:finite(r.finishedAt)?final.t-r.finishedAt:null,
        finishedAtMs:r.finishedAt,programElapsedMs:finite(r.finishedAt)&&programRows.length?r.finishedAt-programRows[0].t:null,
        completed:final.completed,failed:final.failed,finalMotorAngleDeg:final.motorAngleDeg,
        finalMotorBusy:final.motorBusy,finalControllerMode:final.controllerMode,
        cordLengthMm:lengthM*1000,upperHalfSpacingMm:upperHalfSpacingM*1000,lowerHalfSpacingMm:lowerHalfSpacingM*1000,
        payloadSolverMassKg:pd.solverMassKg,payloadConfiguredMassKg:pd.configuredMassKg,
        payloadYawInertiaKgM2:inertiaYawKgM2,payloadInertiaTensorKgM2:pd.inertiaKgM2,
        payloadMassAdjusted:pd.massAdjusted,payloadInertiaAdjusted:pd.inertiaAdjusted,effectiveGravity:g,
        predictedPeriodSeconds,measuredPeriodSeconds:periodSeconds,periodsSeconds,crossingsMs,
        cycles:periodsSeconds.length,periodCycleScatter:cycleScatter,
        periodRelativeError:periodSeconds===null?null:Math.abs(periodSeconds/predictedPeriodSeconds-1),
        passiveYawPeakToPeakDeg:span(fitRows.map(x=>x.payloadYawDeg)),
        relativeYawPeakToPeakDeg:span(fitRows.map(x=>x.relativeYawDeg)),
        maxMotorAbsDeg:absmax(rows.map(x=>x.motorAngleDeg)),
        maxRelativeYawAbsDeg:absmax(rows.map(x=>x.relativeYawDeg)),
        maxPayloadRollPitchDeg:maximum(rows.flatMap(x=>[Math.abs(x.payloadLongitudinalTiltDeg),Math.abs(x.payloadTransverseTiltDeg)])),
        maxPayloadTiltDeg:maximum(rows.map(x=>x.payloadTiltDeg)),maxChassisTiltDeg:maximum(rows.map(x=>x.chassisTiltDeg)),
        maxChassisTranslationMm:maximum(rows.map(x=>x.chassisTranslationMm)),
        maxHorizontalCentreDriftMm:maximum(rows.map(x=>x.horizontalCentreDriftMm)),
        maxCordLengthErrorMm:absmax(allRopeRows.map(x=>x.lengthErrorMm)),
        maxFreeLengthErrorMm:absmax(advancedRopeRows.map(x=>x.freeLengthErrorMm).filter(finite)),
        maxFreeLengthErrorMmAllFrames:absmax(allRopeRows.map(x=>x.freeLengthErrorMm).filter(finite)),
        fixedCordFreeLengthScope:'All observed frames after the first native integration (t>0); unstepped initialization reported separately',
        freeLengthInitializationFrames,
        payloadTiltBasis:{initialLongitudinal:initialPayloadAxis,initialTransverse},
        maxRiseEquationErrorMm:absmax(rows.map(x=>x.riseEquationErrorMm)),
        maxObservedRiseMm:maximum(rows.map(x=>x.riseMm)),
        holdMotorArrivalErrorDeg:absmax(holdRows.map(x=>x.motorAngleDeg-20)),
        maxMotorHingeGapMm:maximum(rows.map(x=>x.motorHingeGapMm)),maxMotorAxisMismatchDeg:maximum(rows.map(x=>x.motorAxisMismatchDeg)),
        ropeTelemetryComplete:activeRopeRows.every(x=>finite(x.freeMm)&&finite(x.tensionN)&&x.tensionN>=0),
        ropeSupport,
        bodyIds:{chassis:base.id,upper:upper.id,payload:payload.id},
        topology:{dynamicAssemblies:m.bodies.filter(b=>b.motion==='dynamic').length,
            hubPlacements:r.runModel.parts.filter(p=>p.part==='45601.dat').length,
            actuators:m.actuators.length,actuatorPorts:m.actuators.map(a=>a.port),
            mechanicalJoints:m.joints.length,payloadMechanicalJoints:m.joints.filter(j=>[j.body1,j.body2].includes(payload.id)).length,
            ropeCouplings:ropes.length,fixedRopes:ropes.every(c=>c.drumJoint===null),
            correctRopeBodies:ropes.every(c=>c.points.length===1 && c.points[0].body===upper.id && c.hook.body===payload.id)},
        diagnostics:r.issues || [],
        placementSha256:sha(r.runModel.parts.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(p=>({id:p.id,part:p.part,color:p.color,position:p.position,rotation:p.rotation})))
    };
    return {rows,summary,contract};
}

/** Gather every gate result, preserving all failures for review. */
export function evaluateTwistspan(r,options={}) {
    const measured=measureTwistspan(r,options),{summary:s,contract:c}=measured;
    const gates=[];
    const gate=(name,passed,value,limit)=>gates.push({name,passed:Boolean(passed),value,limit});
    const finiteBelow=(name,value,limit)=>gate(name,finite(value)&&value<=limit,value,`<= ${limit}`);
    const finiteAbove=(name,value,limit)=>gate(name,finite(value)&&value>=limit,value,`>= ${limit}`);
    const t=s.topology,n=c.nativeGates,e=c.qualifiedEnvelope;
    gate('diagnostics_empty',s.diagnostics.length===0,s.diagnostics,[]);
    gate('three_dynamic_assemblies',t.dynamicAssemblies===c.topology.dynamicAssemblies,t.dynamicAssemblies,c.topology.dynamicAssemblies);
    gate('one_hub',t.hubPlacements===c.topology.hubs,t.hubPlacements,c.topology.hubs);
    gate('one_motor_A',t.actuators===1&&t.actuatorPorts.length===1&&t.actuatorPorts[0]==='A',t.actuatorPorts,['A']);
    gate('two_fixed_direct_ropes',t.ropeCouplings===2&&t.fixedRopes&&t.correctRopeBodies,t,'two direct fixed cords from upper rotor to passive payload');
    gate('payload_no_mechanical_joint',t.payloadMechanicalJoints===0,t.payloadMechanicalJoints,0);
    gate('finite_program_completed',s.completed===1&&s.failed===0&&finite(s.finishedAtMs),{completed:s.completed,failed:s.failed,finishedAtMs:s.finishedAtMs},{completed:1,failed:0});
    finiteBelow('watchdog_seconds',s.programElapsedMs===null?null:s.programElapsedMs/1000,c.program.watchdogSeconds);
    gate('final_motor_idle_hold',!s.finalMotorBusy&&s.finalControllerMode==='hold',{busy:s.finalMotorBusy,mode:s.finalControllerMode},{busy:false,mode:'hold'});
    finiteBelow('final_motor_datum_error_deg',Math.abs(s.finalMotorAngleDeg),n.encoderArrivalErrorDegMax);
    finiteBelow('held_motor_arrival_error_deg',s.holdMotorArrivalErrorDeg,n.encoderArrivalErrorDegMax);
    finiteAbove('cold_observation_seconds',s.coldDurationMs/1000,n.coldSeconds-0.002);
    finiteAbove('after_observation_seconds',s.afterDurationMs===null?null:s.afterDurationMs/1000,n.afterSeconds-0.002);
    finiteAbove('measured_output_cycles',s.cycles,n.cyclesMin);
    finiteAbove('passive_yaw_peak_to_peak_deg',s.passiveYawPeakToPeakDeg,n.passiveYawPeakToPeakDegMin);
    finiteBelow('period_relative_error',s.periodRelativeError,n.periodRelativeErrorMax);
    if(finite(n.periodCycleScatterMax)) finiteBelow('period_cycle_scatter',s.periodCycleScatter,n.periodCycleScatterMax);
    finiteBelow('motor_abs_deg',s.maxMotorAbsDeg,e.motorAbsDegMax);
    finiteBelow('payload_relative_yaw_abs_deg',s.maxRelativeYawAbsDeg,e.payloadRelativeYawAbsDegMax);
    finiteBelow('payload_roll_pitch_deg',s.maxPayloadRollPitchDeg,e.payloadRollPitchDegMax);
    finiteBelow('chassis_tilt_deg',s.maxChassisTiltDeg,e.chassisTiltDegMax);
    finiteBelow('chassis_translation_mm',s.maxChassisTranslationMm,e.chassisTranslationMmMax);
    finiteBelow('payload_horizontal_centre_drift_mm',s.maxHorizontalCentreDriftMm,e.payloadHorizontalCentreDriftMmMax);
    finiteBelow('cord_length_error_mm',s.maxCordLengthErrorMm,n.cordLengthErrorMmMax);
    finiteBelow('rise_equation_error_mm',s.maxRiseEquationErrorMm,n.riseEquationErrorMmMax);
    gate('native_rope_telemetry_present',s.ropeTelemetryComplete,s.ropeTelemetryComplete,true);
    finiteBelow('native_fixed_cord_free_length_error_mm',s.maxFreeLengthErrorMm,n.fixedCordCommandFreeLengthErrorMmMax ?? 1e-6);
    const expectedLengthMm=c.units.cordLengthLdu*c.units.lduMm;
    const expectedHalfSpacingMm=c.units[s.variant==='inner'?'innerHalfSpacingLdu':'outerHalfSpacingLdu']*c.units.lduMm;
    gate('declared_cord_length',Math.abs(s.cordLengthMm-expectedLengthMm)<1e-6,s.cordLengthMm,expectedLengthMm);
    gate('matched_declared_attachment_spacing',Math.abs(s.upperHalfSpacingMm-expectedHalfSpacingMm)<0.001&&Math.abs(s.lowerHalfSpacingMm-expectedHalfSpacingMm)<0.001,{upper:s.upperHalfSpacingMm,lower:s.lowerHalfSpacingMm},expectedHalfSpacingMm);
    return {status:gates.every(x=>x.passed)?'PASS':'FAIL',scope:'exported native experiment and declared observation envelope',summary:s,gates,rows:measured.rows};
}

export function judgeTwistspan(r,options={}) {
    const report=evaluateTwistspan(r,options);
    if(report.status!=='PASS') {
        const error=new Error(`TwistSpan ${options.variant||'outer'} failed: ${report.gates.filter(g=>!g.passed).map(g=>g.name).join(', ')}`);
        error.report=report;
        throw error;
    }
    return report;
}

export function evaluateTwistspanPair(outer,inner,{contract,...options}={}) {
    const a=evaluateTwistspan(outer,{...options,variant:'outer',contract});
    const b=evaluateTwistspan(inner,{...options,variant:'inner',contract});
    const c=readContract(contract),gates=[];
    const gate=(name,passed,value,limit)=>gates.push({name,passed:Boolean(passed),value,limit});
    const ratio=finite(a.summary.measuredPeriodSeconds)&&finite(b.summary.measuredPeriodSeconds)?b.summary.measuredPeriodSeconds/a.summary.measuredPeriodSeconds:null;
    gate('outer_native_gates',a.status==='PASS',a.status,'PASS');
    gate('inner_native_gates',b.status==='PASS',b.status,'PASS');
    gate('identical_program_bytes',/^[a-f0-9]{64}$/.test(a.summary.programSha256||'') && a.summary.programSha256===b.summary.programSha256,
        {outer:a.summary.programSha256,inner:b.summary.programSha256},'identical SHA-256 of executed program bytes');
    gate('identical_rigid_placements',a.summary.placementSha256===b.summary.placementSha256,{outer:a.summary.placementSha256,inner:b.summary.placementSha256},'identical');
    gate('identical_payload_mass',Math.abs(a.summary.payloadSolverMassKg-b.summary.payloadSolverMassKg)<=1e-10,{outer:a.summary.payloadSolverMassKg,inner:b.summary.payloadSolverMassKg},'difference <= 1e-10 kg');
    const inertiaDifference=maximum(a.summary.payloadInertiaTensorKgM2.flatMap((row,i)=>row.map((x,j)=>Math.abs(x-b.summary.payloadInertiaTensorKgM2[i][j]))));
    gate('identical_payload_inertia',inertiaDifference<=1e-12,inertiaDifference,'<= 1e-12 kg m²');
    gate('identical_cord_length',Math.abs(a.summary.cordLengthMm-b.summary.cordLengthMm)<1e-6,{outer:a.summary.cordLengthMm,inner:b.summary.cordLengthMm},'identical');
    gate('half_attachment_spacing',Math.abs(a.summary.upperHalfSpacingMm/2-b.summary.upperHalfSpacingMm)<0.001&&Math.abs(a.summary.lowerHalfSpacingMm/2-b.summary.lowerHalfSpacingMm)<0.001,{outer:a.summary.upperHalfSpacingMm,inner:b.summary.upperHalfSpacingMm},'inner = outer / 2');
    gate('inner_outer_measured_period_ratio',finite(ratio)&&ratio>=c.nativeGates.innerOuterPeriodRatioMin&&ratio<=c.nativeGates.innerOuterPeriodRatioMax,ratio,[c.nativeGates.innerOuterPeriodRatioMin,c.nativeGates.innerOuterPeriodRatioMax]);
    return {status:gates.every(g=>g.passed)?'PASS':'FAIL',scope:'physical attachment-spacing comparison with invariant payload and program',periodRatio:ratio,gates,outer:a,inner:b};
}

export function judgeTwistspanPair(outer,inner,options={}) {
    const report=evaluateTwistspanPair(outer,inner,options);
    if(report.status!=='PASS') {
        const error=new Error(`TwistSpan comparison failed: ${report.gates.filter(g=>!g.passed).map(g=>g.name).join(', ')}`);
        error.report=report;
        throw error;
    }
    return report;
}
