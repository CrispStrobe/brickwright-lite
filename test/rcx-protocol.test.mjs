import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fixtures live beside the test so it runs from any cwd. Each .rcx is paired
// with the .nqc it was compiled from (nqc -TRCX2), which is what makes the
// container layout claims in docs/RCX-IR-PROTOCOL.md checkable by hand.
const fx = name => join(import.meta.dirname, 'fixtures/rcx-images', name);

import {
  OP, REQUESTS, HEADER, TOGGLE_BIT,
  encodeCommand, createSequencer,
  decodeReply, DecodeError,
  createReplyReader, extractReply, replyOpcodeFor,
  parseRcxImage, CHUNK_TASK, CHUNK_SUBROUTINE,
  planBlocks, encodeStartDownloadParams, encodeTransferDataParams,
  downloadImage, RcxSession, createFakeTower, DEFAULT_BLOCK_SIZE,
} from '../overlay/scratch-gui/src/lib/rcx/rcx-protocol.js';

const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join(' ');
const bytes = (s) => Uint8Array.from(s.split(/\s+/).filter(Boolean).map((x) => parseInt(x, 16)));

/* ---------------------------------------------------------------- framing */

test('framing: hand-derived frame for set program number (91) slot 0', () => {
  // 55 ff 00 | Op Op' | D0 D0' | Ck Ck'
  // Op = 91, Op' = 6e.  D0 = 00, D0' = ff.  Ck = (0x91 + 0x00) % 256 = 91, Ck' = 6e.
  assert.equal(hex(encodeCommand(OP.SET_PROGRAM_NUMBER, [0])),
    '55 ff 00 91 6e 00 ff 91 6e');
});

test('framing: hand-derived frame for play tone 440 Hz / 50 (23)', () => {
  // 440 = 0x01b8, little-endian => b8 01.  duration 50 = 0x32.
  // Ck = (0x23 + 0xb8 + 0x01 + 0x32) % 256 = 0x10e % 256 = 0x0e, Ck' = f1.
  assert.equal(hex(encodeCommand(OP.PLAY_TONE, [0xb8, 0x01, 0x32])),
    '55 ff 00 23 dc b8 47 01 fe 32 cd 0e f1');
});

test('framing: the same play-tone bytecode appears verbatim in a real NQC image', () => {
  // t.nqc ends with PlayTone(440, 50); the compiled task body must contain
  // `23 b8 01 32`. This cross-checks the little-endian short independently.
  const img = parseRcxImage(readFileSync(fx('t.rcx')));
  assert.equal(img.ok, true);
  assert.ok(hex(img.chunks[0].data).includes('23 b8 01 32'));
});

test('framing: zero-parameter command (stop all tasks, 50)', () => {
  assert.equal(hex(encodeCommand(OP.STOP_ALL_TASKS)), '55 ff 00 50 af 50 af');
});

test('framing: checksum wraps modulo 256', () => {
  const f = encodeCommand(OP.PLAY_TONE, [0xff, 0xff, 0xff], { checkArity: true });
  // 0x23 + 0xff*3 = 0x320 -> 0x20
  assert.equal(f[f.length - 2], 0x20);
  assert.equal(f[f.length - 1], 0xdf);
});

test('framing: every byte after the header is followed by its complement', () => {
  const f = encodeCommand(OP.START_TASK_DOWNLOAD, encodeStartDownloadParams(3, 1234));
  for (let i = 3; i < f.length; i += 2) {
    assert.equal(f[i + 1], (~f[i]) & 0xff, `pair at ${i}`);
  }
  assert.deepEqual([...f.subarray(0, 3)], HEADER);
});

test('framing: arity rule holds for every fixed-length request in the table', () => {
  for (const [op, spec] of REQUESTS) {
    if (spec.params === null) continue;
    assert.equal(op & 0x07, spec.params,
      `${spec.name} 0x${op.toString(16)}: low 3 bits ${op & 7} != ${spec.params} params`);
  }
});

test('framing: wrong parameter count is rejected', () => {
  assert.throws(() => encodeCommand(OP.SET_PROGRAM_NUMBER, [0, 0]), /takes 1 parameter/);
  assert.throws(() => encodeCommand(OP.STOP_ALL_TASKS, [1]), /takes 0 parameter/);
});

