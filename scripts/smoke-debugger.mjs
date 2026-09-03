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
import { writeFileSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, symlinkSync, existsSync }
    from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const LITE = path.join(repo, 'packages/scratch-gui/src');
const BUILD = path.join(repo, 'packages/scratch-gui/build');
const SDCC_DIST = path.join(LITE, 'lib/sdcc-wasm/dist');
// gate-shapes-allow: overridable with STC_COMPILER, and its absence exits 2 below.
const STCC = process.env.STC_COMPILER || path.resolve(repo, '../../stc-compiler');

for (const [what, where] of [['the integrated tree (npm run integrate)', LITE],
    ['a webpack build (static/emu8051.wasm)', path.join(BUILD, 'static/emu8051.wasm')],
    ['the in-tree SDCC WASM toolchain', path.join(SDCC_DIST, 'sdcc.js')],
    ['stc-compiler (set STC_COMPILER)', path.join(STCC, 'stc_symtab.py')]]) {
    if (!existsSync(where)) { console.error(`smoke-debugger: missing ${what}: ${where}`); process.exit(2); }
}
// gate-shapes-allow: this IS the fail-closed check — no runnable sdcc means exit 2, not a pass.
try { execFileSync('sdcc', ['--version'], { stdio: 'pipe' }); }
catch { console.error('smoke-debugger: no runnable sdcc on PATH'); process.exit(2); }
const work = mkdtempSync(path.join(tmpdir(), 'bw-runner-'));

// ---- the app root this run resolves assets against ------------------------
// A staged mirror of `build/`, identical to it except that `static/sdcc-wasm`
// points at `src/lib/sdcc-wasm/dist` — the source webpack's CopyWebpackPlugin
// copies from — instead of whatever a previous build happened to leave there.
//
// This is not tidiness. The toolchain in build/ can be OLDER than the one in
// the tree, and a pre-2026-08-31 copy is the 64 KiB-stack build whose stack
// overflow corrupts SDCC's own static data (see sdcc-wasm/BUILD-INFO.md). It
// fails as `memory access out of bounds` from the sdcc stage — which reads as
// a compiler or harness bug, not as "your build directory is stale", and sent
// at least one investigation down a dead end. Resolving the toolchain from the
// tree makes this script's verdict a property of the committed toolchain, the
// same one test/wasm-compiler-integration.test.mjs gates.
const stage = mkdtempSync(path.join(tmpdir(), 'bw-approot-'));
mkdirSync(path.join(stage, 'static'));
for (const entry of readdirSync(BUILD)) {
    if (entry !== 'static') symlinkSync(path.join(BUILD, entry), path.join(stage, entry));
}
for (const entry of readdirSync(path.join(BUILD, 'static'))) {
    if (entry !== 'sdcc-wasm') {
        symlinkSync(path.join(BUILD, 'static', entry), path.join(stage, 'static', entry));
    }
}
symlinkSync(SDCC_DIST, path.join(stage, 'static/sdcc-wasm'));
const digest = file => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : '-');
const staleAssets = ['cc1.js', 'cc1.wasm', 'sdcc.js', 'sdcc.wasm', 'sdas8051.js', 'sdas8051.wasm',
    'sdld.js', 'sdld.wasm', 'runtime.json']
    .filter(name => digest(path.join(SDCC_DIST, name)) !==
        digest(path.join(BUILD, 'static/sdcc-wasm', name)));
if (staleAssets.length) {
    console.log(`note: build/static/sdcc-wasm is stale (${staleAssets.join(' ')}); ` +
        'using src/lib/sdcc-wasm/dist. Rebuild the GUI to ship what this run tested.');
}

// ---- browser stubs --------------------------------------------------------
// Emscripten resolves the .wasm against this; in a browser it is the app root.
globalThis.document = { baseURI: `file://${stage}/` };

