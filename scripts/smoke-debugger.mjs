#!/usr/bin/env node
/**
 * Smoke-test the debugger without a browser.
 *
 * Drives `src/lib/bw-debug/debug-runner.js` — the real one, from the INTEGRATED
 * tree — against the real emulator and the real board layer, stubbing only the
 * three things a browser provides: `fetch` (backed by a local SDCC + stc_symtab
 * instead of the hosted compiler), `requestAnimationFrame`, and the VM.
 *
 * It exists because the interesting failures here are silent. The first version
 * of the runner created the emulator adapter AFTER loading the image, and
 * `emu_init` re-callocs code memory — so the CPU NOP-sledded through 64 KB of
 * zeroes, reached the breakpoint address anyway, and halted with every task
 * still at state 0. A green webpack build says nothing about that; this does.
 *
 * Preconditions, all reported rather than skipped past:
 *   - `node scripts/integrate.mjs` has run (this reads packages/scratch-gui/src)
 *   - a webpack build exists (for static/emu8051.wasm)
 *   - sdcc on PATH, and a stc-compiler checkout for stc_symtab.py
 *
 *     node scripts/smoke-debugger.mjs
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const LITE = path.join(repo, 'packages/scratch-gui/src');
const BUILD = path.join(repo, 'packages/scratch-gui/build');
const STCC = process.env.STC_COMPILER || path.resolve(repo, '../../stc-compiler');

for (const [what, where] of [['the integrated tree (npm run integrate)', LITE],
    ['a webpack build (static/emu8051.wasm)', path.join(BUILD, 'static/emu8051.wasm')],
    ['stc-compiler (set STC_COMPILER)', path.join(STCC, 'stc_symtab.py')]]) {
    if (!existsSync(where)) { console.error(`smoke-debugger: missing ${what}: ${where}`); process.exit(2); }
}
try { execFileSync('sdcc', ['--version'], { stdio: 'pipe' }); }
catch { console.error('smoke-debugger: no runnable sdcc on PATH'); process.exit(2); }
const work = mkdtempSync(path.join(tmpdir(), 'bw-runner-'));

// ---- browser stubs --------------------------------------------------------
// Emscripten resolves the .wasm against this; in a browser it is the app root.
globalThis.document = { baseURI: `file://${BUILD}/` };
let frames = 0;
globalThis.requestAnimationFrame = (fn) => { frames++; return setTimeout(fn, 0); };
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// fetch -> the local toolchain, exactly what POST /compile{symbols:true} returns
globalThis.fetch = async (url, init) => {
    const req = JSON.parse(init.body);
    const src = path.join(work, 'main.c');
    writeFileSync(src, req.code);
    execFileSync('sdcc', ['--debug', '-mmcs51', '--iram-size', '256', '--xram-size', '1024',
        '--code-size', '61440', '-o', `${work}/`, src], { stdio: 'pipe' });
    const ihx = readFileSync(path.join(work, 'main.ihx'));
    execFileSync('python3', [path.join(STCC, 'stc_symtab.py'),
        '--cdb', path.join(work, 'main.cdb'), '--source', src,
        '--fosc', '11059200', '--device', req.target, '-o', path.join(work, 's.json')],
        { stdio: 'pipe' });
    const symbols = JSON.parse(readFileSync(path.join(work, 's.json'), 'utf8'));
    return { json: async () => ({
        success: true, base64: ihx.toString('base64'), bytes: ihx.length, symbols,
        symbols_error: null
    }) };
};

// ---- the VM stub ----------------------------------------------------------
const { default: SB3Creator } = await import(`${LITE}/lib/sb3-creator.js`);
const creator = new SB3Creator();
creator.parse(`DEVICE STC12C5A60S2
CLOCK 11059200
PIN led1 = P1.0 OUTPUT ACTIVE LOW
PIN led2 = P1.1 OUTPUT

WHEN flag clicked:
  FOREVER:
    toggle led1
    wait 0.15 seconds

WHEN flag clicked:
  REPEAT 4:
    toggle led2
    wait 0.3 seconds
`);
// The VM stub mimics the REAL one, which means dropping `stc` from toJSON():
// scratch-vm's sb3 serializer emits targets/monitors/extensions/meta and nothing
// else, and keeps the hardware declarations on the runtime instead. An earlier
// version of this stub served `stc` from toJSON() and so could not have caught
// the runner reading it from there — which would have sent every debug build to
// the host C target without failing.
const serialised = { ...creator.project };
const stc = serialised.stc;
delete serialised.stc;
const projectJson = JSON.stringify(serialised);
const glows = [];
const vm = {
    toJSON: () => projectJson,
    runtime: { stc, glowBlock: (id, on) => glows.push([id, on]) }
};
const blockOpcode = new Map();
for (const t of creator.project.targets) {
    for (const [id, b] of Object.entries(t.blocks || {})) blockOpcode.set(id, b.opcode);
}

// ---- run it ---------------------------------------------------------------
const { createDebugRunner } = await import(`${LITE}/lib/bw-debug/debug-runner.js`);
const store = await import(`${LITE}/lib/bw-debug/breakpoints.js`);

// The block a user would right-click: the second script's REPEAT. Marked BEFORE
// anything is built or running, which is the whole reason breakpoints live in a
// store rather than inside the runner — at this moment there is no emulator, no
// symbol table, and no idea which (task, state) this block will become.
const repeatBlock = [...blockOpcode].find(([, op]) => op === 'control_repeat')[0];
store.toggleBreakpoint(repeatBlock);
console.log(`marked one block before starting: ${blockOpcode.get(repeatBlock)}`);

const runner = createDebugRunner({ vm, onChange: () => {} });
await runner.start();
let st = runner.state();
if (st.phase === 'error') { console.log('FAILED:', st.message); process.exit(1); }

const yieldBlocks = st.yieldBlocks;
console.log(`yield points: ${yieldBlocks.length}, all real blocks: ${yieldBlocks.every(b => blockOpcode.has(b))}`);
console.log(`  kinds: ${yieldBlocks.map(b => runner.yieldKind(b)).join(', ')}`);

for (let i = 0; i < 200 && runner.state().phase !== 'paused'; i++) {
    await new Promise(r => setTimeout(r, 10));
}

st = runner.state();
const why = st.session && st.session.why;
console.log(`halted: phase=${st.phase} after ${frames} frames, ${runner.timeMs().toFixed(1)} ms`);
console.log(`  position: ${JSON.stringify(why && why.tasks)}`);
console.log(`  pc 0x${why ? why.pc.toString(16) : '?'}, cause ${why && why.cause}`);
console.log(`  glowing: ${st.glowing.map(b => blockOpcode.get(b)).join(' + ')}`);
console.log(`  glowBlock calls: ${JSON.stringify(glows.map(([id, on]) => [blockOpcode.get(id) || id, on]))}`);

// A mark on a block the build has no yield for must be KEPT and reported, not
// silently dropped — it is the user's intent, and a later edit may give it one.
const plainBlock = [...blockOpcode].find(([, op]) => op === 'stc12_toggle')[0];
store.toggleBreakpoint(plainBlock);
const after = runner.state();
console.log(`  marks: ${after.breakpoints.length}, unreachable: ${after.unreachableBreakpoints.length}`);

// ---- the board the runner exposes is the one the emulator drives ----------
// Without this the Circuit tab builds its own board and shows LEDs that never
// change while the program blinks them.
const board = runner.board();
// getLeds() returns ID STRINGS, not objects. Mapping .id off them yields
// undefined, and ledBrightness(undefined) returns 0 — a plausible, wrong
// answer of exactly the kind simulation.md warns about. Take the shape from
// the engine's own tests, not from memory.
const leds = board ? board.getLeds() : [];
if (board) {
    const realSetPin = board.setPin.bind(board);
    let n = 0;
    board.setPin = (...args) => { n++; return realSetPin(...args); };
    setTimeout(() => console.log(`  board.setPin calls during the run: ${n}`), 380);

}
let brightSamples = [];
if (board && leds.length) {
    // Clear the pause point first: it is still armed from the check above, so a
    // resume would stop at it again and we would be sampling a frozen board —
    // which is correct behaviour and a useless measurement.
    store.clearBreakpoints();
    runner.resume();
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 10));
        brightSamples.push(board.ledBrightness(leds[0]));
    }
    runner.pause();
}
const distinct = new Set(brightSamples.map(b => b.toFixed(3)));
console.log(`  brightness: ${brightSamples.slice(0, 10).map(b => b.toFixed(3)).join(' ')} …`);
console.log(`  board time: ${board ? (Number(board.getTime()) / 1e6).toFixed(1) : '?'} ms`);
console.log(`board: ${leds.length} LEDs, ${distinct.size} distinct brightness values over 40 samples`);

// ---- the engineer's view: parity with emu8051's TUI -----------------------
const insp = runner.inspect();
console.log(`inspect: PC ${insp.pc.toString(16)} A ${insp.regs.a} SP ${insp.regs.sp} bank ${insp.regs.bank}`);
console.log(`  SFRs: ${Object.entries(insp.sfr).map(([k, v]) => `${k}=${v.toString(16)}`).join(' ')}`);
console.log(`  stack depth: ${insp.stack.length}`);

const traceRows = runner.trace();
console.log(`trace: ${traceRows.length} rows, last = ${traceRows.at(-1).text} @ ${traceRows.at(-1).pc.toString(16)}`);

// Stepping IS the per-instruction trace: each step halts, and every halt is a row.
const before = runner.trace().length;
runner.stepInstruction(5);
const added = runner.trace().length - before;
const walked = runner.trace().slice(-5);
console.log(`stepped 5 instructions -> ${added} rows: ${walked.map(r => r.text.split(/\s+/)[0]).join(' ')}`);

// The opcode LENGTH TABLE, against the oracle it was generated from.
//
// Not by comparing a linear walk to stc_disasm's listing: that disassembler
// resynchronises on branch targets and skips what it decides is data, so a
// naive walk from 0x0000 through SDCC's interrupt-vector padding disagrees
// with it for reasons that have nothing to do with lengths. Instead, take
// stc_disasm's OWN consecutive instruction boundaries — where it is certain —
// and check that our table predicts each gap.
const disasmOut = execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, ${JSON.stringify(STCC)})
import stc_disasm
print(stc_disasm.disassemble_hex(open(${JSON.stringify(path.join(work, 'main.ihx'))}).read()))
`], { encoding: 'utf8' });
const oracle = disasmOut.split('\n')
    .map(l => l.match(/^([0-9A-F]{4})\s+((?:[0-9A-F]{2} )+)/))
    .filter(Boolean)
    .map(m => ({ addr: parseInt(m[1], 16), len: m[2].trim().split(/\s+/).length }));
const { instructionLength } = await import(`${LITE}/lib/bw-debug/opcodes.js`);
const lengthMismatch = oracle.filter(o => {
    const opcode = runner.readMem('code', o.addr, 1)[0];
    return instructionLength(opcode) !== o.len;
});
console.log(`opcode lengths: ${oracle.length} instructions from stc_disasm, ${lengthMismatch.length} disagree`);

const listing = runner.listing(0x0000, 8);
console.log(`listing: ${listing.map(r => r.text.split(/\s+/)[0]).slice(0, 5).join(' ')}`);

// Memory, both ways, in a space the program does not touch.
runner.writeMem('xram', 0x200, 0xA5);
const readBack = runner.readMem('xram', 0x200, 1)[0];

// Registers are editable because every one of them IS a memory location: the
// accumulator is SFR 0xE0, R3 is internal RAM at bank*8+3. The drawer writes
// them through the same writeMem the hex view uses, so this checks that path.
runner.writeMem('sfr', 0xE0, 0x5A);
const accBack = runner.inspect().regs.a;
const bank = runner.inspect().regs.bank;
runner.writeMem('iram', (bank * 8) + 3, 0x99);
const r3Back = runner.inspect().regs.r[3];
console.log(`register edit: A=${accBack.toString(16)} R3=${r3Back.toString(16)} (bank ${bank})`);

// Set PC and an address breakpoint — the TUI's `g` and `k`.
const pcOk = runner.setPc(0x0100) === undefined && runner.inspect().pc === 0x0100;
const bpOn = runner.toggleAddressBreakpoint(0x0170);
const bpOff = runner.toggleAddressBreakpoint(0x0170);
console.log(`setPc ok: ${pcOk} | address breakpoint on/off: ${bpOn}/${bpOff}`);

const fail = [];
if (!board) fail.push('the runner exposes no board, so the Circuit tab has nothing to show');
if (!leds.length) fail.push('the inferred board has no LEDs');
if (distinct.size < 2) fail.push('the LED never changed brightness — the board is not being driven');
if (!insp || !insp.regs || insp.regs.r.length !== 8) fail.push('inspect did not return eight registers');
if (!traceRows.length) fail.push('the trace recorded nothing');
if (!traceRows.at(-1).text) fail.push('a trace row has no disassembly');
if (added !== 5) fail.push(`stepping 5 instructions recorded ${added} rows, not 5`);
if (walked.some(r => !r.bytes.length)) fail.push('a traced instruction has no opcode bytes');
if (!oracle.length) fail.push('stc_disasm produced no instructions to check against');
if (lengthMismatch.length) fail.push(`${lengthMismatch.length} opcode lengths disagree with stc_disasm`);
if (listing.some(r => !r.text)) fail.push('a listing row has no disassembly');
if (readBack !== 0xA5) fail.push(`memory write/read gave ${readBack}`);
if (accBack !== 0x5A) fail.push(`writing SFR 0xE0 did not change A (${accBack})`);
if (r3Back !== 0x99) fail.push(`writing bank*8+3 did not change R3 (${r3Back})`);
if (!pcOk) fail.push('setPc did not move the PC');
if (!bpOn || bpOff) fail.push('the address breakpoint did not toggle');
if (st.phase !== 'paused') fail.push(`never paused (phase ${st.phase})`);
if (!why || why.cause !== 'breakpoint') fail.push(`stopped for the wrong reason: ${why && why.cause}`);
if (!st.glowing.includes(repeatBlock)) fail.push('the breakpoint block is not glowing');
if (st.glowing.length !== 2) fail.push(`expected both tasks lit, got ${st.glowing.length}`);
if (!glows.some(([id, on]) => id === repeatBlock && on === true)) fail.push('glowBlock was never called on');
if (!yieldBlocks.every(b => blockOpcode.has(b))) fail.push('a yield point is not a real block');
if (!runner.isYieldBlock(repeatBlock)) fail.push('isYieldBlock disagrees with itself');
if (runner.isYieldBlock('nonsense')) fail.push('isYieldBlock said yes to a made-up id');
if (after.breakpoints.length !== 2) fail.push('a mark on a non-yield block was dropped');
if (!after.unreachableBreakpoints.includes(plainBlock)) fail.push('an unreachable mark was not reported');

runner.destroy();
store.clearBreakpoints();
console.log(fail.length ? `\nFAILED\n  ${fail.join('\n  ')}` : '\nOK — the runner drives it end to end.');
process.exit(fail.length ? 1 : 0);
