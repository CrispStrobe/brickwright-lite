// SPDX-License-Identifier: BSD-3-Clause
// Issue #1435 contact stage: collider-subset, collider-height, synthetic-plate
// and manifold-reduction cases with per-step ground manifold counts and lowest
// collider gaps. Integrity assertions only; drift values are reported through
// t.diagnostic and never judged against a tolerance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {sourceIdentities,prepareInputs} from './fixtures/resting-creep-1435/observe.mjs';
import {contactManifest,buildContactCase,runContactCase,colliderGaps} from './fixtures/resting-creep-1435/observe-contact.mjs';
import {auditContactRecord,auditContactAll,extractContactRecords,contactSummary,CONTACT_PREFIX} from '../scripts/verify-sim-resting-creep-contact.mjs';
import {recompute,expectedIdentities} from '../scripts/verify-sim-resting-creep.mjs';

const spec=id=>contactManifest.cases.find(c=>c.id===id);

test('Resting creep contact: each case changes only what its manifest entry declares',()=>{
    const prepared=prepareInputs(),built=Object.fromEntries(contactManifest.cases.map(s=>[s.id,buildContactCase(s,prepared)]));
    const all=built['coplanar-all-colliders'];
    assert.equal(all.subject.colliders.length,51);assert.deepEqual(all.collidersRemoved,[]);
    assert.equal(built['coplanar-rails-only'].subject.colliders.length,4);
    assert.equal(built['coplanar-floor-supports-only'].subject.colliders.length,18);
    assert.deepEqual(built['coplanar-without-hover-parts'].collidersRemoved.sort(),contactManifest.hoverParts);
    assert.deepEqual(built['coplanar-hover-parts-up-0.5mm'].collidersShifted.sort(),contactManifest.hoverParts);
    for(const [id,b] of Object.entries(built)) {
        assert.deepEqual(b.mechanism.bodies.map(x=>x.id),['ground',b.subject.id],id);
        assert.deepEqual(b.mechanism.joints,[],id);
        if(b.spec.build!=='isolated-frame')continue;
        const ref=built[b.spec.input==='orrery-raised'?'raised-all-colliders':'coplanar-all-colliders'].subject;
        assert.equal(b.subject.massKg,ref.massKg,id+' configured mass unchanged');
        assert.deepEqual(b.subject.position,ref.position,id+' pose unchanged');
        const byPart=new Map(ref.colliders.map(c=>[c.part+JSON.stringify(c.position),c]));
        for(const c of b.subject.colliders) {
            if(b.collidersShifted.includes(c.part))assert.ok(Math.abs(c.position[1]-b.spec.hoverShiftM-ref.colliders.find(r=>r.part===c.part).position[1])<1e-15);
            else assert.equal(c,byPart.get(c.part+JSON.stringify(c.position)),id+' collider object kept');
        }
    }
    // Stated initial gaps: the coplanar frame and the plate rest at zero gap;
    // the hover parts sit 1.6 mm up, the plate's hover cube at its stated gap.
    const gaps=b=>{const g=b.mechanism.bodies[0],top=g.position[1]+g.colliders[0].halfExtents[1];
        return colliderGaps(b.subject.colliders,b.subject.position,b.subject.rotation,top);};
    assert.ok(Math.abs(Math.min(...gaps(all)))<1e-9);
    const hov=all.subject.colliders.map((c,i)=>[c.part,gaps(all)[i]]).filter(([p])=>contactManifest.hoverParts.includes(p));
    for(const [,g] of hov)assert.ok(Math.abs(g-0.0016)<1e-9,'hover parts 1.6 mm above the floor');
    for(const id of ['plate-hover-1.2mm','plate-hover-1.6mm','plate-hover-1.9mm','plate-hover-2.1mm']) {
        const g=gaps(built[id]);assert.ok(Math.abs(Math.min(...g))<1e-9);assert.ok(Math.abs(g.at(-1)-spec(id).hoverGapM)<1e-9,id);
    }
});

