// The clean-room RCX protocol, compared against NQC's own implementation.
//
// WHY THIS EXISTS. docs/RCX-IR-PROTOCOL.md argued that two agreeing
// implementations are worth more than one, and then the argument was never
// cashed: lib/rcx/rcx-protocol.js had only ever been checked against fixtures
// the same person generated and against a contract the same person wrote.
// This is the comparison.
//
// THE ORACLE is NQC's `rcxlib` — the canonical implementation, the one that
// has driven real bricks since 1998. It is MPL-2.0, so reading it is allowed;
// it is also not the implementer's to read, which is why this file is the
// AUDITOR's and was written after the clean-room round closed, not during it.
// What is reproduced below are FACTS — opcode numbers, reply lengths, the
// order of a download — cited to file and function, in the same way the
// contract cites RCX Internals. No NQC code is copied; the repository stays
// BSD-3-Clause and nothing here ships.
//
// Upstream: https://github.com/jverne/nqc at 21c24ec1, the commit
// overlay/scratch-gui/src/lib/nqc-wasm was built from.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {
    REQUESTS, OP, TOGGLE_BIT, parseRcxImage, planBlocks,
    DEFAULT_BLOCK_SIZE, downloadImage, createFakeTower
} from '../overlay/scratch-gui/src/lib/rcx/rcx-protocol.js';
import {
    RCX_BAUD_RATE, RCX_PARITY, RCX_DATA_BITS, RCX_STOP_BITS
} from '../overlay/scratch-gui/src/lib/rcx/rcx-serial.js';

const fx = name => join(import.meta.dirname, 'fixtures/rcx-images', name);

/**
 * NQC's reply-length table, from `RCX_Link::GetReplyLength` in
 * rcxlib/RCX_Link.cpp, with the opcode values from rcxlib/RCX_Constants.h.
 *
 * TWO CONVENTIONS DIFFER AND THE COMPARISON IS MEANINGLESS UNTIL THEY ARE
 * RECONCILED. NQC counts the reply opcode byte; our `replyParams` counts only
 * the data that follows it. So the relation asserted below is
 *
 *     nqc === ours + 1
 *
 * and NQC's `default: return 1` — every opcode not named in its switch — is
 * therefore "the opcode and nothing else", i.e. `replyParams: 0`.
 */
const NQC_REPLY_LENGTH = new Map([
    [0x25, 2],   // kRCX_BeginTaskOp
    [0x35, 2],   // kRCX_BeginSubOp
    [0x45, 2],   // kRCX_DownloadOp
    [0x30, 3],   // kRCX_BatteryLevelOp
    [0x12, 3],   // kRCX_ReadOp
    [0x15, 9],   // kRCX_GetVersions
    [0xa5, 26],  // kRCX_UnlockOp
    [0x20, 189]  // kRCX_GetMemMap, non-Spybotics target
]);

const NQC_DEFAULT_REPLY_LENGTH = 1;

/**
 * Opcodes NQC's table treats as variable-length, computed from the request.
 * Ours records `replyParams: null` for the same reason, and neither can be
 * compared as a number.
 */
const NQC_VARIABLE = new Set([0x63, 0xa4]);

/**
 * What NQC never sends, so its `default` is untested there and cannot be
 * cited as agreement. Named rather than quietly skipped: a differential that
 * hides its own blind spots is worse than no differential, because it reads
 * as broader agreement than it has.
 */
const NQC_DOES_NOT_EXERCISE = new Set([
    0x52 // kRCX_SetDatalogOp — defined in RCX_Constants.h, sent by nothing in
         // rcxlib or compiler. Our table says its reply carries one byte;
         // NQC's default would say none. Neither claim is tested by NQC, so
         // this row is UNRESOLVED and is excluded from the agreement below
         // rather than counted as a match or as a conflict.
]);

