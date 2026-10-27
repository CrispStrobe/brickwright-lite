// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Diagnostic checks, not an admission signature. A reviewed passive-motion
// oracle and actual app/persistence checks remain necessary for qualification.
import {solidOverlaps} from '../../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {shaftEngagement} from '../../overlay/scratch-gui/src/lib/bw-sim/kinds/pin-axle.js';
import {motorPhaseMeta} from '../../overlay/scratch-gui/src/lib/bw-sim/model/motor-phase.js';
const mv=(m,v)=>[0,1,2].map(i=>m[i*3]*v[0]+m[i*3+1]*v[1]+m[i*3+2]*v[2]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const transform=(p,c)=>({...c,part:p.id,position:mv(p.rotation,c.position).map((v,i)=>v+p.position[i]),axis:mv(p.rotation,c.axis)});

export function checkIntakeStructure(prepared,catalog,{fixedMotorPorts=[],drivenParts={},fixedParts=[]}={}) {
    const {model,mechanism}=prepared,errors=[],advisories=[];
    const add=(code,parts,message)=>errors.push({code,parts,message});
    if(!mechanism||!model?.parts?.length)return{ok:false,errors:[{code:'empty-mechanism',parts:[],message:'No compiled model'}],advisories};
    const seen=new Set();
    for(const p of model.parts){
        if(seen.has(p.id))add('duplicate-id',[p.id],'Semantic part IDs must be unique');seen.add(p.id);
        const m=p.rotation,det=m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
        const columns=[0,1,2].map(i=>[m[i],m[i+3],m[i+6]]);
        if(![...p.position,...m].every(Number.isFinite)||Math.abs(det-1)>1e-5||columns.some((a,i)=>columns.some((b,j)=>Math.abs(dot(a,b)-(i===j?1:0))>1e-5)))add('non-rigid-placement',[p.id],'Use a proper rigid placement matrix');
    }
    // Only physically retaining constraints provide structural reachability.
    // A gear ratio or a chain transmission does not provide a shaft bearing.
    const links=[...mechanism.joints];
    for(const c of mechanism.couplings||[]){
        if(c.kind==='universalJoint')links.push({body1:c.body1,body2:c.body2});
        if(c.kind==='rope')for(const p of c.points||[])links.push({body1:p.body,body2:c.hook.body});
    }
    const roots=new Set((mechanism.hubs||[]).map(h=>h.body)),reached=new Set(roots),pending=[...roots];
    while(pending.length){const at=pending.shift();for(const j of links){const next=j.body1===at?j.body2:j.body2===at?j.body1:null;if(next&&next!=='ground'&&next!=='world'&&!reached.has(next)){reached.add(next);pending.push(next);}}}
    if(!roots.size)add('missing-hub',[],'No physical hub body');
    for(const id of fixedParts)if(!mechanism.bodies.some(b=>roots.has(b.id)&&b.parts.includes(id)))add('fixed-part-not-mounted',[id],'A declared fixed bearing or support must belong to the rigid chassis, not merely connect through the moving linkage');
    for(const b of mechanism.bodies)if(b.motion==='dynamic'&&!reached.has(b.id)&&b.role!=='load')add('disconnected-assembly',b.parts,'No retaining connection to a hub');
    for(const port of new Set([...fixedMotorPorts,...Object.keys(drivenParts)]))if(mechanism.actuators.filter(a=>a.port===port).length!==1)add('missing-or-ambiguous-drive',[port],'Each declared input must resolve to exactly one real motor');
    for(const a of mechanism.actuators){
        const j=mechanism.joints.find(j=>j.id===a.joint),root=mechanism.hubs.find(h=>h.id===a.hub)?.body;
        if(fixedMotorPorts.includes(a.port)&&j?.body1!==root)add('motor-housing-not-mounted',[a.port],'The motor housing must be rigidly mounted to its declared chassis');
        const part=drivenParts[a.port];
        if(part&&!mechanism.bodies.find(b=>b.id===j?.body2)?.parts.includes(part))add('drive-not-keyed',[part],'The declared input arm/gear is not rigidly keyed to the motor rotor');
    }
    const connectors=model.parts.flatMap(p=>{const meta=catalog.get(p.part);return(meta?motorPhaseMeta(meta,p.rotorAngle).connectors:[]).map(c=>transform(p,c));});
    const shafts=connectors.filter(c=>c.type==='axle');
    for(const p of model.parts){
        const meta=catalog.get(p.part);
        if(meta?.gear||meta?.connectors.length!==1||meta.connectors[0].type!=='axlehole'||!meta.colliders.length||!meta.colliders.every(c=>c.shape==='cylinder'))continue;
        const bore=transform(p,meta.connectors[0]);
        if(!shafts.some(s=>s.part!==p.id&&shaftEngagement(s,bore)!==null))add('retainer-without-engagement',[p.id],'The retaining bore must actually engage a stock axle, not merely touch its end');
    }
    // The editor's solid-overlap pass deliberately omits shaft regions. An
    // axle can consequently have a valid bearing graph while its free tip
    // projects into another gear's teeth (the original VectorSum divergence).
    // For ordinary cylindrical gear colliders, reject that intrusion unless
    // the shaft is actually seated in one of that gear's declared bores.
    for(const p of model.parts){
        const meta=catalog.get(p.part);if(!meta?.gear)continue;
        const bores=connectors.filter(c=>c.part===p.id&&['axlehole','pinhole'].includes(c.type));
        for(const shaft of shafts){
            if(shaft.part===p.id||bores.some(h=>shaftEngagement(shaft,h)!==null))continue;
            let hit=false;
            for(const c of meta.colliders){
                if(c.shape!=='cylinder')continue;
                const [x,y,z,w]=c.rotation||[0,0,0,1];
                const axis=mv(p.rotation,[2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)]);
                const centre=mv(p.rotation,c.position||[0,0,0]).map((v,i)=>v+p.position[i]);
                for(const sign of [-1,1]){
                    const delta=shaft.position.map((v,i)=>v+sign*shaft.axis[i]*shaft.length/2-centre[i]);
                    const axial=dot(delta,axis),radial=Math.hypot(...delta.map((v,i)=>v-axial*axis[i]));
                    if(Math.abs(axial)<c.halfHeight-1e-6&&radial<c.radius-1e-6)hit=true;
                }
            }
            if(hit)add('shaft-tip-in-gear',[shaft.part,p.id],'A free axle tip penetrates a gear outside its declared bore');
        }
    }
    const pairs=new Set();
    for(const p of model.parts)for(const other of solidOverlaps(model,catalog,p)){
        const parts=[p.id,other.part].sort(),key=parts.join('\n');
        if(!pairs.has(key)){pairs.add(key);add('solid-overlap',parts,'Solid part volumes overlap in the saved assembly');}
    }
    for(const i of prepared.issues||[]){if(i.severity==='error')add(i.code,i.parts||[],i.message);else advisories.push(i);}
    return{ok:errors.length===0,errors,advisories,placements:model.parts.length,motors:mechanism.actuators.length};
}

