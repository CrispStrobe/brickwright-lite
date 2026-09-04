import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {createTrace} from '../overlay/scratch-gui/src/lib/bw-debug/trace.js';

const target = {
    regs: () => ({pc: 0x1234, a: 1, b: 2, r: [], bank: 0, dptr: 0, sp: 7, psw: 0}),
    readMem: (space, address, length) => new Uint8Array(length).fill(space === 'code' ? 0 : address & 0xff),
    disasm: () => 'NOP',
    timeNs: () => 500n
};

test('legacy trace produces a reconstructed snapshot event, not a fake retire', () => {
    const events = createDebugEventStream({capacity: 4});
    const trace = createTrace({eventStream: events, cpuId: 'cpu0'});
    trace.record(target, 'breakpoint');
    const [event] = events.drain();
    assert.equal(event.kind, 'instruction');
    assert.equal(event.phase, 'snapshot');
    assert.equal(event.fidelity, 'reconstructed');
    assert.equal(event.cpuId, 'cpu0');
    assert.equal(event.pcBefore, 0x1234);
    assert.equal(event.cause, 'breakpoint');
});

test('clearing trace also resets compatibility stream ordering', () => {
    const events = createDebugEventStream({capacity: 4});
    const trace = createTrace({eventStream: events});
    trace.record(target);
    trace.clear();
    trace.record(target);
    assert.deepEqual(events.drain().map(event => event.seq), [0]);
});

test('a CPU reset opens a new time domain without discarding prior history', () => {
    let now = 500n;
    const resettable = {...target, timeNs: () => now};
    const events = createDebugEventStream({capacity: 4});
    const trace = createTrace({eventStream: events});
    trace.record(resettable);
    now = 0n;
    trace.record(resettable, 'reset');
    const batch = events.drain();
    assert.deepEqual(batch.map(event => event.time.domain),
        ['simulation-ns', 'simulation-ns-reset-1']);
    assert.equal(trace.rows().length, 2, 'reset is a boundary in history, not a request to erase it');
});
