// Selectors we reach into upstream with must still match something.
//
// The Circuit tab's full-width mode hides the stage column by injecting
//
//     html[data-bw-hide-stage] div[class*="stage-and-target-wrapper"] { display: none }
//
// It targets a *substring* of a CSS-module class name because the built name is
// hashed. That works, and it is invisible when it stops working: upstream
// renames the class, the attribute is still set, the rule matches nothing, and
// the option silently does nothing. No error, no warning, a checkbox that lies.
//
// This is the same failure family as everything else this campaign found —
// a dependency that is real, unstated, and fails quietly. So it is stated here.
//
// Asserted as the property: the class our selector needs exists in the
// stylesheet it comes from. Not "the CSS file is present", which would pass
// after a rename.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

/**
 * Each entry: a class name our code matches on, and the upstream stylesheet
 * that must define it. Add a row whenever code reaches into upstream markup
 * by name — the point is that the reach is written down somewhere a test reads.
 */
const REACHES = [
    {
        selector: 'stage-and-target-wrapper',
        css: 'packages/scratch-gui/src/components/gui/gui.css',
        why: 'Circuit tab full-width mode hides the stage column by matching this ' +
             'class substring (circuit-tab.jsx injects the rule). If upstream renames ' +
             'it, the option stops working with no error.'
    }
];

const integrated = existsSync(resolve(repo, 'packages/scratch-gui/src'));
const skip = integrated ? false : 'run `npm run integrate` first';

for (const r of REACHES) {
    test(`upstream still defines .${r.selector}`, {skip}, () => {
        const p = resolve(repo, r.css);
        assert.ok(existsSync(p), `${r.css} is missing — the reach cannot be checked`);
        const css = readFileSync(p, 'utf8');
        assert.ok(css.includes(`.${r.selector}`),
            `.${r.selector} is not in ${r.css}.\n\n${r.why}\n\n` +
            `Either upstream renamed it — in which case find the new name and update ` +
            `BOTH the injected rule and this row — or the file moved.`);
    });
}

test('every reach states why it exists', {skip}, () => {
    // A row with no reason becomes undeletable: nobody later can tell whether
    // it still matters. Same rule as the ALLOWED/KNOWN_DEAD lists.
    for (const r of REACHES) {
        assert.ok(r.why && r.why.length > 30,
            `${r.selector} is listed with no real reason`);
    }
});

test('the injected rule and this list agree', {skip}, () => {
    // The list is only useful if it covers what the code actually does. If
    // someone adds a second injected selector and forgets a row here, this
    // catches it — derived from the source, not maintained by hand.
    const tab = resolve(repo,
        'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
    const src = readFileSync(tab, 'utf8');
    const used = [...src.matchAll(/class\*=\\?"([a-z0-9-]+)\\?"/g)].map((m) => m[1]);
    const listed = new Set(REACHES.map((r) => r.selector));
    const missing = used.filter((u) => !listed.has(u));
    assert.deepEqual(missing, [],
        `circuit-tab.jsx matches upstream classes that this list does not cover: ` +
        `${missing.join(', ')}. Add a row so a rename fails here instead of silently.`);
    assert.ok(used.length > 0,
        'found no class*= selectors in circuit-tab.jsx — if the full-width mode was ' +
        'removed, delete this file; if the pattern changed, update the regex, because ' +
        'a check that finds nothing to check is not passing, it is blind');
});
