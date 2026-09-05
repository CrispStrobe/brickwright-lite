import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {I8086Machine, BLINK8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';

const PROGRAM = Uint8Array.of(
    0xb8, 0x34, 0x12,       // mov ax,1234h
    0x8e, 0xd8,             // mov ds,ax (leaves interrupt shadow)
    0xb0, 0x80,             // mov al,80h
    0xe6, 0x63,             // out 63h,al (8255 mode)
    0xb0, 0xaa,             // mov al,aah
    0xe6, 0x61,             // out 61h,al
    0xa2, 0x00, 0x02,       // mov [0200h],al
    0xeb, 0xfe              // jmp $
);

const fixture = () => {
    const machine = new I8086Machine(BLINK8086);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    machine.cpu.ss = 0;
    machine.cpu.sp = 0x900;
    machine.mem.set(PROGRAM, 0x100);
    return {machine, target: createI8086DebugTarget({machine})};
};

const canonical = value => {
    if (ArrayBuffer.isView(value)) return Array.from(value);
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    }
    return value;
};
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

test('8086 instruction checkpoint restores complete CPU, RAM, device, clock and pending-line state', () => {
    const {machine, target} = fixture();
    machine.step();
    machine.step();
    assert.equal(machine.cpu.intShadow, 1, 'fixture must checkpoint the interrupt shadow itself');
    machine.nmi();
    const checkpoint = target.captureCheckpoint();

    for (let i = 0; i < 5; i++) machine.step();
    machine.keyIn(0x1e); // unsupported on BLINK, but must not perturb the snapshot proof
    target.restoreCheckpoint(checkpoint);

    assert.deepEqual(machine.saveState(), checkpoint.machine);
    assert.equal(checkpoint.schema, 1);
    assert.equal(checkpoint.mode, 'instruction');
    assert.equal(checkpoint.time.ticks, machine.cycles);
    assert.equal(checkpoint.time.domain, 'i8086-cycles');
    assert.deepEqual(target.capabilities().recording, ['checkpoint', 'restore']);
});

test('8086 restore deterministically replays machine state and recorded instruction facts', () => {
    const {machine, target} = fixture();
    machine.step();
    machine.step();
    const checkpoint = target.captureCheckpoint();
    const events = [];
    target.onDebugEvent(event => events.push(event));

    const run = () => {
        const start = events.length;
        for (let i = 0; i < 6; i++) machine.step();
        const facts = events.slice(start).map(({time, ...event}) => ({ticks: time.ticks, ...event}));
        return hash({state: machine.saveState(), facts});
    };
    const first = run();
    target.restoreCheckpoint(checkpoint);
    const second = run();
    assert.equal(second, first, 'restored execution diverged from its first instruction-mode replay');
});

test('8086 restore rejects incomplete or mismatched snapshots before mutation', () => {
    const {machine, target} = fixture();
    machine.step();
    const checkpoint = target.captureCheckpoint();
    const before = machine.saveState();
    const incomplete = {...checkpoint, machine: {...checkpoint.machine, cpu: {...checkpoint.machine.cpu}}};
    delete incomplete.machine.cpu.intShadow;
    assert.throws(() => target.restoreCheckpoint(incomplete), /CPU field 'intShadow' is missing/);
    assert.deepEqual(machine.saveState(), before);

    assert.throws(() => target.restoreCheckpoint({...checkpoint, variant: '80186'}),
        /incompatible target snapshot/);
    assert.deepEqual(machine.saveState(), before);
});

test('8086 does not advertise checkpoints with an unsnapshotable attached device', () => {
    const {machine, target} = fixture();
    machine.attachDevice('opaque', {advance() {}});
    assert.deepEqual(target.capabilities().recording, []);
    assert.throws(() => target.captureCheckpoint(), /machine state is incomplete/);
});

test('8086 fails closed while an external bus-trace cursor or audio mixer is live', () => {
    const traced = fixture();
    traced.machine.cpu.busTrace = [];
    assert.deepEqual(traced.target.capabilities().recording, []);
    assert.throws(() => traced.target.captureCheckpoint(), /machine state is incomplete/);

    const audible = fixture();
    void audible.machine.audio;
    assert.deepEqual(audible.target.capabilities().recording, []);
    assert.throws(() => audible.target.captureCheckpoint(), /machine state is incomplete/);
});

test('8086 refuses a machine-only checkpoint when a boundary service owns hidden state', () => {
    const {machine} = fixture();
    const target = createI8086DebugTarget({machine, step: () => machine.step()});
    assert.deepEqual(target.capabilities().recording, []);
    assert.throws(() => target.captureCheckpoint(), /machine state is incomplete/);
});
