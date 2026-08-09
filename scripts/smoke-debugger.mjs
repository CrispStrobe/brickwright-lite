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
const projectJson = JSON.stringify(creator.project);
const glows = [];
const vm = {
    toJSON: () => projectJson,
    runtime: { glowBlock: (id, on) => glows.push([id, on]) }
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

const fail = [];
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
