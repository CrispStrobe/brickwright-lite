/**
 * A prose-only push under docs/ is a ledger row, not a build — unless code
 * reads the doc. build.yml's push `paths` filter says which is which, and this
 * test keeps that list equal to what the tree actually mentions.
 *
 * Why a test and not a hand list: `paths-ignore` cannot say "except", so the
 * only shapes are 41 enumerated skips (rots silently the day a doc gains a
 * reader) or this — computed re-includes, checked on every build.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {censusDocMentions, listDocs, parsePushPaths, reincludedDocs, judge} from '../scripts/lib/doc-triggers.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(path.join(ROOT, '.github', 'workflows', 'build.yml'), 'utf8');
const {entries, hasPathsIgnore} = parsePushPaths(yml);

test('the push trigger is a paths filter: everything first, then negations, then the docs put back', () => {
    assert.equal(hasPathsIgnore, false, 'paths and paths-ignore cannot coexist on one trigger; GitHub rejects the workflow');
    assert.equal(entries[0], '**', 'the first entry must include everything, or every later negation is meaningless');
    for (const root of ['BLOCKED.md', 'BUILD.md', 'CLAUDE.md', 'HANDOFF.md', 'LANES.md', 'MBIT-BUILD.md', 'PLAN.md', 'README.md', 'ROADMAP.md']) {
        assert.ok(entries.includes(`!${root}`), `${root} is root prose nothing reads and must stay negated`);
    }
    const cut = entries.indexOf('!docs/*.md');
    assert.ok(cut > 0, 'docs/*.md is negated as a whole and then re-included by name');
    for (const e of entries.slice(cut + 1)) assert.match(e, /^docs\/[^/]+\.md$/, `after the docs negation only re-includes belong: "${e}"`);
    assert.ok(!entries.some(e => e === '!docs/**' || e === '!docs/generated/**'), 'docs/generated is test input (generated reports asserted against source) and must keep triggering');
    assert.ok(!entries.some(e => /^!.*\.(js|mjs|jsx|json|yml|html)$/.test(e)), 'no code path is ever negated');
});

test('every doc some non-comment line of code mentions is re-included; every re-include is mentioned', () => {
    const mentions = censusDocMentions(ROOT);
    const mentioned = [...mentions.keys()].sort();
    const reincluded = reincludedDocs(entries);
    const {missing, stale} = judge(mentioned, reincluded);
    assert.deepEqual(missing, [], 'docs code mentions that a push would NOT build for — add each to the push paths in build.yml:\n' +
        missing.map(d => `  docs/${d}  <- ${mentions.get(d).slice(0, 3).join(', ')}`).join('\n'));
    assert.deepEqual(stale, [], 'docs re-included in build.yml that nothing in code mentions any more — remove them:\n' +
        stale.map(d => `  docs/${d}`).join('\n'));
    assert.ok(listDocs(ROOT).length > reincluded.length, 'if every doc is re-included the negation buys nothing');
});

test('the verdict is by name, both directions (mutation)', () => {
    assert.deepEqual(judge(['A.md', 'B.md'], ['A.md', 'B.md']), {missing: [], stale: []});
    assert.deepEqual(judge(['A.md', 'B.md', 'NEW-READER.md'], ['A.md', 'B.md']), {missing: ['NEW-READER.md'], stale: []});
    assert.deepEqual(judge(['A.md'], ['A.md', 'GONE.md']), {missing: [], stale: ['GONE.md']});
});

test('the census counts mentions on code lines, never in comments', () => {
    // The trigger block's own comment names docs/generated and this test's
    // header names docs/ — neither may count. A doc named only in a comment
    // anywhere would otherwise be pinned as a trigger forever.
    const mentions = censusDocMentions(ROOT);
    for (const [doc, where] of mentions) {
        for (const loc of where) {
            const [file, line] = loc.split(':');
            const text = readFileSync(path.join(ROOT, file), 'utf8').split('\n')[Number(line) - 1].trim();
            assert.doesNotMatch(text, /^(\/\/|\*|\/\*|#(?!!)|<!--)/, `${doc} counted from a comment at ${loc}`);
        }
    }
    const parsed = parsePushPaths("on:\n  push:\n    paths:\n      - '**'\n      - '!docs/*.md'\n      # a comment between entries\n      - 'docs/X.md'  # trailing\n      - 'docs/Y.md'\npermissions:\n");
    assert.deepEqual(parsed.entries, ['**', '!docs/*.md', 'docs/X.md', 'docs/Y.md']);
    assert.deepEqual(reincludedDocs(parsed.entries), ['X.md', 'Y.md']);
});
