import test from 'node:test';
import assert from 'node:assert/strict';
import {createZ80Target} from '../overlay/scratch-gui/src/lib/bw-board/z80-target-factory.js';
import {createFlooohZ80CycleProvider, FLOOOH_Z80_PINS, FLOOOH_Z80_STATE_FIELDS}
  from '../overlay/scratch-gui/src/lib/bw-board/floooh-z80-cycle-provider.js';

const pins = value => Object.fromEntries(FLOOOH_Z80_PINS.map(name =>
  [name, ['m1', 'mreq', 'iorq', 'rd', 'wr', 'rfsh', 'halt', 'wait', 'int', 'nmi'].includes(name)
    ? false : value]));
const cpuState = () => Object.fromEntries(FLOOOH_Z80_STATE_FIELDS.map((name, index) =>
  [name, ['prefixActive', 'iff1', 'iff2'].includes(name) ? false : index]));
const wrapper = (cost = {}) => {
  let crossings = 0;
  let step = 0;
  const metadata = {maxBatchTicks: 64, maxEvents: 64, eventBytes: 4096,
    moduleBytes: 8192, ...cost};
  return {
    reset: () => pins(0),
    tickBatch(count) {
      crossings++;
      return Array.from({length: count}, () => {
        step++;
        return {...pins(step), registers: {pc: step, step}, retired: step % 4 === 0};
      });
    },
    registers: () => ({pc: step, step}),
    saveState: cpuState,
    loadState: () => true,
    costMetadata: () => metadata,
    crossings: () => crossings
  };
};

const fastConfig = {clockHz: 4_000_000,
  regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: []};

test('default and explicit fast selection never invoke the optional loader', async () => {
  let loads = 0;
  const loadCycleModule = async () => { loads++; throw new Error('must stay lazy'); };
  for (const options of [{}, {executionMode: 'fast'}]) {
    const made = await createZ80Target({...options, config: fastConfig, loadCycleModule});
    assert.ok(made.target);
    assert.equal(made.target.capabilities().steps.includes('cycle'), false);
  }
  assert.equal(loads, 0);
});

test('only explicit cycle selection loads once and failures never masquerade as fast success', async () => {
  let loads = 0;
  const failed = await createZ80Target({executionMode: 'cycle', config: fastConfig,
    loadCycleModule: async () => { loads++; throw new Error('missing optional chunk'); }});
  assert.equal(loads, 1);
  assert.equal(failed.target, null);
  assert.equal(failed.adapter, null);
  assert.deepEqual(failed.refusal, {accepted: false, code: 'cycle-provider-load-failed',
    reason: 'missing optional chunk'});
  assert.equal(Object.hasOwn(failed, 'fallback'), false);

  await assert.rejects(() => createZ80Target({executionMode: 'automatic',
    config: fastConfig, loadCycleModule: async () => { loads++; return wrapper(); }}),
  /unknown Z80 execution mode/);
  assert.equal(loads, 1, 'an invalid selection is rejected before optional code loads');
});

test('large run slices use bounded batches and preserve a multi-batch cycle step', async () => {
  const core = wrapper();
  const made = await createZ80Target({executionMode: 'cycle', config: fastConfig,
    loadCycleModule: async () => core});
  const events = [];
  made.target.onDebugEvent(event => events.push(event));
  made.target.step('cycle', 130);
  assert.equal(made.target.runFor(1_000_000_000), 'budget');
  assert.equal(events.length, 64);
  assert.equal(made.target.runFor(1_000_000_000), 'budget');
  assert.equal(events.length, 128);
  assert.equal(made.target.runFor(1_000_000_000), 'halted');
  assert.equal(events.length, 130);
  assert.equal(core.crossings(), 3, 'one wrapper crossing per bounded batch, never one per tick');
  assert.deepEqual(events.map(event => event.time.ticks).slice(-3), [128, 129, 130]);
});

test('every module and transfer cost boundary rejects independently before ticking', async () => {
  const mutations = [
    {maxBatchTicks: 0}, {maxBatchTicks: 65_537},
    {maxBatchTicks: 64, maxEvents: 63}, {maxEvents: 65_537},
    {eventBytes: 4 * 1024 * 1024 + 1}, {moduleBytes: 2 * 1024 * 1024 + 1}
  ];
  for (const cost of mutations) {
    const core = wrapper(cost);
    const result = await createFlooohZ80CycleProvider({clockHz: 4_000_000,
      loadModule: async () => core});
    assert.equal(result.code, 'cycle-provider-cost-unsupported', JSON.stringify(cost));
    assert.equal(core.crossings(), 0);
  }
});

test('short or oversized drains throw instead of publishing partial cycle history', async () => {
  for (const tickBatch of [count => Array.from({length: count - 1}, () =>
    ({...pins(0), registers: {}})), count => Array.from({length: count + 1}, () =>
    ({...pins(0), registers: {}}))]) {
    const core = wrapper();
    core.tickBatch = tickBatch;
    const provider = await createFlooohZ80CycleProvider({clockHz: 4_000_000,
      loadModule: async () => core});
    assert.throws(() => provider.tickBatch(4), /incomplete or oversized/);
    assert.equal(provider.debugTime().ticks, 0, 'rejected drain advances no host-visible time');
  }
});
