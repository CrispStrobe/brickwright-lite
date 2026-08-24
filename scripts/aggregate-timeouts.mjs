#!/usr/bin/env node
/**
 * The census of every wait in the browser gates, and the join that turns an
 * observed sweep into evidence for each one.
 *
 *   node scripts/aggregate-timeouts.mjs --census        # static, no browser
 *   node scripts/aggregate-timeouts.mjs --observed <f>  # join a sweep's JSONL
 *   node scripts/aggregate-timeouts.mjs --census --json
 *
 * TWO POPULATIONS, AND ONLY ONE OF THEM IS A THRESHOLD
 * ----------------------------------------------------
 * `sb3-creator/scripts/threshold-inventory.mjs` counts `timeout: N` — a BOUND,
 * a ceiling on how long a wait may take. Its p90 is meaningful: the wait
 * usually finishes far below it, and the gap is the headroom.
 *
 * It does not count `waitForTimeout(N)`, and that is correct by its own
 * definition — a fixed sleep bounds nothing, decides no verdict, and its
 * observed cost is always exactly N. But *correct by definition* is not the
 * same as *not worth counting*. In these scripts the sleeps outnumber the
 * bounds better than two to one, they are the dominant wall-clock cost of the
 * browser gates, and every one of them is a guess about how long the app needs
 * that nobody has ever checked. A sleep that is too short is a flake; a sleep
 * that is too long is the CI bill. Neither shows up in a threshold inventory.
 *
 * So this counts both, and keeps them apart, because the honest thing to say
 * about a fixed sleep is not a p90 — it is "this number cannot be measured by
 * observation; it can only be shortened until something breaks."
 *
 * THE INSTRUMENT ASSERTS ITS OWN YIELD
 * ------------------------------------
 * The join refuses a sweep file with no `installed` marker (the hook never ran)
 * and one with zero bounded observations (the hook ran and wrapped nothing —
 * which really happened: keying on `constructor.name` matched `Page` while
 * playwright's bundled class is `_Page`, and the first run recorded two calls
 * out of hundreds). Both look exactly like a clean sweep in a summary table.
 */
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join, relative} from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(import.meta.dirname, '..');
const DIRS = ['scripts', 'test'];

const jsFiles = (dir) => {
    const out = [];
    const stack = [join(ROOT, dir)];
    while (stack.length) {
        const d = stack.pop();
        if (!existsSync(d)) continue;
        for (const e of readdirSync(d, {withFileTypes: true})) {
            const p = join(d, e.name);
            if (e.isDirectory()) { if (e.name !== 'node_modules') stack.push(p); continue; }
            if (/\.(mjs|js)$/.test(e.name)) out.push(p);
        }
    }
    return out.sort();
};

const numeric = (n) => n && n.type === 'Literal' && typeof n.value === 'number' ? n.value : null;

/** Static census: every bound and every fixed sleep, with file:line. */
export function census () {
    const bounds = [];
    const sleeps = [];
    let parsed = 0;
    for (const abs of DIRS.flatMap(jsFiles)) {
        const rel = relative(ROOT, abs);
        const src = readFileSync(abs, 'utf8');
        let ast;
        try {
            ast = acorn.parse(src, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
        } catch { continue; }
        parsed++;
        walk.simple(ast, {
            Property (node) {
                if (node.key && (node.key.name === 'timeout' || node.key.value === 'timeout')) {
                    const v = numeric(node.value);
                    if (v !== null) bounds.push({file: rel, line: node.loc.start.line, value: v});
                }
            },
            CallExpression (node) {
                const callee = node.callee;
                if (callee.type !== 'MemberExpression') return;
                const name = callee.property && (callee.property.name || callee.property.value);
                if (name !== 'waitForTimeout') return;
                const v = numeric(node.arguments[0]);
                if (v !== null) sleeps.push({file: rel, line: node.loc.start.line, value: v});
            }
        });
    }
    // A scan that parsed nothing returns two empty lists, which reads in a
    // table exactly like a repository with no waits in it.
    if (parsed < 50) {
        throw new Error(`only ${parsed} files parsed under ${DIRS.join(', ')} — the scan is broken, `
            + 'and every count it produces would be a clean sweep over nothing.');
    }
    return {parsed, bounds, sleeps};
}

/**
 * Which scripts a CI run actually executes.
 *
 * Two spellings are expanded: a literal `node scripts/x.mjs`, and `npm run foo`
 * resolved through package.json.
 *
 * MEASURED, NOT ASSUMED — and the assumption was wrong. This was written
 * because `package.json` defines eleven `verify:*` aliases and it looked
 * obvious that CI used some of them, which would have made the workflow-only
 * scan undercount. It does not: `grep -rn 'npm run verify' .github/workflows/`
 * returns nothing, CI spells all five browser gates `node scripts/…`, and
 * adding the alias expansion moved the counts by zero. The eleven aliases are
 * for humans. So the expansion stays as cheap insurance against the day a
 * workflow uses one, and this comment says it currently earns nothing — which
 * is the honest version of a defence whose first draft claimed to have fixed a
 * 40 % undercount it had not checked for.
 */
const CI_GATES = (() => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {};
    const wfDir = join(ROOT, '.github', 'workflows');
    const text = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))
        .map((f) => readFileSync(join(wfDir, f), 'utf8')).join('\n');
    const found = new Set();
    const addFrom = (s) => {
        for (const m of s.matchAll(/node\s+(scripts\/[a-z0-9._-]+\.mjs)/g)) found.add(m[1]);
    };
    addFrom(text);
    for (const m of text.matchAll(/npm run ([a-z0-9:_-]+)/g)) {
        const body = pkg[m[1]];
        if (body) addFrom(body);
    }
    return found;
})();

