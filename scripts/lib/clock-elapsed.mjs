// Elapsed time between two Date.now() readings of the controlled browser
// clock. The gate installs the clock at time 0 and readings are fractional
// milliseconds that the clock builds up by adding timer steps, so their float
// difference carries accumulated rounding (CI observed 1000.0000000000364 for
// a correct one-second advance). Playwright's clock advances in whole
// milliseconds (runFor and timer delays are integer ms), so a real clock error
// is at least one millisecond; rounding over at most 1000 steps at these
// magnitudes (< 1e9 ms) stays below 1e-4 ms. Accept |difference - expected| up
// to 1e-3 ms: rounding passes, any real error (or a fraction of one at
// 0.01 ms and above) fails.
export const ELAPSED_TOLERANCE_MS = 1e-3;
export function elapsedMatches(before, after, expectedMs) {
    if (![before, after, expectedMs].every(Number.isFinite)) return false;
    return Math.abs((after - before) - expectedMs) <= ELAPSED_TOLERANCE_MS;
}
