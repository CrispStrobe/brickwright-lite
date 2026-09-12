import test from 'node:test';
import assert from 'node:assert/strict';
import {createM6502Adapter} from 'bw-board/m6502-adapter.js';
import {createM6502DebugTarget} from 'bw-board/m6502-debug.js';
import {createZ80Adapter} from 'bw-board/z80-adapter.js';
import {createZ80DebugTarget} from 'bw-board/z80-debug.js';

const board = {advanceTo() {}, setPin() {}};

test('6502 publishes observed retires and honest instruction-atomic memory evidence', () => {
  const adapter = createM6502Adapter({config: {
    clockHz: 1_000_000,
    regions: [{kind: 'ram', start: 0, end: 0xffff}],
    chips: []
  }});
  adapter.attachBoard(board);
  const target = createM6502DebugTarget(adapter, {cpuId: 'cpu-a'});
  const events = [];
  const off = target.onDebugEvent(event => events.push(event));
  const cycleBase = adapter.machine.cycles;
  adapter.machine.cpu.pc = 0x0200;
  adapter.machine.mem.set([0xa9, 0x2a, 0x85, 0x10], 0x0200); // LDA #$2a; STA $10

  target.step('insn', 2);
  assert.equal(target.runFor(100_000), 'halted');
  off();

  const retires = events.filter(event => event.kind === 'instruction');
  assert.deepEqual(retires.map(event => [event.pcBefore, event.pcAfter]), [
    [0x0200, 0x0202], [0x0202, 0x0204]
  ]);
  assert.deepEqual(retires.map(event => event.time.ticks), [
    BigInt(cycleBase + 2), BigInt(cycleBase + 5)
  ]);
  assert.ok(retires.every(event => event.fidelity === 'recorded'));
  assert.deepEqual(retires[0].instruction.bytes, [0xa9, 0x2a]);
  assert.equal(retires[0].registersAfter.a, 0x2a);
  assert.deepEqual(retires[0].changes.registers.a, {before: 0, after: 0x2a});
  assert.ok(events.some(event => event.kind === 'memory' &&
    event.memory.direction === 'write' && event.memory.address === 0x10 && event.memory.value === 0x2a));
  assert.ok(events.filter(event => event.kind === 'memory')
    .every(event => event.fidelity === 'reconstructed'));
  assert.equal(target.capabilities().steps.includes('cycle'), false);
  assert.equal(target.capabilities().fidelity.cycle, 'unsupported');

  target.step('insn');
  target.runFor(100_000);
  assert.equal(events.filter(event => event.kind === 'instruction').length, 2,
    'unsubscribe stops publication without stopping execution');
});

test('6502 retire metadata keeps pre-execution bytes when code overwrites itself', () => {
  const adapter = createM6502Adapter({config: {clockHz: 1_000_000,
    regions: [{kind: 'ram', start: 0, end: 0xffff}], chips: []}});
  adapter.attachBoard(board);
  const target = createM6502DebugTarget(adapter);
  const events = [];
  target.onDebugEvent(event => events.push(event));
  adapter.machine.cpu.pc = 0x0200;
  adapter.machine.cpu.a = 0xea;
  adapter.machine.mem.set([0x8d, 0x00, 0x02], 0x0200); // STA $0200
  target.step('insn');
  target.runFor(100_000);
  const retire = events.find(event => event.kind === 'instruction');
  assert.deepEqual(retire.instruction.bytes, [0x8d, 0x00, 0x02]);
  assert.equal(adapter.machine.mem[0x0200], 0xea);
});

test('Z80 publishes real port and memory accesses before their following retires', () => {
  const adapter = createZ80Adapter({config: {
    clockHz: 4_000_000,
    regions: [{kind: 'ram', start: 0, end: 0xffff}],
    ports: []
  }});
  adapter.attachBoard({advanceTo() {}});
  const target = createZ80DebugTarget(adapter, {cpuId: 'cpu-z'});
  const events = [];
  target.onDebugEvent(event => events.push(event));
  adapter.machine.mem.set([
    0x3e, 0x2a,       // LD A,$2a
    0xd3, 0x10,       // OUT ($10),A -- full port $2a10
    0x32, 0x00, 0x20  // LD ($2000),A
  ], 0);

  target.step('insn', 3);
  assert.equal(target.runFor(100_000), 'halted');

  const retires = events.filter(event => event.kind === 'instruction');
  assert.deepEqual(retires.map(event => [event.pcBefore, event.pcAfter]), [
    [0, 2], [2, 4], [4, 7]
  ]);
  assert.deepEqual(retires.map(event => event.time.ticks), [7n, 18n, 31n]);
  assert.ok(retires.every(event => event.cpuId === 'cpu-z' && event.fidelity === 'recorded'));
  assert.deepEqual(retires[0].instruction.bytes, [0x3e, 0x2a]);
  assert.equal(retires[0].registersAfter.a, 0x2a);
  assert.deepEqual(retires[0].changes.registers.a, {before: 0, after: 0x2a});
  assert.deepEqual(events.filter(event => event.kind === 'port').map(event => event.port), [
    {address: 0x2a10, direction: 'write', value: 0x2a}
  ]);
  const memoryWrite = events.find(event => event.kind === 'memory' &&
    event.memory.direction === 'write' && event.memory.address === 0x2000);
  const portWrite = events.find(event => event.kind === 'port');
  assert.equal(memoryWrite.memory.value, 0x2a);
  assert.equal(adapter.machine.mem[0x2000], 0x2a);
  for (const [access, pcAfter] of [[portWrite, 4], [memoryWrite, 7]]) {
    const index = events.indexOf(access);
    const following = events[index + 1];
    assert.equal(following.kind, 'instruction', 'the access is adjacent to its following retire');
    assert.equal(following.phase, 'retire');
    assert.equal(following.pcAfter, pcAfter);
    assert.ok(access.time.ticks <= following.time.ticks);
  }
  assert.ok(events.filter(event => event.kind === 'port')
    .every(event => event.fidelity === 'reconstructed'));
  assert.deepEqual(target.capabilities().events, ['instruction', 'memory', 'port']);
  assert.equal(target.capabilities().extensions.eventBreakpointBoundary, 'instruction-retire');
  assert.equal(target.capabilities().steps.includes('cycle'), false);
});

test('Z80 retire metadata keeps pre-execution bytes when code overwrites itself', () => {
  const adapter = createZ80Adapter({config: {clockHz: 4_000_000,
    regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: []}});
  adapter.attachBoard({advanceTo() {}});
  const target = createZ80DebugTarget(adapter);
  const events = [];
  target.onDebugEvent(event => events.push(event));
  adapter.machine.cpu.a = 0;
  adapter.machine.mem.set([0x32, 0x00, 0x00], 0); // LD ($0000),A
  target.step('insn');
  target.runFor(100_000);
  const retire = events.find(event => event.kind === 'instruction');
  assert.deepEqual(retire.instruction.bytes, [0x32, 0x00, 0x00]);
  assert.equal(adapter.machine.mem[0], 0);
});
