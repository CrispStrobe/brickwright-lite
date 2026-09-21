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
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

import {
    REQUESTS, OP, TOGGLE_BIT, parseRcxImage, planBlocks,
    DEFAULT_BLOCK_SIZE, downloadImage, createFakeTower, decodeReply,
    extractReply, encodeCommand, replyOpcodeFor
} from '../overlay/scratch-gui/src/lib/rcx/rcx-protocol.js';
import {
    RCX_BAUD_RATE, RCX_PARITY, RCX_DATA_BITS, RCX_STOP_BITS
} from '../overlay/scratch-gui/src/lib/rcx/rcx-serial.js';

const encodeCommandFor = (opcode, params) =>
    encodeCommand(opcode, params, {toggle: false, checkArity: false});

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
    // Was 0x52. It is no longer here: `nqc -clear` sends it — the only thing
    // in NQC that does — and that run resolved the row against us. See
    // "the reply of an opcode NQC barely uses" below.
]);

test('every declared reply opcode is the complement with the toggle cleared', () => {
    // This convention is load-bearing and nothing asserted it. Checked naively
    // against `~opcode`, all 33 entries "mismatch" — by exactly 0x08 every
    // time, because the table stores the reply in the same canonical form it
    // keys requests by: toggle bit clear, applied at encode time. That is the
    // same normalisation NQC does with `data[0] & 0xf7`.
    //
    // Which means a single entry written with the toggle SET would have looked
    // like all the others to a reader and been wrong on the wire, with nothing
    // to catch it. Now there is.
    for (const [opcode, spec] of REQUESTS) {
        assert.equal(spec.reply, (~opcode) & 0xff & ~TOGGLE_BIT,
            `0x${opcode.toString(16)} (${spec.name}) declares reply 0x${spec.reply.toString(16)}`);
    }
});

test('the reply of an opcode NQC barely uses: 0x52 carries no data', () => {
    // The one row the first oracle pass could not resolve, because NQC's
    // download path never sends it. `nqc -clear` does — it is the last frame
    // of that sequence — and the capture settles it: NQC transmits
    // `52 ad 00 ff 00 ff 52 ad`, accepts a reply of the complemented opcode
    // alone, and exits 0. We said one data byte, which would have made
    // extractReply wait for a byte that never comes.
    const spec = REQUESTS.get(0x52);
    assert.equal(spec.params, 2, 'a short datalog size');
    assert.equal(spec.replyParams, 0);
    const clear = capture('clear.log');
    const frame = clear.find(f => f.opcode === 0x52);
    assert.ok(frame, '-clear must still be the capture that exercises this');
    assert.deepEqual(frame.params, [0, 0]);
});

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


/* ------------------------------------------------------------------ decoder */

/** Every TX line in every capture: 59 frames NQC actually transmitted. */
const allCapturedFrames = () => readdirSync(join(import.meta.dirname, 'fixtures/rcx-captures'))
    .filter(name => name.endsWith('.log'))
    .flatMap(name => readFileSync(join(import.meta.dirname, 'fixtures/rcx-captures', name), 'utf8')
        .split('\n')
        .filter(line => line.startsWith('TX '))
        .map(line => ({
            file: name,
            bytes: Uint8Array.from(line.slice(3).trim().split(/\s+/).map(h => parseInt(h, 16)))
        })));

test('the decoder accepts every frame NQC transmitted', () => {
    // EVERYTHING ABOVE TESTS THE ENCODER. This is the other half, and it is
    // the half that was never checked against anything but our own fake
    // tower: these bytes were produced by NQC, not by us, so agreement here
    // is not circular in the way a round trip through our own encoder is.
    const frames = allCapturedFrames();
    assert.ok(frames.length >= 55, `only ${frames.length} captured frames`);

    const refused = [];
    for (const {file, bytes} of frames) {
        const decoded = decodeReply(bytes);
        if (!decoded.ok) refused.push(`${file}: ${decoded.error} — ${decoded.detail}`);
    }
    assert.deepEqual(refused, [], 'frames NQC sent that our decoder rejects');
});

