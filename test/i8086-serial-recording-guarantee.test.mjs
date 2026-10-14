/**
 * The 8086 serial RECORDING guarantee, pinned before the bw-board pin moves.
 *
 * WHY THIS EXISTS. Lite and upstream record a received serial byte by two
 * different mechanisms, and the bump replaces lite's file with upstream's:
 *
 *   lite      `sendSerial()` calls `adapter.sendSerial` and THEN publishes
 *             itself. Nothing wraps the adapter, so a caller holding the
 *             adapter and calling it directly is not recorded -- a bypass the
 *             file's own comment states rather than claims closed.
 *
 *   upstream  wraps `adapter.sendSerial` at CONSTRUCTION, and `sendSerial()`
 *             then DELIBERATELY DOES NOT PUBLISH when an adapter is present,
 *             because publishing as well would log the byte twice.
 *
 * Both are correct for themselves, and both record a byte sent through the
 * TARGET. That is the guarantee, and it is the one with no test -- which is
 * why it can be lost without anything going red.
 *
 * THE TWO WAYS THE BUMP CAN BREAK IT, and this file is shaped to catch both:
 *
 *   LOSS.       Take upstream's `sendSerial` without its construction-time
 *               wrapper (a hand-merge rather than a wholesale take) and the
 *               method delegates to an unwrapped adapter and publishes
 *               nothing. Zero facts. The replay log is simply short.
 *   DOUBLE-LOG. Keep lite's publish AND adopt upstream's wrapper and the byte
 *               is recorded twice. The same shape as two copies of one
 *               mechanism converging -- a merge that keeps both halves.
 *
 * So the assertion is EXACTLY ONE fact, never "at least one": the count is the
 * only thing that separates the guarantee from either failure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {I8086Machine, TIERA8088} from 'bw-board/i8086-machine.js';
import {createI8086DebugTarget} from 'bw-board/i8086-debug.js';
import {createI8086Adapter} from 'bw-board/i8086-adapter.js';

/** TIERA8088 plus a UART, so there is a chip to take the byte. */
const withUart = () => ({...TIERA8088, chips: [...TIERA8088.chips,
    {kind: 'uart16550', name: 'uart1', at: 0x10}]});

const serialFacts = facts => facts.filter(f => f.producer === 'i8086.serial');

test('a byte sent through the 8086 TARGET is recorded exactly once, with an adapter', () => {
    const adapter = createI8086Adapter({config: withUart()});
    assert.equal(typeof adapter.sendSerial, 'function',
        'the fixture needs an adapter that can take a byte, or the case below proves nothing');
    const target = createI8086DebugTarget(adapter);
    const facts = [];
    target.onDebugInput(f => facts.push(f));

    assert.equal(target.sendSerial(0x41), true, 'the byte reached a chip');

    const serial = serialFacts(facts);
    // EXACTLY ONE. Zero is the lost-recording failure (upstream's method
    // without upstream's wrapper); two is the double-log failure (lite's
    // publish kept alongside upstream's wrapper).
    assert.equal(serial.length, 1,
        `expected exactly one i8086.serial fact, got ${serial.length}. `
        + '0 means the recording was lost: upstream\'s sendSerial does not publish when an '
        + 'adapter is present because its construction-time wrapper is what records, so the '
        + 'wrapper has to come with the method. 2 means both mechanisms are live at once — '
        + 'lite\'s own publish was kept alongside upstream\'s wrapper.');
    assert.equal(serial[0].payload.byte, 0x41);
    assert.ok(serial[0].time, 'a recorded fact carries the time it happened at');
});

test('the byte is masked to 8 bits in the record, not just on the wire', () => {
    const adapter = createI8086Adapter({config: withUart()});
    const target = createI8086DebugTarget(adapter);
    const facts = [];
    target.onDebugInput(f => facts.push(f));

    assert.equal(target.sendSerial(0x141), true);

    const serial = serialFacts(facts);
    assert.equal(serial.length, 1);
    // Both implementations mask with & 0xff. A record of 0x141 would be a fact
    // that never happened on the wire, and replaying it would refuse.
    assert.equal(serial[0].payload.byte, 0x41, 'the recorded byte is the byte the chip saw');
});

test('a byte sent through the TARGET is recorded exactly once with no adapter at all', () => {
    // Several callers construct this target over a bare {machine}. Upstream
    // publishes inline on this path (there is no adapter to have wrapped);
    // lite publishes here too. The guarantee must survive the bump on both
    // routes, and this is the one a wrapper cannot cover.
    const machine = new I8086Machine(withUart());
    const target = createI8086DebugTarget({machine});
    const facts = [];
    target.onDebugInput(f => facts.push(f));

    assert.equal(target.sendSerial(0x42), true, 'the machine took the byte without an adapter');

    const serial = serialFacts(facts);
    assert.equal(serial.length, 1, `expected exactly one fact on the bare-machine path, got ${serial.length}`);
    assert.equal(serial[0].payload.byte, 0x42);
});

test('the adapter-held bypass is RECORDED since the pin bump, exactly once', () => {
    // THE BYPASS IS CLOSED, AND THIS CASE IS HOW WE KNOW. It was written as a
    // two-way detector while lite still had the bypass -- a caller holding the
    // adapter could call `adapter.sendSerial` directly and no fact was produced,
    // and lite's own comment said so. It reddened at the bump, which is what it
    // was for, and the count it reported decided which outcome we got:
    //
    //     0 -> still bypassed        1 -> CLOSED        2 -> double-log
    //
    // Measured at the bump: ONE. Upstream's wrapper arrived in the same file as
    // the method it feeds, so a wholesale take carried both, and lite's own
    // publish did not survive alongside it. A partial take -- lifting
    // `sendSerial` without the construction block at i8086-debug.js:385-394 --
    // is the thing that would have given 0, and it would have been silent.
    //
    // DO NOT RE-OPEN THE BYPASS TO MAKE ANYTHING PASS.
    const adapter = createI8086Adapter({config: withUart()});
    const target = createI8086DebugTarget(adapter);
    const facts = [];
    target.onDebugInput(f => facts.push(f));

    assert.equal(adapter.sendSerial(0x43), true, 'the byte still reaches the chip either way');
    const afterBypass = serialFacts(facts).length;

    // THE CONTROL, AND IT IS THE POINT OF THIS CASE. Without it, zero facts
    // reads identically as "this path is unrecorded" and "nothing records at
    // all, the listener was never wired" -- and a fixture that proves the
    // second while claiming the first is the failure this suite exists to
    // prevent elsewhere.
    assert.equal(target.sendSerial(0x44), true);
    assert.equal(serialFacts(facts).length, afterBypass + 1,
        'the recorder was live throughout, so the count above is a fact about the '
        + 'adapter path and not about the listener');

    assert.equal(afterBypass, 1,
        'the adapter-held bypass stopped recording, or started recording TWICE. '
        + 'READ THE EXACTLY-ONCE CASE FIRST: if it reports 2, both mechanisms are live '
        + 'and this is a DOUBLE-LOG, not a closed '
        + 'bypass — fix that instead. If it still reports 1, then upstream\'s '
        + 'construction-time wrapper has closed a bypass lite only stated, which is an '
        + 'IMPROVEMENT. Adopt it: assert 1 here, and drop the "will not be recorded" '
        + 'sentence from i8086-debug.js. Do not re-open the bypass to make this pass.');
});
