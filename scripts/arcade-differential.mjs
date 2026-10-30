#!/usr/bin/env node
/**
 * Behavioural differential: run each MakeCode Arcade program in the original
 * MakeCode simulator and in Brickwright under identical deterministic
 * conditions (seeded randomness, paused fake clock, one sample grid, one input
 * script) and report where behaviour differs.
 *
 * node --import ./scripts/lib/register-gui-scope.mjs scripts/arcade-differential.mjs \
 *   [--seconds 8] [--fps 30] [--seed 1] [--entropy sequence|constant]
 *   [--scripts idle,arrows,ab] [--timeout-ms 120000] [--out report.json] [--markdown summary.md]
 *   [--audit-dir DIR --require-compile] [--limit N] [--offset N] [--only a.ts,b.ts]
 *   [--max-load 8] [--min-free-gb 12] [--wait-seconds 0] [--work-dir DIR] [--resume] file-or-directory [...]
 *
 * --out receives program sources' labels and per-sample detail: keep it private.
 * The Markdown summary holds counts and cause categories only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeProgram} from './lib/arcade-differential/analyze.mjs';
import {summarize, renderMarkdown} from './lib/arcade-differential/report.mjs';
import {SCRIPT_NAMES} from './lib/arcade-differential/script.mjs';

const args = process.argv.slice(2), inputs = [];
const opt = {seconds: 8, fps: 30, seed: 1, entropy: 'sequence', scripts: SCRIPT_NAMES, timeoutMs: null, out: null, markdown: null,
    auditDir: null, requireCompile: false, limit: Infinity, offset: 0, only: null, maxLoad: 8, minFreeGb: 12, waitSeconds: 0, workDir: null, resume: false};
const value = i => { if (i + 1 >= args.length) throw new Error(`${args[i]} needs a value`); return args[i + 1]; };
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--seconds') opt.seconds = Number(value(i++));
    else if (a === '--fps') opt.fps = Number(value(i++));
    else if (a === '--seed') opt.seed = Number(value(i++));
    else if (a === '--entropy') opt.entropy = value(i++);
    else if (a === '--scripts') opt.scripts = value(i++).split(',');
    else if (a === '--timeout-ms') opt.timeoutMs = Number(value(i++));
    else if (a === '--out') opt.out = value(i++);
    else if (a === '--markdown') opt.markdown = value(i++);
    else if (a === '--audit-dir') opt.auditDir = value(i++);
    else if (a === '--require-compile') opt.requireCompile = true;
    else if (a === '--limit') opt.limit = Number(value(i++));
    else if (a === '--offset') opt.offset = Number(value(i++));
    else if (a === '--only') opt.only = value(i++).split(',');
    else if (a === '--max-load') opt.maxLoad = Number(value(i++));
    else if (a === '--min-free-gb') opt.minFreeGb = Number(value(i++));
    else if (a === '--wait-seconds') opt.waitSeconds = Number(value(i++));
    else if (a === '--work-dir') opt.workDir = value(i++);
    else if (a === '--resume') opt.resume = true;
    else if (a.startsWith('--')) throw new Error('Unknown option ' + a);
    else inputs.push(a);
}
if (!inputs.length) { console.error('usage: arcade-differential.mjs [options] file-or-directory ...'); process.exit(2); }
// Original ~ browser launch + real-time-free stepping; Brickwright should be fast, so a hang is obvious.
const perScript = opt.seconds * opt.fps;
opt.timeoutMs ??= null;
const timeoutMs = {original: opt.timeoutMs ?? 60000 + perScript * 40 * opt.scripts.length, brickwright: opt.timeoutMs ?? 30000 + perScript * 15 * opt.scripts.length};

const files = [];
for (const input of inputs) {
    if (fs.statSync(input).isDirectory()) for (const f of fs.readdirSync(input).sort()) { if (f.endsWith('.ts')) files.push(path.join(input, f)); }
    else files.push(input);
}
let selected = files;
if (opt.only) selected = selected.filter(f => opt.only.includes(path.basename(f)));
if (opt.requireCompile) {
    if (!opt.auditDir) throw new Error('--require-compile needs --audit-dir');
    const passing = new Set();
    for (const f of fs.readdirSync(opt.auditDir)) {
        if (!f.endsWith('.json')) continue;
        for (const row of JSON.parse(fs.readFileSync(path.join(opt.auditDir, f), 'utf8')).rows || []) if (row.qualification?.originalCompile === 'pass') passing.add(path.basename(row.file));
    }
    selected = selected.filter(f => passing.has(path.basename(f)));
}
selected = selected.slice(opt.offset, opt.offset + opt.limit);

const ownsWorkDir = !opt.workDir;
const workDir = opt.workDir || fs.mkdtempSync(path.join(os.tmpdir(), 'bw-arcade-diff-'));
fs.mkdirSync(workDir, {recursive: true});
const progressPath = opt.out ? opt.out + '.progress.jsonl' : null;
const done = new Map();
if (opt.resume && progressPath && fs.existsSync(progressPath)) {
    for (const line of fs.readFileSync(progressPath, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(line); done.set(r.file, r); }
}

function resourceProblem() {
    const load = os.loadavg()[0];
    if (load > opt.maxLoad) return `1-minute load average ${load.toFixed(1)} exceeds ${opt.maxLoad}`;
    const st = fs.statfsSync(workDir), freeGb = st.bavail * st.bsize / 2 ** 30;
    if (freeGb < opt.minFreeGb) return `${freeGb.toFixed(1)} GB free is below the ${opt.minFreeGb} GB floor`;
    return null;
}

const rows = [];
let paused = null;
for (const file of selected) {
    const label = path.basename(file);
    if (done.has(label)) { rows.push(done.get(label)); continue; }
    // Pause (not push on) while the machine is overloaded; give up and report after --wait-seconds.
    const waitUntil = Date.now() + opt.waitSeconds * 1000;
    while ((paused = resourceProblem()) && Date.now() < waitUntil) await new Promise(resolve => setTimeout(resolve, 15000));
    if (paused) break;
    const started = Date.now();
    const result = await analyzeProgram(fs.readFileSync(file, 'utf8'), {...opt, timeoutMs, workDir});
    const row = {file: label, ...result};
    rows.push(row);
    if (progressPath) fs.appendFileSync(progressPath, JSON.stringify(row) + '\n');
    process.stderr.write(`${rows.length}/${selected.length} ${row.class} ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
}

const summary = summarize(rows, {settings: {seconds: opt.seconds, fps: opt.fps, seed: opt.seed, entropy: opt.entropy, scripts: opt.scripts.join('+')},
    ...(paused ? {paused: `${paused}; ${rows.length} of ${selected.length} programs done`} : {})});
if (opt.out) fs.writeFileSync(opt.out, JSON.stringify({generatedAt: new Date().toISOString(), summary, rows}, null, 1));
const markdown = renderMarkdown(summary);
if (opt.markdown) fs.writeFileSync(opt.markdown, markdown); else process.stdout.write(markdown);
if (ownsWorkDir) fs.rmSync(workDir, {recursive: true, force: true});
process.exit(paused ? 3 : 0);
