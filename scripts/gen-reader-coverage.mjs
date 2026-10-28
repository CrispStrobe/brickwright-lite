#!/usr/bin/env node
/**
 * Generate docs/generated/READER-COVERAGE.md — how much of each language the
 * importer's readers actually lift, measured, not asserted.
 *
 * A reader turns source in one language into the pseudocode AST. It has THREE
 * outcomes, not two, and the third is the one folklore hides:
 *   - CLEAN    — parsed, nothing dropped (empty `warnings`).
 *   - DEGRADED — parsed, but the reader hit a construct it has no lifting for
 *                and kept going with a placeholder, naming the loss in
 *                `warnings`. The program "imports" and is quietly wrong.
 *   - REFUSED  — the reader threw (or, for the 8086 lifter, returned ok:false):
 *                nothing came back.
 * A mapped/refused ratio that folds DEGRADED into "mapped" reports a reader as
 * healthier than it is. This document counts all three and lists the refusal
 * and degradation reasons by construct, so the number stops being a rumour.
 *
 * Derived, never edited: `--check` fails when the file on disk differs from
 * what this script renders, and test/reader-coverage-doc.test.mjs runs that
 * check in CI. The numbers are the deliverable — there is no threshold and
 * nothing here asserts a floor. Plan: docs/LANGUAGE-DEVICE-MATRIX-PLAN.md, L3.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {FIXTURES, FIXTURE_SOURCES} from './reader-coverage-fixtures.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs/generated/READER-COVERAGE.md');
const lib = path.join(root, 'overlay/scratch-gui/src/lib');
const rel = p => path.relative(root, p).replaceAll(path.sep, '/');

const OUTCOME = Object.freeze({CLEAN: 'clean', DEGRADED: 'degraded', REFUSED: 'refused'});

/**
 * Each reader normalises to {outcome, reasons[]}. The five sb3-creator readers
 * share a contract — `default(src)` returns {pseudocode, warnings} or throws;
 * the 8086 lifter catches its own LiftError and returns {ok, warnings, error}.
 */
