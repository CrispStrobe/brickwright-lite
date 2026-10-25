/**
 * Overlays ask where the SCREEN is, not where the page is.
 *
 * `position: fixed` is fixed to the layout viewport. Normally that is the
 * screen and none of this matters. Not here: the page is floored at 1024px
 * wide (upstream's minimum, load-bearing for the editor chrome), so on a 430pt
 * phone the layout viewport is 1024 while the visual one is 430 — and a modal
 * with `inset: 0` centres at x=512, off the side of the screen.
 *
 * Measured on the shipping build at 430pt: layout 1024x2225, visual 430x930.
 * That is why the Machine Manager's import button could not be reached on iOS.
 *
 * The pure core is tested here; whether the modal then lands on screen is a
 * browser question and is asserted by scripts/verify-phone-modal.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {boxFrom, isPanned, overlayStyleFor} from
    '../overlay/scratch-gui/src/lib/visual-viewport.js';

test('a phone reports the visible box, not the page', () => {
    const vv = {offsetLeft: 0, offsetTop: 0, width: 430, height: 930};
    assert.deepEqual(boxFrom(vv, {innerWidth: 1024, innerHeight: 2225}),
        {left: 0, top: 0, width: 430, height: 930});
});

test('a panned page moves the box with the reader', () => {
    // Pan right and the visible box starts further into the layout viewport.
    const vv = {offsetLeft: 300, offsetTop: 40, width: 430, height: 930};
    assert.deepEqual(boxFrom(vv), {left: 300, top: 40, width: 430, height: 930});
});

test('without a VisualViewport the layout viewport IS the answer', () => {
    // Older engines: the two boxes cannot differ, so reporting the window is
    // correct rather than a degraded guess.
    assert.deepEqual(boxFrom(null, {innerWidth: 1280, innerHeight: 800}),
        {left: 0, top: 0, width: 1280, height: 800});
    assert.deepEqual(boxFrom(undefined, {innerWidth: 0, innerHeight: 0}),
        {left: 0, top: 0, width: 0, height: 0});
    // A malformed object is not trusted into the layout.
    assert.deepEqual(boxFrom({width: 'wide'}, {innerWidth: 900, innerHeight: 600}),
        {left: 0, top: 0, width: 900, height: 600});
});

test('DESKTOP IS UNTOUCHED: same box means the ordinary inset:0', () => {
    // This is the half that keeps the change safe. Where the screen and the
    // page agree — every desktop — the overlay must behave exactly as before,
    // or a fix for phones becomes a regression for everyone else.
    const box = {left: 0, top: 0, width: 1440, height: 900};
    assert.equal(isPanned(box, 1440), false);
    assert.deepEqual(overlayStyleFor(box, 1440), {position: 'fixed', inset: 0});
    // A rounding-sized difference is not a pan.
    assert.equal(isPanned({left: 0, top: 0, width: 1437, height: 900}, 1440), false);
});

test('a phone gets an overlay the size of the screen, placed where it is', () => {
    const box = {left: 300, top: 40, width: 430, height: 930};
    assert.deepEqual(overlayStyleFor(box, 1024),
        {position: 'fixed', left: 300, top: 40, width: 430, height: 930});
    assert.equal(isPanned(box, 1024), true);
});

test('THE RULE CAN FAIL: a modal centred in 1024 misses a 430 screen', () => {
    // The arithmetic of the actual bug, so the reason survives the fix.
    const layout = 1024, screen = 430;
    const modalWidth = Math.min(680, layout * 0.92);
    const insetZeroLeft = (layout - modalWidth) / 2;         // centred in the PAGE
    assert.ok(insetZeroLeft + modalWidth > screen,
        'the whole modal would have fitted on screen, so there was no bug to fix');
    const fixed = overlayStyleFor({left: 0, top: 0, width: screen, height: 930}, layout);
    assert.equal(fixed.width, screen, 'the overlay must be the width of the screen');
});
