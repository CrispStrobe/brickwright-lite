/** Transactional binary search for the first divergent recorded event. */

const refusal = (code, reason, details = {}) => Object.freeze({accepted: false, code, reason, ...details});
const cursor = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.branchId !== 'string' || !value.branchId ||
        !Number.isSafeInteger(value.eventCursor) || value.eventCursor < 0) {
        throw new TypeError(`${label} must be a branch-qualified safe event cursor`);
    }
    return Object.freeze({branchId: value.branchId, eventCursor: value.eventCursor});
};
const rejected = value => value === false || value?.accepted === false || value?.refused;

export function createDivergenceBisection ({captureSource, restoreSource, probe, maxProbes = 64}) {
    if (typeof captureSource !== 'function' || typeof restoreSource !== 'function' ||
        typeof probe !== 'function') throw new TypeError('bisection requires capture, restore, and probe functions');
    if (!Number.isSafeInteger(maxProbes) || maxProbes < 3 || maxProbes > 256) {
        throw new RangeError('bisection maxProbes must be 3..256');
    }

    return Object.freeze({
        async bisect ({good, bad}) {
            let left; let right;
            try { left = cursor(good, 'good'); right = cursor(bad, 'bad'); } catch (error) {
                return refusal('invalid-bisection-range', error.message);
            }
            if (left.branchId !== right.branchId) return refusal('bisection-branch-mismatch',
                'good and bad boundaries must belong to the same branch');
            if (left.eventCursor >= right.eventCursor) return refusal('invalid-bisection-range',
                'known-good cursor must precede the bad boundary');
            let source;
            try { source = await captureSource(); } catch (error) {
                return refusal('bisection-source-capture-failed', error?.message || String(error));
            }
            if (source === undefined || rejected(source)) return refusal('bisection-source-capture-failed',
                source?.reason || source?.refused || 'source capture returned no state');
            let probes = 0;
            const inspect = async at => {
                if (++probes > maxProbes) return refusal('bisection-probe-limit', 'bisection exceeded its probe bound');
                let result; let failure = null;
                try {
                    result = await probe(Object.freeze({branchId: left.branchId, eventCursor: at}),
                        Object.freeze({passive: true}));
                    if (rejected(result)) failure = refusal('bisection-probe-refused',
                        result?.reason || result?.refused || 'replay probe was refused', {probeCursor: at});
                    else if (!result || result.passive !== true || result.deterministic !== true ||
                        result.externalEffects !== 0 ||
                        typeof result.matches !== 'boolean') failure = refusal('bisection-probe-not-passive',
                        'probe did not provide a deterministic passive receipt', {probeCursor: at});
                } catch (error) {
                    failure = refusal('bisection-probe-failed', error?.message || String(error), {probeCursor: at});
                }
                try {
                    const restored = await restoreSource(source);
                    if (rejected(restored)) throw new Error(restored?.reason || restored?.refused || 'restore refused');
                } catch (error) {
                    return refusal('bisection-source-restore-failed', error?.message || String(error),
                        {probeCursor: at, priorFailureCode: failure?.code || null});
                }
                return failure || Object.freeze({accepted: true, matches: result.matches});
            };

            const goodResult = await inspect(left.eventCursor);
            if (!goodResult.accepted) return goodResult;
            if (!goodResult.matches) return refusal('bisection-good-diverged',
                'the supplied known-good checkpoint does not match', {probeCursor: left.eventCursor, probes});
            const badResult = await inspect(right.eventCursor);
            if (!badResult.accepted) return badResult;
            if (badResult.matches) return refusal('bisection-bad-matched',
                'the supplied bad boundary does not diverge', {probeCursor: right.eventCursor, probes});

            let lo = left.eventCursor; let hi = right.eventCursor;
            while (hi - lo > 1) {
                const middle = lo + Math.floor((hi - lo) / 2);
                const result = await inspect(middle);
                if (!result.accepted) return result;
                if (result.matches) lo = middle; else hi = middle;
            }
            return Object.freeze({accepted: true, branchId: left.branchId,
                goodCursor: Object.freeze({branchId: left.branchId, eventCursor: lo}),
                badCursor: right, firstMismatchCursor: Object.freeze({branchId: left.branchId, eventCursor: hi}),
                firstMismatchEventSeq: hi - 1, probes});
        }
    });
}

export default createDivergenceBisection;
