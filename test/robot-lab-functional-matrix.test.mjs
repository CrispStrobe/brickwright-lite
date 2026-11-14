// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const inventory=read('docs/data/robot-lab-experimental-checkpoint.json').models;
const matrix=read('docs/data/robot-lab-functional-matrix-20261114.json');
const finitePositive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const moved=m=>m?.moved===true&&Number.isInteger(m.samples)&&m.samples>1&&Number.isFinite(m.travelDeg)&&m.travelDeg>=0.1;

function validate(value) {
    assert.equal(inventory.length,82,'checkpoint inventory count');
    const ids=inventory.map(m=>m.id);
    assert.equal(new Set(ids).size,82,'unique inventory IDs');
    assert.equal(value.models.length,82,'matrix count');
    assert.equal(new Set(value.models.map(m=>m.id)).size,82,'unique matrix IDs');
    assert.deepEqual(value.models.map(m=>m.id).sort(),[...ids].sort(),'complete inventory coverage');
    const counts={total:value.models.length,pass:0,fail:0,untested:0,blocked:0};
    for(const row of value.models){
        const key=String(row.status).toLowerCase();assert.ok(key in counts&&key!=='total','known result status');counts[key]++;
        if(row.status!=='PASS')continue;
        assert.deepEqual(row.failure_modes,[],row.id+' failure modes');
        assert.ok(Number.isInteger(row.primitiveCalls)&&row.primitiveCalls>0,row.id+' actual VM primitive calls');
        assert.ok(Number.isInteger(row.steps)&&row.steps>0&&finitePositive(row.simulatedMs),row.id+' sampled execution');
        assert.equal(row.bodySanity?.status,'ASSESSED',row.id+' assessed stability');
        assert.equal(row.bodySanity.assessed,true,row.id+' stability assessment flag');
        assert.ok(finitePositive(row.bodySanity.travelBoundM),row.id+' stability bound');
        assert.deepEqual(row.bodySanity.travelOverBound,[],row.id+' stability violations');
        assert.ok(Number.isFinite(row.maxBodyDisplacementM)&&row.maxBodyDisplacementM>=0&&row.maxBodyDisplacementM<=row.bodySanity.travelBoundM,row.id+' observed displacement');
        for(const key of ['partFailures','missingOpcodes','vmErrors','sessionFailures','nonfinite'])assert.deepEqual(row[key],[],row.id+' '+key);
        assert.equal(row.unboundMotorCount,0,row.id+' unbound motors');
        assert.ok(Number.isInteger(row.motorPartCount)&&row.motorPartCount>=0,row.id+' motor inventory');
        assert.equal(Object.keys(row.motors).length,row.motorPartCount,row.id+' every installed motor observed');
        assert.equal(row.programFailedObserved,false,row.id+' program failure flag');
        if('programFaultObserved' in row)assert.equal(row.programFaultObserved,false,row.id+' program fault flag');
        assert.ok(['COMPLETED','BOUNDED_PARTIAL'].includes(row.execution),row.id+' execution coverage');
        if(row.execution==='COMPLETED')assert.ok(finitePositive(row.finishedAt),row.id+' observed completion');
        else assert.equal(row.finishedAt,null,row.id+' partial run cannot claim completion');
        for(const [port,motor] of Object.entries(row.motors)){
            if(moved(motor)){
                assert.ok(['MOVED','UNCOMMANDED_MOVED'].includes(motor.status),row.id+' motion classification');
                assert.equal(motor.commanded,motor.status==='MOVED',row.id+' command/passive distinction');
                continue;
            }
            // This supplied comparison deliberately holds its motor. Keep that
            // observation and require a separately described actual motor run.
            assert.equal(row.id,'sarrus-lift-single-chain',row.id+' stationary motor');
            assert.equal(motor.status,'UNCOMMANDED_STATIONARY');
            assert.equal(motor.commanded,false);
            assert.equal(row.execution,'COMPLETED');
            assert.ok(row.originalProgramObservation.includes('motor:'+port+':UNCOMMANDED_STATIONARY'),'original hold-only observation retained');
            const diagnostic=row.motorDiagnostic;
            assert.equal(diagnostic?.status,'PASS','separate motor diagnostic');
            assert.ok(/separate/i.test(diagnostic.description)&&/original/i.test(diagnostic.description),'separate diagnostic documented');
            assert.deepEqual(diagnostic.failures,[]);
            assert.ok(finitePositive(diagnostic.simulatedMs));
            assert.ok(moved(diagnostic.motors[port]),'diagnostic physical movement');
            assert.equal(diagnostic.motors[port].commanded,true,'diagnostic real command');
        }
    }
    assert.deepEqual(value.summary,counts,'summary derived from individual rows');
    const prose=JSON.stringify(value);
    assert.doesNotMatch(prose,/\/(?:mnt|home|tmp|root)\/|file:\/\/|[A-Za-z]:\\\\|"(?:hostname|sessionId|session_id)"\s*:/,'no private paths or host/session fields');
}

test('functional matrix covers all 82 inventoried models with actual execution, stability and motor evidence',()=>validate(matrix));
test('green summary counts cannot conceal missing execution, stability, motion or diagnostics',()=>{
    const cases={
        duplicate:copy=>{copy.models[1].id=copy.models[0].id;},
        summary:copy=>{copy.summary.pass--;},
        noVm:copy=>{copy.models[0].primitiveCalls=0;},
        unassessed:copy=>{copy.models[0].bodySanity.assessed=false;},
        unstable:copy=>{copy.models[0].bodySanity.travelOverBound=['body'];},
        missingMotor:copy=>{copy.models[0].motors={};},
        programFailure:copy=>{copy.models[0].programFailedObserved=true;},
        noMotion:copy=>{const m=Object.values(copy.models[0].motors)[0];m.travelDeg=0;m.moved=false;},
        falsePassiveClaim:copy=>{const r=copy.models.find(m=>m.id==='equinox-differential');Object.values(r.motors).find(m=>m.status==='UNCOMMANDED_MOVED').commanded=true;},
        missingDiagnostic:copy=>{delete copy.models.find(m=>m.id==='sarrus-lift-single-chain').motorDiagnostic;},
        stationaryDiagnostic:copy=>{Object.values(copy.models.find(m=>m.id==='sarrus-lift-single-chain').motorDiagnostic.motors)[0].travelDeg=0;},
        privatePath:copy=>{copy.scope+=' Evidence: /mnt/private/result.json';}
    };
    for(const [name,mutate] of Object.entries(cases)){const copy=structuredClone(matrix);mutate(copy);assert.throws(()=>validate(copy),undefined,name);}
});
