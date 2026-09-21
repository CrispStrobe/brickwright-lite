/**
 * A sync must leave the copy webpack compiles current — and touch nothing else.
 *
 * THE DEFECT THIS HOLDS. `0eb9a6a74` synced the sb3-creator emitter into
 * overlay/ and did not run `npm run integrate`, so
 * packages/scratch-gui/src/lib/sb3-creator.js kept the pre-bump bytes:
 *
 *     git show 0eb9a6a74:packages/scratch-gui/src/lib/sb3-creator.js \
 *       | grep -c escapeTextLiteral      ->  0
 *
 * A commit titled "Pin sb3-creator past the literal that corrupted itself on
 * every save" shipped a build that still corrupted the literal. Every identity
 * gate stayed green, because they compare the OVERLAY against upstream and the
 * overlay was correct. `overlay-packages-pairs` caught it, but only in CI and
 * only after the merge.
 *
 * This is a unit test on purpose. The sync itself needs a local sb3-creator
 * checkout, and CI sets no SB3_CREATOR_DIR, so a checkout-gated test would skip
 * in exactly the place the defect reached — a holder that holds nothing. The
 * step is therefore its own function over injected fs, and this drives it
 * directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mirrorIntoPackages } from '../scripts/lib/mirror-pairs.mjs';

/** In-memory fs: a plain path -> contents map. */
const fsOf = (files) => ({
    store: files,
    readFile: async (p) => {
        if (!(p in files)) throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'});
        return files[p];
    },
    writeFile: async (p, v) => { files[p] = v; },
});

test('a stale mirror is brought up to the bytes the sync just wrote', async () => {
    const files = {
        '/o/sb3-creator.js': 'NEW with escapeTextLiteral',
        '/p/sb3-creator.js': 'OLD pre-bump bytes',
    };
    const fs = fsOf(files);
    const {copied} = await mirrorIntoPackages(['/o/sb3-creator.js'], '/p', fs);
    assert.deepEqual(copied, ['sb3-creator.js']);
    assert.equal(files['/p/sb3-creator.js'], 'NEW with escapeTextLiteral',
        'the build copy must carry what the sync wrote, or the app runs the old compiler');
});

test('a file OUTSIDE the sync\'s own list is never touched', async () => {
    // The blast-radius property, and the reason this is not `npm run integrate`:
    // another session's in-flight overlay edit must not be swept into the mirror
    // by someone else running a sync.
    const files = {
        '/o/sb3-creator.js': 'NEW',
        '/p/sb3-creator.js': 'OLD',
        '/o/ble-diagnostics.js': 'another session, mid-edit',
        '/p/ble-diagnostics.js': 'committed bytes',
    };
    const fs = fsOf(files);
    const {copied} = await mirrorIntoPackages(['/o/sb3-creator.js'], '/p', fs);
    assert.deepEqual(copied, ['sb3-creator.js']);
    assert.equal(files['/p/ble-diagnostics.js'], 'committed bytes',
        'a sync mirrored a file it did not write — it is integrate, with integrate\'s blast radius');
});

test('an already-current mirror is a no-op, so a re-run is quiet', async () => {
    const files = {'/o/a.js': 'same', '/p/a.js': 'same'};
    const fs = fsOf(files);
    assert.deepEqual((await mirrorIntoPackages(['/o/a.js'], '/p', fs)).copied, [],
        'reporting a copy it did not make would make every re-run look like a change');
});

test('a target that does not exist yet is created, not skipped past', async () => {
    // Every path handed here is one the caller just wrote, so a missing mirror
    // is a mirror that has not caught up — integrate would create it. Skipping
    // instead was the SILENT-SKIP the shape audit caught in the first draft,
    // and it would have left a newly vendored file out of the build entirely.
    const files = {'/o/newly-vendored.js': 'x'};
    const fs = fsOf(files);
    const {copied} = await mirrorIntoPackages(['/o/newly-vendored.js'], '/p', fs);
    assert.deepEqual(copied, ['newly-vendored.js']);
    assert.equal(files['/p/newly-vendored.js'], 'x');
});

test('an unreadable source is REPORTED, never dropped and never mirrored as absence', async () => {
    const files = {'/p/a.js': 'committed bytes'};
    const fs = fsOf(files);
    const {copied, unreadable} = await mirrorIntoPackages(['/o/a.js'], '/p', fs);
    assert.deepEqual(copied, []);
    assert.deepEqual(unreadable, ['a.js'],
        'a file this sync could not read must reach the caller — dropping it silently is how '
        + 'the build keeps the old compiler while the run reports success');
    assert.equal(files['/p/a.js'], 'committed bytes',
        'an unreadable source must not be mirrored as absence');
});
