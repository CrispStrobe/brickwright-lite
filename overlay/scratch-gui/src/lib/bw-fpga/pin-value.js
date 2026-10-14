/**
 * Fold a design's driven output pins into ONE number — so the FPGA tab can show
 * its outputs as a digit on a seven-segment widget, not only as one indicator
 * per pin. The lowest pin number is the least-significant bit (a counter on pins
 * 15–18 then reads 0,1,2,3,… as it counts), which matches how the demo board and
 * the examples order their LED pins.
 *
 * Pure and framework-free; unit-tested.
 *
 * @module
 */

/**
 * @param {Array<{pin:number, high:boolean}>} leds  driven pins and their levels
 * @returns {number} the unsigned value, LSB = the lowest pin number
 */
export function pinsToValue (leds) {
    const sorted = [...(leds || [])].sort((a, b) => a.pin - b.pin);
    return sorted.reduce((acc, {high}, i) => acc | ((high ? 1 : 0) << i), 0);
}
