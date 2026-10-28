// SPDX-License-Identifier: BSD-3-Clause
// Standalone reader for the issue #1435 contact-stage observations
// (CREEP1435_CONTACT diagnostics). No engine or producer imports: it validates
// the retained rows and recomputes every summary with the baseline reader's
// own recompute(). A pass proves data integrity only.
//   node scripts/verify-sim-resting-creep-contact.mjs <unit-job-log-or-tap>
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {manifest as base,recompute,expectedIdentities} from './verify-sim-resting-creep.mjs';

const repo=new URL('../',import.meta.url);
export const contactManifest=JSON.parse(readFileSync(new URL('test/fixtures/resting-creep-1435/contact-manifest.json',repo)));
export const CONTACT_PREFIX='CREEP1435_CONTACT ';

export function extractContactRecords(text) {
    return [...text.matchAll(/^.*?(?:#|ℹ) CREEP1435_CONTACT (\{.*\})\s*$/gm)].map(m=>JSON.parse(m[1]));
}

// Contact fields over the run: manifold census and the lowest collider gap.
export function contactSummary(rows) {
    let manifoldSteps=0,maxManifolds=0,minGap=Infinity,maxGap=-Infinity,bandSteps=0;
    for(const r of rows){manifoldSteps+=r[16]>0;maxManifolds=Math.max(maxManifolds,r[16]);
        minGap=Math.min(minGap,r[17]);maxGap=Math.max(maxGap,r[17]);bandSteps+=r[18]>0;}
    return {stepsWithGroundManifolds:manifoldSteps,maxGroundManifoldsPerStep:maxManifolds,
        minLowestGapM:minGap,maxLowestGapM:maxGap,stepsWithSpeculativeBandColliders:bandSteps};
}

export function auditContactRecord(r,spec,expected) {
    const M=contactManifest;
    assert.equal(r.schemaVersion,M.schemaVersion);assert.equal(r.stage,'contact');
    assert.equal(r.case,spec.id);assert.equal(r.build,spec.build);
    assert.equal(r.manifoldReduction,spec.manifoldReduction!==false);
    if(spec.build==='plate')assert.equal(r.input,null);
    else{const i=base.inputs.find(x=>x.id===spec.input);assert.deepEqual(r.input,{id:i.id,file:i.file,bytes:i.bytes,sha256:i.sha256});}
    assert.deepEqual(r.identities,expected.identities);
    assert.deepEqual(r.clock,M.clock);assert.deepEqual(r.rowFields,M.rowFields);
    assert.deepEqual(r.motorCommands,[],'passive observation only');
    assert.match(r.mechanismSha256,/^[0-9a-f]{64}$/);
    assert.deepEqual(r.bodies,['ground',r.subject.id]);assert.deepEqual(r.joints,[]);
    assert.equal(r.collidersShifted.length>0,Boolean(spec.hoverShiftM),'shift census');
    assert.equal(r.collidersRemoved.length>0,Boolean(spec.colliders),'removal census');
    const {steps,dtSeconds}=M.clock;
    assert.equal(r.rows.length,steps+1,'initial pose plus every completed step');
    r.rows.forEach((row,i)=>{
        assert.equal(row.length,M.rowFields.length);
        assert.ok(row.every(Number.isFinite),'finite row '+i);
        assert.equal(row[0],i,'ordered, unique step census');
        assert.ok(Math.abs(row[1]-i*dtSeconds)<1e-9,'fixed clock at step '+i);
        assert.ok(Math.abs(Math.hypot(...row.slice(5,9))-1)<=base.quaternionNormTolerance,'normalized quaternion at step '+i);
        assert.ok(row[15]===0||row[15]===1);
        assert.ok(Number.isInteger(row[16])&&row[16]>=0,'manifold count');
        assert.ok(Number.isInteger(row[18])&&row[18]>=0&&row[18]<=r.subject.colliders,'band census');
    });
    assert.equal(r.rows[0][16],0,'no manifold before the first step');
    const d=r.initialDynamics;
    assert.ok(d.solverMassKg>0&&d.centerOfMassWorld.every(Number.isFinite)&&d.inertiaKgM2.flat().every(Number.isFinite));
    const s=recompute(r.rows);
    assert.deepEqual(Object.keys(r.summary).sort(),Object.keys(s).sort());
    for(const k of Object.keys(s))assert.ok(Math.abs(r.summary[k]-s[k])<=base.summaryTolerance*Math.max(1,Math.abs(s[k])),'summary '+k);
    return {...s,...contactSummary(r.rows),colliders:r.subject.colliders,manifoldReduction:r.manifoldReduction};
}

export function auditContactAll(records,expected) {
    assert.equal(records.length,contactManifest.cases.length,'exact case census');
    return contactManifest.cases.map((spec,i)=>({case:spec.id,...auditContactRecord(records[i],spec,expected)}));
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
    const table=auditContactAll(extractContactRecords(readFileSync(process.argv[2],'utf8')),expectedIdentities());
    console.log(JSON.stringify({audit:'PASS (data integrity only)',cases:table},null,1));
}
