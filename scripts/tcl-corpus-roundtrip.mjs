#!/usr/bin/env node
/**
 * Measure the Tcl tab's reader and generator against a corpus of real Tcl.
 *
 *   node scripts/tcl-corpus-roundtrip.mjs --dir <corpus> [--out report.json] [--limit N]
 *                                         [--no-run] [--filter substring] [--jobs N]
 *
 * For every *.tcl file under <corpus>:
 *
 *   READ     tclToPseudocode(source) — CLEAN (every command is a block),
 *            DEGRADED (some commands kept as grey `raw` blocks, each named in a
 *            warning) or REFUSED (the reader threw: a lexing failure).
 *   BLOCKS   the pseudocode parses into a project (SB3Creator.parse).
 *   WRITE    generateTcl(project) — ok, or refused with reasons.
 *   FIXED    read(write(read(src))) writes the same text again.
 *   RUN      the ORIGINAL under real tclsh, and the REGENERATED program on the
 *            DOS bench under Jim Tcl (the tab's ▶ Run path), print the same
 *            lines. The original also runs on the bench: when it already
 *            differs there, the difference is the runtime's (Jim Tcl in 64 KB,
 *            no TclOO, …), not the round trip's, and is counted apart. Needs
 *            `tclsh` on PATH (skipped without it, by name).
 *
 * The report counts each outcome and ranks the commands the reader kept raw —
 * that ranking is the gap list. Nothing here asserts a threshold: the numbers
 * are the deliverable, like gen-reader-coverage.mjs.
 *
 * The corpus is not in this repository (Rosetta Code is GFDL; the Tcl wiki has
 * no stated licence). It is backed up, with provenance and a fetch.sh, in the
 * private brickwright-firmware-private repo under compat-corpora/tcl/, and the
 * last report sits beside it in compat-corpora/reports/TCL-ROUNDTRIPS.md:
 *
 *   node scripts/tcl-corpus-roundtrip.mjs --dir ../brickwright-firmware-private/compat-corpora/tcl/rosetta --jobs 4
 */
import {mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = path.join(root, 'overlay/scratch-gui/src/lib');
const roms = path.join(root, 'overlay/scratch-gui/static/roms');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : dflt;
};
const flag = name => args.includes(`--${name}`);
const dir = opt('dir');
if (!dir) {
    console.error('usage: tcl-corpus-roundtrip.mjs --dir <corpus> [--out report.json] [--limit N] [--no-run] [--filter s] [--jobs N]');
    process.exit(2);
}

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
const haveTclsh = spawnSync('tclsh', [], {input: 'exit 0\n'}).status === 0;
const doRun = !flag('no-run');

// --shard k/n --shard-out f: this process measures every n-th file from k
// and writes its records to f as JSON (what --jobs runs).
const shard = opt('shard');
const jobs = Number(opt('jobs', 1));
let records;
if (!shard && jobs > 1) {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'tcl-corpus-shards-'));
    records = (await Promise.all(Array.from({length: jobs}, (_, k) => new Promise((resolve, reject) => {
        const file = path.join(tmp, `${k}.json`);
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args.filter((a, i) =>
            a !== '--jobs' && args[i - 1] !== '--jobs' && a !== '--out' && args[i - 1] !== '--out'),
        '--shard', `${k}/${jobs}`, '--shard-out', file], {stdio: ['ignore', 'ignore', 'inherit']});
        child.on('exit', code => (code === 0 ? resolve(JSON.parse(readFileSync(file, 'utf8'))) :
            reject(new Error(`shard ${k} exited ${code}`))));
    })))).flat();
    rmSync(tmp, {recursive: true, force: true});
    const order = new Map(files.map((f, i) => [path.relative(path.resolve(dir), f), i]));
    records.sort((a, b) => order.get(a.file) - order.get(b.file));
} else {
    let mine = files;
    if (shard) {
        const [k, n] = shard.split('/').map(Number);
        mine = files.filter((f, i) => i % n === k);
    }
    records = await measure(mine);
    if (shard) {
        writeFileSync(opt('shard-out'), JSON.stringify(records));
        process.exit(0);
    }
}

