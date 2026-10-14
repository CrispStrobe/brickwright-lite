// SPDX-License-Identifier: Apache-2.0
//
// No bundled extension may quietly differ from the upstream file it claims.
//
// WHAT THIS IS FOR
// ----------------
// On 2026-09-20 an audit compared all 22 bundles against CrispStrobe/extensions
// and found five carrying changes that had never gone up:
//
//   arrays              nine extra blocks (an entire table-display feature)
//   lego_poweredup      a Scratch Link endpoint without which that connection
//   legoboost_universal   type could never connect inside the app
//   ev3_universal       lint directives
//   legonxt_...         lint directives
//
// Every one had a reason visible in its own comments. Nobody was careless. The
// step that was missing each time was the one that sends the change up, and
// nothing was watching — so five accumulated, and the largest of them (the five
// SPIKE extensions that were one hub) took a day to unpick.
//
// They were reclaimed and the count reached zero. This is what keeps it there,
// because a count measured once decays: nobody noticed the first five either.
//
// WHY IT RUNS OFFLINE
// -------------------
// Against sha256s recorded by scripts/spike/vendor-bundles.mjs from
// the immutable sha-addressed raw URLs. A gate that fetches can answer
// differently on two runs, and one that passes quietly when the network is down
// is worse than no gate at all.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {
    ROOT, MAP, LITE_ONLY, ALLOWED_DIVERGENCE, UPSTREAM_COMMIT,
    bundleIds, bundleSource, bundlePath, sha256
} from '../scripts/spike/bundled-upstream.mjs';

const pins = JSON.parse(readFileSync(
    resolve(ROOT, 'overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json'), 'utf8'));

const ids = bundleIds(readdirSync);

test('the recorded pins are for the commit the map names', () => {
    // Regenerating for a new commit but leaving the map pointing at the old one
    // would compare this tree against something nobody chose.
    assert.equal(pins.commit, UPSTREAM_COMMIT,
        'bundled-upstream-pins.json and bundled-upstream.mjs disagree about the commit — ' +
        'run: node scripts/spike/vendor-bundles.mjs');
    assert.match(pins.commit, /^[0-9a-f]{40}$/, 'the pin must be a full sha');
});

test('every bundle is classified — upstream, Lite-only, or neither', () => {
    // The clause that makes the rest binding. A new extension cannot arrive
    // unclassified and slip past: saying "this one is ours" is cheap, saying it
    // by accident is exactly what went wrong before.
    const unclassified = ids.filter(id => !MAP[id] && !LITE_ONLY[id]);
    assert.deepEqual(unclassified, [],
        'these bundles claim no upstream file and are not declared Lite-only — ' +
        'add them to MAP or LITE_ONLY in scripts/spike/bundled-upstream.mjs');
});

test('the map and the Lite-only list name bundles that exist', () => {
    const present = new Set(ids);
    assert.deepEqual(Object.keys(MAP).filter(id => !present.has(id)), [],
        'MAP names a bundle that is not in the tree');
    assert.deepEqual(Object.keys(LITE_ONLY).filter(id => !present.has(id)), [],
        'LITE_ONLY names a bundle that is not in the tree');
    const both = Object.keys(MAP).filter(id => LITE_ONLY[id]);
    assert.deepEqual(both, [], 'a bundle cannot be both vendored and Lite-only');
});

test('every mapped bundle has a pin', () => {
    const missing = Object.keys(MAP).filter(id => !pins.files[id]);
    assert.deepEqual(missing, [],
        'run: node scripts/spike/vendor-bundles.mjs');
});

test('every mapped bundle is byte-identical to its upstream file', () => {
    // The gate. A difference here is a fork, whatever its intent.
    const diverged = [];
    for (const [id, path] of Object.entries(MAP)) {
        if (ALLOWED_DIVERGENCE[id]) continue;
        const source = bundleSource(id);
        if (source === null) {
            diverged.push(`${id}: not a makeExt bundle, so it cannot be compared to ${path}`);
            continue;
        }
        const actual = sha256(source);
        if (actual !== pins.files[id].sha256) {
            // Both sizes in UTF-8. A JavaScript string's .length counts UTF-16
            // code units, which reads as a difference of hundreds of bytes on
            // files full of emoji and em-dashes even when they are identical.
            diverged.push(
                `${id} != ${path}\n      bundled  ${actual} (${Buffer.byteLength(source, 'utf8')} B)` +
                `\n      upstream ${pins.files[id].sha256} (${pins.files[id].bytes} B)`);
        }
    }
    assert.deepEqual(diverged, [],
        '\n  A BUNDLED EXTENSION HAS DIVERGED FROM UPSTREAM:\n    ' +
        `${diverged.join('\n    ')}\n\n` +
        '  Send the change up to CrispStrobe/extensions, then move UPSTREAM_COMMIT and\n' +
        '  regenerate the pins. If it genuinely belongs downstream only, say so in\n' +
        '  ALLOWED_DIVERGENCE with a reason — in review, which is the whole difference\n' +
        '  between this and the five forks that arrived unannounced.\n');
});

