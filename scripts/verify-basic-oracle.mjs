#!/usr/bin/env node
// BASIC twin-run oracle — CLI/CI gate.
//
// Runs each fixture's BBC BASIC program on TWO independent engines and compares
// their console output through one normaliser (basic-twin-oracle.js):
//
//   emulated  — BbcZ80Runner over lite's static/roms/bbcbasic.com (R.T.
//               Russell's BBC BASIC Z80 .COM), the EXACT runner the Code tab's
//               BBC profile uses (pseudocode-importer.jsx runBasic).
//   reference — BBCSDL (R.T. Russell, zlib) built as a host console `bbcbasic`
//               by scripts/build-bbcsdl-reference.sh. A different codebase (C,
//               not Z80 asm) for the same language, so agreement is real
//               cross-engine evidence, not an engine judging itself.
//
// A fixture that carries `expected` is anchored against it too, so a CODEGEN
// defect (both engines run the same wrong emitted program and agree) still goes
// red — see basic-twin-oracle.js for the three legs.
//
// USAGE
//   BBCSDL_BBCBASIC=/path/to/bbcbasic node scripts/verify-basic-oracle.mjs
//   node scripts/verify-basic-oracle.mjs --program my.bas           # one raw program
//   node scripts/verify-basic-oracle.mjs --pseudocode my.bw         # one generated program
//
// The reference binary is found via $BBCSDL_BBCBASIC, else the default build
// output tools/bbcsdl/bbcbasic. With no reference present the run reports the
// EMULATED side and its own expected anchors (so codegen is still gated) and
// exits non-zero, naming the missing half — it never reports a twin PASS it did
// not measure.

import {readFileSync, existsSync, writeFileSync, unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runEmulatedBbc, compareTwin, normalizeConsole} from
    '../overlay/scratch-gui/src/lib/bw-debug/basic-twin-oracle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COM_PATH = path.join(ROOT, 'overlay/scratch-gui/static/roms/bbcbasic.com');
const DEFAULT_REF = path.join(ROOT, 'tools/bbcsdl/bbcbasic');
const DEFAULT_BRANDY = path.join(ROOT, 'tools/brandy/tbrandy');

const com = new Uint8Array(readFileSync(COM_PATH));

// ── the reference engine ────────────────────────────────────────────────────
//
// BBCSDL's console reads commands on stdin. Feeding "<lines>\nRUN\n*QUIT\n"
// loads the program, runs it, and quits; its stdout is the banner, each line
// echoed after a '>' prompt, the program output, then ">*QUIT". The program
// output is exactly the lines BETWEEN the ">RUN" echo and the ">*QUIT" echo —
// a deterministic slice because this harness always appends *QUIT.
export function runReferenceBbc(bin, program, {inputs = []} = {}) {
    const lines = String(program).split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
    const feed = [...lines, 'RUN', ...inputs, '*QUIT', ''].join('\n');
    const res = spawnSync(bin, [], {input: feed, encoding: 'utf8', timeout: 30000, maxBuffer: 1 << 24});
    if (res.error) throw new Error(`reference failed to run: ${res.error.message}`);
    const raw = (res.stdout || '').split(/\r\n|\r|\n/);
    const start = raw.findIndex((l) => l.replace(/[^\x20-\x7e]/g, '') === '>RUN');
    if (start === -1) return {output: (res.stdout || ''), raw: res.stdout || '', reason: 'no-run-echo'};
    let end = raw.findIndex((l, i) => i > start && l.replace(/[^\x20-\x7e]/g, '') === '>*QUIT');
    if (end === -1) end = raw.length;
    return {output: raw.slice(start + 1, end).join('\n'), raw: res.stdout || '', reason: 'ok'};
}