let frames = 0;
globalThis.requestAnimationFrame = (fn) => { frames++; return setTimeout(fn, 0); };
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// fetch serves TWO kinds of request, and assuming otherwise is what broke this script.
//
// The POST /compile below is the one it was written for. But when the build ships
// static/sdcc-wasm, the app installs its OWN fetch interceptor, takes that POST, compiles
// locally, and then fetches its runtime pack with `fetch(url)` and NO init — which this stub
// used to dereference as `init.body`, throwing "Cannot read properties of undefined (reading
// 'body')". Reported as "local WASM compilation failed", which reads like a compiler fault.
//
// `document.baseURI` above already points at the real build directory, so those assets are on
// disk: serve them. That keeps the local-WASM path — the one production uses — under test,
// rather than routing around it.
//
// It went unnoticed because the prerequisite check for sdcc exits 2 BEFORE reaching any of
// this, and CI downgrades exit 2 to a warning. A precondition that fires first can shadow every
// assertion behind it indefinitely; the skip was the only thing anyone ever saw.
globalThis.fetch = async (url, init) => {
    if (!init || init.method !== 'POST') {
        const href = typeof url === 'string' ? url : (url && url.href) || String(url);
        const asset = href.startsWith('file:') ? fileURLToPath(href) : href;
        if (!existsSync(asset)) throw new Error(`smoke-debugger: no such local asset: ${href}`);
        const bytes = readFileSync(asset);
        return {
            ok: true,
            status: 200,
            json: async () => JSON.parse(bytes.toString('utf8')),
            text: async () => bytes.toString('utf8'),
            arrayBuffer: async () =>
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        };
    }
    const req = JSON.parse(init.body);
    const src = path.join(work, 'main.c');
    writeFileSync(src, req.code);
    // gate-shapes-allow: the sdcc proven runnable at startup, or this script already exited 2.
    execFileSync('sdcc', ['--debug', '-mmcs51', '--iram-size', '256', '--xram-size', '1024',
        '--code-size', '61440', '-o', `${work}/`, src], { stdio: 'pipe' });
    const ihx = readFileSync(path.join(work, 'main.ihx'));
    // gate-shapes-allow: python3 + the STCC checkout, both existence-checked at startup.
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
  set counter to 0
  REPEAT 4:
    change counter by 1
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
//
// The bytes handed to the oracle are the ones the emulator is EXECUTING, read
// back out of code memory. They used to be `${work}/main.ihx`, written by the
// POST /compile branch of the fetch stub — but the app's own local-WASM router
// now claims that POST (that route IS production, and testing it is the point
// of this script), so native SDCC never runs and no such file is written.
// Compiling a second image with native SDCC would be worse than a missing file:
// stc_disasm would report boundaries in an SDCC 4.2.0 image while `readMem`
// below reads the 4.5.0 one, and every disagreement would be noise about
// version skew. Reading the loaded image keeps both sides on the same bytes,
// and it is not circular — the boundaries still come from stc_disasm, not from
// the length table under test.
//
// Bounded to the program's own contiguous region, which is what SDCC lays out
// from 0x0000. The last nonzero byte is NOT that boundary: code memory also
// carries bytes at 0xFFC0.., and stc_disasm sweeps min(address)..max(address),
// so including them disassembles 64 KB of padding — 1.1 MB of NOP listing,
// which overflows execFileSync's default 1 MB buffer (ENOBUFS) before any
// length is ever compared.
//
// Read in 256-byte chunks, because a single 0x10000 request does NOT come back
// whole: `readMem`'s fast path hands the length straight to the emulator's
// scratch buffer, and a 64 KB ask returned the first ~270 bytes correctly and
// ZERO for everything after — a silent short read. Taken at face value it makes
// the program look like it ends at 0x010E while the CPU is demonstrably
// executing at 0x01F8, and it hands stc_disasm a desert of NOPs to agree with.
const PROGRAM_GAP = 64;
const CODE_CHUNK = 256;
const codeBytes = [];
for (let at = 0; at < 0x10000; at += CODE_CHUNK) {
    codeBytes.push(...runner.readMem('code', at, CODE_CHUNK));
}
let codeEnd = 0;
for (let at = 0; at < codeBytes.length; at++) {
    if (codeBytes[at]) codeEnd = at + 1;
    else if (at - codeEnd >= PROGRAM_GAP) break;
}
const ihxRecords = [];
for (let at = 0; at < codeEnd; at += 16) {
    const row = [Math.min(16, codeEnd - at), (at >> 8) & 0xFF, at & 0xFF, 0x00,
        ...codeBytes.slice(at, Math.min(at + 16, codeEnd))];
    row.push((0x100 - (row.reduce((sum, b) => sum + b, 0) & 0xFF)) & 0xFF);
    ihxRecords.push(`:${row.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('')}`);
}
ihxRecords.push(':00000001FF');
const loadedIhx = path.join(work, 'loaded.ihx');
writeFileSync(loadedIhx, `${ihxRecords.join('\n')}\n`);
// gate-shapes-allow: same STCC checkout, already existence-checked at startup.
const disasmOut = execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, ${JSON.stringify(STCC)})
import stc_disasm
print(stc_disasm.disassemble_hex(open(${JSON.stringify(loadedIhx)}).read()))
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