test('an allowed divergence must carry a reason', () => {
    for (const [id, reason] of Object.entries(ALLOWED_DIVERGENCE)) {
        assert.ok(MAP[id], `${id} is listed as diverging from an upstream file it does not claim`);
        assert.ok(typeof reason === 'string' && reason.length > 30,
            `${id}'s divergence needs a reason someone can weigh, not a placeholder`);
    }
});

test('a Lite-only declaration must carry a reason', () => {
    for (const [id, reason] of Object.entries(LITE_ONLY)) {
        assert.ok(typeof reason === 'string' && reason.length > 20,
            `${id} is declared Lite-only without saying why`);
    }
});

// ---------------------------------------------------------------- mutation

test('the gate fails on a planted divergence', () => {
    // Without this, tightening the comparison to silence a false positive is
    // indistinguishable from deleting it. Every clause above is a claim about
    // this repository; this one is a claim about the gate.
    const id = Object.keys(MAP)[0];
    const real = bundleSource(id);
    assert.ok(real, `${id} should be a makeExt bundle`);

    const tampered = `${real}\n// a downstream fix nobody sent up\n`;
    assert.notEqual(sha256(tampered), pins.files[id].sha256,
        'appending a line must change the hash, or the comparison is not comparing');

    // And the real one must still match, so the check above is not passing
    // merely because everything mismatches.
    assert.equal(sha256(real), pins.files[id].sha256,
        `${id} should match its pin before tampering`);
});

test('the pins describe real files at a plausible size', () => {
    // A truncated fetch that still wrote a hash would make the gate compare
    // this tree against an empty string and pass nothing but itself.
    for (const [id, entry] of Object.entries(pins.files)) {
        assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${id} has no usable hash`);
        assert.ok(entry.bytes > 1000, `${id} recorded only ${entry.bytes} bytes — a truncated fetch?`);
        assert.match(entry.path, /^[\w./-]+\.js$/, `${id} has an odd upstream path`);
        // A bundle from somewhere other than CrispStrobe/extensions must say
        // where, and at which commit. Without this an entry could quietly
        // change repository and the pin would still look like the pin.
        if (entry.repo || entry.commit) {
            assert.match(entry.repo || '', /^[\w-]+\/[\w.-]+$/, `${id} names an odd repo`);
            assert.match(entry.commit || '', /^[0-9a-f]{40}$/, `${id}'s repo pin is not a full sha`);
        } else {
            assert.match(entry.path, /^extensions\/CrispStrobe\//,
                `${id} claims CrispStrobe/extensions but its path is not in it`);
        }
    }
});

test('the generated pin file is not hand-edited into agreement', () => {
    const raw = readFileSync(
        resolve(ROOT, 'overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json'), 'utf8');
    assert.match(raw, /GENERATED by scripts\/spike\/vendor-bundles\.mjs/,
        'the pin file lost its generated banner');
});

test('a bundle that is not a makeExt wrapper is Lite-only, not silently skipped', () => {
    // The Lite-native extensions are ordinary CommonJS modules rather than
    // wrapped strings. That is fine — but it must be the declared reason they
    // are not compared, not an accident of the unwrapper returning null.
    for (const id of ids) {
        if (!MAP[id]) continue;
        assert.notEqual(bundleSource(id), null,
            `${id} claims ${MAP[id]} but is not a makeExt bundle, so nothing was compared`);
    }
    assert.ok(readFileSync(bundlePath(ids[0]), 'utf8').length > 0);
});

test('a bundle vendored from another repository is pinned there, not here', () => {
    // controller comes from the bw-board package rather than
    // CrispStrobe/extensions. Its pin must be the sha vendor-pins.json already
    // records for that package — two records of one fact that can disagree is
    // exactly the shape this whole gate exists to prevent.
    const vendorPins = JSON.parse(readFileSync(resolve(ROOT, 'vendor-pins.json'), 'utf8'));
    for (const [id, entry] of Object.entries(MAP)) {
        if (typeof entry === 'string') continue;
        const recorded = pins.files[id];
        assert.ok(recorded, `${id} has no pin`);
        assert.equal(recorded.commit, vendorPins[entry.pin],
            `${id} is pinned at a different sha than vendor-pins.json["${entry.pin}"]`);
        assert.equal(recorded.repo, entry.repo);
    }
});
