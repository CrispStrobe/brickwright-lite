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
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {censusDocMentions, constructedTopLevelDocPaths, outputOnlyMentions, listDocs, parsePushPaths, reincludedDocs, judge} from '../scripts/lib/doc-triggers.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(path.join(ROOT, '.github', 'workflows', 'build.yml'), 'utf8');
const {entries, hasPathsIgnore} = parsePushPaths(yml);

const pushWouldBuild = (file, paths = entries) => {
    let included = false;
    for (const entry of paths) {
        const negated = entry.startsWith('!');
        const pattern = negated ? entry.slice(1) : entry;
        const matches = pattern === '**' || pattern === file ||
            (pattern === 'docs/*.md' && /^docs\/[^/]+\.md$/.test(file));
        if (matches) included = !negated;
    }
    return included;
};

const assertHistoryOnlySkipped = paths => {
    assert.equal(pushWouldBuild('HISTORY.md', paths), false,
        'HISTORY.md-only pushes are ledger updates and must skip Build');
};

test('the push trigger is a paths filter: everything first, then negations, then the docs put back', () => {
    assert.equal(hasPathsIgnore, false, 'paths and paths-ignore cannot coexist on one trigger; GitHub rejects the workflow');
    assert.equal(entries[0], '**', 'the first entry must include everything, or every later negation is meaningless');
    for (const root of ['BLOCKED.md', 'BUILD.md', 'CLAUDE.md', 'HANDOFF.md', 'HISTORY.md', 'LANES.md', 'MBIT-BUILD.md', 'PLAN.md', 'README.md', 'ROADMAP.md']) {
        assert.ok(entries.includes(`!${root}`), `${root} is root prose nothing reads and must stay negated`);
    }
    const cut = entries.indexOf('!docs/*.md');
    assert.ok(cut > 0, 'docs/*.md is negated as a whole and then re-included by name');
    for (const e of entries.slice(cut + 1)) assert.match(e, /^docs\/[^/]+\.md$/, `after the docs negation only re-includes belong: "${e}"`);
    assert.ok(!entries.some(e => e === '!docs/**' || e === '!docs/generated/**'), 'docs/generated is test input (generated reports asserted against source) and must keep triggering');
    assert.ok(!entries.some(e => /^!.*\.(js|mjs|jsx|json|yml|html)$/.test(e)), 'no code path is ever negated');
});

test('HISTORY-only skips by name while executable and governed build inputs still trigger (mutation)', () => {
    assertHistoryOnlySkipped(entries);
    assert.equal(pushWouldBuild('scripts/integrate.mjs'), true, 'executable source must trigger Build');
    assert.equal(pushWouldBuild('THIRD-PARTY-NOTICES.md'), true, 'the governed root build-input document must trigger Build');
    assert.equal(pushWouldBuild('docs/CYCLE-ACCURATE-CORE-EVALUATION.md'), true,
        'a governed docs build input must be re-included and trigger Build');

    const mutated = entries.filter(entry => entry !== '!HISTORY.md');
    assert.equal(mutated.length, entries.length - 1, 'mutation removed the exact HISTORY.md exclusion');
    assert.throws(() => assertHistoryOnlySkipped(mutated), /HISTORY\.md-only pushes/,
        'removing the exact exclusion must redden this gate by name');
});

test('every doc some non-comment line of code mentions is re-included; every re-include is mentioned', () => {
    const mentions = censusDocMentions(ROOT);
    const mentioned = [...mentions.keys()].sort();
    const reincluded = reincludedDocs(entries);
    const {missing, stale} = judge(mentioned, reincluded);
    assert.deepEqual(missing, [], 'docs code mentions that a push would NOT build for — add each to the push paths in build.yml:\n' +
        missing.map(d => `  ${d}  <- ${mentions.get(d).slice(0, 3).join(', ')}`).join('\n'));
    assert.deepEqual(stale, [], 'docs re-included in build.yml that nothing in code mentions any more — remove them:\n' +
        stale.map(d => `  ${d}`).join('\n'));
    assert.ok(listDocs(ROOT).length > reincluded.length, 'if every doc is re-included the negation buys nothing');
});

