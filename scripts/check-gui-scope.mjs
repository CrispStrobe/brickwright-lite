#!/usr/bin/env node
/**
 * The GUI-scope boundary, DECLARED: every bare specifier the resolve hook
 * re-resolved from packages/scratch-gui, and every root test that caused it,
 * must be listed in scripts/lib/gui-scope-allowed.json.
 *
 * scripts/lib/gui-scope-hooks.mjs measures the boundary (BW_GUI_SCOPE_LOG,
 * one `specifier\tparentURL\ttestFile` line per redirect). This turns the
 * measurement into a gate: a specifier or a test not in the list fails the CI
 * step BY NAME, so the boundary grows only by review — someone adds the entry,
 * with the test that needs it, in the same commit as the import.
 *
 * No wildcards: the list is exact. Measured 2026-09-06 on run 34012073586:
 * one specifier (avr8js), two redirects.
 *
 *   node scripts/check-gui-scope.mjs --log test-results/fast.gui-scope.tsv
 *   (a missing or empty log means no redirects happened — the corpus job, or a
 *    box where a stray parent node_modules answers first; that is reported, not
 *    failed, because the hook then had nothing to declare)
 */
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const ALLOWED_PATH = path.join(ROOT, 'scripts', 'lib', 'gui-scope-allowed.json');

/** Parse the hook's log into {specifier -> Set(testFile)}. */
export const parseLog = text => {
    const seen = new Map();
    for (const line of String(text || '').split('\n')) {
        if (!line.trim()) continue;
        const [specifier, , testFile = '(no test file in argv)'] = line.split('\t');
        if (!seen.has(specifier)) seen.set(specifier, new Set());
        seen.get(specifier).add(testFile);
    }
    return seen;
};

/**
 * Compare observed redirects with the declared list. Pure; exported for the tests.
 * @param {Map<string, Set<string>>} observed - from parseLog
 * @param {Record<string, {tests: string[], why?: string}>} allowed - the JSON
 * @returns {{undeclaredSpecifiers: string[], undeclaredTests: string[], unused: string[]}}
 */
export const judge = (observed, allowedJson) => {
    // "$comment" and any other "$…" key is prose, not a specifier.
    const allowed = Object.fromEntries(Object.entries(allowedJson).filter(([k]) => !k.startsWith('$')));
    const undeclaredSpecifiers = [...observed.keys()].filter(s => !allowed[s]).sort();
    const undeclaredTests = [];
    for (const [spec, tests] of observed) {
        if (!allowed[spec]) continue;
        for (const t of tests) if (!allowed[spec].tests.includes(t)) undeclaredTests.push(`${spec} <- ${t}`);
    }
    const unused = Object.keys(allowed).filter(s => !observed.has(s)).sort();
    return {undeclaredSpecifiers, undeclaredTests: undeclaredTests.sort(), unused};
};

const isMain = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split('/').pop());
if (isMain) {
    const at = process.argv.indexOf('--log');
    const logPath = at >= 0 ? process.argv[at + 1] : 'test-results/fast.gui-scope.tsv';
    const allowed = JSON.parse(readFileSync(ALLOWED_PATH, 'utf8'));
    if (!existsSync(logPath) || !readFileSync(logPath, 'utf8').trim()) {
        console.log(`check-gui-scope: no redirects were logged at ${logPath} — nothing crossed the boundary in this run (or a parent node_modules answered before the hook; on CI there is none)`);
        process.exit(0);
    }
    const observed = parseLog(readFileSync(logPath, 'utf8'));
    const {undeclaredSpecifiers, undeclaredTests, unused} = judge(observed, allowed);
    for (const [spec, tests] of observed) console.log(`  ${spec}  <-  ${[...tests].join(', ')}`);
    if (unused.length) console.log(`note: declared but not redirected this run: ${unused.join(', ')} (a parent node_modules may have answered first, or the importer is gone — prune when it is)`);
    let failed = false;
    if (undeclaredSpecifiers.length) {
        failed = true;
        console.error(`::error::bare specifier(s) re-resolved from packages/scratch-gui but not declared in scripts/lib/gui-scope-allowed.json: ${undeclaredSpecifiers.join(', ')} — a root test now depends on a GUI package it did not before; declare it with the test that needs it, in this commit, or import through the integrated tree instead.`);
    }
    if (undeclaredTests.length) {
        failed = true;
        console.error(`::error::test(s) crossed the GUI-scope boundary for a declared specifier but are not listed for it: ${undeclaredTests.join('; ')} — add the test to the entry, or stop the import.`);
    }
    process.exit(failed ? 1 : 0);
}