test('the decoder recovers the same opcode and payload the bytes carry', () => {
    // Accepting a frame is not the same as understanding it. Each byte pair on
    // the wire is a value and its complement, so the payload can be recovered
    // here independently of how the decoder does it, and the two compared.
    for (const {file, bytes} of allCapturedFrames()) {
        const decoded = decodeReply(bytes);
        assert.equal(decoded.opcode, bytes[3], `${file}: opcode`);
        assert.equal(decoded.baseOpcode, bytes[3] & ~TOGGLE_BIT & 0xff, `${file}: base opcode`);

        const expected = [];
        for (let i = 5; i < bytes.length - 2; i += 2) {
            assert.equal(bytes[i + 1], (~bytes[i]) & 0xff,
                `${file}: byte at ${i} is not followed by its complement`);
            expected.push(bytes[i]);
        }
        assert.deepEqual([...decoded.params], expected, `${file}: payload`);
    }
});

test('the checksum rule holds on every captured frame', () => {
    // "Ck is the sum of the opcode and the data bytes, modulo 256." Computed
    // here from the raw bytes rather than taken from the decoder, so the two
    // are independent statements of the same rule.
    for (const {file, bytes} of allCapturedFrames()) {
        let sum = bytes[3];
        for (let i = 5; i < bytes.length - 2; i += 2) sum += bytes[i];
        assert.equal(bytes[bytes.length - 2], sum & 0xff, `${file}: checksum`);
        assert.equal(bytes[bytes.length - 1], (~sum) & 0xff, `${file}: checksum complement`);
    }
});

test('the toggle alternates across NQC\'s own command stream', () => {
    // RCX Internals says messages "seem to alternate" the 0x08 bit and that
    // the brick never runs the same opcode twice in a row. This is that claim
    // measured on a real sender: within one download, consecutive frames must
    // not repeat both opcode and toggle.
    const frames = readFileSync(
        join(import.meta.dirname, 'fixtures/rcx-captures/mine-native-slot1.log'), 'utf8')
        .split('\n').filter(l => l.startsWith('TX '))
        .map(l => parseInt(l.slice(3).trim().split(/\s+/)[3], 16));
    for (let i = 1; i < frames.length; i++) {
        assert.notEqual(frames[i], frames[i - 1],
            `frame ${i}: NQC repeated the exact opcode byte 0x${frames[i].toString(16)}`);
    }
    // And the repeated TRANSFER_DATA frames are the case that proves it: the
    // same command four times, distinguishable only by the toggle.
    const transfers = frames.filter(op => (op & ~TOGGLE_BIT & 0xff) === OP.TRANSFER_DATA);
    assert.ok(transfers.length >= 4, `only ${transfers.length} transfer frames`);
    assert.equal(new Set(transfers).size, 2, 'transfers must use exactly two toggle phases');
});

test('opcodes NQC sends that we do not tabulate are named, not silently absent', () => {
    // 0xf7 (send an IR message) appears in the corpus via `nqc -msg`. We have
    // no entry for it, and that is a scope decision rather than an oversight:
    // nothing in this app sends a message to a brick. Naming it here means the
    // gap is a recorded choice, and a future frame with an unknown opcode
    // fails this test instead of passing unnoticed.
    const KNOWN_ABSENT = new Set([0xf7]);
    const unknown = new Set();
    for (const {bytes} of allCapturedFrames()) {
        const base = bytes[3] & ~TOGGLE_BIT & 0xff;
        if (!REQUESTS.has(base) && !KNOWN_ABSENT.has(base)) unknown.add(base);
    }
    assert.deepEqual([...unknown], [], 'captured opcodes we neither tabulate nor excuse');
});

/* ---------------------------------------------------- what each side REFUSES */