async function measure (list) {
    const {default: tclToPseudocode, generateTcl} = await import(path.join(lib, 'bw-lang/tcl.js'));
    const SB3Creator = (await import(path.join(lib, 'sb3-creator.js'))).default;
    const {runDosToolchain} = await import(path.join(lib, 'bw-debug/dos-toolchain-routes.js'));
    const JIM = {compiler: new Uint8Array(readFileSync(path.join(roms, 'jim.exe'))),
        support: {'JIMLIB.TCL': readFileSync(path.join(roms, 'jimlib.tcl'), 'utf8')}};
    // tclsh runs each original in a scratch directory: corpus programs write files.
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'tcl-corpus-'));
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
    const bench = async source => {
        const r = await runDosToolchain('jim', source, {fetchToolchain: async () => JIM, maxSteps: 80_000_000});
        return r.compile.terminated ? lines(r.compile.screen) : null;
    };
    const out = [];
    for (const file of list) {
        const rec = {file: path.relative(path.resolve(dir), file)};
        out.push(rec);
        const src = readFileSync(file, 'utf8');
        let read;
        try {
            read = tclToPseudocode(src);
        } catch (e) {
            rec.read = 'refused';
            rec.error = e.message;
            continue;
        }
        rec.warnings = read.warnings;
        if (!/\S/.test(read.pseudocode)) { rec.read = 'empty'; continue; }
        rec.read = read.warnings.length ? 'degraded' : 'clean';
        let proj;
        try {
            proj = project(read.pseudocode);
        } catch (e) {
            rec.blocks = e.message.split('\n').slice(0, 2).join(' ');
            continue;
        }
        const w1 = generateTcl(proj);
        if (!w1.ok) { rec.write = w1.reasons; continue; }
        rec.write = 'ok';
        try {
            const w2 = generateTcl(project(tclToPseudocode(w1.tcl).pseudocode));
            rec.fixed = w2.ok && w2.tcl === w1.tcl;
        } catch (e) {
            rec.fixed = false;
            rec.fixedError = e.message.split('\n')[0];
        }
        if (!doRun || !haveTclsh) continue;
        const orig = spawnSync('tclsh', [file], {input: '', timeout: 5000, encoding: 'utf8', cwd, maxBuffer: 1 << 22});
        if (orig.status !== 0 || orig.error) {
            rec.run = 'tclsh-failed';
            continue;
        }
        const a = lines(orig.stdout);
        const b = await bench(w1.tcl);
        if (JSON.stringify(a) === JSON.stringify(b)) { rec.run = 'same'; continue; }
        const base = await bench(src);
        rec.run = JSON.stringify(a) !== JSON.stringify(base) ? 'runtime' :
            // the original just fit the 64 KB segment, the regenerated one (a
            // few more variables) does not
            /out of memory/.test((b || []).join('\n')) ? 'memory' : 'differs';
        rec.diff = {tclsh: a.slice(0, 6), jim: (b || ['(did not finish)']).slice(-6)};
    }
    rmSync(cwd, {recursive: true, force: true});
    return out;
}

// ---- tally ------------------------------------------------------------
const reason = w => {
    const m = /no block for the Tcl command "([^"]+)"|no block for the Tcl command \[([^\]]+)\]/.exec(w);
    if (m) return `command: ${m[1] || m[2]}`;
    return String(w).replace(/^(unsupported|kept as Tcl) \(line \d+\): /, '').replace(/"[^"]*"/g, '"…"')
        .replace(/\d+/g, 'N').slice(0, 90);
};
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
const rank = m => [...m].sort((x, y) => y[1] - x[1]);
const tally = {files: records.length, read: {clean: 0, degraded: 0, empty: 0, refused: 0}, blocks: {ok: 0, failed: 0},
    write: {ok: 0, refused: 0}, fixed: {yes: 0, no: 0},
    run: {same: 0, differs: 0, memory: 0, runtime: 0, tclshFailed: 0, skipped: 0}};
const gaps = new Map();
const readRefusals = new Map();
const writeRefusals = new Map();
for (const r of records) {
    tally.read[r.read]++;
    if (r.read === 'refused') { bump(readRefusals, reason(r.error)); continue; }
    for (const w of new Set((r.warnings || []).map(reason))) bump(gaps, w);
    if (r.read === 'empty') continue;
    if (r.blocks) { tally.blocks.failed++; continue; }
    tally.blocks.ok++;
    if (r.write !== 'ok') {
        tally.write.refused++;
        for (const x of r.write || []) bump(writeRefusals, reason(x));
        continue;
    }
    tally.write.ok++;
    tally.fixed[r.fixed ? 'yes' : 'no']++;
    if (!r.run) tally.run.skipped++;
    else if (r.run === 'tclsh-failed') tally.run.tclshFailed++;
    else tally.run[r.run]++;
}
for (const r of records) delete r.warnings;

const report = {corpus: path.resolve(dir), tclsh: haveTclsh, tally,
    gaps: rank(gaps), readRefusals: rank(readRefusals), writeRefusals: rank(writeRefusals), files: records};
const out = opt('out');
if (out) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);

const pct = (n, d) => (d ? `${(100 * n / d).toFixed(1)}%` : '-');
const t = tally;
console.log(`files ${t.files}`);
console.log(`read    clean ${t.read.clean} (${pct(t.read.clean, t.files)})  degraded ${t.read.degraded}  empty ${t.read.empty}  refused ${t.read.refused}`);
console.log(`blocks  ok ${t.blocks.ok}  failed ${t.blocks.failed}`);
console.log(`write   ok ${t.write.ok}  refused ${t.write.refused}`);
console.log(`fixed   ${t.fixed.yes}/${t.fixed.yes + t.fixed.no}`);
console.log(`run     same ${t.run.same}  differs ${t.run.differs}  memory ${t.run.memory}  runtime ${t.run.runtime}  tclsh-failed ${t.run.tclshFailed}  skipped ${t.run.skipped}${haveTclsh ? '' : ' (no tclsh on PATH)'}`);
console.log('        (differs: the round trip changed what prints; memory: the regenerated program, not the original,');
console.log('         ran out of the 64 KB segment; runtime: the original already prints differently under Jim on DOS)');
console.log('\ntop commands kept raw (files affected):');
for (const [k, n] of rank(gaps).slice(0, 40)) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log('\ntop read refusals:');
for (const [k, n] of rank(readRefusals).slice(0, 10)) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log('\ntop write refusals:');
for (const [k, n] of rank(writeRefusals).slice(0, 10)) console.log(`  ${String(n).padStart(5)}  ${k}`);
