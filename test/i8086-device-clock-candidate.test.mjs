import {test} from 'node:test';
import assert from 'node:assert/strict';
import {I8254} from '../overlay/scratch-gui/src/lib/bw-board/i8254.js';
import {installDeviceCandidate} from '../scripts/lib/i8086-device-candidates.mjs';

const original = I8254.prototype.advanceMs;
installDeviceCandidate('pit-clock');

test('conversion cache retains exact fractional state across costs and clock changes', () => {
    const candidate=new I8254(), reference=new I8254();
    for (const pit of [candidate,reference]) {
        for (let ch=0;ch<3;ch++) {
            pit.write(3,(ch<<6)|0x36);pit.write(ch,233);pit.write(ch,3);
        }
    }
    const costs=[0,1,3,4,8,12,17,25,255,256,1000,0.5,-1];
    const cpuClocks=[5000000,4772727,5000000.25];
    for(let i=0;i<10000;i++) {
        candidate.clockHz=reference.clockHz=i%101<50?1193182:1193182.125;
        const n=costs[i%costs.length], clock=cpuClocks[Math.floor(i/173)%3];
        candidate.advanceCpuCycles(n,clock);
        original.call(reference,n*1000/clock);
        assert.equal(candidate._frac,reference._frac,`fraction ${i}`);
        assert.deepEqual(candidate.getState(),reference.getState(),`state ${i}`);
    }
    assert.equal(candidate._cycleTicks.length,256);
});

test('public advanceMs overrides and unusual clocks use the reference conversion', () => {
    const pit=new I8254(), seen=[];
    pit.advanceMs=function(ms){seen.push(ms);};
    pit.advanceCpuCycles(12,5000000);
    assert.deepEqual(seen,[12*1000/5000000]);
    delete pit.advanceMs;
    let reads=0;
    Object.defineProperty(pit,'advanceMs',{configurable:true,get(){
        reads++;return function(ms){seen.push(ms);};
    }});
    pit.advanceCpuCycles(12,5000000);
    assert.equal(reads,1,'method getter is observed once, as in the original dispatch');
    delete pit.advanceMs;
    for(const cpuClock of [Infinity,NaN,-5000000]) {
        const a=new I8254(),b=new I8254();
        a.advanceCpuCycles(4,cpuClock);original.call(b,4*1000/cpuClock);
        assert.ok(Object.is(a._frac,b._frac));
        assert.deepEqual(a.getState(),b.getState());
    }
});