test('framing: header bytes may never be an opcode', () => {
  for (const bad of [0x00, 0x55, 0xff]) {
    assert.throws(() => encodeCommand(bad, [], { checkArity: false }), /header byte/);
  }
});

/* ----------------------------------------------------------------- toggle */

test('toggle: bit 0x08 alternates across successive commands', () => {
  const seq = createSequencer(false);
  const ops = [];
  for (let i = 0; i < 6; i++) ops.push(seq.encode(OP.ALIVE)[3]);
  assert.deepEqual(ops, [0x10, 0x18, 0x10, 0x18, 0x10, 0x18]);
});

test('toggle: matches the NN/MM pairs printed in RCX Internals', () => {
  const seq = createSequencer(false);
  for (const [base, toggled] of [[0x10, 0x18], [0x50, 0x58], [0x70, 0x78], [0x91, 0x99]]) {
    seq.reset(false);
    assert.equal(seq.encode(base, base === 0x91 ? [0] : [])[3], base);
    assert.equal(seq.encode(base, base === 0x91 ? [0] : [])[3], toggled);
  }
});

test('toggle: checksum uses the byte actually on the wire, toggle included', () => {
  const off = encodeCommand(OP.STOP_ALL_TASKS, [], { toggle: false });
  const on = encodeCommand(OP.STOP_ALL_TASKS, [], { toggle: true });
  assert.equal(off[3], 0x50);
  assert.equal(off[off.length - 2], 0x50);
  assert.equal(on[3], 0x58);
  assert.equal(on[on.length - 2], 0x58);
});

test('toggle: the caller can reset it, and state is per-sequencer not global', () => {
  const a = createSequencer(false);
  const b = createSequencer(false);
  a.next(); a.next(); a.next();          // a is now "on"
  assert.equal(a.peek(), true);
  assert.equal(b.peek(), false, 'b must be untouched by a');
  a.reset();
  assert.equal(a.peek(), false);
  assert.equal(a.encode(OP.ALIVE)[3], 0x10);
});

test('toggle: two identical commands in a row differ on the wire', () => {
  const seq = createSequencer(false);
  const first = seq.encode(OP.START_TASK, [0]);
  const second = seq.encode(OP.START_TASK, [0]);
  assert.notDeepEqual([...first], [...second],
    'without alternation the brick would silently drop the second');
});

/* --------------------------------------------------------------- decoding */

test('decode: round-trips a frame we built', () => {
  const f = encodeCommand(OP.PLAY_TONE, [0xb8, 0x01, 0x32], { toggle: true });
  const r = decodeReply(f);
  assert.equal(r.ok, true);
  assert.equal(r.opcode, 0x2b);
  assert.equal(r.baseOpcode, 0x23);
  assert.equal(r.toggle, true);
  assert.deepEqual([...r.params], [0xb8, 0x01, 0x32]);
});

test('decode: accepts a hand-written reply (e7/ef, the alive reply)', () => {
  // Reply to 10 is ~10 = ef. Void payload. Ck = ef.
  const r = decodeReply(bytes('55 ff 00 ef 10 ef 10'));
  assert.equal(r.ok, true);
  assert.equal(r.opcode, 0xef);
  assert.equal(r.params.length, 0);
});

test('decode: rejects a bad checksum, and says so', () => {
  const f = encodeCommand(OP.SET_PROGRAM_NUMBER, [0]);
  f[f.length - 2] ^= 0x01;
  f[f.length - 1] = (~f[f.length - 2]) & 0xff;   // keep the complement valid
  const r = decodeReply(f);
  assert.equal(r.ok, false);
  assert.equal(r.error, DecodeError.BAD_CHECKSUM);
  assert.match(r.detail, /expected 0x91/);
});

test('decode: rejects a broken complement, and names the offset', () => {
  const f = encodeCommand(OP.SET_PROGRAM_NUMBER, [0]);
  f[6] = 0x00;    // D0' should be ff
  const r = decodeReply(f);
  assert.equal(r.ok, false);
  assert.equal(r.error, DecodeError.BAD_COMPLEMENT);
  assert.equal(r.offset, 6);
});

test('decode: rejects a bad header', () => {
  const r = decodeReply(bytes('aa ff 00 10 ef 10 ef'));
  assert.equal(r.ok, false);
  assert.equal(r.error, DecodeError.BAD_HEADER);
  assert.equal(r.offset, 0);
});

