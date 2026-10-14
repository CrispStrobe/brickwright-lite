// Every game's touch hint, in both languages.
//
// These were 46 English literals inside PROFILES — invisible to the i18n guard
// until #306 widened it, and listed there as the population to shrink. A
// German-speaking player got German menus and English play instructions.
//
// What is asserted is coverage and correspondence, not prose: every game the
// module knows has a hint in EVERY locale, they differ (a German entry copied
// from English is the failure that looks finished), and the button names stay
// as printed on the buttons.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {gameTouchProfileFor} from '../overlay/scratch-gui/src/lib/game-touch-controls.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/game-touch-controls.js'), 'utf8');
const GAMES = [...SRC.matchAll(/^\s{4}(\w+):\s*\{/gm)].map(m => m[1]);
const LOCALES = ['en', 'de'];

test('the scan found the games it is about to reason over', () => {
    assert.ok(GAMES.length >= 40, `only ${GAMES.length} game profiles parsed — the rest means nothing`);
});

test('every game has a hint in every locale, and they are not the same string', () => {
    const missing = [];
    const untranslated = [];
    for (const game of GAMES) {
        const byLocale = LOCALES.map(l => gameTouchProfileFor(game, l).hint);
        byLocale.forEach((h, i) => { if (!h || !h.trim()) missing.push(`${game}/${LOCALES[i]}`); });
        if (byLocale[0] === byLocale[1]) untranslated.push(game);
    }
    assert.deepEqual(missing, [], `game(s) with no hint: ${missing.join(', ')}`);
    assert.deepEqual(untranslated, [],
        'German hint identical to English — a copied entry reads as finished and is not: '
        + untranslated.join(', '));
});

test('an unknown game still gets a hint, in the right language', () => {
    assert.match(gameTouchProfileFor('no-such-game', 'de').hint, /Touchpad/);
    assert.match(gameTouchProfileFor('no-such-game', 'en').hint, /touch pad/);
    assert.equal(gameTouchProfileFor(null, 'de'), null, 'no game, no profile');
});

test('an absent locale falls back to English rather than rendering nothing', () => {
    // One English sentence in a German page is a translation bug; an empty
    // hint is a broken one.
    const h = gameTouchProfileFor('g2048').hint;
    assert.ok(h && h.trim().length > 0);
    assert.equal(h, gameTouchProfileFor('g2048', 'en').hint);
});

test('BUTTON NAMES STAY AS PRINTED, so a hint names the key the player can see', () => {
    // sky_skim's buttons say DIVE and FLAP; its German hint must say so too,
    // or the instruction points at a control that is not on screen.
    const de = gameTouchProfileFor('sky_skim', 'de');
    assert.match(de.hint, /\bDIVE\b/);
    assert.match(de.hint, /\bFLAP\b/);
    assert.equal(de.downLabel, 'DIVE');
    assert.equal(de.upLabel, 'FLAP');
});

test('no hint literal is left in the profile data', () => {
    // The whole point: the ratchet entry in i18n-no-hardcoded-strings is gone,
    // and it can only stay gone if the literals do.
    const profiles = SRC.slice(SRC.indexOf('const PROFILES'), SRC.indexOf('export const gameTouchProfileFor'));
    assert.equal(/hint:\s*'/.test(profiles), false, 'a hint literal is back in PROFILES');
});