export function checkIntakeProgramOutcome(record,{successVariable,faultVariables=['fault','failed'],afterMs=2000}={}) {
    const errors=[],frames=record.track||[],program=frames.filter(f=>f.phase==='program'),last=program.at(-1),variables=last?.extra?.variables;
    if(record.finishedAt===null||!Number.isFinite(record.finishedAt))errors.push({code:'program-timeout'});
    const validPose=p=>Array.isArray(p?.position)&&p.position.length===3&&Array.isArray(p.rotation)&&p.rotation.length===4&&[...p.position,...p.rotation].every(Number.isFinite)&&Math.abs(Math.hypot(...p.rotation)-1)<1e-3;
    if(!frames.length||!frames.every(f=>f.bodies&&Object.keys(f.bodies).length>0&&Object.values(f.bodies).every(validPose)))errors.push({code:'non-finite-or-invalid-pose'});
    if(frames.some((f,i)=>!Number.isFinite(f.t)||(i>0&&f.t<=frames[i-1].t)))errors.push({code:'invalid-recording-time'});
    if(record.vmErrors?.length||record.unsupported?.length)errors.push({code:'unsupported-or-vm-error',details:[...(record.vmErrors||[]),...(record.unsupported||[])]});
    if(frames.some(f=>f.extra?.sessionFailed))errors.push({code:'failed-simulation-session'});
    if(!variables)errors.push({code:'missing-program-observation'});
    if(successVariable&&Number(variables?.[successVariable])!==1)errors.push({code:'program-did-not-succeed',variable:successVariable,value:variables?.[successVariable]??null});
    for(const name of faultVariables)if(variables&&Object.hasOwn(variables,name)&&Number(variables[name])!==0)errors.push({code:'program-fault',variable:name,value:variables[name]});
    const after=frames.filter(f=>f.phase==='after');
    if(!after.length||after.at(-1).t-record.finishedAt<afterMs-1e-6)errors.push({code:'incomplete-continuation',requiredMs:afterMs});
    return{ok:errors.length===0,errors,variables:variables||null,scope:'Program completion and finite continuation only; a reviewed passive-output law is still required.'};
}
