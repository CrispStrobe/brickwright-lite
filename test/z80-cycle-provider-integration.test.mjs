import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlooohZ80CycleProvider, FLOOOH_Z80_PINS, FLOOOH_Z80_STATE_FIELDS}
  from '../overlay/scratch-gui/src/lib/bw-board/floooh-z80-cycle-provider.js';
import {createZ80CycleDebugTarget}
  from '../overlay/scratch-gui/src/lib/bw-board/z80-cycle-debug.js';
import {createDebugTarget}
  from '../overlay/scratch-gui/src/lib/bw-board/debug-target-factory.js';

const pins = value => Object.fromEntries(FLOOOH_Z80_PINS.map((name, i) => [name, name === 'data' ? value : i]));
const state = value => Object.fromEntries(FLOOOH_Z80_STATE_FIELDS.map((name, i) =>
  [name, ['prefixActive', 'iff1', 'iff2'].includes(name) ? false : value + i]));
const fakeModule = () => {
  let cpu = state(10); let pinState = pins(0); let loads = 0;
  return {
    reset() { pinState = pins(0); return pinState; },
    tick() { cpu.step++; pinState = pins(cpu.step); return {...pinState, retired: cpu.step % 4 === 0}; },
    registers() { return {pc: cpu.pc, step: cpu.step}; },
    saveState() { return structuredClone(cpu); },
    loadState(next, nextPins) { cpu = structuredClone(next); pinState = structuredClone(nextPins); loads++; },
    loadCount: () => loads
  };
};

test('fast Z80 remains the default and cycle mode fails closed without an optional module', async () => {
  const fast = await createDebugTarget('z80', {config: {clockHz: 4_000_000,
    regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: []}});
  assert.ok(fast.target);
  assert.equal(fast.target.capabilities().steps.includes('cycle'), false);
  const absent = await createDebugTarget('z80', {executionMode: 'cycle', config: {clockHz: 4_000_000}});
  assert.equal(absent.target, null);
  assert.equal(absent.refusal.code, 'cycle-provider-unavailable');
  assert.equal(absent.adapter, null, 'cycle selection never falls back to the fast adapter');
});

test('injected floooh boundary records one immutable pin event per real tick', async () => {
  const core = fakeModule();
  const made = await createZ80CycleDebugTarget({config: {clockHz: 4_000_000},
    loadCycleModule: async () => core});
  assert.equal(made.accepted, true);
  assert.deepEqual(made.target.capabilities().steps, ['cycle']);
  assert.match(made.target.cycleProvider().engine, /^floooh-z80@[0-9a-f]{40}$/);
  assert.deepEqual(made.target.capabilities().recording, [],
    'provider-only state must not claim a complete machine checkpoint');
  const events = [];
  made.target.onDebugEvent(event => events.push(event));
  made.target.step('cycle', 2);
  assert.equal(made.target.runFor(1_000_000), 'halted');
  assert.deepEqual(events.map(event => event.time.ticks), [1, 2]);
  assert.ok(events.every(event => event.fidelity === 'recorded' && event.phase === 'tick'));
  assert.notEqual(events[0].signals, events[1].signals);
});

test('snapshots enumerate named state, reject omissions before mutation, and restore defensively', async () => {
  const core = fakeModule();
  const provider = await createFlooohZ80CycleProvider({clockHz: 4_000_000,
    loadModule: async () => core});
  provider.tick();
  const snapshot = provider.captureState();
  assert.deepEqual(Object.keys(snapshot.cpu), [...FLOOOH_Z80_STATE_FIELDS]);
  const malformed = structuredClone(snapshot); delete malformed.cpu.intBits;
  assert.throws(() => provider.restoreState(malformed), /incomplete/);
  assert.equal(core.loadCount(), 0, 'invalid state is rejected before the core is touched');
  const mistyped = structuredClone(snapshot); mistyped.cpu.step = '1';
  assert.throws(() => provider.restoreState(mistyped), /incomplete/);
  provider.tick();
  assert.equal(provider.restoreState(snapshot), true);
  snapshot.cpu.pc = 0xffff;
  assert.notEqual(provider.registers().pc, 0xffff, 'restore does not alias caller-owned state');
});

test('wrapper ABI and loader failures return stable refusals', async () => {
  assert.equal((await createFlooohZ80CycleProvider({clockHz: 1, loadModule: async () => ({})})).code,
    'cycle-provider-abi-mismatch');
  assert.equal((await createFlooohZ80CycleProvider({clockHz: 1,
    loadModule: async () => { throw new Error('missing wasm'); }})).code, 'cycle-provider-load-failed');
});
