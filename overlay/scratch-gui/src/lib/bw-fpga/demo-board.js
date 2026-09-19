// Wire up a demonstration Tang Nano 20K board so the FPGA payoff is one click,
// not a hand-built breadboard.
//
// It places the FPGA and four LEDs (each through a 330Ω resistor to ground) on
// header pins 15-18 — the EXACT placement the `sequence` example's .cst names.
// So: press this, load `sequence`, Synthesise, and Step the clock, and these
// four LEDs count up in binary on the board.
//
// It builds through the live Circuit model's addPart/addWire — the same API
// fpga-gate-level-sim's "THE LOOP" test builds a working, drivable board with, so
// the result is not a mock: the pins the design drives are the pins these LEDs
// hang on. positions are left near the origin like the gallery circuits (the
// breadboard lays parts out itself); a small spread keeps them from colliding.

/** The pins `sequence` places led[0..3] on. Kept in step with examples.js. */
export const DEMO_LED_PINS = [15, 16, 17, 18];

/**
 * @param {{addPart: Function, addWire: Function}} circuit  the live Circuit
 *   (window.__circuit) — bw-circuit-ui's model with addPart(kind, params, x, y)
 *   returning {id} and addWire(idA, terminalA, idB, terminalB).
 * @param {{pins?: number[], ohms?: number}} [opts]
 * @returns {{tang: string, gnd: string, leds: Array<{pin, resistor, led}>}}
 */
export function buildDemoBoard (circuit, {pins = DEMO_LED_PINS, ohms = 330} = {}) {
    if (!circuit || typeof circuit.addPart !== 'function' || typeof circuit.addWire !== 'function') {
        throw new TypeError('buildDemoBoard needs a live circuit with addPart/addWire '
            + '(window.__circuit, published by the circuit designer)');
    }
    // Positions are WORLD PIXELS (part.x = x in circuit.js), and the Tang Nano is
    // 60 x 210 px at the origin. The old layout put every LED/resistor at x=3..12
    // — INSIDE that footprint, 3 px apart — so the whole board piled onto one spot.
    // Spread the four LED columns to the RIGHT of the board, each with its resistor
    // above and LED below, and drop ground clear underneath.
    const tang = circuit.addPart('tang_nano_20k', {}, 0, 0);
    const COL0 = 120;
    const COL_GAP = 110;
    const gnd = circuit.addPart('gnd', {}, COL0, 260);
    const leds = pins.map((pin, i) => {
        const x = COL0 + (i * COL_GAP);
        const resistor = circuit.addPart('resistor', {ohms}, x, 40);
        const led = circuit.addPart('led', {}, x, 130);
        // FPGA header pin -> resistor -> LED anode; LED cathode -> ground.
        circuit.addWire(tang.id, `p${pin}`, resistor.id, 'a');
        circuit.addWire(resistor.id, 'b', led.id, 'anode');
        circuit.addWire(led.id, 'cathode', gnd.id, 'gnd');
        return {pin, resistor: resistor.id, led: led.id};
    });
    return {tang: tang.id, gnd: gnd.id, leds};
}
