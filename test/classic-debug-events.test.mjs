import test from 'node:test';
import assert from 'node:assert/strict';
import {createM6502Adapter} from '../overlay/scratch-gui/src/lib/bw-board/m6502-adapter.js';
import {createM6502DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/m6502-debug.js';
import {createZ80Adapter} from '../overlay/scratch-gui/src/lib/bw-board/z80-adapter.js';
import {createZ80DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/z80-debug.js';

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

test('Z80 publishes real IN/OUT evidence without claiming cycle placement', () => {
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
    0xdb, 0x11        // IN A,($11) -- full port $2a11, open bus $ff
  ], 0);

  target.step('insn', 3);
  assert.equal(target.runFor(100_000), 'halted');

  const retires = events.filter(event => event.kind === 'instruction');
  assert.deepEqual(retires.map(event => [event.pcBefore, event.pcAfter]), [
    [0, 2], [2, 4], [4, 6]
  ]);
  assert.deepEqual(retires.map(event => event.time.ticks), [7n, 18n, 29n]);
  assert.ok(retires.every(event => event.cpuId === 'cpu-z' && event.fidelity === 'recorded'));
  assert.deepEqual(events.filter(event => event.kind === 'port').map(event => event.port), [
    {address: 0x2a10, direction: 'write', value: 0x2a},
    {address: 0x2a11, direction: 'read', value: 0xff}
  ]);
  assert.ok(events.filter(event => event.kind === 'port')
    .every(event => event.fidelity === 'reconstructed'));
  assert.deepEqual(target.capabilities().events, ['instruction', 'memory', 'port']);
  assert.equal(target.capabilities().steps.includes('cycle'), false);
});
