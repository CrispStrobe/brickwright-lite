#!/usr/bin/env node
// N2b measurement: how far the 8086 C route reaches over the gallery, and why
// each program that does not reach is refused.
//
//   node scripts/measure-i8086-numeric-reach.mjs --examples <sb3-creator>/examples [--compile]
//
// Every `<dir>/*/program.bw` is retargeted onto the 8051 pin surface
// (SB3Creator.retargetPseudocode to STC12C5A60S2 — the retargeter has no i8086
// entry, and the i8086 board shares the P1/P2/P3 pin names, which generateC
// maps onto the 8255's ports A/B/C), its DEVICE line is swapped for i8086, and
// the result is parsed and run through generateC. Each lands in one bucket:
//   retarget  the retargeter refused the program (no hardware declarations, a
//             part the 8051 pool lacks) — never reaches the emitter
//   choke     the verb choke refused it ("This program also uses: …") — a verb
//             with no i8086 C branch; the numeric model is not reached
//   int16     the numeric model refused it: a literal outside -32768..32767,
//             named in the refusal
//   wait      N2c refused a computed wait, or a literal outside 0..65535 ms,
//             before its unsigned word argument could wrap
//   host      generateC emitted HOST C (no hardware declarations survived the
//             retarget — string, micro:bit and SPIKE programs): a desktop
//             program, never 8086 code; the route refuses it by name
//   long      a `long` token reached DEVICE C (must be 0 after N2b step 2)
//   emits     C came out; with --compile, SmallerC is run and the result is
//             split into compiled / compile-failed (first diagnostic kept)
// Printed as one JSON object so a test or a plan entry can quote it. The
// gallery lives in the sb3-creator checkout, not here, so the directory is an
// argument, never a sibling-path default (gate-shapes AMBIENT-BINDING).
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';

const argv = process.argv.slice(2);
const dirIdx = argv.indexOf('--examples');
if (dirIdx < 0 || !argv[dirIdx + 1]) {
    console.error('usage: measure-i8086-numeric-reach.mjs --examples <dir> [--compile]');
    process.exit(2);
}
const dir = argv[dirIdx + 1];
const doCompile = argv.includes('--compile');

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
// --sb3 <file> names another build of the emitter (a pre-change copy placed in
// the same lib dir, so its relative imports resolve) for a before/after count.
const sb3Idx = argv.indexOf('--sb3');
const sb3Url = sb3Idx >= 0 && argv[sb3Idx + 1] ? new URL(argv[sb3Idx + 1], L) : new URL('sb3-creator.js', L);
const {default: SB3Creator} = await import(sb3Url.href);
const asText = r => {
    if (typeof r === 'string') return r;
    for (const k of ['pseudocode', 'text', 'source', 'code']) if (r && typeof r[k] === 'string') return r[k];
    throw new Error(`retargetPseudocode returned an object with keys ${Object.keys(r || {}).join(',')}`);
};

let compileC = null;
if (doCompile) {
    const {createRequire} = await import('node:module');
    const {dirname} = await import('node:path');
    const {fileURLToPath, pathToFileURL} = await import('node:url');
    const distUrl = new URL('smallerc-wasm/dist/', L);
    const require = createRequire(import.meta.url);
    const EXPORTS = {smlrpp: 'createSmlrpp', smlrc: 'createSmlrc'};
    const importFactory = async name => {
        const url = new URL(`${name}.js`, distUrl);
        const source = await readFile(url, 'utf8');
        const filename = fileURLToPath(url);
        const module = {exports: {}};
        Function('module', 'exports', 'require', '__filename', '__dirname',
            source.replace(new RegExp(`export default ${EXPORTS[name]};\\s*$`), ''))(
            module, module.exports, require, filename, dirname(filename));
        return module.exports;
    };
    const {HEADERS} = await import(new URL('headers.js', distUrl).href);
    const toolchain = {
        factories: await Promise.all(['smlrpp', 'smlrc'].map(importFactory)),
        headers: HEADERS,
        resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
    };
    const {compileWithToolchain} = await import(new URL('smallerc-wasm/compiler.js', L).href);
    compileC = code => compileWithToolchain(code, {target: 'i8086'}, toolchain);
}

