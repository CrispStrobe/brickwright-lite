import test from 'node:test';
import assert from 'node:assert/strict';

import {createM6502Adapter} from 'bw-board/m6502-adapter.js';
import {createM6502DebugTarget} from 'bw-board/m6502-debug.js';
import {Z80Machine} from 'bw-board/z80-machine.js';
import {createZ80Adapter} from 'bw-board/z80-adapter.js';
import {createZ80DebugTarget} from 'bw-board/z80-debug.js';
import {replayOutcome, canVetoDebugInput}
    from 'bw-board/debug-replay-contract.js';
import {subscribeDebugTargetInputs} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';

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

test('classic controls do not mutate when the recorder refuses to admit the input', () => {
    const machine = new Z80Machine({
        clockHz: 3_500_000, regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: [], ula: true
    });
    const target = createZ80DebugTarget({machine});
    const beforeButtons = machine._kempston;
    const beforeKeys = machine.ula.saveState();

    // THE SAME GUARANTEE, THROUGH THE HOOK THAT NOW CARRIES IT: "an
    // un-recordable input does not happen". This used to be exercised by
    // returning a refusal from `onDebugInput`, because the bridge published
    // BEFORE applying. The converged bridge publishes AFTER acceptance and
    // ignores the TELL's return, so the veto lives in the ASK --
    // `onDebugInputAdmission`, consulted before the input reaches the machine.
    //
    // WHAT IS ASSERTED IS STILL THE MACHINE, NOT THE PLUMBING. A case that only
    // checked the call returned false would pass on a bridge that refuses the
    // caller and mutates anyway, which is the failure this guards.
    assert.equal(canVetoDebugInput(target), true,
        'this target must declare the ASK hook, or the refusal below cannot be delivered '
        + 'and the case would assert nothing');

    // Wired through the real subscription, not by calling the hook directly, so
    // the test covers the path production uses. ACTIVE ON PURPOSE: an inactive
    // session admits everything, so a veto that never fires and one that always
    // accepts are indistinguishable from outside.
    const asked = [];
    const session = {
        status: () => ({active: true}),
        appendInput: () => ({accepted: true}),
        wouldAcceptInput: input => {
            asked.push(input.producer);
            return {accepted: false, code: 'input-budget-exceeded'};
        }
    };
    const unsubscribe = subscribeDebugTargetInputs(target, session);
    assert.equal(typeof unsubscribe, 'function', 'the subscription must have taken');

    assert.equal(target.setButtons(3), false, 'a refused ASK is reported to the caller');
    assert.equal(target.setKeys(['A']), false);
    assert.equal(machine._kempston, beforeButtons, 'and the machine was not touched');
    assert.deepEqual(machine.ula.saveState(), beforeKeys);
    // The refusal was actually solicited for both inputs -- without this the
    // assertions above also pass on a target that refuses for its own reasons
    // and never consults the recorder at all.
    assert.deepEqual(asked, ['z80.buttons', 'z80.keys']);

    unsubscribe();
    // AND THE CONTROL: with the veto gone the same calls must now land, so the
    // refusal above is a fact about the ASK and not about these inputs being
    // rejected for some unrelated reason.
    assert.equal(target.setButtons(3), true, 'unsubscribed: the input is admitted again');
    assert.notEqual(machine._kempston, beforeButtons, 'and now the machine did change');
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
    // THE REASON MUST NAME THE CAUSE, and this assertion was briefly WRONG.
    //
    // Mid-bump this refused only because the chip had no paired state codec;
    // the `live board buffer-input sampling is not logged` reason had been
    // lost. I read that as a benign rename and updated the expectation to the
    // codec wording — which was an expectation edited to match a REGRESSION.
    // It was a symptom of the checkpoint gate dropping its unlogged-input
    // consequence, and fixing that restored this reason. The signal was
    // already visible and I did not act on it: a guarantee that stops naming
    // its own cause has usually lost something, not been reworded.
    //
    // So the CAUSE-NAMING reason is what is asserted, and it is asserted as a
    // MEMBER of the list rather than as the whole of it. Both reasons are
    // legitimately present here — the codec one is about restoring chip state,
    // this one about inputs that never reach the log — and a case pinning one
    // spelling of the pair reds the day the other is added.
    const refusal = target.captureCheckpoint();
    assert.match(refusal.refused, /buffer-input sampling is not logged/);
    assert.ok(target.capabilities().extensions.checkpointRefusal
        .some(reason => /buffer-input sampling/.test(reason)),
    'the declared reasons must still name the unlogged input, not only the missing codec: '
    + 'losing this reason while keeping the refusal is how the consequence went missing before');
});
