#!/usr/bin/env node
/**
 * Measure the Tcl tab's reader and generator against a corpus of real Tcl.
 *
 *   node scripts/tcl-corpus-roundtrip.mjs --dir <corpus> [--out report.json] [--limit N]
 *                                         [--no-run] [--filter substring]
 *
 * For every *.tcl file under <corpus>:
 *
 *   READ     tclToPseudocode(source) — CLEAN (every command lifted), DEGRADED
 *            (some commands left as `# unsupported`, each named in a warning) or
 *            REFUSED (the reader threw: a lexing failure, nothing came back).
 *   BLOCKS   the pseudocode parses into a project (SB3Creator.parse).
 *   WRITE    generateTcl(project) — ok, or refused with reasons.
 *   FIXED    read(write(read(src))) writes the same text again.
 *   RUN      for a CLEAN lift that writes: the ORIGINAL under real tclsh and the
 *            REGENERATED partcl on the DOS bench (the tab's ▶ Run path) print the
 *            same lines. Needs `tclsh` on PATH (skipped without it, by name).
 *
 * The report counts each outcome and ranks the commands the reader could not
 * lift — that ranking is the gap list. Nothing here asserts a threshold: the
 * numbers are the deliverable, like gen-reader-coverage.mjs.
 *
 * The corpus is not in this repository (Rosetta Code is GFDL; the Tcl wiki has
 * no stated licence). It is backed up, with provenance and a fetch.sh, in the
 * private brickwright-firmware-private repo under compat-corpora/tcl/, and the
 * last report sits beside it in compat-corpora/reports/TCL-ROUNDTRIPS.md:
 *
 *   node scripts/tcl-corpus-roundtrip.mjs --dir ../brickwright-firmware-private/compat-corpora/tcl/rosetta
 */
import {readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = path.join(root, 'overlay/scratch-gui/src/lib');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : dflt;
};
const flag = name => args.includes(`--${name}`);
const dir = opt('dir');
if (!dir) {
    console.error('usage: tcl-corpus-roundtrip.mjs --dir <corpus> [--out report.json] [--limit N] [--no-run] [--filter s]');
    process.exit(2);
}

const {default: tclToPseudocode, generateTcl} = await import(path.join(lib, 'bw-lang/tcl.js'));
const SB3Creator = (await import(path.join(lib, 'sb3-creator.js'))).default;
const {runDosToolchain} = await import(path.join(lib, 'bw-debug/dos-toolchain-routes.js'));
const TCL_EXE = new Uint8Array(readFileSync(path.join(root, 'overlay/scratch-gui/static/roms/tcl.exe')));
const haveTclsh = spawnSync('tclsh', [], {input: 'exit 0\n'}).status === 0;
const doRun = !flag('no-run');

const walk = d => readdirSync(d).flatMap(f => {
    const p = path.join(d, f);
    if (f.startsWith('.')) return [];
    return statSync(p).isDirectory() ? walk(p) : (f.endsWith('.tcl') ? [p] : []);
});
let files = walk(path.resolve(dir)).sort();
const filter = opt('filter');
if (filter) files = files.filter(f => f.includes(filter));
const limit = Number(opt('limit', 0));
if (limit) files = files.slice(0, limit);

const quiet = fn => {
    const saved = [console.log, console.warn, console.error];
    console.log = console.warn = console.error = () => {};
    try { return fn(); } finally { [console.log, console.warn, console.error] = saved; }
};
const project = src => quiet(() => {
    const c = new SB3Creator();
    c.parse(src);
    return c.project;
});
const lines = s => String(s).replace(/\r/g, '').replace(/\s+$/, '').split('\n').map(l => l.trimEnd())
    .filter((l, i, a) => !(l === '' && i === a.length - 1));
const reason = w => {
    const m = /no block for the Tcl command "([^"]+)"|no block for the Tcl command \[([^\]]+)\]/.exec(w);
    if (m) return `command: ${m[1] || m[2]}`;
    return String(w).replace(/^unsupported \(line \d+\): /, '').replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 90);
};

const tally = {files: 0, read: {clean: 0, degraded: 0, refused: 0}, blocks: {ok: 0, failed: 0},
    write: {ok: 0, empty: 0, refused: 0}, fixed: {yes: 0, no: 0},
    run: {same: 0, differs: 0, originalFailed: 0, skipped: 0}};
const gaps = new Map();
const refusals = new Map();
const writeRefusals = new Map();
const perFile = [];
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

