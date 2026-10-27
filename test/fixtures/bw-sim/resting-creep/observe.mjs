// SPDX-License-Identifier: BSD-3-Clause
// Passive resting-frame observation for issue #1435. No motor command, pose
// edit, material/geometry change or runtime-default change is made.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel} from '../../../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {createPhysicsCore} from '../../../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
const root=new URL('./',import.meta.url),repo=new URL('../../../../',import.meta.url);
export const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
export const sha256=b=>createHash('sha256').update(b).digest('hex');
const LIST_KEYS=['joints','gears','hubs','actuators','couplings','devices','diagnostics'];

export function sourceIdentities() {
    const file=f=>{const b=readFileSync(new URL(f,repo));return {file:f,sha256:sha256(b)};};
    const pin=readFileSync(new URL(manifest.engine.pinSource,repo),'utf8');
    return {core:file(manifest.historicalSources.core.file),catalogue:file(manifest.historicalSources.catalogue.file),
        engine:{version:manifest.engine.version,resolved:pin.match(/const JOLT_PHYSICS_URL = '([^']+)'/)[1],
            integrity:pin.match(/const JOLT_PHYSICS_INTEGRITY = '([^']+)'/)[1]}};
}

export function prepareInputs() {
    const catalog=catalogFrom(JSON.parse(readFileSync(new URL(manifest.historicalSources.catalogue.file,repo),'utf8')));
    const prepared=new Map();
    for(const input of manifest.inputs) {
        const bytes=readFileSync(new URL(input.file,root));
        const {mechanism,issues}=prepareModel(bytes.toString('utf8'),catalog,manifest.preparation);
        prepared.set(input.id,{input:{id:input.id,file:input.file,bytes:bytes.length,sha256:sha256(bytes)},mechanism,issues});
    }
    return prepared;
}

const partIds=body=>body.parts.map(p=>typeof p==='string'?p:p.id);
export function frameBody(mechanism) {
    const hits=mechanism.bodies.filter(b=>manifest.frameParts.every(id=>partIds(b).includes(id)));
    if(hits.length!==1||hits[0].motion!=='dynamic')throw new Error('exactly one dynamic body must carry every frame support');
    return hits[0];
}
export function heaviestBody(mechanism) {
    const dynamic=mechanism.bodies.filter(b=>b.motion==='dynamic').sort((a,b)=>b.massKg-a.massKg);
    if(!dynamic.length||(dynamic[1]&&dynamic[1].massKg===dynamic[0].massKg))throw new Error('no unique heaviest dynamic body');
    return dynamic[0];
}

// Keep the compiled ground and frame bodies exactly (same objects, so mass,
// COM inputs and collider transforms are untouched); remove everything else
// explicitly and enumerate what was removed.
export function isolateFrame(mechanism) {
    const frame=frameBody(mechanism),grounds=mechanism.bodies.filter(b=>b.motion==='static');
    if(grounds.length!==1||grounds[0].id!=='ground')throw new Error('exactly one static ground body expected');
    const keep=new Set(['ground',frame.id]);
    const dropped=mechanism.bodies.filter(b=>!keep.has(b.id));
    const removed={bodies:dropped.map(b=>b.id),parts:dropped.flatMap(partIds).sort()};
    const isolated={...mechanism,bodies:mechanism.bodies.filter(b=>keep.has(b.id))};
    for(const key of LIST_KEYS){removed[key]=(mechanism[key]||[]).map(e=>e.id??e.code??JSON.stringify(e));isolated[key]=[];}
    const inside=pair=>keep.has(pair[0])&&keep.has(pair[1]);
    isolated.noCollide=(mechanism.noCollide||[]).filter(inside);
    isolated.noCollideParts=(mechanism.noCollideParts||[]).filter(inside);
    removed.noCollide=(mechanism.noCollide||[]).filter(p=>!inside(p)).map(p=>p.slice(0,2).join('|'));
    removed.noCollideParts=(mechanism.noCollideParts||[]).filter(p=>!inside(p)).map(p=>p.slice(0,2).join('|'));
    if(isolated.noCollide.length||isolated.noCollideParts.length)throw new Error('ground/frame collision relation must stay native');
    return {mechanism:isolated,removed,frame,ground:grounds[0]};
}

