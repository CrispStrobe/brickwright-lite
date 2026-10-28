/**
 * A clocked design's outputs, over time — the second rung of the FPGA visual
 * analog (schematic → WAVEFORMS → gate builder). The gate-level sim can be
 * stepped one cycle at a time; a TRACE is the output values recorded at each
 * cycle. This module turns a trace into drawable LANES: one per 1-bit signal,
 * and a multi-bit output expanded into a lane per bit — so a 4-bit counter
 * reads as four square waves, LSB fast, MSB slow, exactly how a logic analyser
 * shows it.
 *
 * Pure and engine-free: it shapes numbers the simulator already produced, so it
 * is fully testable without digitaljs or a browser.
 *
 * @module
 */

/**
 * One sample's value for a given bit: 0, 1, or 'x' (undefined/unknown).
 * A value may arrive as a boolean, a number, or a bit string ('0101'); an
 * undefined value stays 'x' rather than being coerced to 0.
 */
function bitOf (value, bit) {
    if (value === undefined || value === null) return 'x';
    if (typeof value === 'boolean') return bit === 0 ? (value ? 1 : 0) : 0;
    if (typeof value === 'string') {
        if (/[^01]/.test(value)) return 'x';
        // bit 0 is the LSB — the rightmost character of the string.
        const idx = value.length - 1 - bit;
        return idx >= 0 && idx < value.length ? Number(value[idx]) : 0;
    }
    if (typeof value === 'number') return (value >> bit) & 1;
    return 'x';
}

/**
 * Turn a clock trace into signal lanes.
 *
 * @param {Array<{cycle:number, values:Object}>} trace  per-cycle output values
 * @param {Object} ports  {name: {direction, width}} — only OUTPUTS become lanes
 * @returns {Array<{name:string, samples:Array<0|1|'x'>}>}
 *   one lane per bit, MSB first within a bus (led[3] above led[0]).
 */
export function traceToLanes (trace, ports) {
    const cycles = (trace || []).map(t => t.cycle);
    const lanes = [];
    for (const [name, p] of Object.entries(ports || {})) {
        if (p.direction !== 'output') continue;
        const width = Math.max(1, p.width || 1);
        // MSB first, so a bus reads top-to-bottom like a written number.
        for (let bit = width - 1; bit >= 0; bit--) {
            const laneName = width === 1 ? name : `${name}[${bit}]`;
            const samples = (trace || []).map(t => bitOf(t.values ? t.values[name] : undefined, bit));
            lanes.push({name: laneName, samples});
        }
    }
    return {lanes, cycles};
}

/**
 * Build an SVG polyline for one lane's square wave. Given per-cycle 0/1/x
 * samples and geometry, it returns the point string: a step function that holds
 * each level for one cycle and jumps between them. 'x' segments are reported
 * separately so the caller can draw them differently (a signal that has no
 * defined level is not a low one).
 *
 * @returns {{points:string, unknown:Array<[number,number]>}}
 *   points: "x,y x,y …" for the defined (0/1) step line;
 *   unknown: [x0,x1] spans (in px) where the value was 'x'.
 */
export function laneWavePoints (samples, {cycleW, laneH, pad = 3}) {
    const hi = pad;
    const lo = laneH - pad;
    const pts = [];
    const unknown = [];
    let prevY = null;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const x0 = i * cycleW;
        const x1 = (i + 1) * cycleW;
        if (s === 'x') { unknown.push([x0, x1]); prevY = null; continue; }
        const y = s === 1 ? hi : lo;
        // a transition from the previous cycle draws a vertical edge
        if (prevY !== null && prevY !== y) pts.push(`${x0},${prevY}`);
        pts.push(`${x0},${y}`, `${x1},${y}`);
        prevY = y;
    }
    return {points: pts.join(' '), unknown};
}
