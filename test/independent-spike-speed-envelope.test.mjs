// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {effectiveMotorSpeed} from '../overlay/scratch-gui/src/lib/spike-sim/speed-envelope.mjs';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

test('nominal limits stay public while the simulator actuator envelope bounds all command modes',async()=>{
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