// ── a SECOND, TRULY-FOREIGN reference engine: Matrix Brandy (GPL) ────────────
//
// BBCSDL and the emulated Z80 .COM are both R.T. Russell's BBC BASIC — one
// author, so their agreement is one family checking itself. Matrix Brandy
// (stardot/MatrixBrandy, GPL-2) is a DIFFERENT codebase by DIFFERENT authors,
// so a THREE-engine agreement is real cross-implementation evidence. Brandy is
// GPL and is NEVER bundled or linked: built on demand into gitignored tools/ by
// scripts/build-brandy-reference.sh — the GPL-oracle-only regime ngspice
// established. Its text build (`tbrandy`) loads a .bas, runs it (quit-at-end),
// and prints through a VT layer, so strip the ANSI cursor controls it emits
// (ESC[...<letter>); the normaliser folds the rest.
export function runBrandyBbc(bin, program, {inputs = []} = {}) {
    const tmp = path.join(tmpdir(), `brandy-${process.pid}-${Math.random().toString(36).slice(2)}.bas`);
    writeFileSync(tmp, String(program));
    try {
        const res = spawnSync(bin, [tmp], {input: inputs.join('\n'), encoding: 'utf8', timeout: 30000, maxBuffer: 1 << 24});
        if (res.error) throw new Error(`brandy failed to run: ${res.error.message}`);
        const clean = (res.stdout || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
        return {output: clean, raw: res.stdout || '', reason: 'ok'};
    } finally {
        try { unlinkSync(tmp); } catch { /* best effort */ }
    }
}

// ── the generated-shape leg: dialect pseudocode → generateBASIC → BBC BASIC ──
//
// The same path the GUI uses (pseudocode-importer.jsx deriveBuffer 'basic'):
// SB3Creator.parse(pseudocode) builds the project, generateBASIC emits BBC
// BASIC. Mutating generateBASIC changes the emitted program; its output then
// diverges from the fixture's `expected`, and the oracle goes red.
export async function generateFromPseudocode(pseudocode, opts = {}) {
    const {default: SB3Creator} = await import(
        '../overlay/scratch-gui/src/lib/sb3-creator.js');
    const creator = new SB3Creator();
    creator.parse(pseudocode);
    const r = new SB3Creator().generateBASIC(creator.project,
        {profile: 'bbc', lineNumbers: true, ...opts});
    if (!r.ok) throw new Error(`generateBASIC refused: ${(r.reasons || []).join('; ')}`);
    return r.basic;
}

// ── fixtures ─────────────────────────────────────────────────────────────────
// Small and decisive. Raw fixtures exercise the EMULATOR vs the reference
// (arithmetic, FOR/NEXT, strings, string functions). Generated fixtures drive
// generateBASIC and ANCHOR on expected so a codegen defect reddens too.
export const RAW_FIXTURES = [
    {name: 'arithmetic', program: '10 PRINT 2+2', expected: '         4'},
    {name: 'arithmetic-chain', program:
        '10 PRINT 6*7\n20 PRINT 100-1\n30 PRINT 10/4',
        expected: '        42\n        99\n       2.5'},
    {name: 'for-next', program:
        '10 FOR I=1 TO 3\n20 PRINT I\n30 NEXT I\n40 PRINT "DONE"',
        expected: '         1\n         2\n         3\nDONE'},
    {name: 'for-next-step', program:
        '10 FOR I=10 TO 0 STEP -5\n20 PRINT I\n30 NEXT I',
        expected: '        10\n         5\n         0'},
    {name: 'strings', program:
        '10 A$="BRICK"\n20 B$="WRIGHT"\n30 PRINT A$+B$\n40 PRINT LEN(A$+B$)',
        expected: 'BRICKWRIGHT\n        11'},
    {name: 'string-funcs', program:
        '10 S$="HELLO WORLD"\n20 PRINT LEFT$(S$,5)\n30 PRINT MID$(S$,7,5)',
        expected: 'HELLO\nWORLD'},
    {name: 'nested-loop', program:
        '10 FOR I=1 TO 2\n20 FOR J=1 TO 2\n30 PRINT I*10+J\n40 NEXT J\n50 NEXT I',
        expected: '        11\n        12\n        21\n        22'}
];

// Each generated fixture is (dialect pseudocode) + the expected output of the
// BBC BASIC generateBASIC emits for it. `program` is filled at run time.
export const GENERATED_FIXTURES = [
    {name: 'gen-print-and-loop',
        pseudocode: 'WHEN flag clicked:\n  print "HELLO"\n  print (2 + 2)\n  REPEAT 3:\n    print "X"',
        expected: 'HELLO\n         4\nX\nX\nX'},
    {name: 'gen-counter',
        pseudocode: 'WHEN flag clicked:\n  set n to 0\n  REPEAT 4:\n    change n by 1\n    print n',
        expected: '         1\n         2\n         3\n         4'}
];

async function buildFixtures() {
    const fixtures = RAW_FIXTURES.map((f) => ({...f, kind: 'raw'}));
    for (const g of GENERATED_FIXTURES) {
        fixtures.push({...g, kind: 'generated', program: await generateFromPseudocode(g.pseudocode)});
    }
    return fixtures;
}

function resolveReference() {
    const bin = process.env.BBCSDL_BBCBASIC || DEFAULT_REF;
    return existsSync(bin) ? bin : null;
}

function resolveBrandy() {
    const bin = process.env.BRANDY_BASIC || DEFAULT_BRANDY;
    return existsSync(bin) ? bin : null;
}

async function main() {
    const args = process.argv.slice(2);
    // The reference engines, each a DIFFERENT implementation of BBC BASIC. The
    // emulated Z80 .COM is always present; BBCSDL (R.T. Russell, C) and Matrix
    // Brandy (GPL, a different author entirely) join when built. Every present
    // engine must twin-agree with the emulated one and the `expected` anchor —
    // so with both references it is a THREE-engine agreement, and Brandy makes
    // it cross-AUTHOR, not one family checking itself.
    const ref = resolveReference();
    const brandy = resolveBrandy();
    const references = [];
    if (ref) references.push({engine: 'BBCSDL', bin: ref, run: (prog) => runReferenceBbc(ref, prog)});
    if (brandy) references.push({engine: 'Brandy', bin: brandy, run: (prog) => runBrandyBbc(brandy, prog)});
    const fail = [];
    const note = [];

    // Ad-hoc single-program modes (good use from the CLI).
    const progIdx = args.indexOf('--program');
    const pseudoIdx = args.indexOf('--pseudocode');
    let fixtures;
    if (progIdx !== -1) {
        const program = readFileSync(args[progIdx + 1], 'utf8');
        fixtures = [{name: path.basename(args[progIdx + 1]), kind: 'raw', program}];
    } else if (pseudoIdx !== -1) {
        const program = await generateFromPseudocode(readFileSync(args[pseudoIdx + 1], 'utf8'));
        console.log('=== generated BBC BASIC ===\n' + program + '\n');
        fixtures = [{name: path.basename(args[pseudoIdx + 1]), kind: 'generated', program}];
    } else {
        fixtures = await buildFixtures();
    }

    const engineList = references.length
        ? references.map((r) => r.engine).join(' + ')
        : '(none — set BBCSDL_BBCBASIC / BRANDY_BASIC or run scripts/build-bbcsdl-reference.sh + scripts/build-brandy-reference.sh)';
    console.log(`reference engines: ${engineList}`);
    console.log(`fixtures         : ${fixtures.length}\n`);

    for (const f of fixtures) {
        const emu = runEmulatedBbc(com, f.program);
        // Run every present reference and twin-compare each against the emulated
        // engine (and the `expected` anchor). ALL must agree; a single
        // disagreement reddens and names the engine that diverged.
        let ok = true;
        const details = [];
        for (const r of references) {
            let out;
            try { out = r.run(f.program).output; }
            catch (e) { out = `<<${r.engine} error: ${e.message}>>`; }
            const v = compareTwin({emulated: emu.output, reference: out, expected: f.expected});
            if (!v.pass) { ok = false; details.push(`vs ${r.engine}: ${v.detail || v.mismatch}`); }
        }
        // With no reference at all, anchor the emulated side on `expected` so a
        // codegen defect is still gated — never a silent pass.
        if (references.length === 0) {
            const v = compareTwin({emulated: emu.output, reference: emu.output, expected: f.expected});
            if (!v.pass) { ok = false; details.push(v.detail || 'vs expected'); }
        }
        const measuredTwin = references.length > 0;
        // A reference-less run with no anchor measured nothing — not a pass.
        if (!measuredTwin && f.expected == null) { ok = false; note.push(f.name); }

        const half = measuredTwin ? `twin×${references.length}` : 'emulated-only';
        console.log(`${ok ? 'ok  ' : 'FAIL'} [${f.kind}/${half}] ${f.name}`);
        if (!ok) {
            fail.push(f.name);
            if (details.length) console.log('     ' + details.join('\n     ').replace(/\n(?!     )/g, '\n     '));
            if (emu.reason !== 'ok') console.log(`     emulated stop reason: ${emu.reason}`);
        }
    }

    if (references.length === 0) {
        console.log('\nWARNING: no reference engine — the cross-engine twin check was NOT run.');
        console.log('Build them:  scripts/build-bbcsdl-reference.sh  and  scripts/build-brandy-reference.sh');
    } else if (references.length === 1) {
        console.log(`\nNote: only ${references[0].engine} ran; build the other reference for the full cross-author agreement.`);
    }
    const unmeasured = references.length === 0;
    console.log(fail.length
        ? `\n${fail.length} fixture(s) FAILED: ${fail.join(', ')}`
        : unmeasured
            ? '\nEmulated + expected anchors passed; cross-engine twin NOT measured (no reference).'
            : `\nAll twin-run oracle checks passed (${references.length}-engine agreement: ${references.map((r) => r.engine).join(', ')} vs emulated).`);
    // Red on any failure; also red when the cross-engine half could not run at
    // all (an honest "not measured", not a pass) unless explicitly allowed.
    process.exit(fail.length ? 1 : (unmeasured && !args.includes('--allow-no-reference')) ? 2 : 0);
}

// Run the gate only when invoked directly; importing this module (the test
// reuses runReferenceBbc + the fixtures) must not run the oracle or exit.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
