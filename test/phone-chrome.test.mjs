import test from 'node:test';
import assert from 'node:assert/strict';
import {chromeRule, MENU_H, TABS_H, TAB_H} from '../overlay/scratch-gui/src/lib/phone-chrome.js';

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

test('the saving is real and bounded', () => {
    // 48 + 44 = 92 today. Anything at or above that is not a saving; anything
    // tiny is not worth a stylesheet.
    const total = MENU_H + TABS_H;
    assert.ok(total < 92, `chrome must shrink below 92px, got ${total}`);
    assert.ok(total >= 60, `${total}px would leave no room for a 32px tap target plus borders`);
});
