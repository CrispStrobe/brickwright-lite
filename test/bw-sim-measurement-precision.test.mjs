// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {collectFixedObservations, createPrecisionAnalysis, observationSelection, OBSERVATION_SAMPLE_LIMIT} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/precision.js';
const mechanism = {joints: [{id: 'a', type: 'hinge'}, {id: 'b', type: 'hinge'}]};
const selection = {revision: 1, joints: ['a', 'b'], contacts: false, screws: false};
const packet = (from, to, revision = 1) => ({revision, overflow: false, samples: Array.from({length: to - from}, (_, offset) => {
    const i = from + offset, t = i * 0.005;
    return {t, stepSeconds: 0.005, joints: [{id: 'a', type: 'hinge', coordinate: Math.sin(2 * Math.PI * (t - 0.002)), powerW: 2},
        {id: 'b', type: 'hinge', coordinate: Math.sin(2 * Math.PI * (t - 0.252)), powerW: -3}]};
})});
test('accepted completed-step samples establish period, explicit phase lag and signed braking work', () => {
    const analysis = createPrecisionAnalysis(selection);
    analysis.accept(packet(1, 301)); analysis.accept(packet(301, 501));
    const rows = analysis.snapshot().rows;
    assert.ok(Math.abs(rows[0].periodSeconds - 1) < 1e-10);
    assert.ok(Math.abs(rows[1].phaseDegrees - 90) < 1e-8);
    assert.ok(Math.abs(rows[0].workJ - 5) < 1e-10);
    assert.ok(Math.abs(rows[1].workJ + 7.5) < 1e-10);
});
test('stale revisions are ignored, overflow and discontinuities invalidate totals, not unavailable-as-zero', () => {
    const analysis = createPrecisionAnalysis(selection);
    assert.equal(analysis.accept(packet(1, 30, 2)), false);
    analysis.accept(packet(1, 20));
    analysis.accept({...packet(20, 40), overflow: true});
    assert.ok(analysis.snapshot().gap);
    assert.ok(analysis.snapshot().rows.every(r => r.workJ === null && r.periodSeconds === null));
    analysis.accept(packet(50, 60));
    assert.ok(analysis.snapshot().rows.every(r => r.workJ === null));
    const other = createPrecisionAnalysis(selection); other.accept(packet(1, 20)); other.accept(packet(30, 50));
    assert.ok(other.snapshot().gap);
    assert.ok(other.snapshot().rows.every(r => r.workJ === null));
});
test('collector is opt-in, copied, bounded, detachable and old callback snapshots cannot deliver after detach', () => {
    let listener, detached = 0, current = 0;
    const core = {observeFixedSteps: fn => {listener = fn; return () => detached++;},
        jointState: () => ({angle: current}), jointDynamics: () => ({t: current * .005, stepSeconds: .005, motorPowerW: 3})};
    const off = collectFixedObservations(core, mechanism, null); assert.equal(listener, undefined); assert.equal(off.take(), null);
    const collector = collectFixedObservations(core, mechanism, selection);
    for (current = 1; current <= OBSERVATION_SAMPLE_LIMIT + 2; current++) listener({t: current * .005, stepSeconds: .005});
    const result = collector.take(); assert.equal(result.samples.length, 600); assert.equal(result.overflow, true);
    assert.equal(result.samples[0].joints[0].coordinate, 1);
    collector.detach(); listener({t: 4, stepSeconds: .005});
    assert.equal(collector.take().samples.length, 0); assert.equal(detached, 1);
    assert.throws(() => observationSelection({...selection, joints: ['a', 'a']}, mechanism));
    assert.throws(() => observationSelection({...selection, joints: ['missing']}, mechanism));
});

test('full-turn periods work for positive and negative unwrapped rotation; oscillation threshold is explicit', () => {
    for (const sign of [1,-1]) {
        const config = {...selection, joints:['a'], mode:'rotation', thresholdDegrees:30}, analysis=createPrecisionAnalysis(config);
        const samples=Array.from({length:500},(_,i)=>({t:(i+1)*.005,stepSeconds:.005,joints:[{id:'a',type:'hinge',coordinate:sign*(i+1)*.005*2*Math.PI,powerW:1}]}));
        analysis.accept({revision:1,samples,overflow:false});
        assert.ok(Math.abs(analysis.snapshot().rows[0].periodSeconds-1)<1e-10);
        assert.equal(analysis.snapshot().rows[0].phaseDegrees,0);
    }
    const thresholded=createPrecisionAnalysis({...selection,joints:['a'],thresholdDegrees:30});
    const samples=packet(1,501).samples.map(s=>({...s,joints:[s.joints[0]]}));
    thresholded.accept({revision:1,samples,overflow:false});
    assert.ok(Math.abs(thresholded.snapshot().rows[0].periodSeconds-1)<1e-10);
});
