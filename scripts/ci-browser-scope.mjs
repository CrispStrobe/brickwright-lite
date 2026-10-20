#!/usr/bin/env node
/**
 * Which BROWSER SHARDS does a pull request need? Used by build.yml's
 * `change scope` job, after scripts/ci-docs-only.mjs, to decide which of
 * browser (heavy), (light), (robotlab) and fpga surface run for a PR.
 *
 * Push to main, workflow_dispatch and schedules never ask: they run every
 * shard, so a regression a skip let through is caught right after merge.
 *
 * THE RULE ERRS TOWARD RUNNING. A wrong skip is worse than a wasted run, so
 * every changed file is classified in this order and the first rule wins:
 *
 *   1. robotlab-only sources (bw-sim, static/sim-lab, the sim-lab-* panes and
 *      sim-lab-* gates)                       -> robotlab (+ any gate that reaches it)
 *   2. shared inputs: .github/, package*.json, packages/, vendor-pins.json,
 *      .nvmrc, vercel.json, every other overlay/ path (the GUI shell, scratch-vm,
 *      webpack config...), THIRD-PARTY-NOTICES.md, licenses/,
 *      docs/schematic-baselines/                -> ALL
 *   3. a file a gate RUNS or IMPORTS (the transitive relative/root-relative
 *      import closure of every script a browser or fpga step names, `npm run`
 *      resolved through package.json)         -> the shards whose steps reach it;
 *      ALL when a shard-less step (a prerequisite: vendor, integrate, overlays,
 *      provenance, the audit) reaches it, or when it is under scripts/lib/
 *   4. a test/, docs/, apps/, bin/ or scripts/ file that a gate
 *      script MENTIONS by path (fixtures, the native bootstrap a light gate
 *      reads, a script a gate spawns)          -> the shards that mention it
 *   5. tests (test/), Rust/Tauri (apps/, *.rs, Cargo.*), the CLI (bin/),
 *      scripts no gate reaches, docs, LANES and root prose  -> no shard
 *   6. anything else, i.e. any path this map does not know -> ALL
 *
 * An empty file list is not evidence of anything: ALL.
 *
 * Usage: changed file names on stdin, one per line (renames: both names).
 * Prints `<shard>=true|false` per shard, `browser=` (any browser matrix shard),
 * `any=` (any shard, fpga included)
 * and `summary=` for $GITHUB_OUTPUT; the per-file verdicts go to stderr.
 */
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJobs} from './lib/workflow-gates.mjs';

export const FPGA = 'fpga';
const PREREQ = '(prerequisite)';