// The code pane anchors at the PC, and clicking a line is how a breakpoint at
// an address gets set -- so the pane's own data has to line up with the PC.
const atPc = runner.listing(runner.inspect().pc, 6);
const pcNow = runner.inspect().pc;
console.log(`code pane: first row 0x${atPc[0].addr.toString(16)} = PC 0x${pcNow.toString(16)} -> ${atPc[0].addr === pcNow}, rows advance by 1-3 bytes`);
const gaps = atPc.slice(1).map((r, i) => r.addr - atPc[i].addr);
console.log(`  instruction sizes walked: ${gaps.join(' ')}`);

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

// ---- the inspector: the user's own nouns ---------------------------------
const vars = runner.variables();
console.log(`variables: ${vars.map(v => `${v.name}=${v.value} @${v.where}`).join(', ') || 'none'}`);
const pinView = runner.pins();
console.log(`pins: ${pinView.map(p => `${p.name}(${p.pin})=${p.direction === 'analog' ? (p.volts||0).toFixed(2)+'V' : (p.on ? 'on' : 'off')}`).join(', ')}`);
const withVars = runner.trace().filter(r => r.variables);
console.log(`timeline: ${withVars.length} stops carry a variable snapshot`);

// let it run so a variable actually moves, then compare two recorded stops
store.clearBreakpoints();
runner.resume();
await new Promise(r => setTimeout(r, 300));
runner.pause();
await new Promise(r => setTimeout(r, 30));
const snaps = runner.trace().filter(r => r.variables);
const counterOverTime = snaps.map(r => (r.variables.find(v => v.name === 'counter') || {}).value);
console.log(`counter across recorded stops: ${JSON.stringify(counterOverTime)}`);

// ---- conditional pause points --------------------------------------------
// The point of the feature: stop on the iteration you care about, not on all
// of them. `counter` counts 1..4 in the second script, so a condition of
// `counter > 2` must skip the first hits and stop at 3.
store.clearBreakpoints();
runner.stop();
const repeatBody = [...blockOpcode].find(([, op]) => op === 'stc12_toggle')[0];
const waitBlock = runner.trace().length ? null : null;
// Put it on the wait inside the REPEAT — a yield point that runs once per turn.
const yieldsByKind = runner.state().yieldBlocks.map(b => [b, runner.yieldKind(b)]);
const waitInRepeat = yieldsByKind.filter(([, k]) => k === 'wait').pop()[0];
const condErr = runner.setCondition(waitInRepeat, 'counter > 2');
console.log(`condition set: ${condErr ? 'REJECTED ' + condErr.error : 'counter > 2'}`);
const bogus = runner.setCondition(waitInRepeat, 'counter >');
console.log(`bogus condition: ${bogus ? 'rejected — ' + bogus.error.slice(0, 40) : 'ACCEPTED (wrong)'}`);
runner.setCondition(waitInRepeat, 'counter > 2');