export function buildCase(spec,prepared) {
    const {input,mechanism,issues}=prepared.get(spec.input);
    if(spec.mechanism==='complete') {
        const subject=spec.subject==='frame'?frameBody(mechanism):heaviestBody(mechanism);
        return {spec,input,issues,mechanism,subject,removed:null};
    }
    if(spec.mechanism!=='isolated-frame'||spec.subject!=='frame')throw new Error('unknown case '+spec.id);
    const iso=isolateFrame(mechanism);
    return {spec,input,issues,mechanism:iso.mechanism,subject:iso.frame,removed:iso.removed};
}

const row=(core,step,subjectId)=>{
    const p=core.bodyPose(subjectId),v=core.bodyLinearVelocity(subjectId),w=core.bodyAngularVelocity(subjectId);
    const contact=core.currentContactPairs().some(([a,b])=>(a==='ground'&&b===subjectId)||(b==='ground'&&a===subjectId));
    return [step,core.time,...p.position,...p.rotation,...v,...w,Number(contact)];
};

export function runCase(J,built,identities) {
    const {clock}=manifest;
    const core=createPhysicsCore(J,built.mechanism,{stepHz:clock.stepHz});
    try {
        const dynamics=core.bodyDynamics(built.subject.id);
        const rows=[row(core,0,built.subject.id)];
        const stop=core.observeFixedSteps(()=>{rows.push(row(core,rows.length,built.subject.id));});
        for(let i=0;i<clock.steps;i++)core.step(clock.dtSeconds);
        stop();
        const record={schemaVersion:manifest.schemaVersion,case:built.spec.id,input:built.input,mechanism:built.spec.mechanism,
            subject:{id:built.subject.id,configuredMassKg:built.subject.massKg,parts:partIds(built.subject).length,colliders:built.subject.colliders.length},
            bodies:built.mechanism.bodies.map(b=>b.id),joints:built.mechanism.joints.map(j=>j.id),removed:built.removed,
            issues:built.issues.map(i=>i.code),mechanismSha256:sha256(JSON.stringify(built.mechanism)),motorCommands:[],identities,clock,
            initialDynamics:{solverMassKg:dynamics.solverMassKg,centerOfMassWorld:dynamics.centerOfMassWorld,inertiaKgM2:dynamics.inertiaKgM2},
            rowFields:manifest.rowFields,rows};
        record.summary=summarize(rows);
        return record;
    } finally {core.destroy();}
}

// Producer-side summary; the standalone reader recomputes it independently.
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const unit=q=>{const n=Math.hypot(...q);return q.map(v=>v/n);};
const qrot=(q,v)=>{const r=qmul(qmul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return r.slice(0,3);};
export function summarize(rows) {
    const q0=unit(rows[0].slice(5,9)),inv0=[-q0[0],-q0[1],-q0[2],q0[3]],p0=rows[0].slice(2,5);
    let maxD=0,maxYaw=0,maxTilt=0,minY=Infinity,maxY=-Infinity,yaw=0,prev=0,contactSteps=0;
    for(const r of rows) {
        const d=Math.hypot(r[2]-p0[0],r[4]-p0[2]);maxD=Math.max(maxD,d);
        minY=Math.min(minY,r[3]);maxY=Math.max(maxY,r[3]);
        const rel=qmul(unit(r.slice(5,9)),inv0),x=qrot(rel,[1,0,0]),up=qrot(rel,[0,1,0]);
        const raw=Math.atan2(-x[2],x[0]);let delta=raw-prev;
        delta-=2*Math.PI*Math.round(delta/(2*Math.PI));yaw+=delta;prev=raw;
        maxYaw=Math.max(maxYaw,Math.abs(yaw));
        maxTilt=Math.max(maxTilt,Math.atan2(Math.hypot(up[0],up[2]),up[1]));
        contactSteps+=r[15];
    }
    const last=rows.at(-1);
    return {finalHorizontalM:Math.hypot(last[2]-p0[0],last[4]-p0[2]),maxHorizontalM:maxD,finalYawDeg:yaw*180/Math.PI,
        maxAbsYawDeg:maxYaw*180/Math.PI,verticalRangeM:maxY-minY,maxTiltDeg:maxTilt*180/Math.PI,groundContactRows:contactSteps};
}
