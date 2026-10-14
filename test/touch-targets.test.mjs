import test from 'node:test';
import assert from 'node:assert/strict';
import {
    wantsTouchTargets, ruleFor, COARSE_QUERY, FLOOR_PX,
} from '../overlay/scratch-gui/src/lib/touch-targets.js';

/** A stand-in for matchMedia that answers one query. */
const mm = (query, matches) => q => ({matches: q === query && matches});

test('a finger asks for bigger targets; a mouse does not', () => {
    assert.equal(wantsTouchTargets(mm(COARSE_QUERY, true)), true);
    assert.equal(wantsTouchTargets(mm(COARSE_QUERY, false)), false);
});

test('the signal is the POINTER, not the width — the case that got this wrong', () => {
    // Measured: a phone in landscape reports effective width 930 and coarse. A
    // width threshold of 700 therefore leaves its controls at ~18pt on screen
    // while still being touched with a finger. And a 600px-wide DESKTOP window
    // reports fine, so a width rule would floor controls for a mouse that needs
    // no help. Both are why this asks about the pointer.
    assert.equal(COARSE_QUERY, '(pointer: coarse)');
    assert.ok(!/width/.test(COARSE_QUERY), 'the query must not mention width');
});

test('no matchMedia at all is treated as a mouse, not as a phone', () => {
    // Failing open here would restyle every control in an environment we cannot
    // measure — worse than leaving it alone.
    assert.equal(wantsTouchTargets(null), false);
    assert.equal(wantsTouchTargets(() => { throw new Error('unsupported query'); }), false);
});

test('the rule sets ONLY the two properties the panes leave unset', () => {
    // The load-bearing claim: those panes style every control inline, so a rule
    // touching padding or font-size would lose, and one touching anything else
    // would fight a style its author chose. Comments are stripped first — prose
    // in a /* */ block contains colons too, and the first version of this test
    // read "Height still applies:" as a property.
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

test('the rule carries no speculative escape hatch', () => {
    // An earlier version shipped a `[data-bw-dense]` opt-out that dropped the
    // width floor for crowded rows. Nothing ever set that attribute, so the
    // selector was dead, and the measurement it was insuring against — a width
    // floor pushing content off the pane — never happened: scrollWidth stayed
    // at 1024 on every tab at every floor tried. Add it back when a real row
    // needs it, with the row that needs it.
    const css = ruleFor(FLOOR_PX);
    assert.ok(!/data-bw-/.test(css.replace(/data-bw-touch/g, '')),
        'no attribute hooks beyond the one flag that arms the rule');
    assert.equal(css.split('{').length - 1, 1, 'exactly one rule block');
});

test('the floor is 32, and 44 is excluded on purpose', () => {
    // 44 is the accessibility standard and was measured to make the Circuit
    // tab's "Analog" control land under an svg, untappable at its centre
    // (covered centres 17 -> 18, against 17 -> 17 at 32). An unreachable 44px
    // control is worse than a reachable 32px one. Guard the decision, not just
    // the digit.
    assert.equal(FLOOR_PX, 32);
    assert.match(ruleFor(37), /min-height: 37px/, 'the floor is parameterised');
});

test('the floor clears the gate\'s hard limit with room to spare', () => {
    // verify-tap-targets.mjs fails anything under 24. A floor at or below that
    // would let the gate pass while changing nothing.
    assert.ok(FLOOR_PX > 24);
});