test('the reply length of every opcode NQC exercises matches ours', () => {
    const compared = [];
    for (const [opcode, nqcLength] of NQC_REPLY_LENGTH) {
        const spec = REQUESTS.get(opcode);
        assert.ok(spec, `we have no entry for 0x${opcode.toString(16)}, which NQC tabulates`);
        assert.equal(spec.replyParams + 1, nqcLength,
            `0x${opcode.toString(16)} (${spec.name}): NQC expects ${nqcLength} reply bytes ` +
            `including the opcode, we expect ${spec.replyParams} after it`);
        compared.push(opcode);
    }
    // The count is here so that deleting a row is a visible edit rather than a
    // quietly narrower claim.
    assert.equal(compared.length, 8);
});

test('everything NQC leaves to its default carries no data bytes for us either', () => {
    const checked = [];
    for (const [opcode, spec] of REQUESTS) {
        if (NQC_REPLY_LENGTH.has(opcode)) continue;
        if (NQC_VARIABLE.has(opcode)) continue;
        if (NQC_DOES_NOT_EXERCISE.has(opcode)) continue;
        if (spec.replyParams === null) continue;
        assert.equal(spec.replyParams, NQC_DEFAULT_REPLY_LENGTH - 1,
            `0x${opcode.toString(16)} (${spec.name}) disagrees with NQC's default`);
        checked.push(opcode);
    }
    assert.ok(checked.length >= 20,
        `only ${checked.length} opcodes fell to the default; the comparison is thinner than it looks`);
});

test('the reply length is not the arity rule, which is what the contract got wrong', () => {
    // docs/RCX-IR-PROTOCOL.md told the implementer that `opcode & 0x07` gives
    // a message's parameter count. True for REQUESTS; the implementer found it
    // false for replies and tabulated them instead. NQC tabulates them too,
    // which is independent confirmation of a correction this repository had
    // already made on its own reasoning.
    const violations = [];
    for (const [opcode, nqcLength] of NQC_REPLY_LENGTH) {
        if (nqcLength - 1 !== (opcode & 0x07)) violations.push(opcode);
    }
    assert.ok(violations.length > 0,
        'if every tabulated reply DID obey the arity rule, the tables would be unnecessary');
    // 0x25 is the cleanest example: arity says 5, the reply carries 1.
    assert.equal(OP.START_TASK_DOWNLOAD & 0x07, 5);
    assert.equal(REQUESTS.get(OP.START_TASK_DOWNLOAD).replyParams, 1);
});

test('NQC masks the toggle bit out before looking an opcode up, and so do we', () => {
    // `switch (data[0] & 0xf7)` in RCX_Link::GetReplyLength. 0xf7 is ~0x08,
    // which is the toggle. Our REQUESTS is keyed the same way — by the opcode
    // with bit 3 clear — and RcxSession applies the toggle at encode time.
    assert.equal(0xf7, (~TOGGLE_BIT) & 0xff);
    for (const opcode of REQUESTS.keys()) {
        assert.equal(opcode & TOGGLE_BIT, 0,
            `0x${opcode.toString(16)} is keyed with its toggle bit set`);
    }
});

/**
 * A capture: every frame NQC transmitted, as base opcode + parameter bytes.
 * `test/fixtures/rcx-captures/README.md` says how they were produced.
 */
const capture = name => readFileSync(join(import.meta.dirname, 'fixtures/rcx-captures', name), 'utf8')
    .split('\n')
    .filter(line => line.startsWith('TX '))
    .map(line => {
        const bytes = line.slice(3).trim().split(/\s+/).map(h => parseInt(h, 16));
        // 55 ff 00, then opcode and its complement, then each data byte and
        // its complement, then the checksum pair.
        const opcode = bytes[3] & ~TOGGLE_BIT & 0xff;
        const params = [];
        for (let i = 5; i < bytes.length - 2; i += 2) params.push(bytes[i]);
        return {opcode, params, raw: bytes};
    });

/** What downloadImage puts on the wire for the same program and slot. */
const ours = async (image, programSlot, blockSize) => {
    const tower = createFakeTower();
    await downloadImage(parseRcxImage(readFileSync(fx(image))), {
        send: tower.send, programSlot, blockSize
    });
    return tower.decoded().map(d => ({opcode: d.baseOpcode, params: [...d.params]}));
};

