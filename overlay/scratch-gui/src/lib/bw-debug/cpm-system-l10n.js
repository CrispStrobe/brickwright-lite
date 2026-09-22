/**
 * The status strings the real CP/M 2.2 boot shows, in one place.
 *
 * When a machine whose profile is 'cpm-system' attaches, debug-runner boots
 * DRI's CCP+BDOS on our MIT BIOS and stocks drive A: (see attachZ80). The two
 * lines it puts in the status bar — the "booting…" phase and the "ready"
 * sentence that points the reader at the A> prompt — used to be English
 * literals in that logic, so they read English in a German session.
 *
 * debug-runner is a pure lib with no props to read a locale from; like
 * lib/bw-fpga/l10n.js this is a shared table taking a locale argument, so the
 * caller passes its own `uiLang()` and English is the fallback when given
 * nothing. Adding a locale means adding one key and translating.
 *
 * @module
 */

import {pickLocale as basePickLocale, makeT} from '../bw-i18n.js';

/** Locales this module carries, English first — it is the fallback. */
export const LOCALES = Object.freeze(['en', 'de']);

const TABLE = {
    en: {
        'cpm-system.booting': 'booting CP/M 2.2…',
        'cpm-system.ready': 'CP/M 2.2 — DIR at the A> prompt',
        // The optional tail when BBC BASIC is stocked on drive A:.
        'cpm-system.ready.bbcbasic': ', or run BBCBASIC'
    },
    de: {
        'cpm-system.booting': 'CP/M 2.2 wird gestartet…',
        'cpm-system.ready': 'CP/M 2.2 — DIR am A>-Prompt',
        'cpm-system.ready.bbcbasic': ', oder BBCBASIC ausführen'
    }
};

export const STRINGS = Object.freeze(TABLE);

/** The locale to use for `loc`, falling back to English. */
export const pickLocale = loc => basePickLocale(loc, TABLE);

/**
 * Look up `key` and fill in `{placeholders}` from `vars`. See lib/bw-i18n.js
 * for the fallback rules; this is that machinery bound to the table above.
 */
export const t = makeT(TABLE);
