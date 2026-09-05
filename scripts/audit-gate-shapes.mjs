#!/usr/bin/env node
/**
 * audit-gate-shapes.mjs — the mechanical half of the "gates that cannot fail" sweep.
 *
 * sb3-creator's `scripts/gate-inventory.mjs` already finds tautologies, corpus-driven vacuity,
 * filesystem-discovery vacuity, early returns and unguarded sibling skips. This finds a
 * different set: four shapes that were each caught the expensive way — by a defect reaching
 * main — on 2026-09-02, and each of which leaves a signature in the text.
 *
 *   TRUNCATED-CAPTURE   A non-greedy `[\s\S]*?` inside a bracket- or brace-delimited capture.
 *                       It ends at the FIRST closing delimiter, so a delimiter introduced later
 *                       inside the region silently shortens the match. Real instance:
 *                       `generate_handler!\(\[([\s\S]*?)\]\)` stopped at `#[cfg(desktop)]`'s
 *                       `]`, and an assertion that the broker "remains unregistered" was reading
 *                       a truncated string that could no longer contain what it looked for.
 *
 *   SEGMENT-MATCH       `.at(-1)` / `.pop()` on a `split` result, used before a membership or
 *                       equality test. Matching a qualified name by its last segment lets
 *                       `native_broker::invoke` pass an allow-list as `invoke`.
 *
 *   WINDOWED-SEARCH     A fixed-width `slice(0, N)` searched for a guard. If the window is wider
 *                       than the construct, it reads into the NEXT one and a deleted guard
 *                       matches its neighbour's. Brace-match the region instead.
 *
 *   SWALLOWED-PRECONDITION
 *                       An awaited precondition inside a `try` whose `catch` is empty or
 *                       comment-only. The gate neither fails nor skips: it CONTINUES, and every
 *                       later assertion runs against a state that was never established.
 *
 *   EVENT-AS-STATE      A visibility/appearance assertion (`waitFor`, `toBeVisible`, a `count()`
 *                       compared against a positive number) in a file that never asserts the
 *                       same thing is ABSENT. Appearance is a transition; most of these defects
 *                       live in the steady state afterwards. bw-ci's formulation: an assertion
 *                       about an event silently taken as an assertion about a state.
 *
 * Every hit is a SUSPECT, not a verdict — the point is to shorten the reading list. Exit is 0
 * unless --strict is passed, so this reports rather than blocks until its findings are triaged.
 */
import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

// `--root <dir>` scans one directory instead of the repository's own test/ and scripts/, so the
// detectors can be exercised against fixtures. A rule that fires on nothing is indistinguishable
// from a rule that is correct, and this sweep just went from 37 WINDOWED-SEARCH hits to 0.
const rootFlag = process.argv.indexOf('--root');
const root = rootFlag === -1
    ? path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
    : path.resolve(process.argv[rootFlag + 1]);
// SCOPE IS A DECISION, AND UNTIL 2026-09-05 IT WAS AN UNWRITTEN ONE.
//
// This tool ranges over test/ and scripts/. The goal it appears to serve --
// "find gates that cannot fail" -- ranges over gates, which is not the same
// set, and the difference was invisible because the summary never said which
// set it had walked. lego-a4's census and my vendor sync failed the same way
// on the same day; the general form is the coverage lane's:
//
//   A success message quantifies over some SET, and is trustworthy only when
//   that set equals the set the GOAL cares about.
//
// MEASURED before writing this: --root . finds 15 more SEGMENT-MATCH hits in
// overlay/ and packages/. I read them. They are NOT defects -- they are
// `file.name.split('.').pop()` extracting a file extension, and a deliberate
// basename comparison in sb3-creator-c.js. `.pop()` on a split is a truncated
// membership test in a GATE and an ordinary extraction in source code, so the
// rule is right and the scope is right.
//
// So the fix is NOT to widen the scan. Widening it would add fifteen false
// positives and teach everyone to ignore the tool -- the vacuous widening I
// have caught myself doing twice this week. The fix is that the OUTPUT must
// name the set it walked, so a reader can see the scope is chosen rather than
// assume it is total. An honest narrow report beats a dishonest wide one.
const roots = rootFlag === -1 ? ['test', 'scripts'] : ['.'];
const strict = process.argv.includes('--strict');

