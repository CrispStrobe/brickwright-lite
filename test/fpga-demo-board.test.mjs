/**
 * The one-click demo board: the parts and wires must be right, and — the point —
 * an LED it places must actually LIGHT when the pin it hangs on is driven, so a
 * synthesised counter animates it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildDemoBoard, DEMO_LED_PINS} from '../overlay/scratch-gui/src/lib/bw-fpga/demo-board.js';

const {Circuit} = await boot();
const MS = 1_000_000n;

/** A fake circuit that records what buildDemoBoard asks for. */
function recorder () {
    const parts = [];
    const wires = [];
    let n = 0;
    return {
        addPart: (kind, params, x, y) => {
            const id = `${kind}#${n++}`;
            parts.push({id, kind, params, x, y});
            return {id};
        },
        addWire: (idA, ta, idB, tb) => wires.push({idA, ta, idB, tb}),
        parts, wires
    };
}

test('it needs a real circuit handle, and says so', () => {
    assert.throws(() => buildDemoBoard(null), /addPart\/addWire/);
    assert.throws(() => buildDemoBoard({addPart () {}}), /addPart\/addWire/);
});

test('it places one Tang Nano, one ground, and a resistor+LED per pin', () => {
    const c = recorder();
    const out = buildDemoBoard(c);
    const kinds = c.parts.map(p => p.kind);
    assert.equal(kinds.filter(k => k === 'tang_nano_20k').length, 1);
    assert.equal(kinds.filter(k => k === 'gnd').length, 1);
    assert.equal(kinds.filter(k => k === 'resistor').length, DEMO_LED_PINS.length);
    assert.equal(kinds.filter(k => k === 'led').length, DEMO_LED_PINS.length);
    assert.equal(out.leds.length, DEMO_LED_PINS.length);
    // resistors are 330Ω, a real red-LED value at 3.3 V.
    assert.ok(c.parts.filter(p => p.kind === 'resistor').every(p => p.params.ohms === 330));
});

test('no two parts land on the same spot, and LEDs clear the Tang Nano footprint', () => {
    const c = recorder();
    buildDemoBoard(c);
    // every part has a DISTINCT position (the old layout piled them at ~one spot)
    const seen = new Set();
    for (const p of c.parts) {
        const key = `${p.x},${p.y}`;
        assert.ok(!seen.has(key), `two parts share ${key} — they would overlap`);
        seen.add(key);
    }
    // the Tang Nano is 60px wide at the origin; nothing else may sit inside it
    const tang = c.parts.find(p => p.kind === 'tang_nano_20k');
    assert.equal(tang.x, 0);
    for (const p of c.parts) {
        if (p === tang) continue;
        assert.ok(p.x >= 100, `${p.kind} at x=${p.x} overlaps the Tang Nano (0..60)`);
    }
});

test('each LED hangs on the pin the sequence example names: pin -> R -> LED -> gnd', () => {
    const c = recorder();
    const {tang, gnd} = buildDemoBoard(c);
    for (const pin of DEMO_LED_PINS) {
        const toR = c.wires.find(w => w.idA === tang && w.ta === `p${pin}`);
        assert.ok(toR, `pin ${pin} is not wired off the FPGA`);
        assert.equal(toR.tb, 'a', 'the FPGA pin drives the resistor');
        const rToLed = c.wires.find(w => w.idA === toR.idB && w.ta === 'b');
        assert.ok(rToLed && rToLed.tb === 'anode', 'the resistor feeds the LED anode');
        const ledToGnd = c.wires.find(w => w.idA === rToLed.idB && w.ta === 'cathode');
        assert.ok(ledToGnd && ledToGnd.idB === gnd && ledToGnd.tb === 'gnd',
            'the LED cathode returns to ground');
    }
});

test('THE PAYOFF: a demo LED lights when its pin is driven high', () => {
    const c = new Circuit(3.3);
    const {leds} = buildDemoBoard(c);
    const first = leds[0];   // led[0], on pin 15

    // Undriven: dark.
    c.advanceTo(20n * MS);
    assert.ok(c.board.ledBrightness(first.led) < 0.05, 'an undriven LED is dark');

    // Drive pin 15 high, as a synthesised design's led[0]=1 would.
    c.setPin(`p${first.pin}`, 'pushpull', true);
    c.advanceTo(45n * MS);
    const lit = c.board.ledBrightness(first.led);
    assert.ok(lit > 0.1, `pin ${first.pin} high must light led[0], got ${lit}`);
    const mA = -c.board.branchCurrent(first.led, 'anode') * 1000;
    assert.ok(mA > 2 && mA < 6, `${mA.toFixed(2)} mA is not a 330R red LED at 3.3 V`);
});
