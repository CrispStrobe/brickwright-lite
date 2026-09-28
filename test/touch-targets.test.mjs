import test from 'node:test';
import assert from 'node:assert/strict';
import {
    effectiveWidth, isTouchWidth, ruleFor, NARROW_PX, FLOOR_PX,
} from '../overlay/scratch-gui/src/lib/touch-targets.js';

test('a phone reads as touch-width despite the 1024 layout', () => {
    // The whole point: innerWidth is 1024 on a 430pt phone, so the layout
    // width alone can never answer this.
    const w = effectiveWidth({width: 1024, height: 2215, scale: 430 / 1024}, 1024);
    assert.ok(Math.abs(w - 430) < 1, `expected ~430, got ${w}`);
    assert.equal(isTouchWidth(w), true);
    assert.equal(isTouchWidth(1024), false, 'the layout width must NOT trip it');
});

test('a tablet and a desktop do not', () => {
    assert.equal(isTouchWidth(effectiveWidth({width: 1024, scale: 834 / 1024}, 1024)), false);
    assert.equal(isTouchWidth(effectiveWidth({width: 1440, scale: 1}, 1440)), false);
});

test('a missing or degenerate box falls back instead of reporting zero', () => {
    assert.equal(effectiveWidth(null, 1440), 1440);
    assert.equal(effectiveWidth({width: 0, scale: 1}, 1440), 1440);
    assert.equal(effectiveWidth({width: 1024, scale: 0}, 1024), 1024, 'scale 0 treated as 1');
    assert.equal(isTouchWidth(0), false, 'an unknown width is not a touch screen');
});

test('the rule sets ONLY the two properties the panes leave unset', () => {
    // This is the load-bearing claim: those panes style every control inline,
    // so a rule touching padding or font-size would lose, and a rule touching
    // anything else would fight a style the author chose on purpose.
    // Strip comments first — prose in a /* */ block contains colons too, and
    // the first version of this test read "Height still applies:" as a property.
    const css = ruleFor(FLOOR_PX).replace(/\/\*[\s\S]*?\*\//g, '');
    const props = [...css.matchAll(/^\s*([a-z-]+)\s*:/gm)].map(m => m[1]);
    assert.deepEqual([...new Set(props)].sort(), ['min-height', 'min-width']);
});

test('the rule is inert until the html flag is set', () => {
    const css = ruleFor(FLOOR_PX);
    const selectors = css.split('{')[0].split(',').map(s => s.trim()).filter(Boolean);
    assert.ok(selectors.length > 0);
    for (const sel of selectors) {
        assert.ok(sel.startsWith('html[data-bw-touch]'),
            `every selector must be gated on the flag; "${sel}" is not`);
    }
});

test('a dense row keeps its width, and only its width', () => {
    const css = ruleFor(FLOOR_PX);
    const dense = css.slice(css.indexOf('data-bw-dense'));
    assert.match(dense, /min-width:\s*0/);
    assert.ok(!/min-height/.test(dense),
        'height must still be floored in a dense row — a 16px-tall button is the harder miss');
});

test('the floor is a CSS-pixel floor, not a 44pt one', () => {
    // 44 CSS px shows as 18.5pt at the 0.42 a phone renders this app at, so a
    // "44" here would be a claim the code cannot make good on. Guard the
    // reasoning, not just the number.
    assert.ok(FLOOR_PX >= 24 && FLOOR_PX <= 48);
    assert.match(ruleFor(37), /min-height: 37px/, 'the floor is parameterised');
    assert.ok(NARROW_PX > 430 && NARROW_PX < 1024);
});
