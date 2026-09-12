import {test} from 'node:test';
import assert from 'node:assert/strict';
import {I8086Machine} from 'bw-board/i8086-machine.js';
import {createPitSchedulingExperiment} from '../scripts/lib/i8086-pit-scheduling-experiment.mjs';
const fixture = () => {
    const machine = new I8086Machine({clockHz:5e6,regions:[{kind:'ram',start:0,end:0xfffff}],
        chips:[{kind:'pit',name:'pit',at:0x40}]});
    machine.cpu.cs = 0; machine.cpu.ip = 0x100;
    machine.mem.set([0x40,0xeb,0xfd],0x100);
    machine._out(0x43,0x36); machine._out(0x40,100); machine._out(0x40,0);
    return machine;
};

test('scoped PIT scheduling preserves fractional phase, edge callbacks and bus barriers', () => {
    const receipts = [false,true].map(scheduled => {
        const machine = fixture(), pit = machine.chips.pit, events = [];
        pit.counters[0].hooks.onOutput = () => events.push({cycles:machine.cycles,state:pit.getState(),phase:pit._frac});
        const scheduler = createPitSchedulingExperiment(machine);
        const run = () => {
            for (let i = 0; i < 10000; i++) {
                machine.step();
                if (i % 211 === 0) { machine._out(0x43,0); machine._in(0x40); }
                if (i % 377 === 0) pit.counters[0].setGate(i % 2);
            }
        };
        if (scheduled) scheduler.run(run); else run();
        if (scheduled) assert.ok(scheduler.stats.deferredCalls > 100);
        return {events,state:pit.getState(),phase:pit._frac,cycles:machine.cycles};
    });
    assert.deepEqual(receipts[0],receipts[1]);
});

test('public counter fields remain a reason NOT to enable scoped batching for arbitrary clients', () => {
    const machine = fixture(), pit = machine.chips.pit;
    const scheduler = createPitSchedulingExperiment(machine);
    scheduler.run(() => {
        const before = pit.counters[0].ce;
        for (let i = 0; i < 5; i++) machine.step();
        const stale = pit.counters[0].ce;
        const coherent = pit.getState().counters[0].ce;
        assert.equal(stale,before);
        assert.notEqual(stale,coherent, 'a direct public field read needs a new observation contract');
    });
});
