// SPDX-License-Identifier: BSD-3-Clause
// Contact-stage observations for issue #1435: which collider configuration and
// which contact setting the coplanar resting creep needs. Passive like
// observe.mjs (no motor command, no pose smoothing). Each case changes exactly
// what contact-manifest.json declares: a collider subset, a collider height,
// a synthetic plate, or (test-only, through a wrapper of the Jolt namespace)
// the bodies' mUseManifoldReduction. The product core is not changed.
import {readFileSync} from 'node:fs';
import {createPhysicsCore} from '../../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {sha256,prepareInputs,isolateFrame,summarize} from './observe.mjs';
const root=new URL('./',import.meta.url);
export const contactManifest=JSON.parse(readFileSync(new URL('contact-manifest.json',root)));

// A Jolt namespace whose BodyCreationSettings start with manifold reduction off.
export const withoutManifoldReduction=J=>new Proxy(J,{get(t,k){
    if(k!=='BodyCreationSettings')return t[k];
    const C=t[k];return function(...a){const o=new C(...a);o.mUseManifoldReduction=false;return o;};
}});

const shift=(c,d)=>({...c,position:[c.position[0],c.position[1]+d,c.position[2]]});
function plateMechanism(spec,template) {
    const P=contactManifest.plate,ground=template.bodies.find(b=>b.id==='ground');
    const top=ground.position[1]+ground.colliders[0].halfExtents[1];
    const box=(halfExtents,position,massKg,part)=>({shape:'box',halfExtents,position,part,massKg});
    const cols=[...P.rails.x.map((x,i)=>box(P.rails.halfExtents,[x,0,0],P.rails.massKg,'plate_rail_'+i)),
        box(P.deck.halfExtents,P.deck.position,P.deck.massKg,'plate_deck')];
    if(spec.hoverGapM!==undefined){const h=P.hover.halfExtents[1],r=P.rails.halfExtents[1];
        cols.push(box(P.hover.halfExtents,[P.hover.x,-r+h+spec.hoverGapM,P.hover.z],P.hover.massKg,'plate_hover'));}
    const body={id:'plate',motion:'dynamic',position:[0,top+P.rails.halfExtents[1],0],rotation:[0,0,0,1],
        massKg:cols.reduce((s,c)=>s+c.massKg,0),colliders:cols,parts:cols.map(c=>c.part),friction:P.friction,
        restitution:0,material:'abs',role:'frame',collisionGroup:'plate'};
    return {...template,bodies:[ground,body]};
}

export function buildContactCase(spec,prepared=prepareInputs()) {
    if(spec.build==='plate') {
        const iso=isolateFrame(prepared.get('orrery-coplanar').mechanism);
        const mechanism=plateMechanism(spec,iso.mechanism);
        return {spec,input:null,mechanism,subject:mechanism.bodies[1],collidersRemoved:[],collidersShifted:[]};
    }
    if(spec.build!=='isolated-frame')throw new Error('unknown build '+spec.build);
    const {input}=prepared.get(spec.input),iso=isolateFrame(prepared.get(spec.input).mechanism),F=iso.frame;
    const floor=new RegExp(contactManifest.floorSupportPattern),hover=new Set(contactManifest.hoverParts);
    const keep={undefined:()=>true,rails:c=>c.part.startsWith('base_rail_'),'floor-supports':c=>floor.test(c.part),
        'without-hover':c=>!hover.has(c.part)}[spec.colliders];
    if(!keep)throw new Error('unknown collider selection '+spec.colliders);
    let colliders=F.colliders.filter(keep);
    const collidersRemoved=F.colliders.filter(c=>!keep(c)).map(c=>c.part);
    const collidersShifted=spec.hoverShiftM?colliders.filter(c=>hover.has(c.part)).map(c=>c.part):[];
    if(spec.hoverShiftM)colliders=colliders.map(c=>hover.has(c.part)?shift(c,spec.hoverShiftM):c);
    const subject=colliders===F.colliders?F:{...F,colliders};
    return {spec,input,mechanism:{...iso.mechanism,bodies:[iso.mechanism.bodies[0],subject]},subject,collidersRemoved,collidersShifted};
}

