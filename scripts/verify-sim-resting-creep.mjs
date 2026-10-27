// SPDX-License-Identifier: BSD-3-Clause
// Standalone retained-output reader for issue #1435. No engine or test-producer
// imports: it validates the retained rows and recomputes every summary.
// A pass proves data integrity only; it says nothing about solver correctness.
//   node scripts/verify-sim-resting-creep.mjs <unit-job-log-or-tap>
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const repo=new URL('../',import.meta.url);
export const manifest=JSON.parse(readFileSync(new URL('test/fixtures/bw-sim/resting-creep/manifest.json',repo)));
export const PREFIX='CREEP1435_RESULT ';

export function extractRecords(text) {
    return [...text.matchAll(/^.*?(?:#|ℹ) CREEP1435_RESULT (\{.*\})\s*$/gm)].map(m=>JSON.parse(m[1]));
}

// Rotation matrix columns of a unit quaternion (x,y,z,w); sign-invariant.
const matrix=q=>{const n=Math.hypot(...q),[x,y,z,w]=q.map(v=>v/n);return [
    [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
    [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
    [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];};
const mulT=(a,b)=>a.map((_,i)=>[0,1,2].map(j=>a[i][0]*b[j][0]+a[i][1]*b[j][1]+a[i][2]*b[j][2])); // a·bᵀ

export function recompute(rows) {
    const r0=matrix(rows[0].slice(5,9)),[x0,,z0]=rows[0].slice(2,5);
    let unwrapped=0,last=0,maxAbsYaw=0,maxTilt=0,maxH=0,lo=Infinity,hi=-Infinity,contact=0;
    for(const r of rows) {
        const rel=mulT(matrix(r.slice(5,9)),r0); // world-frame rotation since the first row
        const heading=Math.atan2(-rel[2][0],rel[0][0]);
        let step=heading-last;
        while(step>Math.PI)step-=2*Math.PI;
        while(step<-Math.PI)step+=2*Math.PI;
        unwrapped+=step;last=heading;
        maxAbsYaw=Math.max(maxAbsYaw,Math.abs(unwrapped));
        maxTilt=Math.max(maxTilt,Math.atan2(Math.hypot(rel[0][1],rel[2][1]),rel[1][1]));
        maxH=Math.max(maxH,Math.hypot(r[2]-x0,r[4]-z0));
        lo=Math.min(lo,r[3]);hi=Math.max(hi,r[3]);contact+=r[15];
    }
    const f=rows[rows.length-1],deg=180/Math.PI;
    return {finalHorizontalM:Math.hypot(f[2]-x0,f[4]-z0),maxHorizontalM:maxH,finalYawDeg:unwrapped*deg,
        maxAbsYawDeg:maxAbsYaw*deg,verticalRangeM:hi-lo,maxTiltDeg:maxTilt*deg,groundContactRows:contact};
}

export function auditRecord(r,spec,expected) {
    assert.equal(r.schemaVersion,manifest.schemaVersion);
    assert.equal(r.case,spec.id);assert.equal(r.mechanism,spec.mechanism);
    const input=manifest.inputs.find(i=>i.id===spec.input);
    assert.deepEqual(r.input,{id:input.id,file:input.file,bytes:input.bytes,sha256:input.sha256});
    assert.deepEqual(r.identities,expected.identities);
    assert.deepEqual(r.clock,manifest.clock);assert.deepEqual(r.rowFields,manifest.rowFields);
    assert.deepEqual(r.motorCommands,[],'passive observation only');
    if(spec.mechanism==='isolated-frame'){assert.deepEqual(r.bodies,['ground',r.subject.id]);assert.deepEqual(r.joints,[]);assert.ok(r.removed.bodies.length>0);}
    else assert.equal(r.removed,null);
    const {steps,dtSeconds}=manifest.clock;
    assert.equal(r.rows.length,steps+1,'initial pose plus every completed step');
    r.rows.forEach((row,i)=>{
        assert.equal(row.length,manifest.rowFields.length);
        assert.ok(row.every(Number.isFinite),'finite row '+i);
        assert.equal(row[0],i,'ordered, unique step census');
        assert.ok(Math.abs(row[1]-i*dtSeconds)<1e-9,'fixed clock at step '+i);
        assert.ok(Math.abs(Math.hypot(...row.slice(5,9))-1)<=manifest.quaternionNormTolerance,'normalized quaternion at step '+i);
        assert.ok(row[15]===0||row[15]===1);
    });
    const d=r.initialDynamics;
    assert.ok(d.solverMassKg>0&&d.centerOfMassWorld.length===3&&d.centerOfMassWorld.every(Number.isFinite));
    assert.ok(d.inertiaKgM2.length===3&&d.inertiaKgM2.flat().every(Number.isFinite));
    const s=recompute(r.rows);
    assert.deepEqual(Object.keys(r.summary).sort(),Object.keys(s).sort());
    for(const k of Object.keys(s))assert.ok(Math.abs(r.summary[k]-s[k])<=manifest.summaryTolerance*Math.max(1,Math.abs(s[k])),'summary '+k);
    return s;
}

export function auditAll(records,expected) {
    assert.equal(records.length,manifest.cases.length,'exact case census');
    return manifest.cases.map((spec,i)=>({case:spec.id,subject:records[i].subject.id,...auditRecord(records[i],spec,expected)}));
}

export function expectedIdentities() {
    const file=f=>({file:f,sha256:createHash('sha256').update(readFileSync(new URL(f,repo))).digest('hex')});
    const pin=readFileSync(new URL(manifest.engine.pinSource,repo),'utf8');
    const integrity=pin.match(/const JOLT_PHYSICS_INTEGRITY = '([^']+)'/)[1];
    assert.equal(integrity,manifest.engine.integrity,'engine pin unchanged');
    return {identities:{core:file(manifest.historicalSources.core.file),catalogue:file(manifest.historicalSources.catalogue.file),
        engine:{version:manifest.engine.version,resolved:pin.match(/const JOLT_PHYSICS_URL = '([^']+)'/)[1],integrity}}};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
    const table=auditAll(extractRecords(readFileSync(process.argv[2],'utf8')),expectedIdentities());
    console.log(JSON.stringify({audit:'PASS (data integrity only)',cases:table},null,1));
}