for (const file of files) {
    const rel = path.relative(path.resolve(dir), file);
    const src = readFileSync(file, 'utf8');
    const rec = {file: rel};
    perFile.push(rec);
    tally.files++;
    let read;
    try {
        read = tclToPseudocode(src);
    } catch (e) {
        tally.read.refused++;
        rec.read = 'refused';
        rec.error = e.message;
        bump(refusals, reason(e.message));
        continue;
    }
    if (!/\S/.test(read.pseudocode)) {
        tally.read.empty = (tally.read.empty || 0) + 1;
        rec.read = 'empty';
        for (const w of new Set(read.warnings.map(reason))) bump(gaps, w);
        continue;
    }
    rec.read = read.warnings.length ? 'degraded' : 'clean';
    tally.read[rec.read]++;
    rec.warnings = read.warnings.length;
    for (const w of new Set(read.warnings.map(reason))) bump(gaps, w);
    let proj;
    try {
        proj = project(read.pseudocode);
        tally.blocks.ok++;
    } catch (e) {
        tally.blocks.failed++;
        rec.blocks = e.message.split('\n').slice(0, 2).join(' ');
        continue;
    }
    const w1 = generateTcl(proj);
    if (!w1.ok) {
        tally.write.refused++;
        rec.write = w1.reasons;
        for (const r of w1.reasons) bump(writeRefusals, reason(r));
        continue;
    }
    // Every command was unsupported: nothing to write, nothing to round-trip.
    if (!/\S/.test(w1.tcl.split('# --- program ---')[1] || '') && !/^proc (?![#]|else|not|and|or|mod|wait )/m.test(w1.tcl)) {
        tally.write.empty++;
        rec.write = 'empty';
        continue;
    }
    tally.write.ok++;
    let fixed = false;
    try {
        const w2 = generateTcl(project(tclToPseudocode(w1.tcl).pseudocode));
        fixed = w2.ok && w2.tcl === w1.tcl;
    } catch (e) { rec.fixedError = e.message.split('\n')[0]; }
    tally.fixed[fixed ? 'yes' : 'no']++;
    rec.fixed = fixed;
    if (rec.read !== 'clean' || !doRun || !haveTclsh) { tally.run.skipped++; continue; }
    const orig = spawnSync('tclsh', [file], {input: '', timeout: 5000, encoding: 'utf8'});
    if (orig.status !== 0 || orig.error) {
        tally.run.originalFailed++;
        rec.run = `tclsh: ${(orig.stderr || String(orig.error || '')).split('\n')[0]}`;
        continue;
    }
    const bench = await runDosToolchain('tcl', w1.tcl, {fetchToolchain: async () => ({compiler: TCL_EXE}), maxSteps: 60_000_000});
    const a = lines(orig.stdout);
    const b = lines(bench.compile.screen);
    const same = JSON.stringify(a) === JSON.stringify(b);
    tally.run[same ? 'same' : 'differs']++;
    rec.run = same ? 'same' : {tclsh: a.slice(0, 8), partcl: b.slice(0, 8)};
}

const rank = m => [...m].sort((x, y) => y[1] - x[1]);
const report = {corpus: path.resolve(dir), tclsh: haveTclsh, tally,
    gaps: rank(gaps), readRefusals: rank(refusals), writeRefusals: rank(writeRefusals), files: perFile};
const out = opt('out');
if (out) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);

const pct = (n, d) => (d ? `${(100 * n / d).toFixed(1)}%` : '-');
const t = tally;
console.log(`files ${t.files}`);
console.log(`read    clean ${t.read.clean} (${pct(t.read.clean, t.files)})  degraded ${t.read.degraded}  empty ${t.read.empty || 0}  refused ${t.read.refused}`);
console.log(`blocks  ok ${t.blocks.ok}  failed ${t.blocks.failed}`);
console.log(`write   ok ${t.write.ok}  empty ${t.write.empty}  refused ${t.write.refused}`);
console.log(`fixed   ${t.fixed.yes}/${t.fixed.yes + t.fixed.no}`);
console.log(`run     same ${t.run.same}  differs ${t.run.differs}  tclsh-failed ${t.run.originalFailed}  skipped ${t.run.skipped}${haveTclsh ? '' : ' (no tclsh on PATH)'}`);
console.log('\ntop reader gaps (files affected):');
for (const [k, n] of rank(gaps).slice(0, 40)) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log('\ntop read refusals:');
for (const [k, n] of rank(refusals).slice(0, 10)) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log('\ntop write refusals:');
for (const [k, n] of rank(writeRefusals).slice(0, 10)) console.log(`  ${String(n).padStart(5)}  ${k}`);
