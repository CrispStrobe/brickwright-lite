import test from 'node:test';
import assert from 'node:assert/strict';
import {chromeRule, MENU_H, TABS_H, TAB_H, TABS_RIGHT, EDITOR_MIN} from '../overlay/scratch-gui/src/lib/phone-chrome.js';

test('the rule is inert until the touch flag is set', () => {
    // Same flag as the tap-target floor, so the two cannot disagree about
    // whether a screen is a touch screen.
    const css = chromeRule().replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = css.split('{').slice(0, -1)
        .map(chunk => chunk.split('\n').filter(Boolean).pop().trim())
        .filter(Boolean);
    assert.ok(selectors.length >= 3);
    for (const sel of selectors) {
        assert.ok(sel.startsWith('html[data-bw-touch]'),
            `every selector must be gated on the flag; "${sel}" is not`);
    }
});

test('class names are matched by substring, because CSS Modules rewrites them', () => {
    // `menu-bar_menu-bar` becomes `menu-bar_menu-bar_x2Jqi` at build time. An
    // exact-name selector would match nothing and fail silently — which has
    // already happened once in this repo, on `.app`.
    const css = chromeRule();
    for (const name of ['menu-bar_menu-bar', 'gui_menu-bar-position', 'gui_tab-list']) {
        assert.match(css, new RegExp(`\\[class\\*="${name}"\\]`),
            `${name} must be matched by substring`);
    }
});

test('shrinking the row does not shrink the thing you tap', () => {
    // The tap-target floor is 32. A tab shorter than that would be a regression
    // dressed as a space saving.
    assert.ok(TAB_H >= 32, `tab height ${TAB_H} must stay at or above the 32px floor`);
    assert.ok(TABS_H >= TAB_H, 'the strip cannot be shorter than its tabs');
});

test('the tab strip is FIXED, not absolute — the distinction is load-bearing', () => {
    // An absolutely positioned strip is clipped by an ancestor's overflow the
    // moment it leaves its parent's box, and measured 0 of 6 tabs clickable.
    // A fixed box is positioned against the viewport and escapes that clipping.
    // If someone "simplifies" this to absolute, the tabs go dead silently.
    const css = chromeRule();
    const tabList = css.slice(css.indexOf('gui_tab-list'));
    assert.match(tabList, /position:\s*fixed/,
        'the tab strip must be fixed; absolute is clipped away and unclickable');
    assert.ok(!/position:\s*absolute/.test(tabList));
    assert.match(tabList, new RegExp(`right:\\s*${TABS_RIGHT}px`));
});

test('the tab strip outranks the menu bar it now sits in', () => {
    // The menu bar is z-index 491 and a sibling in the root stacking context.
    // Anything at or below that paints under it.
    const css = chromeRule();
    const z = Number((css.match(/z-index:\s*(\d+)/) || [])[1]);
    assert.ok(z > 491, `z-index must beat the menu bar's 491, got ${z}`);
});

test('the chrome is now ONE row, and bounded', () => {
    // 48 + 44 = 92 before any of this. The tab strip is fixed, so it costs no
    // flow height at all and the chrome IS the menu bar: 36px, measured.
    assert.ok(MENU_H < 48, `the menu row must shrink below 48px, got ${MENU_H}`);
    assert.ok(MENU_H >= TABS_H, `a ${TABS_H}px strip cannot sit inside a ${MENU_H}px row`);
    assert.ok(MENU_H < 92, 'the whole chrome must beat the two-row 92px it replaces');
});

test('the editor column is allowed to shrink, with a floor', () => {
    // Upstream gives it `flex: 1 0 598px` — grow freely, NEVER shrink — which on
    // a 1024 layout starves the pane beside it: the debugger collapsed to its
    // 120px min-width and overflowed the layout. The rule must enable shrink
    // (the middle number) AND keep a floor, or the designer gets crushed
    // instead. Both halves are load-bearing, so both are asserted.
    const css = chromeRule();
    const block = css.slice(css.indexOf('gui_editor-wrapper'));
    assert.match(block, new RegExp('flex:\\s*1\\s+1\\s+' + EDITOR_MIN + 'px'),
        'shrink must be 1; `1 0` is the upstream value that caused this');
    assert.match(block, new RegExp('min-width:\\s*' + EDITOR_MIN + 'px'),
        'and a floor, so shrinking cannot crush the designer');
    assert.ok(EDITOR_MIN > 400, `${EDITOR_MIN}px would not hold the designer`);
});

test('the chrome rule set stays scoped to the touch flag as it grows', () => {
    // Four rules now. Every one must still be gated, or a desktop inherits a
    // phone's layout.
    const css = chromeRule().replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = css.split('{').slice(0, -1)
        .map(chunk => chunk.split('\n').filter(Boolean).pop().trim())
        .filter(Boolean);
    assert.ok(selectors.length >= 4, `expected at least 4 selectors, got ${selectors.length}`);
    for (const sel of selectors) {
        assert.ok(sel.startsWith('html[data-bw-touch]'), `"${sel}" is not gated on the flag`);
    }
});
