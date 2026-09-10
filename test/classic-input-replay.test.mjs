import test from 'node:test';
import assert from 'node:assert/strict';

import {createM6502Adapter} from '../overlay/scratch-gui/src/lib/bw-board/m6502-adapter.js';
import {createM6502DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/m6502-debug.js';
import {Z80Machine} from '../overlay/scratch-gui/src/lib/bw-board/z80-machine.js';
import {createZ80Adapter} from '../overlay/scratch-gui/src/lib/bw-board/z80-adapter.js';
import {createZ80DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/z80-debug.js';
import {replayOutcome} from '../overlay/scratch-gui/src/lib/bw-board/debug-replay-contract.js';

const mConfig = {
    clockHz: 1_000_000,
    regions: [{kind: 'ram', start: 0, end: 0x5fff}, {kind: 'ram', start: 0x6010, end: 0xffff}],
    chips: [{kind: 'via', name: 'via1', at: 0x6000}]
};

test('6502 controls and adapter serial publish bounded replay facts in call order', () => {
    const adapter = createM6502Adapter({config: mConfig});
    adapter.attachBoard({advanceTo() {}, setPin() {}});
    const serial = [];
    adapter.sendSerial = byte => { serial.push(byte); return true; };
    const target = createM6502DebugTarget(adapter);
    const facts = [];
    target.onDebugInput(fact => facts.push(fact));

    assert.equal(target.setButtons(5), true);
    assert.equal(adapter.sendSerial(0x141), true);
    assert.deepEqual(facts.map(fact => [fact.producer, fact.payload]), [
        ['m6502.buttons', {mask: 5}], ['m6502.serial', {byte: 0x41}]
    ]);
    assert.ok(facts.every(fact => fact.time.domain === 'm6502-cycles'));
    // Read through replayOutcome rather than compared to a literal: these
    // targets now return the contract's shapes, and replayOutcome normalises
    // the old bare `true` and `{refused, code}` identically, so this assertion
    // holds across the change instead of pinning one spelling of success.
    assert.equal(replayOutcome(target.applyReplayInput(facts[0])).accepted, true);
    assert.equal(replayOutcome(target.applyReplayInput(facts[1])).accepted, true);
    assert.deepEqual(serial, [0x41, 0x41]);
    assert.equal(facts.length, 2, 'replay application must not recursively log itself');

    // RECLASSIFIED, not merely renamed. A byte of `'x'` is a MALFORMED FACT for
    // a producer this target fully supports, and it used to come back as
    // UNSUPPORTED_REPLAY_INPUT -- the same answer as a producer with no path at
    // all, and as a board with no VIA. Three different situations, one code. A
    // driver told "unsupported input" about a malformed payload looks for a
    // missing capability rather than at its own log.
    assert.equal(replayOutcome(
        target.applyReplayInput({producer: 'm6502.serial', payload: {byte: 'x'}})).code,
    'invalid-replay-input');
    // And the other two, so the distinction is exercised rather than described.
    assert.equal(replayOutcome(
        target.applyReplayInput({producer: 'm6502.paddle', payload: {}})).code,
    'unsupported-replay-input');
});

test('Spectrum buttons and keyboard matrix replay to an equivalent input state', () => {
    const config = {
        clockHz: 3_500_000, regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: [], ula: true
    };
    const first = new Z80Machine(config);
    const second = new Z80Machine(config);
    const target = createZ80DebugTarget({machine: first});
    const replay = createZ80DebugTarget({machine: second});
    const facts = [];
    target.onDebugInput(fact => facts.push(fact));
    assert.equal(target.setButtons(0x15), true);
    assert.equal(target.setKeys(['A', 'CAPS SHIFT']), true);
    for (const fact of facts) assert.equal(replayOutcome(replay.applyReplayInput(fact)).accepted, true);
    assert.equal(second._kempston, first._kempston);
    assert.deepEqual(second.ula.saveState(), first.ula.saveState());
    assert.equal(replay.setKeys(Array(41).fill('A')), false, 'key payload is explicitly bounded');
    assert.deepEqual(target.capabilities().extensions.inputReplay, ['z80.buttons', 'z80.keys']);
    assert.match(target.capabilities().extensions.inputRefusals[0], /tape insertion/);
    assert.deepEqual(target.capabilities().reverse, undefined);
});

test('classic controls do not mutate when recorder-before-application refuses the input', () => {
    const machine = new Z80Machine({
        clockHz: 3_500_000, regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: [], ula: true
    });
    const target = createZ80DebugTarget({machine});
    const beforeButtons = machine._kempston;
    const beforeKeys = machine.ula.saveState();
    // THE VETO CHANNEL, exercised. `publishInput` treats a listener returning
    // false or {accepted: false} as a refusal and does NOT apply the input --
    // "if it cannot be recorded, it does not happen". It is deliberately not
    // converged with the upstream targets, whose listeners are fire-and-forget:
    // adding dedup or fire-and-forget semantics here would withhold calls from
    // a channel whose whole purpose is to let the recorder decide.
    target.onDebugInput(() => ({accepted: false, code: 'input-budget-exceeded'}));

    assert.equal(target.setButtons(3), false);
    assert.equal(target.setKeys(['A']), false);
    assert.equal(machine._kempston, beforeButtons);
    assert.deepEqual(machine.ula.saveState(), beforeKeys);
});

test('live 6502 board sampling suppresses recording with an explicit reason', () => {
    const adapter = createM6502Adapter({config: mConfig});
    adapter.attachBoard({advanceTo() {}, setPin() {}, readPin() { return 1; }});
    const target = createM6502DebugTarget(adapter);
    assert.deepEqual(target.capabilities().recording, []);
    assert.match(target.capabilities().extensions.checkpointRefusal.join('; '), /input-net sampling/);
    assert.equal(target.captureCheckpoint().code, 'INCOMPLETE_CHECKPOINT_STATE');
});

test('live Z80 buffer sampling suppresses recording with an explicit reason', () => {
    const adapter = createZ80Adapter({config: {
        clockHz: 4_000_000,
        regions: [{kind: 'ram', start: 0, end: 0xffff}],
        ports: [{kind: 'buffer', name: 'inputs', at: 0x10}]
    }});
    adapter.attachBoard({readPin: () => false, setPin() {}});
    const target = createZ80DebugTarget(adapter);
    assert.deepEqual(target.capabilities().recording, []);
    assert.match(target.captureCheckpoint().refused, /buffer-input sampling/);
});