test('no top-level doc is read through a path built from a variable — the one shape the census cannot see', () => {
    // bw-ci's question when reviewing the rule. docs/generated/… and
    // docs/schematic-baselines/<file> ARE read through constructed paths and
    // that is safe only because the one-level `!docs/*.md` never reaches a
    // subdirectory — the glob's depth is load-bearing there. A variable-named
    // doc at the TOP level would be "mentioned nowhere, skip" while a test read
    // it every run; name it on a line, or move it under a subdirectory.
    const hits = constructedTopLevelDocPaths(ROOT);
    assert.deepEqual(hits, [], 'constructed top-level docs/ path(s):\n  ' + hits.join('\n  '));
    // and the detector sees each shape (mutation):
    const dir = mkdtempSync(path.join(tmpdir(), 'doc-trig-'));
    mkdirSync(path.join(dir, 'docs'));
    writeFileSync(path.join(dir, 'docs', 'X.md'), '');
    mkdirSync(path.join(dir, 'test'));
    writeFileSync(path.join(dir, 'test', 'a.test.mjs'), [
        "const a = readFileSync(join(root, 'docs', name));",
        'const b = readFileSync(`docs/${name}`);',
        "const c = readFileSync('docs/' + name);",
        "const ok1 = readFileSync(join(root, 'docs', 'generated', name));",
        "const ok2 = readFileSync(`docs/schematic-baselines/${name}`);",
        "// const commented = readFileSync('docs/' + name);"
    ].join('\n'));
    const found = constructedTopLevelDocPaths(dir);
    assert.deepEqual(found.map(h => h.split(':')[1]), ['1', '2', '3'], found.join('\n'));
});

test('the trigger list cannot vouch for itself, and a name printed as markdown is not a read (mutation)', t => {
    // Until 2026-09-07 the census counted build.yml's own re-include entries as
    // mentions, so "stale" could never fire: re-including a doc nothing reads
    // stayed green (fired live on docs/CI-QUEUE-2026-09-07.md). Now the real
    // list plus one unmentioned doc is red naming it:
    // The probe is any doc nothing mentions, chosen at run time — a literal
    // name here would itself be a mention and the census would count it.
    const mentioned = [...censusDocMentions(ROOT).keys()];
    const probe = listDocs(ROOT).find(d => !mentioned.includes(d));
    assert.ok(probe, 'no unmentioned doc exists to probe with — the negation buys nothing');
    const mutated = yml.replace("      - '!docs/*.md'\n", `      - '!docs/*.md'\n      - 'docs/${probe}'\n`);
    assert.notEqual(mutated, yml, 'mutation anchor');
    assert.deepEqual(judge(mentioned, reincludedDocs(parsePushPaths(mutated).entries)).stale, [probe]);
    // and the two exclusions, each shape on its own line in a throwaway tree:
    const dir = mkdtempSync(path.join(tmpdir(), 'doc-trig-'));
    mkdirSync(path.join(dir, 'docs'));
    for (const d of ['X.md', 'Y.md', 'Z.md']) writeFileSync(path.join(dir, 'docs', d), '');
    mkdirSync(path.join(dir, '.github', 'workflows'), {recursive: true});
    writeFileSync(path.join(dir, '.github', 'workflows', 'w.yml'), "on:\n  push:\n    paths:\n      - '**'\n      - '!docs/*.md'\n      - 'docs/X.md'\n      - 'docs/Z.md'  # trailing\njobs:\n  a:\n    steps:\n      - run: cat docs/Z.md\n");
    mkdirSync(path.join(dir, 'scripts'));
    writeFileSync(path.join(dir, 'scripts', 'g.mjs'), [
        'const md = `> stale? see \\`docs/X.md\\`, task L3.`;',     // printed as markdown: not a mention
        "const y = readFileSync('docs/Y.md', 'utf8');",              // a read: a mention
        'const both = `\\`docs/X.md\\`` + readFileSync(`docs/X.md`);'  // printed AND read on one line: the read counts
    ].join('\n'));
    const m = censusDocMentions(dir);
    assert.deepEqual([...m.keys()].sort(), ['X.md', 'Y.md', 'Z.md']);
    assert.deepEqual(m.get('X.md'), ['scripts/g.mjs:3'], 'the markdown line does not count; the trigger entry does not count; the read does');
    assert.deepEqual(m.get('Z.md'), ['.github/workflows/w.yml:11'], 'a workflow READING a doc in a run: line still counts; its own trigger entry does not');
    assert.deepEqual(outputOnlyMentions(dir).map(h => h.split(':').slice(0, 2).join(':')), ['scripts/g.mjs:1']);
    const live = outputOnlyMentions(ROOT);
    t.diagnostic(`output-only mentions in this tree (reported, not counted): ${live.length}` + live.map(h => `\n  ${h}`).join(''));
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