/**
 * NQC brackets the download with two frames we do not send, and both are
 * outside the protocol this module implements rather than omissions in it:
 *
 *   0x10 ALIVE — RCX_Link::Sync() pings before anything, to establish that a
 *     brick is listening. Ours takes an already-working session; a caller that
 *     wants the check sends it, and lib/rcx/rcx-serial.js users will, because
 *     that ping is also how you tell "no brick" from "no tower".
 *   0x51 PLAY_SOUND — `if (!gQuiet) Send(cmd.MakePlaySound(5))`, the beep that
 *     tells a user across the room the download finished. A UI decision, not a
 *     protocol one.
 */
const BRACKETS = {lead: [0x10], trail: [0x51]};

const downloadProper = frames => {
    let a = 0;
    let b = frames.length;
    while (a < b && BRACKETS.lead.includes(frames[a].opcode)) a++;
    while (b > a && BRACKETS.trail.includes(frames[b - 1].opcode)) b--;
    return frames.slice(a, b);
};

test('capture: the download sequence matches NQC frame for frame', async () => {
    // THE COMPARISON THAT REPLACED A SOURCE READING. An earlier version of
    // this file asserted the order taken from RCX_Link::DownloadByChunk —
    // stop, then select the slot — and changed the implementation to match.
    // The capture says otherwise, and the capture wins: that branch is dead
    // from NQC's own CLI (RCX_Image::Download declares programNumber = 0 and
    // nqc.cpp never passes one), so the slot is selected by a separate action
    // BEFORE the download's stop-all. Reading a reference tells you what it
    // could do; running it tells you what it does.
    // THE SLOT NUMBERS DIFFER BY ONE AND BOTH ARE RIGHT. NQC's `-pgm N` is
    // one-based and it sends N-1; our `programSlot` is zero-based and sends it
    // unchanged. So the capture made with `-pgm 3` is the run our
    // `programSlot: 2` must reproduce. Writing 3 against 3 here would fail —
    // and it did, which is how the trap got documented at the API.
    const cases = [
        {log: 't-slot3.log', image: 't.rcx', slot: 2},
        {log: 'mine-native-slot1.log', image: 'mine-native.rcx', slot: 0},
        {log: 'c-slot2.log', image: 'c.rcx', slot: 1}
    ];
    for (const {log, image, slot} of cases) {
        const theirs = downloadProper(capture(log));
        const mine = downloadProper(await ours(image, slot, DEFAULT_BLOCK_SIZE));
        assert.deepEqual(
            mine.map(f => f.opcode),
            theirs.map(f => f.opcode),
            `${log}: opcode sequence differs`);
        for (let i = 0; i < theirs.length; i++) {
            assert.deepEqual(mine[i].params, theirs[i].params,
                `${log}: frame ${i} (opcode 0x${theirs[i].opcode.toString(16)}) payload differs`);
        }
    }
});

test('capture: NQC asks for exactly the line settings rcx-serial.js opens', () => {
    // The only independent confirmation of those constants. Until this was
    // captured they were a citation of RCX Internals and nothing more — and a
    // wrong parity does not raise an error, it produces a brick that never
    // answers.
    const header = readFileSync(
        join(import.meta.dirname, 'fixtures/rcx-captures/t-slot3.log'), 'utf8').split('\n');
    const speed = header.find(l => l.startsWith('SPEED '));
    assert.equal(speed, 'SPEED 2400 data=8 parity=odd stop=1');
    assert.equal(RCX_BAUD_RATE, 2400);
    assert.equal(RCX_PARITY, 'odd');
    assert.equal(RCX_DATA_BITS, 8);
    assert.equal(RCX_STOP_BITS, 1);
});

