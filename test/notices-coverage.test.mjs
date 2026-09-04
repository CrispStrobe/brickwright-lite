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
        text: 'overlay/scratch-gui/static/licenses/scratch-link.BSD-3-Clause.txt',
    },
    {
        name: 'Scrub',
        licence: 'BSD-3-Clause',
        holder: 'Shinichiro Oba',
        evidence: 'apps/tauri/src-tauri/plugins/scratchlink-original/ios/Sources/PerfectWebSockets/Shim.swift',
        inBinary: true,
        text: 'overlay/scratch-gui/static/licenses/scrub.BSD-3-Clause.txt',
    },
    {
        name: 'labwired',
        // The first version of this file said `holder: null` here, which is
        // precisely the hole: MIT requires the copyright AND permission notice
        // to accompany substantial portions, so an SPDX id alone satisfies
        // nothing. A blocking review caught it. There is no null case now.
        licence: 'MIT',
        holder: 'Andrii Shylenko',
        evidence: 'scripts/sync-labwired-wasm.mjs',
        inBinary: true,
        text: 'overlay/scratch-gui/static/licenses/labwired-core.MIT.txt',
    },
    {
        // Not a library: six source FILES from someone else's repository,
        // compiled into the bundle as strings. A lockfile cannot see them and
        // neither can a dependency audit, which is exactly the category this
        // list exists for.
        name: '8086 example programs',
        licence: 'MIT',
        holder: 'Amey Thakur and Mega Satish',
        evidence: 'overlay/scratch-gui/src/lib/bw-asm/examples-i8086.js',
        inBinary: true,
        text: 'overlay/scratch-gui/static/licenses/amey-thakur-8086.MIT.txt',
    },
    {
        name: 'rp2040js',
        licence: 'MIT',
        holder: 'Uri Shaked',
        evidence: 'packages/scratch-gui/src/lib/bw-board/rp2040js-debug.js',
        inBinary: false,
        text: null,
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
        assert.match(NOTICES, new RegExp(v.holder),
            `${v.name}: the copyright holder must be named — BSD-3 clause 2 and MIT both ` +
            'ask for the notice, not the SPDX id. There is deliberately no opt-out here.');
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

test('the full licence text SHIPS for anything inside the binary', () => {
    // The heart of the blocking review that produced this test's second draft:
    // BSD-3 clause 2 and MIT both require the notice, the conditions and the
    // disclaimer to accompany the distribution. A summary paragraph plus a
    // GitHub hyperlink accompanies nothing — it needs a network, a browser and
    // a tap. These files are served from static/, so they are in the web build
    // and inside the IPA, and they open with the device in flight mode.
    for (const v of VENDORED.filter(x => x.inBinary)) {
        assert.ok(existsSync(path.join(ROOT, v.text)),
            `${v.name} ships in the binary but its licence text does not: ${v.text}`);
        const text = read(v.text);
        assert.match(text, new RegExp(v.holder), `${v.text} must carry the copyright line`);
        // The disclaimer is the part people drop when retyping a licence.
        assert.match(text, /WARRANT/i, `${v.text} must carry the warranty disclaimer`);
        if (v.licence === 'BSD-3-Clause') {
            assert.match(text, /Neither the name/,
                `${v.text}: all THREE BSD conditions must be present, not two`);
        }
        if (v.licence === 'MIT') {
            assert.match(text, /without restriction/,
                `${v.text}: the MIT permission notice itself must be present`);
        }
        assert.match(ABOUT, new RegExp(v.text.replace('overlay/scratch-gui/', '').replace(/\./g, '\\.')),
            `${v.name}: the bundled text must be reachable from the About dialog`);
    }
});
