/**
 * The CP/M-system status strings, and the locale they are chosen by.
 *
 * These are the two lines a learner reads while the real CP/M 2.2 boots: the
 * "booting…" phase and the ready sentence that points at the A> prompt. They
 * were English literals inside attachZ80, so a German session watched an
 * English machine start. debug-runner is a pure lib with no props, so the
 * locale comes from its own uiLang() and the table takes it as an argument —
 * the lib/bw-fpga/l10n.js shape.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    t, STRINGS, LOCALES, pickLocale
} from '../overlay/scratch-gui/src/lib/bw-debug/cpm-system-l10n.js';

const KEYS = ['cpm-system.booting', 'cpm-system.ready', 'cpm-system.ready.bbcbasic'];

test('every locale carries every key, and English is the fallback', () => {
    assert.equal(LOCALES[0], 'en', 'English must be first — it is the fallback');
    for (const loc of LOCALES) {
        for (const k of KEYS) {
            assert.ok(STRINGS[loc] && STRINGS[loc][k], `${loc} is missing ${k}`);
        }
        assert.deepEqual(Object.keys(STRINGS[loc]).sort(), [...KEYS].sort(),
            `${loc} does not carry exactly the keys the others do`);
    }
});

test('German is a translation, not a copy', () => {
    for (const k of KEYS) {
        assert.notEqual(t('de', k), t('en', k), `${k} is still English in German`);
    }
    // 'CP/M 2.2', 'DIR', 'A>' and 'BBCBASIC' are names and commands: they must
    // survive translation, because typing the German for DIR does nothing.
    assert.match(t('de', 'cpm-system.ready'), /CP\/M 2\.2/);
    assert.match(t('de', 'cpm-system.ready'), /DIR/);
    assert.match(t('de', 'cpm-system.ready'), /A>/);
    assert.match(t('de', 'cpm-system.ready.bbcbasic'), /BBCBASIC/);
});

test('an unknown locale falls back to English rather than to nothing', () => {
    // uiLang() only ever returns 'en' or 'de' today, but the table is what a
    // third locale would be added to, and a miss must not render empty.
    assert.equal(pickLocale('fr'), 'en');
    assert.equal(pickLocale(undefined), 'en');
    assert.equal(t('fr', 'cpm-system.ready'), t('en', 'cpm-system.ready'));
    assert.equal(t('de-DE', 'cpm-system.ready'), t('de', 'cpm-system.ready'),
        'a regional tag must resolve to its base locale');
    // A key nobody defined must not render as empty text in the status bar.
    assert.ok(String(t('en', 'cpm-system.nope') || '').length > 0);
});
