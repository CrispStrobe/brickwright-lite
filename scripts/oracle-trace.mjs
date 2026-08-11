/*
 * Black-box oracle trace contract.
 *
 * This module deliberately knows nothing about simavr, uCsim, PICSimLab, or
 * Velxio internals. External runners convert their output into the small row
 * shape accepted here; Brickwright compares only the observable pin trace.
 * It is test tooling, never imported by the shipped GUI.
 */

function asBigInt(value, name) {
    try {
        return BigInt(value);
    } catch {
        throw new TypeError(`${name} must be an integer`);
    }
}

/** Convert an oracle row to the canonical, simulator-independent shape. */
export function normalizeTrace(rows, {clockHz = null} = {}) {
    if (!Array.isArray(rows)) throw new TypeError('trace must be an array');
    const hz = clockHz == null ? null : asBigInt(clockHz, 'clockHz');
    if (hz !== null && hz <= 0n) throw new RangeError('clockHz must be positive');

    const normalized = rows.map((row, index) => {
        if (!row || typeof row !== 'object') throw new TypeError(`trace row ${index} is not an object`);
        let timeNs;
        if (row.timeNs !== undefined) timeNs = asBigInt(row.timeNs, `trace row ${index}.timeNs`);
        else if (row.cycle !== undefined && hz !== null) {
            const cycle = asBigInt(row.cycle, `trace row ${index}.cycle`);
            timeNs = (cycle * 1_000_000_000n) / hz;
        } else throw new TypeError(`trace row ${index} needs timeNs or cycle plus clockHz`);
        if (timeNs < 0n) throw new RangeError(`trace row ${index} has negative time`);
        if (typeof row.pin !== 'string' || !row.pin) throw new TypeError(`trace row ${index} needs pin`);
        const value = Number(row.value);
        if (value !== 0 && value !== 1) throw new TypeError(`trace row ${index} value must be 0 or 1`);
        return {timeNs, pin: row.pin.toUpperCase(), value};
    });

    normalized.sort((a, b) => a.timeNs < b.timeNs ? -1 : a.timeNs > b.timeNs ? 1 : a.pin.localeCompare(b.pin));
    const result = [];
    const last = new Map();
    for (const row of normalized) {
        if (last.get(row.pin) === row.value) continue;
        last.set(row.pin, row.value);
        result.push(row);
    }
    return result;
}

/** Compare observable traces while keeping the first useful mismatch. */
export function compareTraces(expected, actual) {
    const left = expected.map(({timeNs, pin, value}) => ({timeNs: String(timeNs), pin, value}));
    const right = actual.map(({timeNs, pin, value}) => ({timeNs: String(timeNs), pin, value}));
    if (left.length !== right.length) {
        return {equal: false, reason: `different edge counts: ${left.length} vs ${right.length}`, index: Math.min(left.length, right.length)};
    }
    for (let i = 0; i < left.length; i++) {
        if (JSON.stringify(left[i]) !== JSON.stringify(right[i])) {
            return {equal: false, reason: 'edge mismatch', index: i, expected: left[i], actual: right[i]};
        }
    }
    return {equal: true};
}