// The text of the line a match sits on, plus the line before it, so an exemption marker may
// be written above a long expression instead of crammed onto its end.
const lineTextOf = (text, index) => {
    const start = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
    const prev = text.lastIndexOf('\n', Math.max(0, start - 2)) + 1;
    const end = text.indexOf('\n', index);
    return text.slice(prev, end === -1 ? text.length : end);
};

const walk = dir => {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.(mjs|js|jsx)$/.test(entry)) out.push(full);
    }
    return out;
};

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const findings = [];
// The `gate-shapes-allow` marker is honoured HERE, in the reporting path, so it works for every
// rule. It was first written into the WINDOWED-SEARCH branch alone, which meant a triaged
// SEGMENT-MATCH stayed reported however carefully it was justified at the site — an exemption
// mechanism that only some rules obey is worse than none, because it teaches you to distrust it.
let rawLines = [];
const note = (file, line, kind, detail) => {
    // The marker may sit on the line itself or the line above it, for long expressions.
    const marked = [rawLines[line - 1], rawLines[line - 2]]
        .some(text => typeof text === 'string' && text.includes('gate-shapes-allow'));
    if (marked) return;
    findings.push({file: path.relative(root, file), line, kind, detail: detail.slice(0, 120)});
};

// Comments are prose ABOUT these shapes as often as instances of them — this file's own header
// is four examples — so they are blanked (length-preserving, so line numbers stay true) before
// anything is matched. A detector that flags the documentation of a defect is noise.
const blankComments = source => source
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

