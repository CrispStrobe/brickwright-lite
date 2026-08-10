// The draggable pane divider turns a pointer position into a stored size, and that
// size back into a flex-basis. Those two conversions have to agree exactly, or the
// boundary lands a little further from the cursor with every frame — which is
// precisely how a split pane feels broken.
//
// This file exists because the first implementation got it wrong in a way that reads
// as correct. It stored a SHARE, competing with the other columns and normalised to a
// percentage, and the arithmetic of that round trip is genuinely exact. The measured
// result was still a 90px boundary move for a 220px drag, because the column also had
// flex-grow: 1 and so rendered at its basis PLUS half the row's free space. The CSS,
// not the arithmetic, was the other half of the conversion.
//
// So what is asserted here is the property that actually matters — a dragged column
// renders at exactly the fraction it was given, and nothing may dilute it — rather
// than the internal consistency of the maths, which was never the thing that broke.
//
// scripts/probe-layout.mjs covers the same feature end to end in Firefox, and is what
// caught the original bug. This covers the arithmetic without needing a build.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    MIN_COLUMN_WIDTH, PANE_SIZES, clampFraction, computePaneStyles, isCollapsed,
    isExplicitFraction, resolveShare
} from '../overlay/scratch-gui/src/lib/pane-sizes.js';

test('a dragged column renders at exactly the fraction it was given', () => {
    for (const wanted of [0.12, 0.25, 0.333, 0.5, 0.75, 0.88]) {
        const style = computePaneStyles('m', 'l', wanted).right;
        assert.equal(style.flexBasis, `${(wanted * 100).toFixed(2)}%`,
            `fraction ${wanted} must render as its own percentage`);
    }
});

test('nothing dilutes a dragged column: flex-grow must be 0', () => {
    // The whole bug. With flex-grow 1 the column takes its basis and then a cut of the
    // row's free space, so the rendered width is not the basis and the divider slides
    // out from under the pointer.
    assert.equal(computePaneStyles('m', 'l', 0.4).right.flexGrow, 0);
    // ...but it must still be allowed to give width back when the window narrows,
    // rather than overflowing the row.
    assert.equal(computePaneStyles('m', 'l', 0.4).right.flexShrink, 1);
});

test('a dragged fraction is independent of what the other columns are', () => {
    // A share is relative to its neighbours; a fraction is not. Changing preset must
    // not move a boundary the user placed by hand.
    for (const [left, middle] of [['xs', 'xl'], ['s', 'm'], ['l', 'l'], ['m', 'xs']]) {
        assert.equal(computePaneStyles(left, middle, 0.4).right.flexBasis, '40.00%',
            `with ${left}/${middle} the dragged fraction must not move`);
    }
});

test('named sizes keep the old share behaviour', () => {
    // Deliberately unchanged: every preset and the default layout were tuned against
    // shares that grow into the free space. Switching them to exact fractions would
    // shrink the stage column by ~270px at 1600px wide for people who never dragged
    // anything. Measured before the divider existed: right column 725px, basis 28.6%.
    const style = computePaneStyles('m', 'l', 'm').right;
    assert.equal(style.flexGrow, 1, 'a named size still grows');
    assert.equal(style.flexBasis, '28.6%', 'and keeps the share arithmetic it had');
});

test('only the xs NAME collapses — a small dragged fraction never does', () => {
    // Dragging narrow must leave a usable column; collapsing stays something the user
    // asks for explicitly, by double-click.
    assert.equal(isCollapsed('xs'), true);
    assert.equal(isCollapsed(0.05), false);

    assert.equal(computePaneStyles('m', 'l', 'xs').right.flexGrow, 0,
        'the collapsed strip must not grow');
    assert.equal(computePaneStyles('m', 'l', 0.15).right.minWidth, `${MIN_COLUMN_WIDTH}px`,
        'a dragged column keeps the declared minimum width');
});

test('clampFraction keeps both columns above the minimum width', () => {
    const row = 1600;
    const limit = MIN_COLUMN_WIDTH / row;

    assert.ok(clampFraction(0.001, row) >= limit, 'dragged to the far edge');
    assert.ok(clampFraction(0.999, row) <= 1 - limit, 'dragged to the near edge');
    assert.equal(clampFraction(0.4, row), 0.4, 'an in-range fraction passes through');
});

test('clampFraction survives a window too narrow for two minimum columns', () => {
    // 200px of row cannot hold two 120px columns, so the min would exceed the max and
    // a naive clamp would return the larger of the two — a column wider than the row.
    const half = clampFraction(0.9, 200);
    assert.ok(half > 0 && half < 1, `got ${half}`);
    assert.equal(half, 0.5);
});

test('a non-finite fraction can never be stored', () => {
    // This value is persisted to localStorage. One NaN would render `flexBasis: NaN%`
    // on every subsequent load, leaving the editor broken with no way back short of
    // clearing site data. Math.max does not filter NaN, so it needs its own check.
    for (const bad of [NaN, Infinity, -Infinity, undefined]) {
        const got = clampFraction(bad, 1600);
        assert.ok(Number.isFinite(got) && got > 0 && got < 1,
            `${String(bad)} produced ${got}`);
    }
    assert.match(computePaneStyles('m', 'l', clampFraction(NaN, 1600)).right.flexBasis,
        /^\d+\.\d\d%$/);
});

test('a corrupt stored size falls back instead of rendering nonsense', () => {
    // Out-of-range numbers are not fractions and must not be treated as one.
    for (const bad of [0, 1, 42, -3, NaN]) {
        assert.equal(isExplicitFraction(bad), false, `${bad} is not a fraction`);
        const style = computePaneStyles('m', 'l', bad).right;
        assert.match(style.flexBasis, /^\d+(\.\d+)?%$/, `${bad} rendered ${style.flexBasis}`);
    }
    assert.equal(resolveShare('nonsense'), PANE_SIZES.m);
    assert.equal(resolveShare(undefined), PANE_SIZES.m);
});
