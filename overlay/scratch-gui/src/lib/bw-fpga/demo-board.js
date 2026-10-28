// Wire up a demonstration Tang Nano 20K board so the FPGA payoff is one click,
// not a hand-built breadboard.
//
// It builds a CLEAN, self-contained circuit: a breadboard, the Tang Nano beside
// it, and four (resistor → LED → ground) legs SEATED on the breadboard so the
// board's own strips make the connections and the parts actually sit in holes —
// a usable, readable circuit, not a pile of free-floating parts at one spot.
//
// Each LED hangs on FPGA header pin 15..18 — the placement the `sequence`
// example's .cst names — so: press this, load `sequence`, Synthesise, Step the
// clock, and the four LEDs count up in binary on the board.
//
// It builds through the live Circuit's addPart/addWire/seatPart — the same API
// the designer uses — so the result is not a mock: the pins the design drives
// are the pins these LEDs hang on.

/** The pins `sequence` places led[0..3] on. Kept in step with examples.js. */
export const DEMO_LED_PINS = [15, 16, 17, 18];

/**
 * @param {object} circuit  the live Circuit (window.__circuit): addPart(kind,
 *   params, x, y) → {id}, addWire(idA, tA, idB, tB), and — for seating on the
 *   breadboard — seatPart(id, boardId, {terminal: holeId}), removePart(id) and
 *   a `parts` array.
 * @param {{pins?: number[], ohms?: number, clear?: boolean}} [opts]
 * @returns {{board:string, tang:string, gnd:string, leds:Array<{pin,resistor,led}>}}
 */
export function buildDemoBoard (circuit, {pins = DEMO_LED_PINS, inputPins = [], ohms = 330, clear = true} = {}) {
    if (!circuit || typeof circuit.addPart !== 'function' || typeof circuit.addWire !== 'function') {
        throw new TypeError('buildDemoBoard needs a live circuit with addPart/addWire '
            + '(window.__circuit, published by the circuit designer)');
    }
    const canSeat = typeof circuit.seatPart === 'function';

    // Start clean so the demo is deterministic and never lands on top of the
    // default starter circuit's parts (the old bug: everything at one spot).
    if (clear && Array.isArray(circuit.parts) && typeof circuit.removePart === 'function') {
        for (const part of [...circuit.parts]) circuit.removePart(part.id);
    }

    // A breadboard to seat the LEDs on; the Tang Nano and ground sit beside it.
    const board = circuit.addPart('breadboard', {}, 340, 320);
    const tang = circuit.addPart('tang_nano_20k', {}, 60, 140);
    const gnd = circuit.addPart('gnd', {}, 150, 40);
    // Ground the top-minus rail; every LED cathode returns to it.
    if (canSeat) circuit.seatPart(gnd.id, board.id, {gnd: 't-2'});

    const leds = pins.map((pin, i) => {
        const col = 6 + (i * 8); // spread across the board: columns 6, 14, 22, 30
        const resistor = circuit.addPart('resistor', {ohms}, 0, 0);
        const led = circuit.addPart('led', {}, 0, 0);
        if (canSeat) {
            // resistor lies across row b; the LED stands with its anode sharing
            // the resistor's far column (same a–e strip) and its cathode on the
            // ground rail. The board's strips wire R.b→anode and cathode→ground.
            circuit.seatPart(resistor.id, board.id, {a: `b${col}`, b: `b${col + 3}`});
            circuit.seatPart(led.id, board.id, {anode: `a${col + 3}`, cathode: `t-${col + 3}`});
        }
        // The guaranteed electrical chain (independent of seating): the FPGA pin
        // drives the resistor, the resistor the LED, the LED returns to ground.
        circuit.addWire(tang.id, `p${pin}`, resistor.id, 'a');
        circuit.addWire(resistor.id, 'b', led.id, 'anode');
        circuit.addWire(led.id, 'cathode', gnd.id, 'gnd');
        return {pin, resistor: resistor.id, led: led.id};
    });

    // Inputs the design READS get a switch on the breadboard: closed pulls the
    // pin to VCC (1), open lets the pulldown hold it at GND (0). Press one and the
    // FPGA logic responds — the loop runs both ways. VCC feeds the switches.
    const switches = inputPins.length
        ? (() => {
            const vcc = circuit.addPart('vcc', {}, 150, 400);
            return inputPins.map((pin, i) => {
                const col = 6 + (i * 8);
                const sw = circuit.addPart('switch', {}, 0, 0);
                const pull = circuit.addPart('resistor', {ohms: 100000}, 0, 0);
                if (canSeat) {
                    circuit.seatPart(sw.id, board.id, {a: `f${col}`, b: `f${col + 3}`});
                    circuit.seatPart(pull.id, board.id, {a: `g${col + 3}`, b: `t-${col + 3}`});
                }
                // VCC → switch → pin; pin → pulldown → ground. The Tang input pin
                // reads high only while the switch is closed.
                circuit.addWire(vcc.id, 'vcc', sw.id, 'a');
                circuit.addWire(sw.id, 'b', tang.id, `p${pin}`);
                circuit.addWire(sw.id, 'b', pull.id, 'a');
                circuit.addWire(pull.id, 'b', gnd.id, 'gnd');
                return {pin, switch: sw.id, pulldown: pull.id};
            });
        })()
        : [];

    return {board: board.id, tang: tang.id, gnd: gnd.id, leds, switches};
}