let scannedCount = 0;
for (const file of roots.flatMap(r => walk(path.join(root, r)))) {
    scannedCount++;
    const raw = readFileSync(file, 'utf8');
    rawLines = raw.split('\n');
    const text = blankComments(raw);

    // TRUNCATED-CAPTURE: a lazy any-char capture that ends on a bracket/brace/paren which can
    // also occur INSIDE the region being captured.
    // The terminator must be an ESCAPED delimiter in the regex source — a literal `]`, `}` or
    // `)` the author is matching. An unescaped `)` is usually just the capture group closing,
    // and flagging that made two thirds of the first run's hits noise, including this file's own.
    for (const m of text.matchAll(/\[\\s\\S\]\*\?\s*\)?\s*\\([\]})])/g)) {
        note(file, lineOf(text, m.index), 'TRUNCATED-CAPTURE',
            `lazy capture terminated by a literal ${m[1]} — a nested ${m[1]} shortens the match`);
    }

    // SEGMENT-MATCH: last-segment extraction feeding a membership/equality test.
    for (const m of text.matchAll(/\.split\([^)]*\)\s*\.\s*(?:at\(\s*-1\s*\)|pop\(\))/g)) {
        const after = text.slice(m.index, m.index + 400);
        if (/\.(has|includes)\(|===|!==|assert\.(equal|deepEqual|ok)/.test(after)) {
            note(file, lineOf(text, m.index), 'SEGMENT-MATCH',
                'qualified name reduced to its final segment before a membership test');
        }
    }

    // WINDOWED-SEARCH: a fixed-width slice used as if it were a scope.
    //
    // This detector used to ask "is there an assertion within 200 characters of the slice",
    // which is a fixed window searched for a construct — the very shape it exists to find. It
    // reported 37 suspects of which 34 were EVIDENCE truncation: the `.slice(0, 160)` in
    // `check(label, labels.some(...), labels.join(' | ').slice(0, 160))` shortens a failure
    // MESSAGE and is good practice, not a hazard. Only a slice whose result reaches a
    // PREDICATE can make a gate lie, so the question is dataflow, not proximity.
    const predicateAfter = /^\s*(?:\.(?:test|exec|match|includes|startsWith|endsWith|indexOf)\s*\(|={2,3}|!={1,2})/;
    const predicateCaller = /(?:\.(?:test|exec)|assert\.(?:match|doesNotMatch|ok|equal|deepEqual|notEqual))\s*\($/;
    for (const m of text.matchAll(/\.slice\(\s*0\s*,\s*(\d{2,})\s*\)/g)) {
        const end = m.index + m[0].length;
        // (a) the window is the receiver of a predicate, or an operand of an equality test.
        let reaches = predicateAfter.test(text.slice(end, end + 24));
        // (b) or the window is the FIRST argument of one — `/re/.test(body.slice(0, 600))`.
        if (!reaches) {
            let depth = 0;
            for (let i = m.index; i >= 0 && m.index - i < 400; i--) {
                const ch = text[i];
                if (ch === ')') depth++;
                else if (ch === '(') {
                    if (depth === 0) { reaches = predicateCaller.test(text.slice(Math.max(0, i - 40), i + 1)); break; }
                    depth--;
                } else if (ch === ',' && depth === 0) break;  // a later argument: this is evidence
            }
        }
        // Three ways a window that reaches a predicate is still sound:
        //   - the expected value is an EMPTY literal, so a truncated prefix of a non-empty
        //     actual still differs from it. `assert.deepEqual(bad.slice(0, 10), [])` shortens
        //     the DIFF, never the verdict.
        //   - the slice selects a row of a typed/array structure for a quantifier
        //     (`[...cells.slice(0, 32)].every(...)`) — a domain, not a text window.
        //   - the line is marked `gate-shapes-allow`, for the deliberate demonstrations. This
        //     detector has now flagged its own documentation five times; a marker it must be
        //     told about is honest, hardcoding its own filenames is how it learns to lie.
        const tail = text.slice(end, end + 80);
        const soundEmpty = /^\s*,\s*(?:\[\s*\]|''|""|``)\s*[,)]/.test(tail);
        const soundDomain = /^\s*\]\s*\.(?:every|some|filter|map|reduce)\s*\(/.test(tail);
        if (reaches && !soundEmpty && !soundDomain) {
            note(file, lineOf(text, m.index), 'WINDOWED-SEARCH',
                `fixed ${m[1]}-char window searched as a scope — brace-match instead`);
        }
    }

    // AMBIENT-BINDING: a gate whose verdict depends on something outside the repository — a
    // binary resolved from PATH, or a sibling checkout. stc-compiler-70 found the sharp version
    // on 2026-09-02: its assembler tests invoked sdcc/ca65 by BARE NAME, so they bound to the
    // developer's system toolchain, passed locally, and had never once exercised the binaries
    // the service actually ships. Wiring them into CI turned them red immediately and exposed a
    // production defect — POST /assemble had never returned a symbol table. The same shape runs
    // the other way here: two sb3-creator tests compare against a "live sibling checkout" and
    // fail on this box while passing in CI. Either direction, the verdict is not about the code.
    // AMBIENT-BINDING is about a VERDICT that depends on something outside the repository, so it
    // is only asked of files that render one. `scripts/gen-*`, `make-*`, `sync-*` and
    // `package-*` are generators and tools: one of them invoking the developer's cargo or
    // python3 is the intended behaviour, not a hazard, and reporting it taught the reader to
    // skim past the class that actually cost stc-compiler-70 a real defect.
    // Matched on the BASENAME convention, not the directory, so the rule is reachable under
    // `--root` and can be proven to fire. It was written against the directory first, and the
    // all-six fixture then showed five rules firing and this one silent — a rule sitting at
    // zero with nothing demonstrating it still works, which is the failure this whole file
    // exists to find.
    const rendersAVerdict = /(?:^|\/)[^/]*\.test\.mjs$|(?:^|\/)(?:verify|proof|audit|oracle|smoke)-/
        .test(path.relative(root, file));
    if (rendersAVerdict) {
    for (const m of text.matchAll(/(?:execFileSync|execSync|spawnSync|spawn|execFile)\(\s*['"`]([a-z0-9_.-]+)['"`]/gi)) {
        const tool = m[1];
        // `node` and `process.execPath` are the runtime this file already runs under; a bare
        // name with no separator that is NOT node is a tool picked up from the environment.
        if (tool !== 'node' && !tool.includes('/') && !tool.includes('.exe')) {
            note(file, lineOf(text, m.index), 'AMBIENT-BINDING',
                `'${tool}' resolved from PATH — the gate may be exercising a tool the build does not ship`);
        }
    }
    // Only a path that ESCAPES this repository counts. `../overlay/.../bw-board/...` is lite's
    // own vendored copy and is exactly what these gates should read; matching the library name
    // anywhere flagged 112 of those and buried the real thing. A sibling is an absolute path
    // into another checkout, or a relative one climbing above the repo root.
    for (const m of text.matchAll(/['"`](\/mnt\/[^'"`\n]*|(?:\.\.\/){2,}[^'"`\n]*)['"`]/g)) {
        const target = m[1];
        if (/(?:bw-board|bw-circuit-ui|sb3-creator|bw-parts|extensions|stc-compiler)\b/.test(target)) {
            note(file, lineOf(text, m.index), 'AMBIENT-BINDING',
                `reads ${target.split('/').slice(-2).join('/')} — a checkout outside this repository`);
        }
    }
    }

    // SWALLOWED-PRECONDITION: an awaited precondition inside a `try` whose `catch` body is empty
    // or comment-only. Found 2026-09-02 in two files carrying the SAME copy-pasted comment:
    //
    //     try { await search.waitFor({state: 'visible'}); await search.fill('counter'); }
    //     catch { /* the example list may not be searchable in this build */ }
    //
    // If the element never appears the gate does not fail and does not skip — it CONTINUES, and
    // every assertion after it runs against a state that was never established. Worse than
    // EVENT-AS-STATE, which at least asserts something: this asserts nothing and says nothing.
    for (const m of text.matchAll(/\btry\s*\{([\s\S]{0,600}?)\}\s*catch\s*(?:\([^)]*\))?\s*\{([\s\S]{0,200}?)\}/g)) {
        const [, body, handler] = m;
        if (!/await[\s\S]*?(?:waitFor|toBeVisible|expect)\(/.test(body)) continue;
        // A handler that records the failure, rethrows, or exits is doing its job.
        if (/\S/.test(handler.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''))) continue;
        note(file, lineOf(text, m.index), 'SWALLOWED-PRECONDITION',
            'an awaited precondition whose failure is discarded — the gate continues as if it held');
    }

    // EVENT-AS-STATE: proves a thing appears, never proves it goes away.
    //
    // Only counts an appearance that STANDS ALONE. A `waitFor` immediately followed by a click,
    // a fill, a count or an evaluate is SYNCHRONISATION before the real assertion, and it fails
    // loudly when the element never arrives. Flagging those made 12 hits of which most were the
    // correct way to write a browser gate — and a class that is mostly noise gets skipped, which
    // is how the real ones survive.
    const appears = [...text.matchAll(/waitFor\(\s*\{?\s*state:\s*'visible'|toBeVisible\(|\.waitFor\(\)/g)]
        .filter(m => !/^[\s\S]{0,180}?\.(?:click|fill|press|type|check|selectOption|count|evaluate|textContent|innerText|screenshot|boundingBox)\(/
            .test(text.slice(m.index + m[0].length)));
    if (appears.length) {
        const provesAbsence = /state:\s*'(detached|hidden)'|toBeHidden\(|count\(\)\s*(?:===|!==)?\s*0|\.count\(\)\s*\)?\s*,\s*0|not\.toBeVisible/.test(text);
        if (!provesAbsence) {
            note(file, lineOf(text, appears[0].index), 'EVENT-AS-STATE',
                `${appears.length} appearance assertion(s), none proving the thing is ever gone`);
        }
    }
}

if (process.argv.includes('--json')) {
    const counts = {};
    for (const f of findings) counts[f.kind] = (counts[f.kind] || 0) + 1;
    // ROOTS AND SCANNED ARE PART OF THE RESULT, not decoration. The human
    // output has always named the roots ("suspects across test, scripts"); the
    // JSON did not, and the JSON is what the TEST consumes -- so the suite's
    // assertion was scope-blind and would have kept passing if someone
    // narrowed the scan to one directory or broke the walk entirely.
    // A count is only meaningful next to the set it counted over.
    console.log(JSON.stringify(
        {total: findings.length, counts, roots, scanned: scannedCount, findings}, null, 2));
    process.exit(0);
}

const byKind = new Map();
for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) || []), f]);
console.log(`\n=== gate-shape audit — ${findings.length} suspects across ${roots.join(', ')} ===\n`);
for (const [kind, list] of [...byKind].sort()) {
    console.log(`${kind}  (${list.length})`);
    for (const f of list) console.log(`  ${f.file}:${f.line}  ${f.detail}`);
    console.log('');
}
if (!findings.length) console.log('no suspects\n');
process.exitCode = strict && findings.length ? 1 : 0;