async function loadReaders () {
    const dflt = async f => (await import(path.join(lib, f))).default;
    const sb3 = fn => src => {
        let r;
        try { r = fn(src); }
        catch (e) { return {outcome: OUTCOME.REFUSED, reasons: [firstClause(e.message)]}; }
        const warnings = r.warnings || [];
        // A reader that returns no pseudocode while warning that the source is
        // not its language has refused softly, not lifted: count it refused.
        const empty = !r.pseudocode || !String(r.pseudocode).replace(/^\s*(#|REM|\/\/).*$/gm, '').trim();
        if (empty && warnings.length) return {outcome: OUTCOME.REFUSED, reasons: warnings.map(firstClause)};
        if (warnings.length) return {outcome: OUTCOME.DEGRADED, reasons: warnings.map(firstClause)};
        return {outcome: OUTCOME.CLEAN, reasons: []};
    };
    const python = await dflt('sb3-creator-python.js');
    const javascript = await dflt('sb3-creator-javascript.js');
    const basic = await dflt('sb3-creator-basic.js');
    const micropython = await dflt('sb3-creator-micropython.js');
    const cDevice = await dflt('sb3-creator-c.js');
    const cHost = await dflt('sb3-creator-chost.js');
    const asm = await dflt('bw-asm/asm-8086-to-pseudocode.js');

    return {
        python: sb3(python),
        javascript: sb3(javascript),
        basic: sb3(src => basic(src, {})),
        micropython: sb3(src => micropython(src, {})),
        // Host C carries @bw-program and its own structure; device C infers pins
        // from possibly hand-written 8051/Arduino source. The importer picks by
        // that marker, so this measures the reader that source would actually hit.
        c: sb3(src => (/@bw-program/.test(src) ? {pseudocode: cHost(src), warnings: []} : cDevice(src))),
        asm: src => {
            const r = asm(src);
            const warnings = (r.warnings || []).map(w => firstClause(typeof w === 'string' ? w : w.text || String(w)));
            if (r.ok) return warnings.length ? {outcome: OUTCOME.DEGRADED, reasons: warnings} : {outcome: OUTCOME.CLEAN, reasons: []};
            // 'foreign' and 'refused' are the reader deliberately declining a
            // program it is not meant to lift (hand-written asm, the scheduler
            // form) — a correct refusal, not a failure to lift what it should.
            const kind = r.error && r.error.kind;
            const why = (kind === 'refused' || kind === 'foreign')
                ? `refused (${kind}): ${firstClause(r.error.message)}`
                : `lift-fail: ${firstClause(r.error ? r.error.message : 'unknown')}`;
            return {outcome: OUTCOME.REFUSED, reasons: [why]};
        }
    };
}

/** The reason line, trimmed to its first clause and stripped of specifics
 *  (line numbers, quoted identifiers) so like reasons bucket together. */
function firstClause (msg) {
    return String(msg)
        .split(/[\n—]/)[0]
        .replace(/\(line[^)]*\)/gi, '')
        .replace(/line \d+/gi, 'line N')
        .replace(/"[^"]*"/g, '"…"')
        .replace(/`[^`]*`/g, '`…`')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);
}

function tally (rows) {
    const t = {clean: 0, degraded: 0, refused: 0};
    for (const r of rows) t[r.outcome]++;
    return t;
}

function bar (t) {
    const total = t.clean + t.degraded + t.refused || 1;
    const pct = n => `${Math.round((n / total) * 100)}%`;
    return `${t.clean} clean · ${t.degraded} degraded · ${t.refused} refused (of ${total}; ${pct(t.clean)} clean)`;
}

export async function buildReaderCoverage () {
    const readers = await loadReaders();
    // (language, family) → [{name, outcome, reasons}]
    const results = [];
    for (const fx of FIXTURES) {
        const run = readers[fx.lang];
        if (!run) throw new Error(`no reader for language '${fx.lang}' (fixture ${fx.name})`);
        const {outcome, reasons} = run(fx.source);
        // Dedupe per fixture: a program that keeps nine grey blocks hit one
        // construct, not nine. Counts downstream are then "fixtures that hit
        // this construct", which is the honest denominator.
        results.push({...fx, outcome, reasons: [...new Set(reasons)]});
    }

    const langs = [...new Set(FIXTURES.map(f => f.lang))];
    const overall = tally(results);
    const roundtrip = tally(results.filter(r => r.kind === 'round-trip'));
    const native = tally(results.filter(r => r.kind === 'native'));

    // Per method × language × family table. Method is kept distinct because a
    // round-trip clean and a native "correctly refused foreign program" are
    // different facts and must not be summed into one figure.
    const rowsByLangFamily = [];
    for (const kind of ['round-trip', 'native']) {
        for (const lang of langs) {
            const fams = [...new Set(results.filter(r => r.lang === lang && r.kind === kind).map(r => r.family))].sort();
            for (const fam of fams) {
                const rows = results.filter(r => r.lang === lang && r.family === fam && r.kind === kind);
                rowsByLangFamily.push(`| ${kind} | ${lang} | ${fam} | ${bar(tally(rows))} |`);
            }
        }
    }

    // Reasons, bucketed by construct, degraded and refused separately.
    const reasonCount = outcome => {
        const m = new Map();
        for (const r of results) if (r.outcome === outcome) for (const why of r.reasons) m.set(why, (m.get(why) || 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const degradedReasons = reasonCount(OUTCOME.DEGRADED);
    const refusedReasons = reasonCount(OUTCOME.REFUSED);
    const reasonRows = list => list.length ? list.map(([why, n]) => `| ${n} | ${why} |`).join('\n') : '| 0 | — none — |';

    // Per-fixture ledger of the NON-CLEAN outcomes only, so a reader's every
    // degradation and refusal is traceable to the program that caused it while
    // the (many) clean round-trips stay summarised in the counts above.
    const notClean = results.filter(r => r.outcome !== OUTCOME.CLEAN);
    const ledgerRows = notClean.map(r =>
        `| ${r.kind} | ${r.lang} | ${r.family} | ${r.name} | ${r.outcome} | ${r.reasons.length ? r.reasons.join('; ') : '—'} |`);

    // Fixture provenance and licence, so every program's origin is on the page.
    const srcRows = FIXTURE_SOURCES.map(s => `| ${s.id} | ${s.langs.join(', ')} | ${s.origin} | ${s.licence} |`);

    return `# Reader coverage

> Generated by \`scripts/gen-reader-coverage.mjs\`. Do not edit; run
> \`npm run gen:reader-coverage\`. \`npm run gen:reader-coverage:check\` fails when
> this file is stale. Plan: \`docs/LANGUAGE-DEVICE-MATRIX-PLAN.md\`, task L3.

A **reader** lifts source in one language into the pseudocode AST the importer
builds every other language from. This page measures how much of each language
its reader actually lifts, over fixtures that already live in the tree or its
pinned corpora. **These numbers are the deliverable. Nothing here is a
threshold and nothing asserts a floor** — the point is that the coverage of
each reader is a measured figure, not folklore.

Each run of a fixture through its reader is one of three outcomes:

- **clean** — lifted with nothing dropped.
- **degraded** — lifted, but the reader met a construct it cannot represent and
  kept going with a placeholder, naming the loss. The program imports and is
  quietly missing something. This is the outcome a mapped/refused ratio hides,
  and it is broken out here for exactly that reason.
- **refused** — the reader threw, or the 8086 lifter returned \`ok:false\`:
  nothing was produced.

## Overall

${bar(overall)}

- round-trip (emit → read back): ${bar(roundtrip)}
- native (real source fed to the reader): ${bar(native)}

## By method, language and device family

**round-trip** emits each device-tagged \`program.bw\` to the language and reads
it back; the family is the program's target. **native** feeds real in-tree
source straight to the reader — for the 8086 lifter that is hand-written asm it
is designed to REFUSE as foreign, so a high refused count there is the reader
working, not failing.

Two readers refuse by design rather than by inability, and their refused counts
should be read that way. The 8086 lifter is v1: it lifts the control-flow and
variable programs the ▶ button lowers and refuses pins, ports, displays, tones,
PWM, keypad, broadcast, "say for secs" and the multi-script scheduler form BY
NAME (plan L1) — every shipped \`i8086_*\` example happens to use one of those,
so all five round-trips are named v1 refusals, and all eleven hand-written
programs are refused as foreign. The refusal reasons below say which.

| method | reader (language) | device family | outcome |
| --- | --- | --- | --- |
${rowsByLangFamily.join('\n')}

## Why readers degrade, by construct

| fixtures | construct kept as a placeholder |
| --- | --- |
${reasonRows(degradedReasons)}

## Why readers refuse, by construct

| fixtures | reason nothing was produced |
| --- | --- |
${reasonRows(refusedReasons)}

## Per-fixture ledger (non-clean outcomes)

Clean round-trips are counted above, not listed. Every degraded and refused
fixture appears here so its verdict is traceable to the program that caused it.

| method | language | family | fixture | outcome | reasons |
| --- | --- | --- | --- | --- | --- |
${ledgerRows.join('\n')}

## Fixture provenance

Every fixture is either already tracked in this repository or drawn from a
corpus this repository pins, with its licence recorded here.

| source | languages | origin | licence |
| --- | --- | --- | --- |
${srcRows.join('\n')}
`;
}

export async function checkReaderCoverage () {
    const expected = await buildReaderCoverage();
    const actual = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
    if (actual !== expected) throw new Error(`${rel(output)} is stale; run npm run gen:reader-coverage`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--check')) {
        await checkReaderCoverage();
        console.log(`${rel(output)} is current`);
    } else {
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, await buildReaderCoverage());
        console.log(`wrote ${rel(output)}`);
    }
}
