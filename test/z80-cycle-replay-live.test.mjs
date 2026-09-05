import assert from 'node:assert/strict';
import test from 'node:test';

import {createZ80CycleDebugTarget} from
    '../overlay/scratch-gui/src/lib/bw-board/z80-cycle-debug.js';
import {FLOOOH_Z80_PINS, FLOOOH_Z80_STATE_FIELDS} from
    '../overlay/scratch-gui/src/lib/bw-board/floooh-z80-cycle-provider.js';
import {createCycleReplayController} from
    '../overlay/scratch-gui/src/lib/bw-debug/cycle-replay.js';

const pins = (step, inputLevel) => Object.fromEntries(FLOOOH_Z80_PINS.map((name, index) =>
    [name, name === 'data' ? ((step + inputLevel) & 0xff) : index]));
const state = step => Object.fromEntries(FLOOOH_Z80_STATE_FIELDS.map((name, index) =>
    [name, ['prefixActive', 'iff1', 'iff2'].includes(name) ? false : step + index]));

const makeCore = () => {
    let cpu = state(10);
    let pinState = pins(cpu.step, 0);
    let inputLevel = 0;
    let corruptTick = null;
    return {
        reset() { pinState = pins(cpu.step, inputLevel); return structuredClone(pinState); },
        tickBatch(count) { return Array.from({length: count}, () => {
            cpu.step++;
            const shownStep = corruptTick === cpu.step ? cpu.step + 17 : cpu.step;
            pinState = pins(shownStep, inputLevel);
            return {...pinState, registers: {pc: cpu.pc, step: cpu.step}, retired: cpu.step % 4 === 0};
        }); },
        registers: () => ({pc: cpu.pc, step: cpu.step}),
        saveState: () => structuredClone(cpu),
        loadState(next, nextPins) { cpu = structuredClone(next); pinState = structuredClone(nextPins); },
        costMetadata: () => ({maxBatchTicks: 64, maxEvents: 64, eventBytes: 4096, moduleBytes: 8192}),
        setInput(value) { inputLevel = value; },
        corruptAt(step) { corruptTick = step; }
    };
};

const fixture = async ({timedInput = false} = {}) => {
    const core = makeCore();
    const made = await createZ80CycleDebugTarget({config: {clockHz: 4_000_000},
        loadCycleModule: async () => core});
    const base = made.target;
    const target = {
        ...base,
        capabilities: () => ({...base.capabilities(), recording: ['checkpoint', 'restore']}),
        replayCycle() {
            base.step('cycle', 1);
            return base.runFor(1_000_000) === 'halted' ? {accepted: true} :
                {accepted: false, reason: 'single cycle did not halt'};
        },
        applyReplayInput(input) {
            if (input?.producer !== 'z80.test-pin' || !Number.isSafeInteger(input.payload?.level)) {
                return {accepted: false, reason: 'invalid test pin input'};
            }
            core.setInput(input.payload.level);
            return {accepted: true};
        }
    };

    // Tick 1 is not an instruction retirement (the fake core retires every
    // fourth microstep), so this is a genuine mid-instruction checkpoint.
    target.replayCycle();
    assert.equal(target.debugTime().ticks, 1);
    assert.equal(target.regs().step % 4, 3);
    const checkpoint = {id: 4, eventCursor: 0, inputCursor: 0,
        time: target.debugTime(), snapshot: target.captureCheckpoint()};
    const expected = [];
    let nextSeq = 0;
    const unsubscribe = target.onDebugEvent(event => expected.push({schema: 1, seq: nextSeq++,
        inputCursor: timedInput && event.time.ticks >= 3 ? 1 : 0, ...structuredClone(event)}));
    target.replayCycle(); // tick 2
    if (timedInput) core.setInput(9);
    target.replayCycle(); // tick 3
    target.replayCycle(); // tick 4, instruction retirement
    unsubscribe();
    const source = target.captureCheckpoint();
    const inputs = timedInput ? [{schema: 1, cursor: 0, producer: 'z80.test-pin',
        time: {ticks: 2, domain: 'z80-tstates'}, payload: {level: 9}}] : [];
    const recorder = {
        findCheckpoint: () => structuredClone(checkpoint),
        eventsFrom: () => structuredClone(expected),
        inputsFrom: () => structuredClone(inputs)
    };
    const controller = createCycleReplayController({recorder, getTarget: () => target});
    return {controller, core, expected, source, target};
};

test('injected Z80 provider reverses one and multiple real cycles from a mid-instruction checkpoint', async () => {
    let f = await fixture();
    let result = f.controller.reverseToCycle(1);
    assert.equal(result.accepted, true, result.reason);
    assert.equal(result.replayedCycles, 1);
    assert.equal(f.target.debugTime().ticks, 2);
    assert.equal(f.target.regs().step % 4, 0, 'one reversed cycle reaches the real retire microstep');

    f = await fixture();
    result = f.controller.reverseToCycle(3);
    assert.equal(result.accepted, true, result.reason);
    assert.equal(result.replayedCycles, 3);
    assert.equal(result.replayedEvents, 3);
    assert.equal(f.target.debugTime().ticks, 4);
});

test('cycle replay verifies event facts and rolls the complete source state back on divergence', async () => {
    const f = await fixture();
    f.core.corruptAt(12); // first replayed core microstep after restoring step 11
    const result = f.controller.reverseToCycle(2);
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'REPLAY_DIVERGED');
    assert.equal(result.divergence.cursor, 0);
    assert.deepEqual(f.target.captureCheckpoint(), f.source,
        'failed replay restores the provider state that was live before reverse');
});

test('recorded input is applied at its exact Z80 cycle boundary before the following tick', async () => {
    const f = await fixture({timedInput: true});
    // Restore also restores CPU/pins, while the input source is intentionally
    // host-owned; reset it so only deterministic input replay can reproduce history.
    f.core.setInput(0);
    const result = f.controller.reverseToCycle(3);
    assert.equal(result.accepted, true, result.reason);
    assert.equal(result.replayedCycles, 3);
    assert.equal(f.target.debugTime().ticks, 4);
});
