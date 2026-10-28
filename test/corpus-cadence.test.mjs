/**
 * The serial-cadence forgiveness, proven in both directions.
 *
 * serialCadenceKnown tells the corpus differential that a serial disagreement
 * is cadence drift on a pure-passthrough program, not a defect. A forgiveness
 * that cannot cry wolf is worth less than a comparator that sometimes does, so
 * these tests exist to show it still fails a genuine value error AFTER the
 * forgiveness, and does not forgive the adversarial same-values-but-real case.
 *
 * Pure functions over synthetic traces — no network, no compile.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { serialCadenceKnown, KNOWN_SERIAL_CADENCE } from '../scripts/corpus-cadence.mjs';

const P14 = 'arduino-sk-p14-serial-pot';
const HORIZON = 1000;
// A serial stream: `values` spread evenly to the horizon at the given gap.
const stream = (values, gap) => ({
    horizon: HORIZON,
    serial: values.map((line, i) => ({ tMs: i * gap, line }))
});
// Referee: 10 lines, 31 then 870, cadence 100ms, last at 900 (+100 gap reaches 1000).
const refPot = stream(['31', '31', '31', '31', '31', '870', '870', '870', '870', '870'], 100);
// Device: fewer lines (slower), same readings, still printing at the horizon.
const devPotSlower = stream(['31', '31', '31', '870', '870', '870', '870'], 150);
const SERIAL_VALUE = [{ kind: 'value', text: 'serial 5: "31" vs "870"' }];
const SERIAL_COUNT = [{ kind: 'count', text: 'serial count: referee 10 vs actual 7' }];

test('cadence is forgiven: listed passthrough, same readings, both ran to the horizon', () => {
    assert.equal(serialCadenceKnown(P14, SERIAL_VALUE, refPot, devPotSlower), true,
        'a slower device that printed the same set of readings and ran to the horizon is WHEN, not WHAT');
    assert.equal(serialCadenceKnown(P14, SERIAL_COUNT, refPot, devPotSlower), true,
        'the smaller line COUNT of a slower passthrough that ran to the horizon is cadence too');
});

test('a real value error still fails AFTER the forgiveness: a reading the referee never produced', () => {
    // The device prints 999 — a value the pot never read. A wrong scaling or a
    // wrong pin would look like this, and it must NOT be forgiven.
    const devWrong = stream(['31', '31', '31', '870', '999', '870', '870'], 150);
    assert.equal(serialCadenceKnown(P14, SERIAL_VALUE, refPot, devWrong), false,
        'a value on either side the other never produced is a real divergence');
});

test('a missing reading is not forgiven: the device never reached the hi endpoint', () => {
    const devStuck = stream(['31', '31', '31', '31', '31', '31'], 150);
    assert.equal(serialCadenceKnown(P14, SERIAL_VALUE, refPot, devStuck), false,
        'the device printed only {31} where the referee printed {31,870} — a real disagreement');
});

test('an early stop is not forgiven: same readings but the device quit well before the horizon', () => {
    // Same set {31,870}, but the last line is at 300ms of a 1000ms horizon with
    // a 150ms cadence — a whole run short. A crash or hang looks exactly like
    // this and must fail, which is why the count gap alone is not enough.
    const devCrashed = stream(['31', '870'], 150);
    assert.equal(serialCadenceKnown(P14, SERIAL_COUNT, refPot, devCrashed), false,
        'a stream that stopped a whole run short of the horizon did not merely run slower');
});

test('the adversarial case is not forgiven: a logic-bearing program is not on the list', () => {
    // `if button: print 870 else print 31` whose transition fires on the wrong
    // line due to a REAL bug produces the same set {31,870} on streams that both
    // reach the horizon — indistinguishable from cadence by any value/count
    // test. The list is what protects against it: only pure passthroughs are on
    // it, so this program is not forgiven.
    assert.equal(serialCadenceKnown('some-button-branch-program', SERIAL_VALUE, refPot, devPotSlower), false,
        'benignity is derived from the PROGRAM being a passthrough; an unlisted program is never forgiven');
    assert.equal(KNOWN_SERIAL_CADENCE.has('some-button-branch-program'), false);
});

test('nothing to forgive: no serial value/count finding returns false', () => {
    assert.equal(serialCadenceKnown(P14, [{ kind: 'level', text: 'led[0]: referee 1@700, actual 0@700' }], refPot, devPotSlower), false,
        'a level (or any non-serial) finding is not this function’s to forgive');
    assert.equal(serialCadenceKnown(P14, [], refPot, devPotSlower), false);
});
