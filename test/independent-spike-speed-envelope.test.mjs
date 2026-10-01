// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {effectiveMotorSpeed} from '../overlay/scratch-gui/src/lib/spike-sim/speed-envelope.mjs';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {readPrivateSpikeEvidence,privateEvidenceSkip} from './helpers/private-spike-evidence.mjs';

test('nominal limits stay public while the measured actuator envelope bounds all command modes',async()=>{
    for(const mode of ['continuous','target','timed']) {
        const hub=new Hub(),b=hub.backend;
        assert.equal(b.maxSpeed('A'),1110);
        assert.equal(b.percentToDps('A',100),1110);
        const pending=mode==='continuous'?b.runAtSpeed('A',5000):
            mode==='target'?b.runToPosition('A',2000,5000):b.runForTime('A',3000,5000);
        for(let ms=0;ms<4000;ms++) {
            b.step(1);
            assert.ok(Math.abs(hub.data.motors[0].degPerSec)<=950);
        }
        if(pending)assert.equal(await pending,'completed');
        b.cancel();assert.equal(hub.data.motors[0].degPerSec,0);
    }
    assert.equal(effectiveMotorSpeed(5000,{deviceId:49,limitDps:1050}),1050);
    assert.throws(()=>effectiveMotorSpeed(NaN,{deviceId:48,limitDps:1110}),TypeError);
});

test('shared-hub trajectories match the private external speed sweep without widened tolerances',
    {skip:privateEvidenceSkip},t=>{
    const fixture=readPrivateSpikeEvidence('speed-sweep.json');
    let largestAngleError=0,largestSpeedError=0;
    for(const record of fixture.records) {
        const hub=new Hub();hub.backend.runAtSpeed('A',record.speed);let elapsed=0;
        for(const sample of record.samples) {
            hub.backend.step(sample.ms-elapsed);elapsed=sample.ms;
            const actual=hub.data.motors[0];
            const ae=Math.abs(actual.position-sample.angle),se=Math.abs(actual.degPerSec-sample.speed);
            assert.ok(ae<=12,`${record.speed}@${sample.ms}: angle error ${ae}`);
            assert.ok(se<=110,`${record.speed}@${sample.ms}: speed error ${se}`);
            largestAngleError=Math.max(largestAngleError,ae);largestSpeedError=Math.max(largestSpeedError,se);
        }
    }
    t.diagnostic(`60 shared-hub samples; maximum angle error ${largestAngleError}, speed error ${largestSpeedError}`);
});