test('decode: never throws on garbage', () => {
  const inputs = [
    undefined, [], new Uint8Array(0), bytes('55'), bytes('55 ff 00'),
    bytes('55 ff 00 10'), bytes('55 ff 00 10 ef 10'),
    bytes('55 ff 00 00 ff 00 ff'),
    Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 0xff),
  ];
  for (const i of inputs) {
    const r = decodeReply(i);
    assert.equal(typeof r.ok, 'boolean');
    if (!r.ok) assert.equal(typeof r.error, 'string');
  }
});

test('decode: refuses an odd-length body', () => {
  const r = decodeReply(bytes('55 ff 00 10 ef 10 ef 00'));
  assert.equal(r.ok, false);
  assert.equal(r.error, DecodeError.ODD_LENGTH);
});

test('decode: refuses 00/55/ff as an opcode', () => {
  const r = decodeReply(bytes('55 ff 00 00 ff 00 ff'));
  assert.equal(r.ok, false);
  assert.equal(r.error, DecodeError.FORBIDDEN_OPCODE);
});

/* -------------------------------------------------------- echo suppression */

test('echo: the reply opcode is the complement of what was sent', () => {
  assert.equal(replyOpcodeFor(0x10), 0xef);
  assert.equal(replyOpcodeFor(0x18), 0xe7);
  // RCX Internals prints the alive reply as e7/ef; both phases are covered.
  assert.equal(REQUESTS.get(0x10).reply, 0xe7);
});

test('echo: the tower echo is dropped and the real reply kept', () => {
  const sent = encodeCommand(OP.ALIVE, [], { toggle: false });          // op 10
  const reply = encodeCommand(0xef, [], { toggle: true, checkArity: false });
  const stream = new Uint8Array([...sent, ...reply]);

  const r = createReplyReader();
  r.expect(sent[3], 0, 0);
  const events = r.push(stream);
  assert.deepEqual(events.map((e) => e.kind), ['echo', 'reply']);
  assert.equal(events[1].frame.opcode, 0xef);
});

test('echo: a command whose echo looks exactly like a reply is not confused', () => {
  // start task download (25) -> reply da. Echo has 5 params, reply has 1.
  const sent = encodeCommand(OP.START_TASK_DOWNLOAD, encodeStartDownloadParams(0, 34));
  const reply = encodeCommand(replyOpcodeFor(sent[3]), [0],
    { toggle: (replyOpcodeFor(sent[3]) & TOGGLE_BIT) !== 0, checkArity: false });
  const r = createReplyReader();
  r.expect(sent[3], 5, 1);
  const events = r.push(new Uint8Array([...sent, ...reply]));
  assert.deepEqual(events.map((e) => e.kind), ['echo', 'reply']);
  assert.deepEqual([...events[1].frame.params], [0]);
});

test('echo: works when the stream arrives in arbitrary fragments', () => {
  const sent = encodeCommand(OP.ALIVE);
  const reply = encodeCommand(0xef, [], { toggle: true, checkArity: false });
  const stream = [...sent, ...reply];
  for (const size of [1, 2, 3, 5, 7, 11]) {
    const r = createReplyReader();
    r.expect(sent[3], 0, 0);
    const kinds = [];
    for (let i = 0; i < stream.length; i += size) {
      for (const e of r.push(stream.slice(i, i + size))) kinds.push(e.kind);
    }
    assert.deepEqual(kinds.filter((k) => k !== 'noise'), ['echo', 'reply'],
      `chunk size ${size}`);
  }
});

test('echo: leading line noise is skipped, the reply still found', () => {
  const sent = encodeCommand(OP.ALIVE);
  const reply = encodeCommand(0xef, [], { toggle: true, checkArity: false });
  // RCX Internals: "Special packet data 01 02 03 04 ff fe fd fc sent when RCX
  // is not listening", and a stray ff when the tower powers down.
  const noise = bytes('01 02 03 04 ff fe fd fc');
  const r = createReplyReader();
  r.expect(sent[3], 0, 0);
  const events = r.push(new Uint8Array([...noise, ...sent, ...reply, 0xff]));
  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.includes('reply'));
  assert.equal(kinds.filter((k) => k === 'reply').length, 1);
});

