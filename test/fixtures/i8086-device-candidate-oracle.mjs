import assert from 'node:assert/strict';
import {I8086Machine} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {I8254} from '../../overlay/scratch-gui/src/lib/bw-board/i8254.js';
import {CGACard} from '../../overlay/scratch-gui/src/lib/bw-board/cga-card.js';
import {installDeviceCandidate} from '../../scripts/lib/i8086-device-candidates.mjs';
const original={advanceMs:I8254.prototype.advanceMs,
    counter:Object.getPrototypeOf(new I8254().counters[0]).advance,
    frame:CGACard.prototype._framePos,
    build:I8086Machine.prototype._buildAdvanceList,
    advance:I8086Machine.prototype._advanceChips,
    wake:I8086Machine.prototype._wakeHorizon};
const variant=process.argv[2];
installDeviceCandidate('none');
assert.equal(I8254.prototype.advanceMs,original.advanceMs);
installDeviceCandidate(variant);
const installedAdvance=I8254.prototype.advanceMs;
installDeviceCandidate(variant);
assert.equal(I8254.prototype.advanceMs,installedAdvance,'idempotent installation');
assert.throws(()=>installDeviceCandidate('unknown'),/Unknown/);
assert.throws(()=>installDeviceCandidate('none'),/fresh isolated realm/);

function fixture(reference) {
    const machine=new I8086Machine({clockHz:5000000,regions:[],chips:[
        {kind:'pit',name:'pit',at:0x40},{kind:'cga',name:'cga',at:0x3d0}]});
    const pit=machine.chips.pit,cga=machine.chips.cga,trace=[];
    if(reference) {
        pit.advanceMs=original.advanceMs;
        for(const c of pit.counters)c.advance=function(ticks){
            if(this.nullCount || (!this.gate && this.mode!==1 && this.mode!==5))return;
            for(let t=0;t<ticks;t++)this._tick();
        };
        cga._framePos=original.frame;
        machine._buildAdvanceList=original.build;
        machine._advanceChips=original.advance;
        machine._wakeHorizon=original.wake;
    }
    const snapshot=()=>({cycles:machine.cycles,pit:pit.getState(),frac:pit._frac,cga:cga.getState()});
    let edges=0;
    pit.hooks.onOutput=(channel,level)=>{
        trace.push({channel,level,state:snapshot()});
        if(channel===0 && ++edges===2) machine.attachDevice('late',{advance(n){trace.push({late:n,state:snapshot()});}});
        if(channel===0 && edges%19===0)pit.counters[1].setGate(1-pit.counters[1].gate);
    };
    cga.hooks.onVSync=()=>{trace.push({vsync:snapshot()});cga.write(4,6);cga.write(5,22+edges%3);};
    // A preceding callback can change CPU and device clocks during traversal.
    machine.chips={clockTap:{advanceMs(ms){
        trace.push({ms});
        machine.clockHz=machine.cycles%7?5000000:4772727.25;
        pit.clockHz=machine.cycles%13?1193182:1193182.125;
    }},...machine.chips};
    machine.attachDevice('observer',{advance(n){trace.push({n,state:snapshot()});}});
    return {machine,pit,cga,trace,snapshot,advanceMs:pit.advanceMs,counterAdvance:pit.counters[1].advance};
}
const a=fixture(false),b=fixture(true),costs=[0,1,4,12,25,255,256,1000,0.5,-1];
for(let i=0;i<4000;i++) {
    for(const f of [a,b]) {
        if(i%37===0)for(let ch=0;ch<3;ch++) {
            const mode=Math.floor(i/37)%8,bcd=Math.floor(i/296)%2;
            f.pit.write(3,ch<<6|0x30|mode<<1|bcd);
            f.pit.write(ch,23+ch*17);f.pit.write(ch,0);
            f.pit.counters[ch].setGate(0);f.pit.counters[ch].setGate(1);
        }
        if(i%113===0){f.pit.write(3,0);f.pit.read(0);}
        if(i%173===0)f.pit.setState(structuredClone(f.pit.getState()));
        if(i===700) f.pit.advanceMs=function(ms){f.trace.push({override:ms});return f.advanceMs.call(this,ms);};
        if(i===900)f.pit.advanceMs=f.advanceMs;
        if(i===1000)f.pit.counters[1].advance=function(t){f.trace.push({counterOverride:t});return f.counterAdvance.call(this,t);};
        if(i===1200)f.pit.counters[1].advance=f.counterAdvance;
        const n=costs[i%costs.length];f.machine.cycles+=n;f.machine._advanceChips(n);
    }
    assert.deepEqual(a.snapshot(),b.snapshot(),`state ${variant}/${i}`);
    assert.deepEqual(a.trace,b.trace,`callbacks ${variant}/${i}`);
    assert.equal(a.machine._wakeHorizon(),b.machine._wakeHorizon(),`halt deadline ${variant}/${i}`);
    a.trace.length=b.trace.length=0;
}
assert.ok(a.machine.devices.late);
assert.ok(a.cga._frameCount>0);
for(const cycles of [-0,0,1,123456,Number.MAX_SAFE_INTEGER,-5,NaN,Infinity]) {
    assert.ok(Object.is(a.cga._framePos(cycles),original.frame.call(a.cga,cycles)),'frame position');
}
console.log(`${variant}: exact state, callback order and halt deadlines`);
