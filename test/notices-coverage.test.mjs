/**
 * Everything we SHIP is named in the notices, and the ones inside the binary
 * are named in the app itself.
 *
 * THE DEFECT THIS GATES
 * ---------------------
 * Two dependencies were vendored into this repo and shipped in the iOS binary —
 * the Scratch Foundation's scratch-link (BSD-3) and labwired-core (MIT) — and
 * neither reached THIRD-PARTY-NOTICES.md. rp2040js, which runs every Pico and
 * the light STM32 tier, had never been listed at all.
 *
 * The Rust list is generated from `cargo metadata` and the npm packages come
 * from a lockfile, so both are self-maintaining. The gap is exactly the things
 * NO package manager tracks: a vendored source tree, a fetched wasm blob. Those
 * are the ones a person has to remember, which is why they are the ones that
 * get forgotten.
 *
 * BSD-3 clause 2 is not a formality here: distributing a binary requires
 * reproducing the copyright notice in the materials that go with it. A link to
 * GitHub needs a network and a browser; the About dialog does not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

const NOTICES = read('THIRD-PARTY-NOTICES.md');
const ABOUT = read('overlay/scratch-gui/src/components/menu-bar/bw-about.jsx');

/**
 * Things that ship and that no lockfile knows about. Each names the evidence
 * that it really is shipped, so a future reader can check rather than trust.
 */
const VENDORED = [
    {
        name: 'scratch-link',
        licence: 'BSD-3-Clause',
        holder: 'Scratch Foundation',
        evidence: 'apps/tauri/src-tauri/vendor/scratch-link-swift/LICENSE',
        inBinary: true,
    },
    {
        name: 'labwired',
        licence: 'MIT',
        holder: null,
        evidence: 'scripts/sync-labwired-wasm.mjs',
        inBinary: true,
    },
    {
        name: 'rp2040js',
        licence: 'MIT',
        holder: null,
        evidence: 'packages/scratch-gui/src/lib/bw-board/rp2040js-debug.js',
        inBinary: false,
    },
];

test('every vendored dependency is still actually shipped', () => {
    // If one stops shipping, its notice should go too — an over-broad notice
    // claiming we carry code we do not is its own kind of wrong.
    for (const v of VENDORED) {
        assert.ok(existsSync(path.join(ROOT, v.evidence)),
            `${v.name}: ${v.evidence} is gone — is it still shipped? Update this list.`);
    }
});

test('each is named in THIRD-PARTY-NOTICES.md with its licence', () => {
    for (const v of VENDORED) {
        assert.match(NOTICES, new RegExp(v.name, 'i'), `${v.name} is not in the notices`);
        assert.match(NOTICES, new RegExp(v.licence.replace('-', '.?')),
            `${v.name}'s licence (${v.licence}) is not stated`);
        if (v.holder) {
            assert.match(NOTICES, new RegExp(v.holder),
                `${v.name}: the copyright holder must be named — BSD-3 clause 2 asks for the notice, not the SPDX id`);
        }
    }
});

test('what ships INSIDE the binary is named in the app, not only behind a link', () => {
    // The notices link goes to GitHub. On a phone with no network, in an app
    // review, or for anyone who simply does not tap it, that is not a notice.
    for (const v of VENDORED.filter(x => x.inBinary)) {
        assert.match(ABOUT, new RegExp(v.name.replace('-', '.?'), 'i'),
            `${v.name} ships in the binary and is not named in the About dialog`);
    }
    assert.match(ABOUT, /Scratch Foundation/,
        'the BSD-3 copyright holder must appear in the app itself');
});

test('the acknowledgement exists in both languages', () => {
    // A German user gets the German dialog; an untranslated key renders as the
    // English fallback at best and an empty paragraph at worst.
    const keys = (ABOUT.match(/thanksText:/g) || []).length;
    assert.equal(keys, 2, `thanksText is defined ${keys} time(s); expected en + de`);
    assert.match(ABOUT, /\{t\('thanksText'\)\}/, 'and it must actually be rendered');
});
