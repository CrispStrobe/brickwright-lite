import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {pinnedUpstream} from './helpers/pinned-upstream.mjs';
import { applyVendorRewrites, nodeModulesDepth, rewritePairs, DEEP_IMPORT_REWRITES }
    from '../scripts/lib/vendor-rewrites.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OVERLAY = 'overlay/scratch-gui/src/lib/bw-board';
const PACKAGES = 'packages/scratch-gui/src/lib/bw-board';
const PAIR = { repoRoot: ROOT, mirrors: [PACKAGES] };

// THE ONE REWRITE LITE PERMITS, AND ITS DEPTH IS NOW DERIVED. The owner's rule
// is that we hold no divergences except transformations a sync itself performs
// and can compute — "stuff like nested relative links, which we could ALSO
// handle modularly and just not hardcode". `../../../` was the hardcode.

test('the depth is derived, and it reproduces the number that used to be written down', () => {
    assert.equal(nodeModulesDepth(PACKAGES, { repoRoot: ROOT, mirrors: [OVERLAY] }), 3);
    assert.equal(nodeModulesDepth(OVERLAY, PAIR), 3,
        'both mirrors must answer the same, since they have identical shape below their root');
});

test('a deeper vendored root gets MORE ../, which is the whole point', () => {
    // Constructed, not measured off this repo: the hazard the module's own
    // header named was a tree at a different nesting depth getting `../../../`
    // because a table said so. Here it gets four, because it is one deeper.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-depth-'));
    try {
        fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'app', 'package.json'), '{}');
        assert.equal(nodeModulesDepth('app/src/lib/deeper/bw-board', { repoRoot: tmp }), 4);
        assert.equal(nodeModulesDepth('app/src/lib', { repoRoot: tmp }), 2);

        const src = `import x from '../node_modules/rp2040js/dist/esm/cortex-m0-core.js';`;
        assert.match(applyVendorRewrites(src, 'app/src/lib/deeper/bw-board', { repoRoot: tmp }),
            /'\.\.\/\.\.\/\.\.\/\.\.\/node_modules\//,
            'four levels down needs four ../, and a table cannot know that');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('a sync of the real upstream file produces exactly the bytes lite holds', () => {
    // The end-to-end claim, and the only one that proves the derivation is not
    // merely self-consistent. Skipped BY NAME rather than assert.ok(true) when
    // the sibling checkout is absent.
    // THE SKIP SAID "at the pin" AND THE CODE DID NOT CHECK IT. This read
    // BW_BOARD_DIR bare, so any tree -- a peer's feature branch included --
    // decided a byte-identity claim, while the message told the reader the pin
    // had been verified. Resolved through the one shared resolver now, whose
    // `pinned` is the judging predicate.
    const {dir: srcDir, pinned, named, head, pin} = pinnedUpstream('bw-board');
    const upstream = srcDir && path.join(srcDir, 'cortex-m0-machine.js');
    if (!upstream || !fs.existsSync(upstream)) {
        return test.skip('set BW_BOARD_DIR to a bw-board checkout at the pin to judge this');
    }
    if (!pinned) {
        return test.skip(named && head
            ? `BW_BOARD_DIR is at ${head.slice(0, 9)} but the pin is ${String(pin).slice(0, 9)} — `
              + 'a tree off the pin may SPEAK, not JUDGE'
            : `BW_BOARD_DIR unset (a sibling at ${String(head).slice(0, 9)} may SPEAK, not JUDGE) — `
              + `set it to a checkout at ${String(pin).slice(0, 9)}`);
    }
    const produced = applyVendorRewrites(fs.readFileSync(upstream, 'utf8'), OVERLAY, PAIR);
    const vendored = fs.readFileSync(path.join(ROOT, OVERLAY, 'cortex-m0-machine.js'), 'utf8');
    assert.equal(produced, vendored, 'a sync would not reproduce the vendored file');
    assert.match(produced, /'\.\.\/\.\.\/\.\.\/node_modules\/rp2040js\//,
        'and the rewrite must actually have fired — an unchanged file would also be equal '
        + 'if upstream had already carried lite\'s spelling');
});

test('it refuses rather than guessing when the depth is underivable', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-nodepth-'));
    try {
        // No package.json anywhere above the root: a wrong depth would produce a
        // file that imports nothing and a gate that calls it correct, so there
        // is no safe default to fall back to.
        assert.throws(() => nodeModulesDepth('a/b/c', { repoRoot: tmp }), /underivable/);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    assert.throws(() => applyVendorRewrites('text'), /needs the vendored root/,
        'a caller that does not say where the copy lands cannot be answered');
    assert.throws(() => applyVendorRewrites('text', OVERLAY), /needs the vendored root/);
});

test('every entry declares text to find and a destination, and no ../ run', () => {
    // The table may not carry a depth again. `from` holds the upstream text;
    // `reaches` holds what is below the ../ run. An entry that wrote its own
    // ../s would silently win over the derivation.
    assert.ok(DEEP_IMPORT_REWRITES.length > 0, 'an empty table would pass every other case here');
    for (const entry of DEEP_IMPORT_REWRITES) {
        assert.equal(typeof entry.from, 'string');
        assert.equal(typeof entry.reaches, 'string');
        assert.doesNotMatch(entry.reaches, /\.\./,
            `${entry.reaches} carries a ../ run; the depth is derived and must not be written here`);
        assert.match(entry.from, /(['"])(\.\.\/)+/, 'from must contain the ../ run being re-based');
    }
});

test('rewritePairs reports what a given root would produce, for the gates', () => {
    const [pair] = rewritePairs(OVERLAY, PAIR);
    assert.equal(pair[0], DEEP_IMPORT_REWRITES[0].from);
    assert.match(pair[1], /'\.\.\/\.\.\/\.\.\/node_modules\//);
    assert.notEqual(pair[0], pair[1], 'a pair whose sides match describes no transformation');
});