// Lowest point of each collider (box, cylinder, sphere) under a body pose.
const rot=(q,v)=>{const [x,y,z,w]=q,t=[2*(y*v[2]-z*v[1]),2*(z*v[0]-x*v[2]),2*(x*v[1]-y*v[0])];
    return [v[0]+w*t[0]+y*t[2]-z*t[1],v[1]+w*t[1]+z*t[0]-x*t[2],v[2]+w*t[2]+x*t[1]-y*t[0]];};
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export function colliderGaps(colliders,position,rotation,floorTop) {
    return colliders.map(c=>{
        const q=qmul(rotation,c.rotation||[0,0,0,1]),centre=rot(rotation,c.position||[0,0,0]).map((v,k)=>v+position[k]);
        const axisY=[[1,0,0],[0,1,0],[0,0,1]].map(a=>Math.abs(rot(q,a)[1]));
        let ext;
        if(c.shape==='box')ext=c.halfExtents.reduce((s,h,i)=>s+h*axisY[i],0);
        else if(c.shape==='cylinder')ext=c.halfHeight*axisY[1]+c.radius*Math.sqrt(Math.max(0,1-axisY[1]*axisY[1]));
        else if(c.shape==='sphere')ext=c.radius;
        else throw new Error('unsupported collider '+c.shape);
        return centre[1]-ext-floorTop;
    });
}

export function runContactCase(J,built,identities) {
    const {clock,contactTolerancesM:tol}=contactManifest,s=built.spec,id=built.subject.id;
    const engine=s.manifoldReduction===false?withoutManifoldReduction(J):J;
    const ground=built.mechanism.bodies.find(b=>b.id==='ground'),floorTop=ground.position[1]+ground.colliders[0].halfExtents[1];
    const core=createPhysicsCore(engine,built.mechanism,{stepHz:clock.stepHz,recordContacts:true});
    const key=['ground',id].sort().join('|');
    try {
        const dynamics=core.bodyDynamics(id);let manifolds=0;
        const row=step=>{
            const p=core.bodyPose(id),v=core.bodyLinearVelocity(id),w=core.bodyAngularVelocity(id);
            const contact=core.currentContactPairs().some(([a,b])=>[a,b].sort().join('|')===key);
            const total=core.contactPairs().pairs[key]||0,stepManifolds=total-manifolds;manifolds=total;
            const gaps=colliderGaps(built.subject.colliders,p.position,p.rotation,floorTop);
            return [step,core.time,...p.position,...p.rotation,...v,...w,Number(contact),stepManifolds,Math.min(...gaps),
                gaps.filter(g=>g>tol.penetrationSlop&&g<=tol.speculativeDistance).length];
        };
        const rows=[row(0)];
        const stop=core.observeFixedSteps(()=>{rows.push(row(rows.length));});
        for(let i=0;i<clock.steps;i++)core.step(clock.dtSeconds);
        stop();
        return {schemaVersion:contactManifest.schemaVersion,stage:'contact',case:s.id,build:s.build,input:built.input,
            subject:{id,configuredMassKg:built.subject.massKg,colliders:built.subject.colliders.length},
            collidersRemoved:built.collidersRemoved,collidersShifted:built.collidersShifted,
            manifoldReduction:s.manifoldReduction!==false,bodies:built.mechanism.bodies.map(b=>b.id),joints:built.mechanism.joints.map(j=>j.id),
            mechanismSha256:sha256(JSON.stringify(built.mechanism)),motorCommands:[],identities,clock,
            initialDynamics:{solverMassKg:dynamics.solverMassKg,centerOfMassWorld:dynamics.centerOfMassWorld,inertiaKgM2:dynamics.inertiaKgM2},
            rowFields:contactManifest.rowFields,rows,summary:summarize(rows)};
    } finally {core.destroy();}
}
