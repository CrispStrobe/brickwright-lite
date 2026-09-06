// Every chip's refusal ledger is reachable from the machine, and carries an address.
//
// WHY THIS EXISTS. Each 8086 support chip already announced when a program asked
// for something it does not model: the 8255 and 8251 set `modeWarning`, the
// uPD765 returns IC=invalid and names itself in `lastRefusal`, the SB DSP and
// YM3812 count unknown commands, the 8237 records unmodelled command bits. All
// of it was correct, individually well-designed, and UNREACHABLE -- a grep for
// any of those names outside the chip that wrote it returned nothing. A driver
// programming memory-to-memory left a precise record in a field with no
// consumer, and the failure surfaced somewhere else entirely as missing data.
//
// That is this repo's recurring defect with the halves swapped. Usually a check
// reports on something it never looked at; here the chips looked carefully and
// nobody read the report. AN ANNOUNCEMENT WITH NO READER IS THE SAME SILENCE IT
// WAS MEANT TO REPLACE, arrived at more expensively.
//
// WHY IT IS A LITE GATE AND NOT ONLY AN UPSTREAM ONE. bw-board has its own
// reachability test. It runs against bw-board's tree. This one runs against the
// VENDORED copies -- the ones the browser actually loads -- and the vendor
// allow-list permits i8086-machine.js to diverge from upstream by nine named
// forward-ports. A merge that preserved all nine and dropped the collector
// would pass every vendor gate in this repo, because those gates compare
// identifiers and this is about whether a value ARRIVES.
import {test} from 'node:test';
import assert from 'node:assert/strict';
//
// THE ONE THING WRONG WITH THIS FILE, recorded rather than left to be found.
// The row shape below is RESTATED here, and bw-board states it too, in
// CHIP-REFUSALS.md. That is a second list which has to agree with a first --
// the exact shape the collector's own comments warn about, and the shape that
// let two ledgers go unread in the first place. It is right today and it will
// drift.
//
// lego-be closed it upstream the same day, after this was pointed out: bw-board
// 92d4e00 exports `ROW_FIELDS` from src/chip-ledger.js, the file lite already
// vendors, so this gate can IMPORT the contract instead of repeating it. Lite
// pins 9a770c8, one commit earlier, which does not have it. Not re-pinning for
// this alone -- 9a770c8 is complete and correct and a bump costs a full
// re-verification -- but the next bw-board bump should replace the literal list
// in this file with that import, and this comment is here so that is a deletion
// rather than a discovery.
import {I8086Machine, PCXT8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';

const machine = () => new I8086Machine(PCXT8086);

test('a fresh machine has refused nothing', () => {
    // The other direction of species 1. Without this, a chipRefusals() that
    // returned a constant row would pass the test below, and the row asserted
    // there would be evidence of nothing -- it has to be CAUSED by the write.
    assert.deepEqual(machine().chipRefusals(), [],
        'a machine that has executed no instruction is reporting refusals, so the rows below '
        + 'are not caused by the program that appears to cause them');
});

test('programming the 8237 for memory-to-memory reaches the machine, with its address', () => {
    const m = machine();
    m.chips.dma1.write(0x08, 0x01);          // command register, bit 0
    const rows = m.chipRefusals();
    assert.equal(rows.length, 1,
        `expected exactly one refusal, got ${rows.length}: ${JSON.stringify(rows)}`);
    const [r] = rows;
    assert.equal(r.part, 'dma1');
    assert.equal(r.kind, 'chip');
    assert.match(r.feature, /memory-to-memory/, 'the feature arrives by name, not as a code');
    // A SYMPTOM SENTENCE CANNOT BE CLICKED, so the row carries both. `at` is the
    // port the program wrote to reach this: the debugger points at the
    // instruction with it and the P-lane table joins to the part's port map.
    assert.equal(r.at, 0x08,
        'the refusal must point at the command port it arrived on, or the debugger has a '
        + 'sentence and no instruction to attach it to');
    assert.ok(typeof r.symptom === 'string' && r.symptom.length > 20,
        `the row must say what the program will OBSERVE, not only what was refused: ${r.symptom}`);
    assert.match(r.symptom, /moves nothing/,
        'the 8237 symptom is that the block copy moves nothing and the temporary register reads '
        + 'back zero -- which is what a driver sees, and what it cannot otherwise learn');
    assert.equal(r.count, 1, 'counts distinguish a bit set once from a bit set in a loop');
    // `ats` is the set of addresses this feature was reached through; `at` is the
    // first of them, kept so a consumer that wants one address does not have to
    // know about the set. bw-board's CHIP-REFUSALS.md caps `ats` at 8 and sets
    // atsMore when it overflowed, so ats.length is NOT a count of distinct
    // addresses once atsMore is true -- asserted here so a consumer reading it as
    // a count fails against the contract rather than against a user.
    assert.deepEqual(r.ats, [0x08], 'the address set carries the port, not just the first hit');
    assert.equal(r.atsMore, false, 'one write cannot overflow an eight-entry address cap');
    assert.equal(r.at, r.ats[0], '`at` must be the first of `ats`, not a separate reading');
});

test('the collector is DERIVED from the field name, so a new ledger joins without an edit', () => {
    // The first version of the collector listed the field names it knew, and the
    // reachability gate immediately found two ledgers it did not reach: the
    // 8259's initWarning and the board's _refusedControls. Adding those two by
    // name would have fixed the instances and left the class.
    assert.ok(I8086Machine.LEDGER_FIELD instanceof RegExp,
        'LEDGER_FIELD must be exported as the pattern itself, so a gate uses THE SAME pattern '
        + 'rather than a copy of it -- two lists that must agree is the shape that let two '
        + 'ledgers go unread in the first place');
    for (const name of ['refusals', 'lastRefusal', 'unsupported', 'unmodelled', 'modeWarning',
        'initWarning', 'invalidCommands']) {
        assert.ok(I8086Machine.LEDGER_FIELD.test(name), `${name} must read as a refusal ledger`);
    }
    for (const name of ['channels', 'command', 'status', 'temp', 'mem', 'clockHz']) {
        assert.ok(!I8086Machine.LEDGER_FIELD.test(name),
            `${name} is ordinary state and must NOT be collected as a refusal`);
    }
});

test('every chip that records a refusal is reachable through the machine', () => {
    // A chip whose ledger the collector cannot see is the original defect,
    // reached again. This walks what the machine actually wired up rather than a
    // list of chip names, so a chip added to PCXT8086 later is covered.
    const m = machine();
    const parts = Object.entries(m.chips).concat(Object.entries(m.devices || {}));
    assert.ok(parts.length > 3, `only ${parts.length} parts wired; this gate would prove little`);
    const unreachable = [];
    for (const [name, part] of parts) {
        if (!part || typeof part !== 'object') continue;
        for (const field of Object.keys(part)) {
            if (!I8086Machine.LEDGER_FIELD.test(field)) continue;
            const v = part[field];
            const populated = (v instanceof Map && v.size > 0) || (typeof v === 'string' && v);
            if (!populated) continue;
            if (!m.chipRefusals().some(r => r.part === name)) unreachable.push(`${name}.${field}`);
        }
    }
    assert.deepEqual(unreachable, [],
        'these chips recorded a refusal the machine does not report:\n  ' + unreachable.join('\n  '));
});
