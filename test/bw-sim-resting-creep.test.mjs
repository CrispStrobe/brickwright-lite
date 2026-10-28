// SPDX-License-Identifier: BSD-3-Clause
// Issue #1435 diagnostic baseline: passive resting observations with an
// independent reader. Integrity assertions only; drift values are reported,
// never accepted or rejected against an invented tolerance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadJolt} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {manifest,sha256,sourceIdentities,prepareInputs,buildCase,isolateFrame,runCase} from './fixtures/resting-creep-1435/observe.mjs';
import {auditRecord,auditAll,recompute,extractRecords,expectedIdentities,PREFIX} from '../scripts/verify-sim-resting-creep.mjs';
const root=new URL('./fixtures/resting-creep-1435/',import.meta.url);

test('Resting creep: frozen inputs, single-coordinate variant and source identities',()=>{
    for(const f of manifest.inputs){const b=readFileSync(new URL(f.file,root));assert.equal(b.length,f.bytes,f.id);assert.equal(sha256(b),f.sha256,f.id);}
    const lines=id=>readFileSync(new URL(manifest.inputs.find(i=>i.id===id).file,root),'utf8').split('\n');
    const raised=lines('orrery-raised'),coplanar=lines('orrery-coplanar'),{change}=manifest.inputs[1];
    assert.equal(raised.length,coplanar.length);
    const differing=raised.map((l,i)=>i).filter(i=>raised[i]!==coplanar[i]);
    assert.deepEqual(differing,[change.line-1],'only one source line differs');
    assert.equal(raised[change.line-1],change.from);assert.equal(coplanar[change.line-1],change.to);
    assert.equal(raised[change.line-2],'0 !BW ID base_rail_0');
    const ids=sourceIdentities();
    assert.equal(ids.engine.integrity,manifest.engine.integrity);
    const pinURL=new URL(ids.engine.resolved);
    assert.equal(pinURL.hostname,'github.com');
    assert.equal(pinURL.pathname,'/CrispStrobe/JoltPhysics.js/releases/download/v'+manifest.engine.version+'/jolt-physics-'+manifest.engine.version+'.tgz');
    assert.deepEqual(ids,expectedIdentities().identities,'producer and reader bind the same identities');
});

test('Resting creep: isolated-frame extraction keeps the compiled frame exactly and enumerates removals',()=>{
    const prepared=prepareInputs();
    for(const id of ['orrery-raised','orrery-coplanar']) {
        const {mechanism}=prepared.get(id);
        const iso=isolateFrame(mechanism);
        assert.deepEqual(iso.mechanism.bodies.map(b=>b.id),['ground',iso.frame.id]);
        assert.equal(iso.mechanism.bodies[1],mechanism.bodies.find(b=>b.id===iso.frame.id),'same compiled frame object');
        assert.equal(iso.mechanism.bodies[0],mechanism.bodies.find(b=>b.id==='ground'),'same compiled ground object');
        assert.ok(Math.abs(iso.frame.massKg-0.20642)<1e-9);assert.equal(iso.frame.parts.length,38);assert.equal(iso.frame.colliders.length,51);
        assert.equal(iso.removed.bodies.length,mechanism.bodies.length-2);
        assert.equal(iso.removed.joints.length,mechanism.joints.length);assert.equal(iso.removed.actuators.length,mechanism.actuators.length);
        for(const k of ['joints','gears','hubs','actuators','couplings','devices','diagnostics','noCollide','noCollideParts'])assert.deepEqual(iso.mechanism[k],[],k);
        assert.deepEqual(iso.removed.parts,mechanism.bodies.filter(b=>b.id!=='ground'&&b.id!==iso.frame.id).flatMap(b=>b.parts.map(p=>p.id??p)).sort());
        assert.ok(!iso.removed.parts.some(p=>p.startsWith('base_rail_')));
        assert.equal(mechanism.joints.length,4,'complete input untouched');
    }
    const a=prepared.get('orrery-raised').mechanism,b=prepared.get('orrery-coplanar').mechanism;
    assert.deepEqual(a.bodies.map(x=>x.id),b.bodies.map(x=>x.id));
    for(const id of ['driving-base','gearbox'])assert.deepEqual(prepared.get(id).issues,[],id+' prepares without issues');
});

// Synthetic rows: a slow straight drift with a constant yaw rate.
const synthetic=(n=manifest.clock.steps)=>Array.from({length:n+1},(_,i)=>{
    const a=i*1e-4,t=i*manifest.clock.dtSeconds;
    return [i,t,i*1e-5,.01,0,0,Math.sin(a/2),0,Math.cos(a/2),0,0,0,0,0,0,1];
});
const fakeRecord=spec=>{
    const ids=expectedIdentities(),input=manifest.inputs.find(i=>i.id===spec.input),rows=synthetic();
    const iso=spec.mechanism==='isolated-frame';
    return {schemaVersion:1,case:spec.id,input:{id:input.id,file:input.file,bytes:input.bytes,sha256:input.sha256},mechanism:spec.mechanism,
        subject:{id:'b2'},bodies:iso?['ground','b2']:['ground','b0','b2'],joints:iso?[]:['j0'],removed:iso?{bodies:['b0'],parts:['crank']}:null,mechanismSha256:'a'.repeat(64),motorCommands:[],
        identities:ids.identities,clock:manifest.clock,rowFields:manifest.rowFields,
        initialDynamics:{solverMassKg:.2,centerOfMassWorld:[0,0,0],inertiaKgM2:[[1,0,0],[0,1,0],[0,0,1]]},rows,summary:recompute(rows)};
};

