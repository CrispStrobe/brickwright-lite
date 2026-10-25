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
    const seats = [];
    let n = 0;
    return {
        addPart: (kind, params, x, y) => {
            const id = `${kind}#${n++}`;
            parts.push({id, kind, params: params || {}, x, y});
            return {id};
        },
        addWire: (idA, ta, idB, tb) => wires.push({idA, ta, idB, tb}),
        removePart: id => { const i = parts.findIndex(p => p.id === id); if (i >= 0) parts.splice(i, 1); return i >= 0; },
        seatPart: (id, boardId, leadMap) => { seats.push({id, boardId, leadMap}); return true; },
        parts, wires, seats
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

test('parts are SEATED on the breadboard, each lead in its own hole', () => {
    const c = recorder();
    const {board} = buildDemoBoard(c);
    assert.ok(c.parts.some(p => p.kind === 'breadboard'), 'a breadboard is added to seat on');
    // every resistor and LED is seated (the old bug: free-floating parts piled at one spot)
    const seatedIds = new Set(c.seats.map(s => s.id));
    for (const p of c.parts.filter(x => x.kind === 'resistor' || x.kind === 'led')) {
        assert.ok(seatedIds.has(p.id), `${p.kind} ${p.id} must be seated on the breadboard`);
    }
    assert.ok(c.seats.every(s => s.boardId === board), 'seated on the demo breadboard');
    // no two leads share a hole
    const holes = c.seats.flatMap(s => Object.values(s.leadMap));
    assert.equal(holes.length, new Set(holes).size, 'no two leads occupy the same hole');
});

test('it starts from a clean canvas, clearing any default circuit first', () => {
    const c = recorder();
    c.addPart('vsource', {}, 0, 0);
    c.addPart('led', {}, 0, 0); // a pre-existing starter circuit
    buildDemoBoard(c);
    assert.ok(!c.parts.some(p => p.kind === 'vsource'), 'the default parts are cleared');
    assert.equal(c.parts.filter(p => p.kind === 'tang_nano_20k').length, 1, 'exactly one Tang Nano');
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
