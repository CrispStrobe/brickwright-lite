/**
 * Engineering inputs on the live debugger target. This is not a second device
 * model or a sequential-channel fallback; LabWired owns transaction validation
 * and emits the one recorded input fact.
 */
export function createEngineeringInputRoute ({getTarget, beforeWrite = () => ({accepted: true}),
    onApplied = () => {}}) {
    if (typeof getTarget !== 'function' || typeof beforeWrite !== 'function' ||
        typeof onApplied !== 'function') throw new TypeError('engineering input route needs callbacks');
    return {
        discoverInputs () {
            const target = getTarget();
            if (!target) return {unsupported: 'nothing is running yet'};
            if (typeof target.discoverInputs !== 'function') {
                return {unsupported: 'this target has no engineering input discovery'};
            }
            try {
                const result = target.discoverInputs();
                return Array.isArray(result) || typeof result?.unsupported === 'string' ? result
                    : {unsupported: 'the target returned invalid input metadata'};
            } catch (error) {
                return {unsupported: error?.message || String(error)};
            }
        },
        setInputs (sets) {
            const target = getTarget();
            if (!target) return {accepted: false, code: 'inputs-unavailable', reason: 'nothing is running yet'};
            if (typeof target.setInputs !== 'function') {
                return {accepted: false, code: 'inputs-unavailable', reason: 'this target has no atomic engineering inputs'};
            }
            if (!Array.isArray(sets)) {
                return {accepted: false, code: 'input-rejected', reason: 'engineering inputs must be an array'};
            }
            // Match instruction stepping: leave historical inspection through
            // the runner's existing fork/recording boundary BEFORE a live write.
            const prepared = beforeWrite();
            if (prepared?.accepted !== true) return prepared?.accepted === false ? prepared : {
                accepted: false, code: 'input-history-unavailable', reason: 'input history did not admit the write'
            };
            let result;
            try { result = target.setInputs(sets); } catch (error) {
                return {accepted: false, code: 'input-rejected', reason: error?.message || String(error)};
            }
            if (typeof result?.accepted !== 'boolean') {
                return {accepted: false, code: 'invalid-input-receipt', reason: 'target returned no input verdict'};
            }
            if (result.accepted) {
                try { onApplied(); } catch { /* a refresh failure cannot undo an accepted engine write */ }
            }
            return result;
        }
    };
}