test('echo: a corrupt reply is refused, not silently returned', () => {
  const sent = encodeCommand(OP.ALIVE);
  const reply = encodeCommand(0xef, [], { toggle: true, checkArity: false });
  reply[reply.length - 2] ^= 0x10;
  reply[reply.length - 1] = (~reply[reply.length - 2]) & 0xff;
  const out = extractReply(sent, new Uint8Array([...sent, ...reply]), 0);
  assert.equal(out.ok, false);
  assert.equal(out.error, DecodeError.BAD_CHECKSUM);
});

test('echo: extractReply reports NO_REPLY when only the echo came back', () => {
  const sent = encodeCommand(OP.ALIVE);
  const out = extractReply(sent, sent, 0);
  assert.equal(out.ok, false);
  assert.equal(out.error, 'NO_REPLY');
});

/* -------------------------------------------------------- .rcx containers */

const SAMPLES = [
  {
    path: fx('t.rcx'),
    size: 61,
    chunks: [{ kind: 'task', number: 0, length: 0x22 }],
    symbols: [{ kind: 'task', index: 0, name: 'main' }],
  },
  {
    path: fx('gen.rcx'),
    size: 69,
    chunks: [{ kind: 'task', number: 0, length: 0x2b }],
    symbols: [{ kind: 'task', index: 0, name: 'main' }],
  },
  {
    path: fx('mine-native.rcx'),
    size: 107,
    chunks: [{ kind: 'task', number: 0, length: 0x45 }],
    symbols: [
      { kind: 'task', index: 0, name: 'main' },
      { kind: 'variable', index: 0, name: 'count' },
    ],
  },
];

for (const s of SAMPLES) {
  test(`.rcx: parses ${s.path}`, () => {
    const raw = readFileSync(s.path);
    assert.equal(raw.length, s.size);
    const img = parseRcxImage(raw);
    assert.equal(img.ok, true, img.ok ? '' : `${img.error}: ${img.detail}`);
    assert.equal(img.version, 0x0102);
    assert.equal(img.target, 3);
    assert.deepEqual(
      img.chunks.map((c) => ({ kind: c.kind, number: c.number, length: c.length })),
      s.chunks);
    assert.deepEqual(
      img.symbols.map((y) => ({ kind: y.kind, index: y.index, name: y.name })),
      s.symbols);
    for (const c of img.chunks) assert.equal(c.data.length, c.length);
    // The whole file must be accounted for.
    assert.equal(img.bytesUsed, raw.length);
  });
}

test('.rcx: a two-task image has two chunks and two task symbols', () => {
  // exp/b.nqc: task main { start second; }  task second { OnFwd(OUT_A); }
  const img = parseRcxImage(readFileSync(fx('b.rcx')));
  assert.equal(img.ok, true);
  assert.equal(img.chunks.length, 2);
  assert.deepEqual(img.chunks.map((c) => [c.kind, c.number, c.length]),
    [['task', 0, 8], ['task', 1, 4]]);
  assert.deepEqual(img.symbols.map((s) => s.name), ['main', 'second']);
  // `start task` (71) with operand 1 must appear in main's body.
  assert.ok(hex(img.chunks[0].data).includes('71 01'));
});

test('.rcx: subroutines appear as chunk type 1 and are 4-byte aligned', () => {
  // exp/c.nqc: sub helper() {...}  task main { helper(); helper(); }
  const img = parseRcxImage(readFileSync(fx('c.rcx')));
  assert.equal(img.ok, true);
  assert.deepEqual(img.chunks.map((c) => [c.type, c.number, c.length]),
    [[CHUNK_SUBROUTINE, 0, 4], [CHUNK_TASK, 0, 10]]);
  assert.deepEqual(img.symbols.map((s) => [s.kind, s.index, s.name]),
    [['subroutine', 0, 'helper'], ['task', 0, 'main']]);
  // Two `call subroutine` (17) with operand 0.
  assert.ok(hex(img.chunks[1].data).endsWith('17 00 17 00'));
  for (const c of img.chunks) assert.equal(c.offset % 4, 0);
});