await runner.start();
for (let i = 0; i < 200 && runner.state().phase !== 'paused'; i++) await new Promise(r => setTimeout(r, 10));
const stopped = runner.state();
const counterAtStop = (runner.variables().find(v => v.name === 'counter') || {}).value;
console.log(`stopped with counter=${counterAtStop}, ${stopped.skippedHits} earlier hits skipped`);

// ---- hover-to-inspect: what was `counter` HERE? ---------------------------
const hoverBlock = runner.state().yieldBlocks.find(b => runner.yieldKind(b) === 'repeat');
const at = runner.valuesAtBlock(hoverBlock);
console.log(`values at the REPEAT block: ${at ? at.variables.map(v => v.name + '=' + v.value).join(', ') + ` (${at.agoMs.toFixed(0)} ms ago)` : 'never stopped there'}`);
// The bridge the editor uses: the runner publishes a resolver, the workspace
// asks. Verified through the same path the tooltip takes, not around it.
const {valuesAtBlock: viaBridge} = await import(`${LITE}/lib/bw-debug/hover-values.js`);
const bridged = viaBridge(hoverBlock);
console.log(`via the editor bridge: ${bridged ? bridged.variables.map(v => v.name + '=' + v.value).join(', ') : 'nothing'}`);

// The condition editor's variable list. block-menu.js feature-detects this and
// falls back to the stage's Scratch variables, so a missing producer is silent
// -- it just offers a subtly different list and conditions quietly never fire.
const editorVars = vm.runtime._bwDebugVariables ? vm.runtime._bwDebugVariables() : null;
// bw-bundle's DebugStatus reads this; a missing producer shows as an em-dash and
// nothing else, so the producing side asserts it.
console.log(`bwMs published: ${runner.state().bwMs}`);
console.log(`condition editor variable list: ${editorVars ? editorVars.map(v => v.name).join(', ') : 'NOT PUBLISHED'}`);

const never = runner.valuesAtBlock('not-a-block');
console.log(`values at a block that is not a yield point: ${never === null ? 'null, correctly' : 'WRONG'}`);

const fail = [];
if (!at) fail.push('no recorded values at a block the program demonstrably stopped at');
if (at && !at.variables.some(v => v.name === 'counter')) fail.push('the snapshot has no counter');
if (never !== null) fail.push('a non-yield block returned something');
if (!bridged) fail.push('the editor bridge returned nothing — a tooltip would never appear');
if (!editorVars) fail.push('_bwDebugVariables is not published, so the condition editor offers the wrong list');
if (typeof runner.state().bwMs !== 'number') fail.push('bwMs is not published — DebugStatus would show an em-dash');
if (editorVars && !editorVars.some(v => v.name === 'counter')) fail.push('the editor list is missing a real variable');
if (bridged && bridged.agoMs < 0) fail.push('a negative "ago" leaked out');
if (condErr) fail.push('a valid condition was rejected');
if (!bogus) fail.push('a malformed condition was accepted');
if (stopped.phase !== 'paused') fail.push('the conditional pause point never fired');
if (counterAtStop !== 3) fail.push(`stopped at counter=${counterAtStop}, wanted the first value over 2`);
if (!stopped.skippedHits) fail.push('no hits were skipped, so the condition did nothing');
if (!vars.length) fail.push('no variables reported — the symbol table carried none');
if (!vars.some(v => v.name === 'counter')) fail.push('the variable is not under its Scratch name');
if (!pinView.length) fail.push('no pins reported');
if (!pinView.some(p => p.direction === 'output' && typeof p.on === 'boolean')) fail.push('a digital pin has no on/off');
if (!withVars.length) fail.push('no trace row carries variables, so the timeline cannot scrub');
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
if (atPc[0].addr !== pcNow) fail.push('the code pane does not start at the program counter');
if (gaps.some(g => g < 1 || g > 3)) fail.push(`a listing step was ${gaps.join(',')} bytes — not an 8051 instruction`);
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