const isScratch = (f) => /(^|\/)_tmp-/.test(f);

const pct = (xs, p) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};

function readObserved (path) {
    const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const installs = lines.filter((r) => r.type === 'installed');
    if (!installs.length) {
        throw new Error(`${path} has no \`installed\` marker: the observer hook never ran, so this file `
            + 'is not an empty sweep — it is no sweep at all. Re-run with '
            + '`node --import ./scripts/observe-timeouts.mjs <script>`.');
    }
    const recs = lines.filter((r) => r.type !== 'installed');
    const bounded = recs.filter((r) => r.type === 'bounded');
    if (!bounded.length) {
        throw new Error(`${path} records ${recs.length} call(s) but not one bounded wait, across `
            + `${installs.length} script run(s). The hook installed and wrapped nothing — the state the `
            + 'first version of the wrapper was in, when it keyed on `constructor.name` and playwright\'s '
            + 'bundled class is `_Page`. Fix the wrapper before reading any number below.');
    }
    return {installs, recs, bounded, sleeps: recs.filter((r) => r.type === 'sleep')};
}

// ── report ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const obsIdx = args.indexOf('--observed');
const obsPath = obsIdx !== -1 ? args[obsIdx + 1] : null;

const c = census();
const group = (rows) => {
    const g = {ci: [], other: [], scratch: []};
    for (const r of rows) g[isScratch(r.file) ? 'scratch' : CI_GATES.has(r.file) ? 'ci' : 'other'].push(r);
    return g;
};
const gb = group(c.bounds);
const gs = group(c.sleeps);
const sum = (rows) => rows.reduce((a, r) => a + r.value, 0);

if (!obsPath) {
    if (asJson) { console.log(JSON.stringify({census: c, ci: [...CI_GATES]}, null, 1)); process.exit(0); }
    console.log(`parsed ${c.parsed} files under ${DIRS.join('/ ')}\n`);
    console.log('                       bounds (`timeout: N`)   fixed sleeps (`waitForTimeout(N)`)');
    const row = (label, b, s) => console.log(
        `  ${label.padEnd(20)} ${String(b.length).padStart(5)}                  ${String(s.length).padStart(5)}`
        + `   = ${(sum(s) / 1000).toFixed(1)} s asleep per run`);
    row('run by CI', gb.ci, gs.ci);
    row('runnable, not in CI', gb.other, gs.other);
    row('_tmp- scratch', gb.scratch, gs.scratch);
    console.log(`  ${'TOTAL'.padEnd(20)} ${String(c.bounds.length).padStart(5)}                  ${String(c.sleeps.length).padStart(5)}`
        + `   = ${(sum(c.sleeps) / 1000).toFixed(1)} s`);
    // Name the gates that actually WAIT, not every script CI happens to run.
    // `CI_GATES` holds 15 entries and 10 of them are vendor/patch steps with no
    // browser in them; printing that set under the heading "browser gates" is a
    // true list with a false label.
    const waiting = [...new Set([...gb.ci, ...gs.ci].map((r) => r.file))].sort();
    console.log(`\nOf the ${CI_GATES.size} scripts CI runs, ${waiting.length} contain waits:`);
    console.log(`  ${waiting.map((f) => f.replace('scripts/', '')).join(', ')}`);
    console.log('\nThe sleep column is the floor on how long a sweep takes: it is spent whether or');
    console.log('not the app is ready, and no observation can shorten it. It is not in any');
    console.log('threshold inventory, because a fixed sleep bounds nothing — which is exactly why');
    console.log('nobody has ever had to justify one.');
    process.exit(0);
}

const o = readObserved(obsPath);
const key = (r) => `${r.file}:${r.line}`;
const byKey = new Map();
for (const r of o.bounded) {
    if (!byKey.has(key(r))) byKey.set(key(r), []);
    byKey.get(key(r)).push(r);
}

const rows = [];
for (const b of c.bounds) {
    const seen = byKey.get(key(b)) || [];
    const ms = seen.map((r) => r.ms);
    rows.push({
        site: key(b),
        literal: b.value,
        n: seen.length,
        p50: pct(ms, 0.5),
        p90: pct(ms, 0.9),
        max: ms.length ? Math.max(...ms) : null,
        method: seen[0]?.method || null,
        outcomes: [...new Set(seen.map((r) => r.outcome))].join(','),
        headroom: ms.length ? +(b.value / Math.max(1, pct(ms, 0.9))).toFixed(1) : null,
        scratch: isScratch(b.file),
        ci: CI_GATES.has(b.file)
    });
}

if (asJson) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }

const observedRows = rows.filter((r) => r.n > 0).sort((a, b) => b.headroom - a.headroom);
console.log(`sweep: ${o.installs.length} script run(s), ${o.recs.length} calls, `
    + `${o.bounded.length} bounded waits, ${o.sleeps.length} fixed sleeps\n`);
console.log('site                                            literal   n     p50     p90     max  headroom  outcome');
for (const r of observedRows) {
    console.log(`  ${r.site.padEnd(44)} ${String(r.literal).padStart(7)} ${String(r.n).padStart(3)}`
        + ` ${String(r.p50).padStart(7)} ${String(r.p90).padStart(7)} ${String(r.max).padStart(7)}`
        + ` ${String(r.headroom).padStart(9)}×  ${r.outcomes}`);
}
const unobserved = rows.filter((r) => r.n === 0 && !r.scratch);
console.log(`\n${observedRows.length} of ${c.bounds.length} bounds observed. `
    + `${unobserved.length} runnable bounds were NOT reached by this sweep — listed, not silently omitted:`);
for (const r of unobserved) console.log(`  ${r.site}  ${r.literal}ms  ${r.ci ? '(CI gate)' : ''}`);
