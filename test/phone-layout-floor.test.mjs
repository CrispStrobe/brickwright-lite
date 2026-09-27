/**
 * The app fits a phone, and desktop keeps the floor it has always had.
 *
 * `playground/index.css` sets `min-width: 1024px` on html, body and .app —
 * upstream's own comment calls it "probably unecessary, transitional until
 * layout is refactored". On a phone it is worse than unnecessary: at a 430pt
 * viewport the LAYOUT viewport becomes 1024 while the VISUAL one stays 430, so
 * the reader gets a zoomed-out desktop to pan around, and every
 * `position: fixed` overlay is pinned to a box wider than the screen.
 *
 * MEASURED against the shipping build, 2026-09-27, at three widths with the
 * media query injected:
 *
 *   phone 430     doc 1024 -> 430   overflow 0
 *   tablet 1032   doc 1032 -> 1032  unchanged
 *   desktop 1440  doc 1440 -> 1440  unchanged
 *
 * This holds the rule to that shape. It is a text check, not a browser one:
 * what can rot silently is the RULE — a breakpoint that creeps above 1024 and
 * starts changing desktop, or the whole block being dropped in a vendor
 * refresh. Whether the page then fits is a browser question and belongs to a
 * browser gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TREES = ['overlay', 'packages'];
const cssOf = tree => readFileSync(
    path.join(ROOT, tree, 'scratch-gui/src/playground/index.css'), 'utf8');

test('both trees relax the width floor below 1024px, and only below', () => {
    for (const tree of TREES) {
        const css = cssOf(tree);
        const m = css.match(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/);
        assert.ok(m, `${tree}: no max-width media query — the phone floor is back`);
        const breakpoint = Number(m[1]);
        assert.ok(breakpoint < 1024,
            `${tree}: the breakpoint is ${breakpoint}px, so it changes desktop too — `
            + 'the point of bounding it was that nothing at or above 1024 moves');
        assert.match(m[2], /min-width:\s*0/, `${tree}: the query does not clear min-width`);
        assert.match(m[2], /min-height:\s*0/, `${tree}: the query does not clear min-height`);
    }
});

test('the desktop floor is still there, outside the query', () => {
    for (const tree of TREES) {
        const css = cssOf(tree);
        const beforeQuery = css.split('@media')[0];
        assert.match(beforeQuery, /min-width:\s*1024px/,
            `${tree}: the unconditional 1024px floor is gone — desktop layout would change`);
    }
});

test('the two trees say the same thing', () => {
    // integrate.mjs copies overlay OVER packages, so a packages-only edit is
    // the dead one. check:mirrors covers this repo-wide; asserting it here too
    // means a failure names THIS file rather than a list of paths.
    assert.equal(cssOf('overlay'), cssOf('packages'),
        'overlay and packages index.css disagree — integrate would discard the packages edit');
});

test('THE RULE CAN FAIL: a creeping breakpoint and a missing query are both caught', () => {
    const bad = '@media (max-width: 1200px) {\n  html { min-width: 0; min-height: 0; }\n}';
    const m = bad.match(/@media\s*\(max-width:\s*(\d+)px\)/);
    assert.equal(Number(m[1]), 1200);
    assert.ok(!(Number(m[1]) < 1024), 'a 1200px breakpoint must not pass the bound above');
    assert.equal('html, body { min-width: 1024px; }'.match(/@media/), null);
});
