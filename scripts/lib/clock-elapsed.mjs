// Elapsed time between two Date.now() readings of a controlled browser clock.
// The readings can be fractional milliseconds (the gate installs its clock at
// time 0), so their float difference is only exact to a few units in the last
// place of the operands
// (about 2.3e-13 ms near 1000). Allow 4 ULPs of the larger operand, no more:
// any real clock error (a skipped or extra millisecond, or a fraction of one
// above that) is still reported.
export function elapsedMatches(before, after, expectedMs) {
    if (![before, after, expectedMs].every(Number.isFinite)) return false;
    const magnitude = Math.max(Math.abs(before), Math.abs(after), 1);
    const ulp = 2 ** (Math.floor(Math.log2(magnitude)) - 52);
    return Math.abs((after - before) - expectedMs) <= 4 * ulp;
}