const synthetic=()=>Array.from({length:contactManifest.clock.steps+1},(_,i)=>{
    const a=i*1e-4;return [i,i*contactManifest.clock.dtSeconds,i*1e-5,.01,0,0,Math.sin(a/2),0,Math.cos(a/2),0,0,0,0,0,0,1,i?1:0,-1e-5,i%2];
});
const fake=s=>{const rows=synthetic(),ids=expectedIdentities();
    return {schemaVersion:1,stage:'contact',case:s.id,build:s.build,input:null,subject:{id:'plate',colliders:6},
        collidersRemoved:[],collidersShifted:[],manifoldReduction:s.manifoldReduction!==false,bodies:['ground','plate'],joints:[],
        mechanismSha256:'a'.repeat(64),motorCommands:[],identities:ids.identities,clock:contactManifest.clock,
        initialDynamics:{solverMassKg:.07,centerOfMassWorld:[0,0,0],inertiaKgM2:[[1,0,0],[0,1,0],[0,0,1]]},
        rowFields:contactManifest.rowFields,rows,summary:recompute(rows)};};

test('Resting creep contact: reader recomputes and rejects corrupted originals',()=>{
    const ids=expectedIdentities(),s=spec('plate-hover-1.6mm'),good=fake(s),a=auditContactRecord(good,s,ids);
    assert.equal(a.stepsWithGroundManifolds,350);assert.equal(a.stepsWithSpeculativeBandColliders,175);
    assert.equal(a.maxGroundManifoldsPerStep,1);assert.equal(a.minLowestGapM,-1e-5);
    assert.deepEqual(contactSummary(good.rows).minLowestGapM,-1e-5);
    const reject=(name,mutate,sp=s)=>{const r=structuredClone(good);mutate(r);assert.throws(()=>auditContactRecord(r,sp,ids),undefined,name);};
    reject('fractional manifolds',r=>{r.rows[9][16]=.5;});
    reject('negative manifolds',r=>{r.rows[9][16]=-1;});
    reject('band beyond collider count',r=>{r.rows[9][18]=7;});
    reject('manifold before first step',r=>{r.rows[0][16]=1;});
    reject('missing row',r=>r.rows.splice(10,1));
    reject('changed summary',r=>{r.summary.finalYawDeg+=1e-3;});
    reject('reduction flag mismatch',r=>{r.manifoldReduction=false;});
    reject('motor command',r=>{r.motorCommands=[['A',1]];});
    reject('undeclared shift',r=>{r.collidersShifted=['plate_rail_0'];});
    reject('wrong case',r=>{r.case='plate-flat';});
    const all=contactManifest.cases.map(c=>{const r=fake(c);if(c.build!=='plate'){r.input={id:'x'};}return r;});
    assert.throws(()=>auditContactAll(all.slice(1),ids),undefined,'case census');
    const log=fake(s);assert.equal(extractContactRecords('2026-10-27T00:00:00Z # '+CONTACT_PREFIX+JSON.stringify(log)).length,1);
});

test('Resting creep contact: actual passive engine observations',async t=>{
    const J=await loadJolt(),prepared=prepareInputs(),identities=sourceIdentities(),records=[];
    for(const s of contactManifest.cases) {
        const record=runContactCase(J,buildContactCase(s,prepared),identities);
        t.diagnostic(CONTACT_PREFIX+JSON.stringify(record));records.push(record);
    }
    const table=auditContactAll(records,expectedIdentities());
    t.diagnostic('CREEP1435_CONTACT_TABLE '+JSON.stringify(table.map(r=>({case:r.case,mm:+(r.finalHorizontalM*1e3).toFixed(4),
        yawDeg:+r.finalYawDeg.toFixed(4),tiltDeg:+r.maxTiltDeg.toFixed(4),colliders:r.colliders,reduction:r.manifoldReduction,
        manifoldSteps:r.stepsWithGroundManifolds,maxManifolds:r.maxGroundManifoldsPerStep,minGapMm:+(r.minLowestGapM*1e3).toFixed(4),
        bandSteps:r.stepsWithSpeculativeBandColliders}))));
});
