// SPDX-License-Identifier: BSD-3-Clause
// Authored programme outcome boundary; mechanical-law accuracy is separately reviewed.
import assert from 'node:assert/strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
// Scratch stores variable values as recorded by the helper: numbers or their
// canonical decimal strings ('1', '-150'). Anything else ('01', '1.0', '') is NaN.
const scratchNumber=v=>typeof v==='number'?v:typeof v==='string'&&String(Number(v))===v?Number(v):NaN;
export function judgeDoorProgrammeOutcome(raw) {
    assert.equal(raw.schema,'bw.paired-door.outcome.v1');
    assert.equal(raw.complete,true,'raw collection finished without an exception');
    assert.equal(raw.nonfinite,0);assert.deepEqual(raw.vmErrors,[]);
    assert.ok(Number.isInteger(raw.fixedRows)&&raw.fixedRows>0&&raw.fixedRows<=12500,'actual bounded integer native fixed updates');
    assert.ok(finite(raw.nativeStartSeconds)&&finite(raw.nativeEndSeconds)&&raw.nativeStartSeconds>=0&&raw.nativeEndSeconds>raw.nativeStartSeconds,'actual native progress');
    assert.ok(finite(raw.flagDatumEncoderAngleDeg)&&Math.abs(raw.flagDatumEncoderAngleDeg)<=2,'authored flag-time datum within2degrees');
    assert.equal(scratchNumber(raw.final.completed),1);assert.equal(scratchNumber(raw.final.failed),0);assert.equal(scratchNumber(raw.final.stage),5);
    assert.ok(finite(raw.finishedAt)&&raw.finishedAt>0,'real helper VM threads finished');
    assert.ok(finite(raw.programmeElapsedMs)&&raw.programmeElapsedMs>=0&&raw.programmeElapsedMs<=55000,'finite nonnegative authored55s duration');
    assert.ok(Array.isArray(raw.frames)&&raw.frames.length>=2,'actual sampled frames');
    let maxFrameGap=0;
    for(let i=0;i<raw.frames.length;i++) {
        const f=raw.frames[i];assert.ok(finite(f.t)&&f.t>=0,'finite nonnegative frame time');
        const attempts=scratchNumber(f.variables.correctionAttempts);
        assert.ok(Number.isInteger(attempts)&&attempts>=0&&attempts<=2,'authored bounded integer correction attempts');
        if(i){const gap=f.t-raw.frames[i-1].t;assert.equal(gap,20,'original helper20ms cadence, no dropped samples');maxFrameGap=Math.max(maxFrameGap,gap);}
    }
    for(const [stage,targetA]of [[1,150],[2,0],[3,-150],[4,0]]) {
        const indices=raw.frames.flatMap((f,i)=>scratchNumber(f.variables.stage)===stage&&scratchNumber(f.variables.settled)===1?[i]:[]);
        assert.ok(indices.length>0,`actual authored settled stage${stage} observed`);
        assert.equal(indices.at(-1)-indices[0]+1,indices.length,'one contiguous authored hold');
        const hold=indices.map(i=>raw.frames[i]);
        // The unchanged helper executes VM before tick+snapshot on each20ms
        // frame. Both settled transitions are observed with the same latency.
        // N held samples span(N−1)*20ms: add exactly one observed frame gap
        // to recover the held interval. Authored wait0.8s requires≥800ms.
        assert.ok(hold.at(-1).t-hold[0].t+maxFrameGap>=800,'authored800ms hold, sampled-edge bound');
        for(const f of hold) {
            assert.equal(scratchNumber(f.variables.targetA),targetA);
            assert.ok(finite(f.encoderAngleDeg)&&Math.abs(f.encoderAngleDeg-targetA)<=0.5,'authored motor completion bound, real API rounded encoder');
            assert.equal(scratchNumber(f.variables.failed),0);
        }
    }
    for(const id of ['rack_front','rack_back','door_front_0','door_front_1','door_back_0','door_back_1']) {
        assert.equal(raw.bindings.filter(b=>b.part===id).length,1,`unique intact output${id}`);
        assert.ok(raw.frames.every(f=>Array.isArray(f.markers?.[id])&&f.markers[id].length===3&&f.markers[id].every(finite)),`actual finite3D marker${id}`);
    }
    return {programme:'AUTHORED_FINITE_OUTCOME_OBSERVED',mechanicalLaw:'NOT_JUDGED',promotion:'UNCHANGED_EXPERIMENTAL'};
}