const entries = (await readdir(dir, {withFileTypes: true})).filter(d => d.isDirectory()).map(d => d.name).sort();
const out = {examples: dir, programs: 0, retarget: [], host: [], choke: [], int16: [],
    waitLiteralPrograms: [], waitComputedPrograms: [], waitLiteralRefused: [], waitComputedRefused: [],
    long: [], emits: [], compiled: [], compileFailed: [], parseFailed: []};
for (const name of entries) {
    let src;
    try { src = await readFile(join(dir, name, 'program.bw'), 'utf8'); } catch { continue; }
    out.programs++;
    let code;
    try {
        const r = SB3Creator.retargetPseudocode(src, 'stc12c5a60s2');
        if (r && r.ok === false) { out.retarget.push(`${name}: ${(r.reasons || ['?'])[0]}`.slice(0, 140)); continue; }
        const retargeted = asText(r).replace(/^DEVICE .*$/m, 'DEVICE i8086');
        const c = new SB3Creator();
        c.parse(retargeted);
        let hasLiteralWait = false;
        let hasComputedWait = false;
        for (const target of c.project.targets || []) {
            for (const block of Object.values(target.blocks || {})) {
                if (block.opcode !== 'control_wait') continue;
                const inner = block.inputs && block.inputs.DURATION && block.inputs.DURATION[1];
                if (Array.isArray(inner) && inner[0] !== 12 && inner[0] !== 13) hasLiteralWait = true;
                else hasComputedWait = true;
            }
        }
        if (hasLiteralWait) out.waitLiteralPrograms.push(name);
        if (hasComputedWait) out.waitComputedPrograms.push(name);
        const g = c.generateC();
        code = typeof g === 'string' ? g : g.code;
    } catch (e) {
        out.parseFailed.push(`${name}: ${String(e.message || e).split('\n')[0].slice(0, 120)}`);
        continue;
    }
    if (/^\s*\/\* No C emitted for DEVICE/.test(code)) {
        if (/wait helper accepts/.test(code)) {
            if (/computes a wait duration/.test(code)) out.waitComputedRefused.push(name);
            else out.waitLiteralRefused.push(name);
            continue;
        }
        const m = /This program has: ([^.]+)\./.exec(code);
        if (m) out.int16.push(`${name}: ${m[1]}`);
        else {
            const v = /This program also uses: ([^.]+)\./.exec(code);
            out.choke.push(`${name}: ${v ? v[1] : '?'}`);
        }
        continue;
    }
    if (/^\s*\/\*[^\n]*blocks → C \(host\)/.test(code)) { out.host.push(name); continue; }
    if (/\blong\b/.test(code.replace(/\/\*[\s\S]*?\*\//g, ''))) { out.long.push(name); continue; }
    out.emits.push(name);
    if (compileC) {
        try {
            const r = await compileC(code);
            if (r && typeof r.asm === 'string' && r.asm.trim()) out.compiled.push(name);
            else out.compileFailed.push(`${name}: ${((r && r.warnings) || ['no asm'])[0]}`.slice(0, 160));
        } catch (e) {
            out.compileFailed.push(`${name}: ${String(e.message || e).split('\n')[0].slice(0, 140)}`);
        }
    }
}
// "pastChoke" means the verb choke no longer owns the terminal outcome. It
// includes later semantic refusals (int16 and N2c wait), not only emitted C.
const stores = out.int16.length + out.waitLiteralRefused.length + out.waitComputedRefused.length + out.emits.length;
out.emitter = sb3Url.pathname.split('/').pop();
out.summary = {
    programs: out.programs,
    retargetRefused: out.retarget.length,
    pastChoke: stores,
    choke: out.choke.length,
    hostC: out.host.length,
    waitLiteralPrograms: out.waitLiteralPrograms.length,
    waitComputedPrograms: out.waitComputedPrograms.length,
    waitLiteralRefused: out.waitLiteralRefused.length,
    waitComputedRefused: out.waitComputedRefused.length,
    int16Refused: out.int16.length,
    longLeaked: out.long.length,
    emits: out.emits.length,
    compiled: doCompile ? out.compiled.length : null,
    compileFailed: doCompile ? out.compileFailed.length : null,
    parseFailed: out.parseFailed.length
};
console.log(JSON.stringify(out, null, 1));