const ROBOTLAB_ONLY = [
    /^overlay\/scratch-gui\/src\/lib\/bw-sim\//,
    /^overlay\/scratch-gui\/static\/sim-lab\//,
    /^overlay\/scratch-gui\/src\/components\/tw-pseudocode\/sim-lab-[^/]+$/,
    /^scripts\/lib\/sim-lab-[^/]+$/,
    /^scripts\/verify-sim-lab-[^/]+$/,
];
const SHARED = [
    /^\.github\//,
    /^package(?:-lock)?\.json$/,
    /^packages\//,
    /^vendor-pins\.json$/,
    /^\.nvmrc$/,
    /^vercel\.json$/,
    /^overlay\//,
    /^THIRD-PARTY-NOTICES\.md$/,
    /^licenses\//,
    /^docs\/schematic-baselines\//,
    /(?:^|\/)webpack[^/]*$/,
];
const NO_BROWSER = [
    [/^test\//, 'test'],
    [/(?:^|\/)Cargo\.(?:toml|lock)$/, 'rust/tauri'],
    [/\.rs$/, 'rust/tauri'],
    [/^apps\//, 'rust/tauri'],
    [/^bin\//, 'cli'],
    [/^scripts\//, 'script no gate reaches'],
    [/^docs\//, 'docs'],
    [/^[^/]+\.md$/, 'docs'],
];
const MENTIONABLE = /^(?:test|docs|apps|bin|scripts)\//;

const CODE = /\.(?:mjs|cjs|js)$/;
const ROOT_REL = /(?:^|[^\w./-])((?:scripts|test|bin|apps)\/[\w./-]+\.(?:mjs|cjs|js|json))/g;
const REL = /['"`](\.\.?\/[^'"`\s$]+)['"`]/g;
const NPM_RUN = /npm run ([\w:.-]+)/g;

/** Repository-relative script paths a piece of shell names, `npm run` resolved through package.json. */
export const entriesOf = (text, npmScripts = {}, seen = new Set()) => {
    const out = new Set();
    for (const m of String(text).matchAll(ROOT_REL)) out.add(m[1]);
    for (const m of String(text).matchAll(NPM_RUN)) {
        const name = m[1];
        if (seen.has(name) || !npmScripts[name]) continue;
        seen.add(name);
        for (const e of entriesOf(npmScripts[name], npmScripts, seen)) out.add(e);
    }
    return out;
};

/**
 * Per browser/fpga step, the labels (shard names, FPGA, or PREREQ) and the
 * scripts its text names. Pure over the workflow text and package.json scripts.
 */
export const gateEntries = (yml, npmScripts = {}) => {
    const lines = yml.split('\n');
    const jobs = parseJobs(yml);
    const browser = jobs.get('browser');
    const fpga = jobs.get('fpga-surface');
    if (!browser || !browser.shards.length || !fpga) throw new Error('build.yml has no browser matrix or fpga-surface job: the scope parse is wrong, not the file');
    const stepText = (job, i) => {
        const start = job.steps[i].line - 1;
        const end = i + 1 < job.steps.length ? job.steps[i + 1].line - 1 : lines.findIndex((l, n) => n > start && /^  [a-z][\w-]*:$/.test(l));
        return lines.slice(start, end < 0 ? undefined : end).join('\n');
    };
    const entries = [];
    browser.steps.forEach((s, i) => {
        const named = [...String(s.ifs || '').matchAll(/matrix\.shard\s*==\s*'([a-z][a-z0-9-]*)'/g)].map(m => m[1]);
        entries.push({labels: named.length ? named : [PREREQ], files: entriesOf(stepText(browser, i), npmScripts)});
    });
    fpga.steps.forEach((s, i) => entries.push({labels: [FPGA], files: entriesOf(stepText(fpga, i), npmScripts)}));
    return {shards: [...browser.shards, FPGA], browserShards: [...browser.shards], entries};
};

/** Walk each entry's import closure. Returns Map<file, Set<label>> and Map<file, text>. */
export const closureOf = (root, entries) => {
    const reach = new Map();
    const texts = new Map();
    const isFile = f => { try { return statSync(path.join(root, f)).isFile(); } catch { return false; } };
    const resolve = (from, spec) => {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
        if (base.startsWith('..')) return null;
        for (const c of [base, base + '.mjs', base + '.js', base + '/index.mjs', base + '/index.js']) if (isFile(c)) return c;
        return null;
    };
    for (const {labels, files} of entries) {
        const stack = [...files].filter(isFile);
        const visited = new Set();
        while (stack.length) {
            const f = stack.pop();
            if (visited.has(f)) continue;
            visited.add(f);
            if (!reach.has(f)) reach.set(f, new Set());
            for (const l of labels) reach.get(f).add(l);
            if (!CODE.test(f)) continue;
            let text = texts.get(f);
            if (text === undefined) { text = readFileSync(path.join(root, f), 'utf8'); texts.set(f, text); }
            for (const m of text.matchAll(REL)) { const r = resolve(f, m[1]); if (r && /^(?:scripts|test|bin|apps)\//.test(r)) stack.push(r); }
            for (const m of text.matchAll(ROOT_REL)) if (isFile(m[1])) stack.push(m[1]);
        }
    }
    return {reach, texts};
};

/**
 * The strings a gate script would use to name `file`: {file: whole names,
 * substring match} and {dir: directories that hold it, matched only where the
 * text names the directory itself — closing quote, or `/` then a quote or
 * `${` — so naming test/fixtures/a/x does not name test/fixtures/b).
 */
export const needlesOf = file => {
    const segs = file.split('/');
    const out = new Set([file]);
    const dirs = new Set();
    const dirsFrom = parts => { for (let n = 2; n < parts.length; n++) dirs.add(parts.slice(0, n).join('/')); };
    if (segs[0] === 'test' || segs[0] === 'docs') {
        dirsFrom(segs);
        if (segs.length >= 3) { out.add(segs.slice(1).join('/')); dirsFrom(segs.slice(1)); }
    }
    if ((segs.length === 2 && (segs[0] === 'test' || segs[0] === 'scripts' || segs[0] === 'bin')) || segs.length === 1) out.add(segs[segs.length - 1]);
    return {files: [...out].filter(n => n.length >= 6), dirs: [...dirs]};
};

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const mentions = (text, {files, dirs}) =>
    files.some(n => text.includes(n)) || dirs.some(d => new RegExp(escape(d) + '(?:[`\'"]|/[`\'"]|/\\$\\{)').test(text));

/**
 * The decision. Pure: `ctx` is {shards, browserShards, reach: Map<file, Set<label>>,
 * texts: Map<file, text>}. Returns {needed: string[] (in ctx.shards order),
 * files: [{file, shards: string[], why}], summary}.
 */
export const decide = (files, ctx) => {
    const all = () => [...ctx.shards];
    const expand = labels => {
        const set = new Set();
        for (const l of labels) { if (l === PREREQ) return all(); set.add(l); }
        return ctx.shards.filter(s => set.has(s));
    };
    const mentionedBy = file => {
        const needles = needlesOf(file);
        const labels = new Set();
        for (const [f, text] of ctx.texts) {
            if (f === file) continue;
            if (mentions(text, needles)) for (const l of ctx.reach.get(f) || []) labels.add(l);
        }
        return labels;
    };
    const list = [...new Set(files.map(f => f.trim()).filter(Boolean))];
    if (!list.length) return {needed: all(), files: [], summary: 'no changed-file list: every shard runs'};
    const verdicts = list.map(file => {
        const reached = ctx.reach.get(file);
        if (ROBOTLAB_ONLY.some(r => r.test(file))) {
            const labels = new Set(['robotlab', ...(reached || [])]);
            return {file, shards: expand(labels), why: 'robotlab source'};
        }
        if (SHARED.some(r => r.test(file))) return {file, shards: all(), why: 'shared input'};
        if (reached && reached.size) {
            if (file.startsWith('scripts/lib/')) return {file, shards: all(), why: 'scripts/lib a gate imports'};
            return {file, shards: expand(reached), why: 'a gate runs or imports it'};
        }
        if (MENTIONABLE.test(file)) {
            const labels = mentionedBy(file);
            if (labels.size) return {file, shards: expand(labels), why: 'a gate names it'};
        }
        const none = NO_BROWSER.find(([r]) => r.test(file));
        if (none) return {file, shards: [], why: none[1]};
        return {file, shards: all(), why: 'unclassified path'};
    });
    const needed = ctx.shards.filter(s => verdicts.some(v => v.shards.includes(s)));
    const counts = new Map();
    for (const v of verdicts) counts.set(v.why, (counts.get(v.why) || 0) + 1);
    const summary = `${list.length} file(s): ` + [...counts].map(([w, n]) => `${w} ${n}`).join(', ');
    return {needed, files: verdicts, summary};
};

/** The real context, read from the tree at `root`. */
export const loadContext = root => {
    const yml = readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8');
    const pkg = existsSync(path.join(root, 'package.json')) ? JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) : {};
    const {shards, browserShards, entries} = gateEntries(yml, pkg.scripts || {});
    const {reach, texts} = closureOf(root, entries);
    return {shards, browserShards, reach, texts};
};

/** $GITHUB_OUTPUT lines for a decision. */
export const outputLines = (result, ctx) => [
    ...ctx.shards.map(s => `${s}=${result.needed.includes(s)}`),
    `browser=${ctx.browserShards.some(s => result.needed.includes(s))}`,
    `any=${result.needed.length > 0}`,
    `summary=${result.summary.replace(/[\r\n]+/g, ' ')}`,
];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const ctx = loadContext(root);
    const result = decide(readFileSync(0, 'utf8').split('\n'), ctx);
    for (const v of result.files) console.error(`${v.shards.join(',') || '-'}\t${v.why}\t${v.file}`);
    console.error(`needed: ${result.needed.join(', ') || 'none'} (${result.summary})`);
    for (const line of outputLines(result, ctx)) console.log(line);
}