test('.rcx: mixed image — 2 subs, 3 tasks, 2 variables', () => {
  const img = parseRcxImage(readFileSync(fx('d.rcx')));
  assert.equal(img.ok, true);
  assert.equal(img.chunks.length, 5);
  assert.deepEqual(img.chunks.map((c) => [c.kind, c.number]),
    [['subroutine', 0], ['subroutine', 1],
     ['task', 0], ['task', 1], ['task', 2]]);
  assert.deepEqual(img.symbols.map((s) => `${s.kind}:${s.name}`),
    ['subroutine:h1', 'subroutine:h2', 'task:main', 'task:t2', 'task:t3',
     'variable:xyz', 'variable:qq']);
  assert.equal(img.bytesUsed, readFileSync(fx('d.rcx')).length);
});

test('.rcx: refuses bad input without throwing', () => {
  assert.equal(parseRcxImage(new Uint8Array(0)).error, 'TOO_SHORT');
  assert.equal(parseRcxImage(bytes('52 43 58 4a 02 01 01 00 01 00 03 00')).error, 'BAD_MAGIC');
  const raw = new Uint8Array(readFileSync(fx('t.rcx')));
  assert.equal(parseRcxImage(raw.subarray(0, 20)).error, 'TRUNCATED_CHUNK');
  const badType = Uint8Array.from(raw);
  badType[12] = 9;
  assert.equal(parseRcxImage(badType).error, 'BAD_CHUNK_TYPE');
});

/* ----------------------------------------------------------------- blocks */

test('blocks: last block carries sequence 0, earlier ones count from 1', () => {
  assert.deepEqual(planBlocks(new Uint8Array(10), 4).map((b) => [b.sequence, b.data.length]),
    [[1, 4], [2, 4], [0, 2]]);
  assert.deepEqual(planBlocks(new Uint8Array(4), 4).map((b) => b.sequence), [0]);
  assert.deepEqual(planBlocks(new Uint8Array(0), 4).map((b) => b.sequence), [0]);
});

test('blocks: transfer-data parameters carry their own data checksum', () => {
  const p = encodeTransferDataParams(1, [0x10, 0x20, 0x30]);
  assert.deepEqual([...p], [0x01, 0x00, 0x03, 0x00, 0x10, 0x20, 0x30, 0x60]);
});

test('blocks: start-download parameters are unknown=0, index LE, length LE', () => {
  assert.deepEqual([...encodeStartDownloadParams(9, 0x0145)],
    [0x00, 0x09, 0x00, 0x45, 0x01]);
});

/* ------------------------------------------------------ download sequence */

test('download: full run against a fake transport', async () => {
  const tower = createFakeTower();
  const img = parseRcxImage(readFileSync(fx('t.rcx')));
  const phases = [];
  const result = await downloadImage(img, {
    send: tower.send,
    programSlot: 2,
    blockSize: 20,
    onProgress: (p) => phases.push(p.phase),
  });
  assert.equal(result.chunks, 1);

  const decoded = tower.decoded();
  assert.ok(decoded.every((d) => d.ok), 'every frame we transmitted must be well-formed');
  const ops = decoded.map((d) => d.baseOpcode);

  // select slot -> stop -> delete tasks -> delete subs -> start download -> blocks
  //
  // This assertion was flipped to stop-first for an hour, on a reading of
  // NQC's source, and flipped back when NQC's actual frames were captured:
  // the branch that reading came from is dead from NQC's own CLI, and on the
  // wire the slot is selected first. test/rcx-nqc-oracle.test.mjs holds the
  // captured sequence.
  assert.deepEqual(ops.slice(0, 5), [
    OP.SET_PROGRAM_NUMBER, OP.STOP_ALL_TASKS, OP.DELETE_ALL_TASKS,
    OP.DELETE_ALL_SUBROUTINES, OP.START_TASK_DOWNLOAD,
  ]);
  assert.deepEqual([...decoded[0].params], [2], 'program slot 2');

  // 34 bytes at 20 per block = 2 blocks, sequences 1 then 0.
  assert.equal(ops.length, 7);
  assert.equal(ops[5], OP.TRANSFER_DATA);
  assert.equal(ops[6], OP.TRANSFER_DATA);
  assert.deepEqual([...decoded[5].params.subarray(0, 4)], [1, 0, 20, 0]);
  assert.deepEqual([...decoded[6].params.subarray(0, 4)], [0, 0, 14, 0]);

  // start task download announced the true chunk length.
  assert.deepEqual([...decoded[4].params], [0, 0, 0, 0x22, 0]);

  // The concatenated block payloads must reconstruct the chunk exactly.
  const rebuilt = [
    ...decoded[5].params.subarray(4, 4 + 20),
    ...decoded[6].params.subarray(4, 4 + 14),
  ];
  assert.deepEqual(rebuilt, [...img.chunks[0].data]);

  assert.deepEqual(phases, [
    'setProgramNumber', 'stopAllTasks', 'deleteAllTasks', 'deleteAllSubroutines',
    'startDownload', 'transferData', 'transferData', 'done',
  ]);
});

