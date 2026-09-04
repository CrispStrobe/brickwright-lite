import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const {
    createDebugEventStream,
    deserializeDebugEvent,
    normalizeDebugEvent,
    serializeDebugEvent
} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-debug/event-stream.js'));

const event = (seq, ticks = seq, extra = {}) => ({
    schema: 1,
    seq,
    time: {ticks, domain: 'oscillator', hz: 12000000},
    cpuId: 'main',
    kind: 'instruction',
    phase: 'retire',
    fidelity: 'recorded',
    pcBefore: 0x100 + Number(seq),
    pcAfter: 0x101 + Number(seq),
    ...extra
});

test('normalization copies decoded events and ignores unknown optional fields', () => {
    const raw = event(1, 2n, {futureOptional: {secret: true}});
    const normalized = normalizeDebugEvent(raw);
    assert.equal(normalized.futureOptional, undefined);
    assert.equal(normalized.time.ticks, 2n);
    raw.time.ticks = 99n;
    assert.equal(normalized.time.ticks, 2n, 'producer mutation cannot alter the retained event');
});

test('unknown required fields and unknown fidelity are refused explicitly', () => {
    assert.throws(() => normalizeDebugEvent({...event(1), requiredFields: ['warpDrive']}),
        /unknown required field warpDrive/);
    assert.throws(() => normalizeDebugEvent({...event(1), fidelity: 'probably'}),
        /unknown fidelity probably/);
});

test('retire and mutation events fail closed when their evidence is incomplete', () => {
    const retire = event(1);
    delete retire.pcAfter;
    assert.throws(() => normalizeDebugEvent(retire), /retire requires pcBefore and pcAfter/);
    assert.throws(() => normalizeDebugEvent({...event(2), kind: 'memory', memory: {space: 'xram'}}),
        /memory event requires space, address, and value/);
});

test('typed port, signal and interrupt evidence survives normalization', () => {
    const port = normalizeDebugEvent({...event(1), kind: 'port',
        port: {address: 0x3f8, direction: 'write', value: 65}});
    const signal = normalizeDebugEvent({...event(2), kind: 'signal',
        signal: {name: 'irq', before: 0, value: 1}});
    const interrupt = normalizeDebugEvent({...event(3), kind: 'interrupt',
        interrupt: {vector: 8}, phase: 'acknowledge'});
    assert.equal(port.port.value, 65);
    assert.equal(signal.signal.name, 'irq');
    assert.equal(interrupt.interrupt.vector, 8);
});

test('sequence is strictly increasing and time is monotonic independently per domain', () => {
    const stream = createDebugEventStream();
    stream.append(event(1, 10));
    assert.throws(() => stream.append(event(1, 11)), /seq must be strictly increasing/);
    stream.append(event(2, 1, {time: {ticks: 1, domain: 'cpu'}}));
    assert.throws(() => stream.append(event(3, 9)), /time decreased in domain oscillator/);
    assert.equal(stream.size(), 2, 'refused events never enter the ring');
});

test('overwrite is bounded and drain exposes an exact gap before retained events', () => {
    const stream = createDebugEventStream({capacity: 2});
    stream.append(event(10));
    stream.append(event(11));
    stream.append(event(12));
    stream.append(event(13));

    assert.equal(stream.size(), 2);
    assert.equal(stream.dropped(), 2);
    const batch = stream.drain();
    assert.deepEqual(batch.map(row => row.kind), ['gap', 'instruction', 'instruction']);
    assert.deepEqual(batch[0], {schema: 1, kind: 'gap', dropped: 2, beforeSeq: 12});
    assert.deepEqual(batch.slice(1).map(row => row.seq), [12, 13]);
    assert.deepEqual(stream.drain(), [], 'a reported gap is not repeated');
});

test('batch drain preserves order and leaves the undrained tail', () => {
    const stream = createDebugEventStream({capacity: 4});
    for (let seq = 0; seq < 4; seq++) stream.append(event(seq));
    assert.deepEqual(stream.drain(2).map(row => row.seq), [0, 1]);
    assert.equal(stream.size(), 2);
    assert.deepEqual(stream.drain().map(row => row.seq), [2, 3]);
});

test('publish owns one total sequence across independent producers', () => {
    const stream = createDebugEventStream();
    const facts = extra => ({
        time: {ticks: 1, domain: extra.cpuId},
        kind: 'instruction', phase: 'retire', fidelity: 'recorded',
        pcBefore: 0, pcAfter: 1, ...extra
    });
    stream.publish(facts({cpuId: 'cpu0'}));
    stream.publish(facts({cpuId: 'cpu1'}));
    assert.deepEqual(stream.drain().map(row => row.seq), [0, 1]);
});

test('publish continues after explicitly sequenced compatibility events and resets on clear', () => {
    const stream = createDebugEventStream();
    stream.append(event(41));
    stream.publish({
        time: {ticks: 42, domain: 'oscillator', hz: 12000000}, cpuId: 'main',
        kind: 'instruction', phase: 'retire', fidelity: 'recorded',
        pcBefore: 1, pcAfter: 2
    });
    assert.deepEqual(stream.drain().map(row => row.seq), [41, 42]);
    stream.clear();
    stream.publish({
        time: {ticks: 0, domain: 'oscillator'}, cpuId: 'main',
        kind: 'instruction', phase: 'retire', fidelity: 'recorded',
        pcBefore: 0, pcAfter: 1
    });
    assert.deepEqual(stream.drain().map(row => row.seq), [0]);
});

test('stable serialization sorts keys and carries bigint without JSON loss', () => {
    const first = serializeDebugEvent(event(0x20000000000001n, 0x20000000000002n));
    const second = serializeDebugEvent({...event(0x20000000000001n, 0x20000000000002n)});
    assert.equal(first, second);
    assert.match(first, /"seq":"0x20000000000001"/);
    assert.equal(deserializeDebugEvent(first).time.ticks, '0x20000000000002');
});

test('malformed JSON, unsafe numeric ordinals, and invalid capacities are refused', () => {
    assert.throws(() => deserializeDebugEvent('{'), /malformed JSON/);
    assert.throws(() => normalizeDebugEvent(event(Number.MAX_SAFE_INTEGER + 1)), /safe integer/);
    assert.throws(() => createDebugEventStream({capacity: 0}), /positive integer/);
});