test('capture: subroutines precede tasks on the wire, not just in the file', () => {
    // c.nqc is `sub helper()` plus `task main()`. NQC downloads chunks in file
    // order and never sorts; we sort. This is the frame evidence that the two
    // agree, rather than an inference from the file layout.
    const ops = downloadProper(capture('c-slot2.log')).map(f => f.opcode);
    assert.ok(ops.indexOf(0x35) < ops.indexOf(0x25),
        `begin-subroutine must precede begin-task: ${ops.map(o => o.toString(16)).join(' ')}`);
});

test('capture: our block size is the reference\'s, measured not assumed', () => {
    // This assertion used to say "no larger than NQC's chunk" and compared
    // against 50, which was our own default dressed up as a bound. NQC's
    // kFragmentChunk is 20, so the old claim was false by a factor of two and
    // passed anyway. The capture settles it: take the payload length of the
    // first full TRANSFER_DATA frame NQC sent.
    const transfers = capture('mine-native-slot1.log').filter(f => f.opcode === 0x45);
    assert.ok(transfers.length >= 2, 'need a multi-block transfer to see a full block');
    // params are: sequence lo, hi, length lo, hi, then the payload, then a
    // trailing checksum byte the command carries itself.
    const payload = transfers[0].params.length - 5;
    assert.equal(payload, 20);
    assert.equal(DEFAULT_BLOCK_SIZE, payload);
});

test('the last block of a transfer is sequence 0, as NQC numbers them', () => {
    // RCX_Link::Download: `seq = 1` before the loop, `seq++` per block, and
    // `seq = 0` on the final one — `if (remain <= chunk) { ... seq = 0; }`.
    // Two implementations reached this independently, and it is not a detail
    // anyone would guess: a sequence that counted 1, 2, 3 to the end would
    // look perfectly reasonable and the brick would reject the transfer.
    const blocks = planBlocks(new Uint8Array(125), 50);
    assert.deepEqual(blocks.map(b => b.sequence), [1, 2, 0]);
    assert.deepEqual(blocks.map(b => b.data.length), [50, 50, 25]);

    // A payload that fits in one block is immediately the last one.
    assert.deepEqual(planBlocks(new Uint8Array(10), 50).map(b => b.sequence), [0]);
    // And an exact multiple must not emit a trailing empty block.
    assert.deepEqual(planBlocks(new Uint8Array(100), 50).map(b => b.sequence), [1, 0]);
});

test('subroutines already precede tasks in every image NQC writes', () => {
    // NQC downloads chunks in FILE order (`for (i=0; i<image.GetChunkCount();
    // i++)`) and does not sort. We sort subroutines first. The two agree on
    // everything NQC produces — asserted here rather than assumed, because it
    // is the reason our sort is belt-and-braces and not a divergence.
    for (const name of ['c', 'd']) {
        const img = parseRcxImage(readFileSync(fx(`${name}.rcx`)));
        const kinds = img.chunks.map(c => c.kind);
        const firstTask = kinds.indexOf('task');
        const lastSub = kinds.lastIndexOf('subroutine');
        assert.ok(firstTask === -1 || lastSub === -1 || lastSub < firstTask,
            `${name}.rcx interleaves chunks: ${kinds.join(' ')}`);
    }
});

test('the program slot goes on the wire zero-based, as NQC sends it', () => {
    // `Send(cmd.Set(kRCX_SelectProgramOp, (UByte)(programNumber-1)))` — NQC's
    // API is one-based and the wire is zero-based. Ours is zero-based at the
    // API too, so the byte is the argument unchanged.
    //
    // THE TRAP, which the frame comparison above walked into: the same NUMBER
    // means different programs in the two APIs. NQC's `-pgm 3` is our
    // `programSlot: 2`. Anyone porting an NQC command line by copying its
    // digits selects the wrong program, and the brick reports nothing wrong —
    // it runs whatever was in the slot they actually picked.
    const tower = createFakeTower();
    return downloadImage(parseRcxImage(readFileSync(fx('t.rcx'))), {
        send: tower.send, programSlot: 3
    }).then(() => {
        const select = tower.decoded().find(d => d.baseOpcode === OP.SET_PROGRAM_NUMBER);
        assert.deepEqual([...select.params], [3]);
    });
});