test('download: the toggle bit alternates across the whole sequence', async () => {
  const tower = createFakeTower();
  await downloadImage(parseRcxImage(readFileSync(fx('mine-native.rcx'))),
    { send: tower.send, blockSize: 30 });
  const toggles = tower.decoded().map((d) => d.toggle);
  for (let i = 1; i < toggles.length; i++) {
    assert.notEqual(toggles[i], toggles[i - 1], `frame ${i} repeats the toggle`);
  }
});

test('download: subroutines go before tasks, each with its own start opcode', async () => {
  const tower = createFakeTower();
  const img = parseRcxImage(readFileSync(fx('d.rcx')));
  await downloadImage(img, { send: tower.send });
  const starts = tower.decoded()
    .filter((d) => d.baseOpcode === OP.START_SUBROUTINE_DOWNLOAD ||
                   d.baseOpcode === OP.START_TASK_DOWNLOAD)
    .map((d) => [d.baseOpcode, d.params[1]]);
  assert.deepEqual(starts, [
    [OP.START_SUBROUTINE_DOWNLOAD, 0], [OP.START_SUBROUTINE_DOWNLOAD, 1],
    [OP.START_TASK_DOWNLOAD, 0], [OP.START_TASK_DOWNLOAD, 1], [OP.START_TASK_DOWNLOAD, 2],
  ]);
});

test('download: a nonzero error byte aborts with a useful message', async () => {
  const tower = createFakeTower({ errorCode: 1 });  // "insufficient memory"
  await assert.rejects(
    downloadImage(parseRcxImage(readFileSync(fx('t.rcx'))), { send: tower.send }),
    (e) => e.name === 'RcxDownloadError' && e.errorCode === 1 &&
           /startTaskDownload returned error code 1/.test(e.message));
});

test('download: a transport that answers with nothing but echo fails loudly', async () => {
  const tower = createFakeTower({ echo: true });
  const echoOnly = (b) => { tower.send(b); return Uint8Array.from(b); };
  await assert.rejects(
    downloadImage(parseRcxImage(readFileSync(fx('t.rcx'))), { send: echoOnly }),
    /no valid reply to setProgramNumber: NO_REPLY/);
});

test('download: retries are attempted when configured', async () => {
  let calls = 0;
  const good = createFakeTower();
  const flaky = (b) => {
    calls++;
    return calls <= 2 ? Uint8Array.from(b) : good.send(b);  // echo only, twice
  };
  const session = new RcxSession(flaky, { retries: 3 });
  const reply = await session.command(OP.ALIVE);
  assert.equal(reply.ok, true);
  assert.equal(calls, 3);
});

test('download: startTask is optional and comes last', async () => {
  const tower = createFakeTower();
  await downloadImage(parseRcxImage(readFileSync(fx('t.rcx'))),
    { send: tower.send, startTask: 0 });
  const ops = tower.decoded().map((d) => d.baseOpcode);
  assert.equal(ops[ops.length - 1], OP.START_TASK);
});

test('download: rejects an out-of-range program slot', async () => {
  await assert.rejects(
    downloadImage(parseRcxImage(readFileSync(fx('t.rcx'))),
      { send: createFakeTower().send, programSlot: 5 }),
    /program slot must be 0\.\.4/);
});

test('download: default block size keeps frames under 256 bytes', () => {
  const f = encodeCommand(OP.TRANSFER_DATA,
    encodeTransferDataParams(1, new Uint8Array(DEFAULT_BLOCK_SIZE)),
    { checkArity: false });
  assert.ok(f.length < 256, `frame is ${f.length} bytes`);
});
