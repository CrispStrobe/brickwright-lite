import {test} from 'node:test';
import assert from 'node:assert/strict';
import {I8086Machine} from 'bw-board/i8086-machine.js';
import {installRamWordExperiment} from '../scripts/lib/i8086-ram-experiment.mjs';

test('guarded word access preserves wrap, ROM/open bus, video and installed observers', () => {
    for (const trace of [false,true]) for (const watched of [false,true]) {
        const pair = [false,true].map(fast => {
            const machine = new I8086Machine({clockHz: 5e6, chips: [], fastWords: false, regions: [
                {kind:'ram',start:0,end:0xbffff}, {kind:'rom',start:0xf0000,end:0xfffff}]});
            const events = [];
            if (fast) installRamWordExperiment(machine);
            if (trace) machine.cpu.busTrace = events;
            if (watched) {
                const r = machine.cpu.read, w = machine.cpu.write;
                machine.cpu.read = a => {events.push(['r',a]); return r(a);};
                machine.cpu.write = (a,v) => {events.push(['w',a,v]); return w(a,v);};
            }
            return {machine,events};
        });
        for (const seg of [0,1,0x1000,0xa000,0xbfff,0xc000,0xf000,0xffff])
        for (const off of [0,1,4094,4095,65534,65535]) {
            const reads = pair.map(({machine}) => {
                machine.cpu._wr16(seg,off,0x1234);
                return machine.cpu._rd16(seg,off);
            });
            assert.equal(reads[0],reads[1]);
        }
        assert.deepEqual(pair[0].machine.mem,pair[1].machine.mem);
        assert.equal(pair[0].machine.displayRevision,pair[1].machine.displayRevision);
        assert.deepEqual(pair[0].events,pair[1].events);
    }
});

test('replaced machine bus and bulk memory restoration cannot bypass byte behavior', () => {
    const machine = new I8086Machine({chips:[], regions:[{kind:'ram',start:0,end:0xfffff}]});
    installRamWordExperiment(machine);
    machine.mem = new Uint8Array(machine.mem); machine.mem[0] = 12;
    assert.equal(machine.cpu._rd16(0,0),12);
    let reads = 0, writes = 0;
    machine._read = () => ++reads;
    machine._write = () => writes++;
    assert.equal(machine.cpu._rd16(0,0),513);
    machine.cpu._wr16(0,0,123);
    assert.equal(writes,2);
});
