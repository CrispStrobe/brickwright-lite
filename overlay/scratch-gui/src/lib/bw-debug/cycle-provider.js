/**
 * Fail-closed negotiation for debugger cycle engines.
 *
 * A cycle provider describes an execution boundary the core can actually stop
 * at. It is deliberately separate from opcode timing: predicted totals are
 * useful annotations, but they are not resumable execution and cannot unlock
 * the cycle-step control.
 */

export const CYCLE_PROVIDER_SCHEMA = 1;

const FIDELITIES = new Set(['recorded', 'predicted', 'reconstructed']);

/** Validate and freeze a provider description supplied by a debug target. */
export function normalizeCycleProvider (raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new TypeError('cycle provider must be an object');
    }
    if (raw.schema !== CYCLE_PROVIDER_SCHEMA) {
        throw new Error(`unsupported cycle provider schema ${String(raw.schema)}`);
    }
    for (const field of ['engine', 'boundary', 'timeDomain', 'fidelity']) {
        if (typeof raw[field] !== 'string' || raw[field].length === 0) {
            throw new TypeError(`cycle provider ${field} must be a non-empty string`);
        }
    }
    if (!FIDELITIES.has(raw.fidelity)) {
        throw new TypeError(`unknown cycle provider fidelity ${String(raw.fidelity)}`);
    }
    const clockHz = raw.clockHz;
    if (clockHz !== undefined && (!Number.isSafeInteger(clockHz) || clockHz <= 0)) {
        throw new TypeError('cycle provider clockHz must be a positive safe integer');
    }
    if (!Array.isArray(raw.signals) ||
        raw.signals.some(signal => typeof signal !== 'string' || signal.length === 0)) {
        throw new TypeError('cycle provider signals must be an array of non-empty strings');
    }
    const signals = [...new Set(raw.signals)];
    return Object.freeze({
        schema: CYCLE_PROVIDER_SCHEMA,
        engine: raw.engine,
        boundary: raw.boundary,
        timeDomain: raw.timeDomain,
        ...(clockHz === undefined ? {} : {clockHz}),
        fidelity: raw.fidelity,
        resumable: raw.resumable === true,
        signals: Object.freeze(signals),
        checkpoint: raw.checkpoint === true
    });
}

/**
 * Select a target's native cycle engine without inferring one from instruction
 * timing. A recorded, resumable provider must agree with the target's cycle
 * step capability; all other descriptions remain annotations only.
 */
export function negotiateCycleProvider (target) {
    if (!target || typeof target.cycleProvider !== 'function') return null;
    const raw = target.cycleProvider();
    if (raw == null) return null;
    const provider = normalizeCycleProvider(raw);
    if (provider.fidelity === 'recorded' && provider.resumable) {
        if (typeof target.capabilities !== 'function' ||
            !(target.capabilities().steps || []).includes('cycle')) {
            throw new Error('recorded resumable cycle provider requires an explicit cycle step capability');
        }
    }
    return provider;
}