test('Resting creep: reader recomputes metrics and rejects corrupted originals',()=>{
    const ids=expectedIdentities(),spec=manifest.cases[3],good=fakeRecord(spec);
    const s=auditRecord(good,spec,ids);
    assert.ok(Math.abs(s.finalHorizontalM-350e-5)<1e-12);assert.ok(Math.abs(s.finalYawDeg-350e-4*180/Math.PI)<1e-9);
    assert.equal(s.verticalRangeM,0);assert.ok(s.maxTiltDeg<1e-6);assert.equal(s.groundContactRows,351);
    const flipped=structuredClone(good);for(const r of flipped.rows)for(let k=5;k<9;k++)r[k]=-r[k];
    assert.deepEqual(recompute(flipped.rows),s,'quaternion sign invariance');
    const reject=(name,mutate)=>{const r=structuredClone(good);mutate(r);assert.throws(()=>auditRecord(r,spec,ids),undefined,name);};
    // Yaw past ±180° unwraps continuously; a pure tilt about X is not yaw.
    const spin=structuredClone(good);spin.rows.forEach((r,i)=>{const a=i*.02;r[5]=0;r[6]=Math.sin(a/2);r[7]=0;r[8]=Math.cos(a/2);});
    assert.ok(Math.abs(recompute(spin.rows).finalYawDeg-350*.02*180/Math.PI)<1e-6,'unwrapped beyond 360 degrees');
    const tilt=structuredClone(good);tilt.rows.forEach((r,i)=>{const a=i*1e-4;r[5]=Math.sin(a/2);r[6]=0;r[7]=0;r[8]=Math.cos(a/2);});
    const ts=recompute(tilt.rows);assert.ok(Math.abs(ts.maxTiltDeg-350e-4*180/Math.PI)<1e-9);assert.ok(Math.abs(ts.maxAbsYawDeg)<1e-9);
    reject('missing row',r=>r.rows.splice(100,1));
    reject('duplicate row',r=>r.rows.splice(100,0,r.rows[100]));
    reject('out of order',r=>{[r.rows[10],r.rows[11]]=[r.rows[11],r.rows[10]];});
    reject('bad quaternion',r=>{r.rows[50][8]=2;});
    reject('non-finite value',r=>{r.rows[20][3]=NaN;});
    reject('clock drift',r=>{r.rows[30][1]+=1e-6;});
    reject('changed summary',r=>{r.summary.finalHorizontalM*=1.01;});
    reject('incomplete case',r=>{r.rows.length=200;});
    reject('motor command',r=>{r.motorCommands=[['A',90,50]];});
    reject('wrong input',r=>{r.input.sha256='0'.repeat(64);});
    reject('changed engine identity',r=>{r.identities.engine.integrity='sha512-x';});
    reject('missing mechanism hash',r=>{delete r.mechanismSha256;});
    reject('wrong case',r=>{r.case='orrery-raised-complete';});
    const all=manifest.cases.map(fakeRecord);
    assert.equal(auditAll(all,ids).length,6);
    assert.throws(()=>auditAll(all.slice(0,5),ids),undefined,'missing case');
    assert.throws(()=>auditAll([all[1],all[0],...all.slice(2)],ids),undefined,'case order');
    const log=all.map(r=>'# '+PREFIX+JSON.stringify(r)).join('\n');
    assert.equal(extractRecords('2026-10-27T00:00:00Z '+log.split('\n')[0]).length,1,'timestamped job-log line');
    assert.equal(extractRecords(log).length,6);
});

test('Resting creep: actual passive engine observations',async t=>{
    const J=await loadJolt(),prepared=prepareInputs(),identities=sourceIdentities(),records=[];
    for(const spec of manifest.cases) {
        const record=runCase(J,buildCase(spec,prepared),identities);
        t.diagnostic(PREFIX+JSON.stringify(record));records.push(record);
    }
    // Integrity only; the retained diagnostics are the original observations.
    const table=auditAll(records,expectedIdentities());
    t.diagnostic('CREEP1435_TABLE '+JSON.stringify(table.map(({case:c,finalHorizontalM,maxAbsYawDeg,verticalRangeM,maxTiltDeg,groundContactRows})=>
        ({case:c,finalHorizontalMm:+(finalHorizontalM*1e3).toFixed(4),maxAbsYawDeg:+maxAbsYawDeg.toFixed(4),verticalRangeMm:+(verticalRangeM*1e3).toFixed(4),maxTiltDeg:+maxTiltDeg.toFixed(4),groundContactRows}))));
});
