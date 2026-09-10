/**
 * THE MARKER IN THE FILE AGREES WITH THE MANIFEST THAT DECLARES IT.
 *
 * The manifest is the authority; the marker is a mirror. This is the assertion
 * that keeps them from being two claims about one fact -- the failure this
 * repository has spent a day removing everywhere else.
 *
 * WHY ONLY THESE FILES CARRY A MARKER, since the obvious question is why not
 * every vendored file. A header on a VENDORED file makes it differ from
 * upstream, and test/vendor-identity.test.mjs asserts BYTE equality against
 * upstream at the pin -- so marking the 325 commentable vendored files would red
 * that gate on all of them, and keeping both would mean comparing "identical
 * after stripping a known header". That trades a total, exact claim over 862
 * files for a comment on 325, and adds a stripper that can swallow a real
 * divergence beginning with the same comment shape.
 *
 * These files are the opposite case. Upstream has no counterpart, so a marker
 * costs nothing and reds nothing -- and they are the ones that need it:
 * upstream cannot restore them, no upstream review sees them, and a sync deleted
 * one of them on 2026-09-08 because a hardcoded keep-list was missing an entry.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SOURCES, NEVER_MARK, BEGIN, END, blockFor, applied, retracted, declared, marked }
    from '../scripts/gen-lite-authored-headers.mjs';

test('every declared lite-authored file carries the marker the manifest implies', async t => {
    const files = await declared();

    // Species 1: an empty corpus satisfies every assertion below, and this list
    // is DERIVED from two documents either of which could stop parsing.
    assert.ok(files.length >= 5,
        `only ${files.length} lite-authored file(s) were derived from the manifests -- the json ` +
        'block moved or stopped parsing, and a marker check over nothing passes trivially');

    const stale = [];
    for (const { file, entry, doc, rel } of files) {
        const src = readFileSync(path.join(ROOT, rel), 'utf8');
        assert.ok(src.includes(BEGIN) && src.includes(END),
            `${rel} is declared lite-authored but carries no marker -- run: ` +
            'node scripts/gen-lite-authored-headers.mjs');
        if (applied(src, blockFor(file, entry, doc)) !== src) stale.push(rel);
    }
    assert.deepEqual(stale, [],
        '\n  MARKERS THAT NO LONGER MATCH THEIR MANIFEST ENTRY:\n    ' + stale.join('\n    ') +
        '\n\n  The entry changed and the block did not, or someone edited the block by hand.\n' +
        '  The manifest is the authority: fix the entry, then run\n' +
        '  node scripts/gen-lite-authored-headers.mjs. A mirror that may disagree with\n' +
        '  its source is a second claim about one fact.\n');
    t.diagnostic(`${files.length} lite-authored file(s) marked, all agreeing with their manifest entry`);
});

test('the marker sits at the very top, where someone opening the file sees it', async () => {
    // A marker below a 40-line module comment is a marker nobody reads. This is
    // the whole point of (c) over a sidecar index, so it is worth asserting
    // rather than trusting the generator to keep prepending.
    for (const { rel } of await declared()) {
        const src = readFileSync(path.join(ROOT, rel), 'utf8');
        assert.equal(src.indexOf(BEGIN), 0,
            `${rel}: the marker is not the first thing in the file -- something was prepended ` +
            'above it, and a warning under a wall of prose is not a warning');
    }
});

test('LICENSE and the generated manifest are excluded by name, with a reason', async () => {
    // NOT "the loop happened to skip them". A licence text must not have
    // anything prepended -- that alters a legal notice -- and .vendor-manifest
    // .json is JSON, which carries no comment, and is rewritten by every sync.
    assert.deepEqual([...NEVER_MARK].sort(), ['.vendor-manifest.json', 'LICENSE'],
        'the never-mark list changed -- if a file left it, say why it is now safe to prepend to');

    // And prove the exclusion BITES: these are declared lite-authored, so
    // without the list they would be marked.
    const declaredNames = new Set();
    for (const { doc } of SOURCES) {
        const md = readFileSync(path.join(ROOT, doc), 'utf8');
        const m = md.match(/```json\n([\s\S]*?)\n```/);
        if (!m) continue;
        for (const f of Object.keys(JSON.parse(m[1]).liteAuthored?.files ?? {})) declaredNames.add(path.basename(f));
    }
    for (const n of NEVER_MARK) {
        assert.ok(declaredNames.has(n),
            `${n} is on the never-mark list but no manifest declares it, so the exclusion ` +
            'protects nothing -- remove it, or the list is a comment pretending to be a guard');
    }
});

test('a marked file is still valid source', async () => {
    // The marker is prepended text; a file that no longer parses is the one way
    // this can break something at runtime rather than merely look wrong.
    for (const { rel } of await declared()) {
        const src = readFileSync(path.join(ROOT, rel), 'utf8');
        assert.match(src.slice(0, 3), /^\/\//, `${rel}: the marker is not a line comment`);
        assert.ok(!/^\s*$/.test(src.slice(src.indexOf(END) + END.length, src.indexOf(END) + END.length + 200)),
            `${rel}: nothing but blank lines follows the marker -- the file's own content is gone`);
    }
});

test('NO FILE CARRIES A MARKER THE MANIFEST NO LONGER DECLARES', async t => {
    // THE OTHER DIRECTION, and until 2026-09-10 nothing checked it. Every test
    // in this file and every mode of the generator walked the DECLARED list, so
    // a file removed from the manifest was visited by neither and its block sat
    // there asserting a thing that had stopped being true.
    //
    // Constructed to prove it: delete one entry, leave the block, and both
    // `--check` and this suite reported agreement and exited 0. The bad state
    // was unreachable by every check that existed.
    //
    // It stopped being hypothetical the moment upstreaming became the default.
    // `instruction-debug-events.js` went up and came back vendored, and the
    // stale block was caught only by the SYNC's content guard — which refused
    // to delete seventeen lines it had no way of knowing were stale. That is
    // the right instinct from a tool that does not know what a marker is, and
    // it is not a check.
    const declaredRels = new Set((await declared()).map(d => d.rel));
    const all = await marked();

    // Species 1 again: a walk that finds nothing satisfies the assertion below.
    assert.ok(all.length >= 5,
        `only ${all.length} marked file(s) were found by walking the roots — the walk stopped ` +
        'matching, and an orphan check over nothing passes trivially');

    // Every declared file that carries a marker must be FOUND by the walk, or
    // the orphan set is computed against a short list and under-reports.
    for (const rel of declaredRels) {
        const src = readFileSync(path.join(ROOT, rel), 'utf8');
        if (!src.includes(BEGIN)) continue;          // NEVER_MARK files, e.g. LICENSE
        assert.ok(all.includes(rel), `${rel} carries a marker and the walk did not find it`);
    }

    // ONE MUTATION IS INERT HERE AND IS RECORDED AS INERT: making the walk
    // non-recursive changes nothing today, because every marked file and every
    // declared one sits flat in its root — measured, not assumed. It stops
    // being inert the moment a lite-authored file lands in a subdirectory, and
    // `bw-circuit-ui/model/` already exists, so that is a when rather than an
    // if. The assertion above is what will catch it: a nested declared file
    // would be missing from the walk.
    const orphans = all.filter(rel => !declaredRels.has(rel));
    assert.deepEqual(orphans, [],
        '\n  FILES CARRYING A MARKER THAT THE MANIFEST NO LONGER DECLARES:\n    ' +
        orphans.join('\n    ') +
        '\n\n  This is what a file going UPSTREAM looks like: it stops being lite-authored\n' +
        '  and the block stays behind claiming it is. Run\n' +
        '  node scripts/gen-lite-authored-headers.mjs — it retracts them now.\n');
    t.diagnostic(`${all.length} marked file(s), ${declaredRels.size} declared, 0 orphaned`);
});

test('retracting a marker returns the file BYTE FOR BYTE', () => {
    // `retracted` deletes lines from vendored files. Without this it is a
    // function that does that on a guess — and the blank line `applied` inserts
    // when it prepends is exactly the sort of thing an inverse forgets.
    const original = 'export const x = 1;\n\nexport const y = 2;\n';
    const block = blockFor('x.js', { reason: 'a reason' }, 'docs/D.md');

    const withMarker = applied(original, block);
    assert.ok(withMarker.startsWith(BEGIN), 'the marker goes on the front');
    assert.ok(withMarker.includes(END));
    assert.notEqual(withMarker, original);

    assert.equal(retracted(withMarker), original, 'the round trip is not byte-exact');

    // Idempotent in both directions, like `applied` is.
    assert.equal(retracted(retracted(withMarker)), original);
    assert.equal(retracted(original), original, 'retracting from an unmarked file changes nothing');
});

test('retracting leaves a HALF marker alone rather than guessing where it ends', () => {
    // A file with a BEGIN and no END is damaged, and the honest response is to
    // leave it for a human and let the assertions above shout. Deleting to the
    // end of the file would be the other option and it is unrecoverable.
    const damaged = `${BEGIN}\n// someone truncated this\nexport const x = 1;\n`;
    assert.equal(retracted(damaged), damaged);
});

test('a marker NOT at the top loses its span and NOTHING ELSE', () => {
    // The blank line is taken back only when the marker STARTS the file,
    // because that is the only case `applied` inserted one. A marker anywhere
    // else can only have been put there by hand, and this function has no way
    // to know which surrounding newline was part of it — so it removes the
    // delimited span exactly and leaves the whitespace for a human.
    //
    // Asserted as what it IS rather than as what would be tidy: my first
    // version of this test expected the newline to be absorbed, and bending the
    // function to satisfy it would have meant guessing at a byte mid-file. A
    // retraction that guesses is the one thing this must not be.
    const block = blockFor('x.js', { reason: 'a reason' }, 'docs/D.md');
    const withMarker = `#!/usr/bin/env node\n${block}\nexport const x = 1;\n`;

    const out = retracted(withMarker);
    assert.equal(out, '#!/usr/bin/env node\n\nexport const x = 1;\n');
    assert.ok(!out.includes(BEGIN) && !out.includes(END), 'the whole span is gone');
    assert.ok(out.includes('#!/usr/bin/env node'), 'and the line before it survived');
    assert.ok(out.includes('export const x = 1;'), 'and the code after it survived');
});
