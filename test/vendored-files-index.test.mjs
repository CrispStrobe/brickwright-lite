/**
 * THE VENDORED-FILE INDEX IS CURRENT, AND IT MIRRORS THE MANIFESTS.
 *
 * docs/generated/VENDORED-FILES.md answers "is this file vendored, and from
 * where" for every vendored file -- the half of the marking problem that cannot
 * be solved inside the files themselves, because a header in a VENDORED file
 * makes it differ from upstream and test/vendor-identity.test.mjs asserts byte
 * equality against upstream at the pin.
 *
 * A generated document that nothing regenerates is a document that was true
 * once. This asserts the committed file is EXACTLY what the generator produces
 * from vendor-pins.json and the two divergence manifests, so the index cannot
 * drift from what it describes -- the same standard the marker gate holds, and
 * the reason neither is hand-maintained.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, OUT, TREES, render } from '../scripts/gen-vendored-files.mjs';

test('the index is exactly what the generator produces today', async t => {
    const committed = readFileSync(path.join(ROOT, OUT), 'utf8');
    const fresh = await render();
    assert.equal(committed, fresh,
        `\n  ${OUT} IS STALE.\n\n` +
        '  A vendored file was added, removed, re-pinned, or its manifest entry changed,\n' +
        '  and the index still describes the tree as it was. Run:\n' +
        '    node scripts/gen-vendored-files.mjs\n' +
        '  and commit the result. Do not edit the file: the manifests and vendor-pins.json\n' +
        '  are the authority and this mirrors them.\n');
    t.diagnostic(`${OUT}: ${fresh.split('\n').filter(l => l.startsWith('- `')).length} vendored file(s) indexed`);
});

test('the index names every tree, its pin, and its manifest', () => {
    // Species 1 in its usual place: an index of nothing is current too. This
    // fails if a tree stops being listed -- which is how a whole vendored root
    // would quietly leave the document while it stayed "in sync".
    const md = readFileSync(path.join(ROOT, OUT), 'utf8');
    const pins = JSON.parse(readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));
    assert.ok(TREES.length >= 2, 'fewer than two vendored trees are indexed');
    for (const { repo, doc } of TREES) {
        assert.match(md, new RegExp(`^## ${repo}$`, 'm'), `${repo} has no section in the index`);
        assert.ok(md.includes(pins[repo]),
            `${repo}'s section does not carry the sha from vendor-pins.json -- an index that ` +
            'names a tree without saying which commit is describing nothing in particular');
        assert.ok(md.includes(doc), `${repo}'s section does not point at its manifest`);
    }
});

test('every entry the index flags is flagged BY a manifest, not by hand', async () => {
    // The flags are the only judgement in the file, so they are the only thing
    // that could become a second opinion. Re-derive them and compare: a
    // `[declared]` that no manifest declares would be this document asserting a
    // divergence on its own authority.
    const md = readFileSync(path.join(ROOT, OUT), 'utf8');
    const flagged = [...md.matchAll(/^- `([^`]+)` `\[(lite|declared|generated)\]`$/gm)].map(m => [m[1], m[2]]);
    // THE FLOOR THAT RETIRES ITSELF -- the fifth of these found in one afternoon,
    // and the pattern is the point. `flagged.length > 0` was a correct species-1
    // defence while divergences existed; the moment every one of them was
    // upstreamed it became a permanent red demanding that the tree be dirty.
    //
    // The matcher is proved against a fabricated index instead, and the real
    // index is then allowed to flag nothing. A tag that stopped being emitted and
    // a tree with nothing to tag produce the same empty list, and only the
    // fixture tells them apart.
    const FABRICATED = [
        '- `fab-a.js` `[lite]`',
        '- `fab-b.js` `[declared]`',
        '- `fab-c.json` `[generated]`',
        '- `fab-plain.js`'
    ].join('\n');
    const probe = [...FABRICATED.matchAll(/^- `([^`]+)` `\[(lite|declared|generated)\]`$/gm)]
        .map(m => `${m[1]}:${m[2]}`);
    assert.deepEqual(probe, ['fab-a.js:lite', 'fab-b.js:declared', 'fab-c.json:generated'],
        'the flag matcher no longer reads the index line shape this generator writes, so it '
        + 'finds nothing whatever the index says -- and an empty flag list is exactly what a '
        + 'clean tree produces. It also must NOT match the untagged line, or every plain '
        + 'vendored file would read as flagged.');

    const expected = new Map();
    for (const { doc } of TREES) {
        const spec = JSON.parse(readFileSync(path.join(ROOT, doc), 'utf8')
            .match(/```json\n([\s\S]*?)\n```/)[1]);
        for (const f of [...Object.keys(spec.files || {}), ...(spec.lineLevelOnly?.files ?? [])]) expected.set(f, 'declared');
        for (const f of Object.keys(spec.liteAuthored?.files ?? {})) expected.set(f, 'lite');
        for (const f of Object.keys(spec.generated?.files ?? {})) expected.set(f, 'generated');
    }

    // BOTH DIRECTIONS. The loop below catches an index flag no manifest supports;
    // this catches a manifest entry the index silently stopped showing, which is
    // how `.vendor-manifest.json` vanished from the index the day it was moved
    // from `liteAuthored` to `generated`.
    const indexed = new Set(flagged.map(([f]) => f));
    const unlisted = [...expected.keys()].filter(f => !indexed.has(f)).sort();
    assert.deepEqual(unlisted, [],
        `a manifest declares ${unlisted.join(', ')} but the index flags nothing for it. The `
        + 'index is where someone looks to find what is in a vendored tree that upstream '
        + 'cannot restore; a declared file missing from it is invisible exactly there.');
    for (const [file, tag] of flagged) {
        assert.equal(expected.get(file), tag,
            `${file} is flagged [${tag}] in the index but the manifests say ` +
            `${expected.get(file) ? `[${expected.get(file)}]` : 'nothing about it'}`);
    }
});
