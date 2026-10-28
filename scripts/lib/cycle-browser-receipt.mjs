export const CYCLE_BROWSER_LIMITS = Object.freeze({
    maxWasmBytes: 64 * 1024,
    maxCompileMs: 5000,
    maxInstantiateMs: 5000,
    maxBatchMs: 5000,
    benchmarkTicks: 200000,
    maxJsWasmCrossings: 2
});

const finiteWithin = (value, maximum) => Number.isFinite(value) && value >= 0 && value <= maximum;

/** Fail-closed promotion audit; returns independent errors for artifact reports and mutation tests. */
export function auditCycleBrowserReceipt(receipt, limits = CYCLE_BROWSER_LIMITS) {
    const errors = [];
    if (!receipt || receipt.schema !== 1) errors.push('schema');
    if (receipt?.runtime !== 'chromium-wasm') errors.push('runtime');
    if (!Number.isSafeInteger(receipt?.wasmBytes) || receipt.wasmBytes <= 0 ||
        receipt.wasmBytes > limits.maxWasmBytes) errors.push('wasmBytes');
    if (!finiteWithin(receipt?.compileMs, limits.maxCompileMs)) errors.push('compileMs');
    if (!finiteWithin(receipt?.instantiateMs, limits.maxInstantiateMs)) errors.push('instantiateMs');
    if (!finiteWithin(receipt?.batchMs, limits.maxBatchMs) || receipt.batchMs === 0) errors.push('batchMs');
    if (receipt?.benchmarkTicks !== limits.benchmarkTicks) errors.push('benchmarkTicks');
    if (!Number.isFinite(receipt?.ticksPerSecond) || receipt.ticksPerSecond <= 0) errors.push('ticksPerSecond');
    if (!Number.isSafeInteger(receipt?.jsWasmCrossings) || receipt.jsWasmCrossings <= 0 ||
        receipt.jsWasmCrossings > limits.maxJsWasmCrossings) errors.push('jsWasmCrossings');
    if (!Number.isSafeInteger(receipt?.stateBytes) || receipt.stateBytes <= 0 ||
        receipt.stateBytes > receipt.wasmBytes) errors.push('stateBytes');
    if (!Number.isSafeInteger(receipt?.traceHash) || receipt.traceHash === 0) errors.push('traceHash');
    return {accepted: errors.length === 0, errors};
}