/**
 * NQC's verdict on a download where every reply is corrupted one way.
 *
 * Measured, not reasoned about: `RCX_ORACLE_CORRUPT=<mode> nqc -d -pgm 1
 * t.nqc` against the logging serial port, one run per mode, exit status
 * recorded. The captures are under `fixtures/rcx-captures/corrupt/`.
 *
 * ACCEPTING TWO OF THESE IS THE INTERESTING PART. A parser that rejected
 * everything malformed would be easy; NQC deliberately tolerates a damaged
 * header, because the header's job is to warm up the link and its leading
 * bytes are the ones a cold link eats.
 */
const NQC_VERDICT = {
    checksum: 'reject',   // the sum byte flipped
    cksumcomp: 'reject',  // the sum's complement flipped
    opcomp: 'reject',     // the opcode's complement flipped
    opcode: 'reject',     // a different opcode, its complement consistent
    truncate: 'reject',   // one byte short
    datacomp: 'reject',   // a payload byte's complement flipped
    header: 'accept',     // 55 fe 00 — a header byte lost
    garbage: 'accept'     // three junk bytes before the frame
};

const corruptedReply = mode => {
    const line = readFileSync(
        join(import.meta.dirname, 'fixtures/rcx-captures/corrupt', `${mode}.log`), 'utf8')
        .split('\n').filter(l => l.startsWith('RX '));
    // The first reply with a payload where the mode needs one, else the first.
    const pick = mode === 'datacomp'
        ? line.find(l => l.trim().split(/\s+/).length > 10) || line[0]
        : line[0];
    return Uint8Array.from(pick.slice(3).trim().split(/\s+/).map(h => parseInt(h, 16)));
};

const ourVerdict = (mode, reply) => {
    // The command that reply answers, and how many payload bytes we expect.
    const isDownload = mode === 'datacomp';
    const sent = isDownload
        ? encodeCommandFor(OP.START_TASK_DOWNLOAD, [0, 0, 0, 0x22, 0])
        : encodeCommandFor(OP.ALIVE, []);
    const heard = new Uint8Array(sent.length + reply.length);
    heard.set(sent, 0);
    heard.set(reply, sent.length);
    return extractReply(sent, heard, isDownload ? 1 : 0).ok ? 'accept' : 'reject';
};

test('our decoder draws the same line NQC draws, on all eight corruptions', () => {
    // THE GAP THIS CLOSES. Every other oracle test checks what we SEND. The
    // replies in those captures were synthesised by the harness, so until now
    // the reply side was only as good as the harness author's understanding
    // of it. This measures NQC's own acceptance instead.
    const disagreements = [];
    for (const [mode, theirs] of Object.entries(NQC_VERDICT)) {
        const ours = ourVerdict(mode, corruptedReply(mode));
        if (ours !== theirs) disagreements.push(`${mode}: NQC ${theirs}, we ${ours}`);
    }
    assert.deepEqual(disagreements, []);
});

test('a truncated header is tolerated, but only for an opcode we await', () => {
    // The tolerance above is real and it is narrow. NQC's FindSync shortens
    // the sync pattern from the front and then REQUIRES the next byte to be
    // the complement of the command it sent; without that guard, syncing on a
    // lone 0x00 would turn any zero byte in a payload into a frame boundary.
    // Ours keeps the guard, so: the same damaged header, followed by an
    // opcode nobody is waiting for, must NOT resynchronise.
    const sent = encodeCommandFor(OP.ALIVE, []);
    const damaged = op => {
        const body = [0x55, 0xfe, 0x00, op, (~op) & 0xff];
        const sum = op & 0xff;
        body.push(sum, (~sum) & 0xff);
        const heard = new Uint8Array(sent.length + body.length);
        heard.set(sent, 0);
        heard.set(Uint8Array.from(body), sent.length);
        return extractReply(sent, heard, 0).ok;
    };
    assert.equal(damaged(replyOpcodeFor(OP.ALIVE)), true, 'the awaited reply must still be found');
    assert.equal(damaged(replyOpcodeFor(OP.POWER_OFF)), false,
        'a damaged header must not vouch for an opcode nobody asked for');
});
