/**
 * Output devices — the far end of a circuit, where bits become something you can
 * SEE. An FPGA drives LEDs and seven-segment displays off its pins; this module
 * is the honest logic behind those: the hex font a seven-segment shows, and a
 * real 4→7 DECODER (a gate model, built by the tested truth-table synthesiser)
 * that turns a 4-bit number into the seven segment-drive signals.
 *
 * Because the decoder is a plain gate model it synthesises to Verilog and
 * simulates in the live evaluator like anything hand-built — and it is proved
 * exhaustively (each of the 16 inputs lights exactly the font's segments).
 *
 * Pure and framework-free; unit-tested against the font (the oracle).
 *
 * @module
 */
import {synthesizeTruthTable, truthTableFrom} from './synthesize.js';

/** The seven segments, in the conventional order.
 *
 *      aaa
 *     f   b
 *     f   b
 *      ggg
 *     e   c
 *     e   c
 *      ddd
 */
export const SEGMENTS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g']);

// Which segments are lit for each hex digit 0–F (common-cathode: 1 = lit). The
// classic seven-segment hex font — the oracle every decoder must reproduce.
const F = (...on) => Object.freeze(Object.fromEntries(SEGMENTS.map(s => [s, on.includes(s) ? 1 : 0])));
export const SEG7_FONT = Object.freeze([
    F('a', 'b', 'c', 'd', 'e', 'f'),      // 0
    F('b', 'c'),                          // 1
    F('a', 'b', 'g', 'e', 'd'),           // 2
    F('a', 'b', 'g', 'c', 'd'),           // 3
    F('f', 'g', 'b', 'c'),                // 4
    F('a', 'f', 'g', 'c', 'd'),           // 5
    F('a', 'f', 'g', 'e', 'd', 'c'),      // 6
    F('a', 'b', 'c'),                     // 7
    F('a', 'b', 'c', 'd', 'e', 'f', 'g'), // 8
    F('a', 'b', 'c', 'd', 'f', 'g'),      // 9
    F('a', 'b', 'c', 'e', 'f', 'g'),      // A
    F('c', 'd', 'e', 'f', 'g'),           // b
    F('a', 'd', 'e', 'f'),                // C
    F('b', 'c', 'd', 'e', 'g'),           // d
    F('a', 'd', 'e', 'f', 'g'),           // E
    F('a', 'e', 'f', 'g')                 // F
]);

/** The lit segments for a 4-bit value, as {a..g}→0|1. Values outside 0–15 wrap. */
export function decodeSeg7 (value) {
    return SEG7_FONT[((value % 16) + 16) % 16];
}

// The decoder's ports: four input bits (LSB-first) and seven segment outputs.
const DIN = ['d0', 'd1', 'd2', 'd3'];
const SEG_OUT = SEGMENTS.map(s => `seg_${s}`);

/**
 * A 4→7 seven-segment decoder as a synthesisable gate model: inputs d0..d3 (d0
 * is the LSB), outputs seg_a..seg_g. Built by the truth-table synthesiser from
 * SEG7_FONT, so it is sum-of-products gates — droppable, synthesisable, live.
 *
 * @returns {{nodes: Array, edges: Array}}
 */
export function sevenSegDecoderModel () {
    const table = truthTableFrom(DIN, SEG_OUT, row => {
        const value = DIN.reduce((acc, nm, i) => acc | (row[nm] << i), 0);
        const font = SEG7_FONT[value];
        return Object.fromEntries(SEGMENTS.map(s => [`seg_${s}`, font[s]]));
    });
    return synthesizeTruthTable(table, {minimize: true});
}

/** Palette/builtin descriptor (same shape as builtins.js) for the decoder. */
export const SEVEN_SEG_DECODER = Object.freeze({
    id: 'seg7_decoder',
    label: '7-seg decoder (4→7)',
    blurb: 'A 4-bit number in (d0–d3), seven segment-drive signals out (seg_a–seg_g) — the classic hex font, as gates.',
    get model () { return sevenSegDecoderModel(); }
});

// The seven segment polygons, on a 0..100 × 0..160 grid. Each is drawn lit or
// dim; together they are the display's FACE — shared by the canvas device node
// and the widgets-panel display, so a "3" looks the same wherever it shows.
const H = (x, y) => `${x},${y} ${x + 10},${y - 8} ${x + 60},${y - 8} ${x + 70},${y} ${x + 60},${y + 8} ${x + 10},${y + 8}`;
const V = (x, y) => `${x},${y} ${x + 8},${y - 10} ${x + 8},${y - 60} ${x},${y - 70} ${x - 8},${y - 60} ${x - 8},${y - 10}`;
const SEG_POLY = {
    a: H(15, 20), g: H(15, 80), d: H(15, 140),
    f: V(15, 78), b: V(85, 78), e: V(15, 138), c: V(85, 138)
};

/**
 * An SVG string for a seven-segment display. Pass a 4-bit value (decoded via the
 * font) or a {a..g}→0|1 segment map (drive the segments directly). Lit segments
 * take `onColor`, dim ones `offColor`. Pure — runs in Node and the browser.
 *
 * @param {number|Object} input  a 0–15 value, or a segment map
 * @param {{onColor?:string, offColor?:string}} [opts]
 * @returns {string} SVG markup (a `<g>` of seven polygons)
 */
export function sevenSegSvg (input, {onColor = '#16a34a', offColor = '#e2e8f0'} = {}) {
    const seg = (typeof input === 'number') ? decodeSeg7(input) : (input || {});
    const polys = SEGMENTS.map(s =>
        `<polygon class="bw-seg bw-seg-${s}" data-on="${seg[s] ? 1 : 0}" points="${SEG_POLY[s]}" fill="${seg[s] ? onColor : offColor}" />`
    ).join('');
    return `<g class="bw-sevenseg">${polys}</g>`;
}

/** Display devices are viewing INSTRUMENTS, not logic: they sink a signal to
 *  show it and emit no HDL, so the bridge drops them from the synthesised model
 *  (but the nets that drive them remain, so the live evaluator still has them). */
export const DISPLAY_KINDS = Object.freeze(new Set(['seg7', 'led']));

/** The 4-bit value driving a seven-segment device, read from the live values on
 *  its d0..d3 inputs (unconnected/unknown bits read 0). React-Flow-edge shape. */
export function seg7Value (nodeId, rfEdges, values) {
    let v = 0;
    for (let i = 0; i < 4; i++) {
        const e = (rfEdges || []).find(x => x.target === nodeId && x.targetHandle === `d${i}`);
        if (e && values[e.source] === 1) v |= (1 << i);
    }
    return v;
}

/** The bit driving an LED device (undefined if nothing drives it / unknown). */
export function ledValue (nodeId, rfEdges, values) {
    const e = (rfEdges || []).find(x => x.target === nodeId && x.targetHandle === 'in');
    return e ? values[e.source] : undefined;
}

/** An LED bank shows several bits at once — one device instead of N LEDs. Its
 *  per-bit live state, read from inputs d0..d(bits-1) (each 0/1/undefined). */
export function ledBankValues (nodeId, rfEdges, values, bits) {
    const out = [];
    for (let i = 0; i < bits; i++) {
        const e = (rfEdges || []).find(x => x.target === nodeId && x.targetHandle === `d${i}`);
        out.push(e ? values[e.source] : undefined);
    }
    return out;
}
