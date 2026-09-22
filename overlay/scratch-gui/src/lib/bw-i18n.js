/**
 * The translation mechanism, once, for components that are not scratch-gui's.
 *
 * There are three ways a string gets translated in this tree, and knowing which
 * to reach for is most of the problem:
 *
 *   1. `react-intl` (`defineMessages` + `intl.formatMessage`) — scratch-gui's
 *      own components, e.g. stage-header. Their strings go through
 *      scratch-l10n and the upstream translation pipeline. Do NOT move those
 *      into a local table; you would cut them off from their translators.
 *   2. A local table in the component, read with the locale from the redux
 *      store (`state.locales.locale`). This is the norm for the tw-pseudocode
 *      panes, which are ours and are not in scratch-l10n.
 *   3. A shared table for a whole feature — see lib/bw-fpga/l10n.js, which is
 *      (2) for a set of modules that have no props at all.
 *
 * This module is the machinery behind (2) and (3): locale selection, key
 * lookup with an English fallback, and `{placeholder}` interpolation. Before
 * it, every component carried its own copy of `pickLocale` and its own
 * interpolation, which is how they drifted — some fell back to English, some
 * rendered `undefined`, most interpolated by template literal and so could not
 * be translated at all.
 *
 * @module
 */

/**
 * The locale to use for `loc` given a table, falling back to English.
 * Accepts a regional tag: 'de-CH' finds 'de'.
 */
export const pickLocale = (loc, table) => {
    const two = String(loc || '').slice(0, 2).toLowerCase();
    return (table && table[two]) ? two : 'en';
};

/** Fill `{placeholders}` from `vars`, leaving unknown ones visible. */
export const interpolate = (template, vars) => (vars
    ? String(template).replace(/\{(\w+)\}/g, (whole, name) =>
        (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole))
    : String(template));

/**
 * A lookup bound to one table: `t(locale, key, vars)`.
 *
 * A missing key falls back to English rather than rendering blank — one English
 * sentence in a German page is a translation bug; an empty page is a broken
 * one. The key itself is the last resort, so a typo shows up in testing rather
 * than silently disappearing.
 */
export function makeT (table) {
    return (locale, key, vars) => {
        const lang = pickLocale(locale, table);
        const template = (table[lang] && table[lang][key]) ||
            (table.en && table.en[key]) || key;
        return interpolate(template, vars);
    };
}

/**
 * A count-aware lookup bound to one table: picks `<key>.one` or `<key>.other`.
 *
 * There is no plural SUFFIX anywhere, deliberately. Appending an English "s" to
 * a shared template renders "4 Eingangskombinations" in German — the bug that
 * makes a translation look finished while reading as nonsense. Plural forms
 * belong to the language, so each locale writes both out in full.
 */
export function makeTn (table) {
    const t = makeT(table);
    return (locale, key, n, vars) => t(locale, `${key}.${n === 1 ? 'one' : 'other'}`, {n, ...vars});
}
