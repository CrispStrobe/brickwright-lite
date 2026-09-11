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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SOURCES, NEVER_MARK, BEGIN, END, blockFor, applied, declared }
    from '../scripts/gen-lite-authored-headers.mjs';

test('every declared lite-authored file carries the marker the manifest implies', async t => {
    const files = await declared();

    // THE FLOOR THAT RETIRED ITSELF. This read `files.length >= 5` -- a correct
    // species-1 defence while lite-authored files existed, and a permanent red
    // once every one of them had been upstreamed or moved out. The list reaching
    // zero is the GOAL; a check that calls the goal a parse failure gets deleted
    // by whoever reaches it, and the marker gate then goes vacuous for good.
    //
    // So the species-1 defence moves to where it can still be made: the marker
    // MACHINERY is driven against a fabricated entry whose answer is known, and
    // the derived list is then allowed to be empty because an empty reading has
    // been distinguished from a broken one.
    const fabricated = blockFor(
        'fab.js',
        {reason: 'a fabricated entry, so the block builder is known to still build'},
        'docs/FABRICATED.md');
    assert.ok(fabricated.startsWith(BEGIN) && fabricated.includes(END),
        'blockFor no longer produces a delimited marker block, so every marker this gate '
        + 'compares against is empty and every comparison below succeeds vacuously');
    assert.ok(fabricated.includes('fab.js') && fabricated.includes('a fabricated entry'),
        'the marker block no longer carries the file name or the manifest reason, so a '
        + 'marker could disagree with its entry in either and this gate would not see it');

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

// THE REVERSE SCAN, and it is the direction every other test in this file lacks.
//
// The three tests above, and the generator, all walk FROM the manifest TO the
// file: for each DECLARED lite-authored file, is its marker right. None walks
// the other way -- FROM a marker back to the manifest -- so a marker in a file
// the manifest NO LONGER declares is invisible. That is not hypothetical: it is
// exactly what a convergence does. machine-checkpoint.js was lite-authored,
// carried this marker, and was upstreamed in the checkpoint pin bump -- its
// entry left liteAuthored.files and its marker had to be removed BY HAND. If it
// had been missed, the file would now carry a block reading "Upstream has no
// copy of this file, so a sync cannot restore it" while upstream has exactly
// that copy: a header that is not merely stale but the precise opposite of true,
// and every gate here green.
//
// So this scans the vendored trees for the marker and requires every file that
// carries one to be declared. It is the graveyard guard the rest of this repo's
// inventories already have, at file granularity: a marker can only be made green
// by declaring the file OR removing the marker, never by leaving both to drift.
const walk = (dir) => {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (e.isFile()) out.push(p);
    }
    return out;
};

// Every root that could hold a marked file: the overlay roots the manifests
// name, AND their packages/ mirrors, since the marker is a byte of the file and
// travels with it. Only the ones present on disk (packages/ is gitignored and
// populated by integrate, so it may be absent in a bare checkout).
const markerRoots = () => {
    const roots = new Set();
    for (const { root } of SOURCES) {
        roots.add(root);
        roots.add(root.replace('overlay/', 'packages/'));
    }
    // A MARKER CAN LEAVE THE VENDORED ROOT, AND ITS LIE LEAVES WITH IT.
    //
    // This scan walked only the vendored roots -- which is where a LEGITIMATE
    // marker lives, and exactly why it could not see the case that actually
    // happened. `w65c02-cycle-provider.js` was relocated out of lib/bw-board/ to
    // lib/bw-debug/ and took its generated header along: still saying "LIVES
    // INSIDE A VENDORED ROOT", still naming a manifest that had retired its
    // entry, and now in a directory this walk did not visit. The orphan check
    // reported no orphans because the orphan had moved out of its reach.
    //
    // So the scan is widened to the whole of each `src/lib`. Its subject is "a
    // file claiming to be lite-authored-inside-a-vendored-root", and that claim
    // is at its most wrong precisely where the file is NOT in one.
    for (const { root } of SOURCES) {
        const lib = root.replace(/\/lib\/.*$/, '/lib');
        if (lib !== root) { roots.add(lib); roots.add(lib.replace('overlay/', 'packages/')); }
    }
    return [...roots].map(r => path.join(ROOT, r)).filter(existsSync);
};

test('every file CARRYING a marker is still declared -- no orphaned markers', async () => {
    // The legitimate homes for a marker: each declared file, in the overlay copy
    // AND its packages/ mirror. Built from the manifest, which is the authority.
    const legitimate = new Set();
    for (const { rel } of await declared()) {
        legitimate.add(path.join(ROOT, rel));
        legitimate.add(path.join(ROOT, rel.replace('overlay/', 'packages/')));
    }

    const roots = markerRoots();
    assert.ok(roots.length >= 1,
        `no vendored root exists to scan (looked for ${SOURCES.map(s => s.root).join(', ')} ` +
        'and their packages/ mirrors) -- a scan over nothing finds no orphan and passes vacuously');

    const marked = [];
    let scanned = 0;
    for (const root of roots) {
        for (const p of walk(root)) {
            scanned++;
            // Read a bounded prefix: the marker is asserted to be the first thing
            // in the file by the test below, so it is always in the first bytes.
            let head;
            try { head = readFileSync(p, 'utf8'); } catch { continue; }
            if (head.includes(BEGIN)) marked.push(p);
        }
    }

    // SAME RETIREMENT, SAME REPAIR. `marked.length >= 5` was the species-1 defence
    // and became a permanent red when the last marked file left. What must stay
    // non-vacuous is the DETECTOR: an orphan scan whose matcher has stopped
    // matching reports "no orphans" exactly as a clean tree does.
    //
    // The walk's corpus is still asserted -- there must be roots, and they must
    // hold files -- and the matcher is fired at a string that carries a marker
    // and one that does not, which is the pair a single positive case misses.
    assert.ok(roots.length >= 1, 'no vendored root exists at all; the scan had nothing to walk');
    assert.ok(scanned > 50,
        `the marker walk only looked at ${scanned} file(s) across ${roots.length} root(s) -- `
        + 'an orphan scan over an empty tree finds no orphan for the wrong reason');
    assert.ok(`${BEGIN}\n// x\n${END}`.includes(BEGIN),
        'the BEGIN sentinel no longer matches a block that literally contains it');
    assert.ok(!'// an ordinary file header\n'.includes(BEGIN),
        'the BEGIN sentinel matches an UNMARKED file, so every file reads as marked and '
        + 'the orphan list is meaningless');

    const orphans = marked.filter(p => !legitimate.has(p)).map(p => path.relative(ROOT, p)).sort();
    assert.deepEqual(orphans, [],
        '\n  FILES CARRYING A LITE-AUTHORED MARKER THAT THE MANIFEST NO LONGER DECLARES:\n    ' +
        orphans.join('\n    ') +
        '\n\n  The marker says upstream has no copy of this file and a sync cannot restore\n' +
        '  it. If that is no longer true -- the file was upstreamed, renamed, or the entry\n' +
        '  retired -- the block is now false. Remove the marker (delete the delimited block),\n' +
        '  or, if the file really is still lite-authored, add its entry back to\n' +
        '  liteAuthored.files. A marker with no manifest entry is a claim with no author.\n');
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
        // EVERY CATEGORY A MANIFEST CAN DECLARE, not just liteAuthored. Both
        // never-mark names left that one category on 2026-09-11 without leaving
        // the tree: LICENSE became `rootSourced` (upstream's file at a path the
        // comparison could not previously resolve) and .vendor-manifest.json
        // became `generated` (written by the sync, not authored by anyone). They
        // still must never be marked -- prepending to a legal notice alters it,
        // and JSON carries no comment -- so the exclusion is as load-bearing as
        // it ever was. Reading only liteAuthored made this gate conclude the
        // exclusion "protects nothing" about two files it very much protects.
        const spec = JSON.parse(m[1]);
        for (const f of Object.keys(spec.liteAuthored?.files ?? {})) declaredNames.add(path.basename(f));
        for (const f of Object.keys(spec.generated?.files ?? {})) declaredNames.add(path.basename(f));
        for (const f of Object.keys(spec.rootSourced ?? {})) declaredNames.add(path.basename(f));
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
