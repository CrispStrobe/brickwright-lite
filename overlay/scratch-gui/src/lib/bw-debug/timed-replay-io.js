const refusal = (code, reason, details = {}) => Object.freeze({accepted: false, code, reason, ...details});
const promiseLike = value => value && typeof value.then === 'function';
const clone = value => structuredClone(value);
const ticks = value => {
    try {
        const result = BigInt(value);
        if (result < 0n) throw new Error();
        return result;
    } catch {
        throw new TypeError('recorded input time ticks must be a non-negative integer');
    }
};
const safeTicks = value => {
    try {
        return {accepted: true, value: ticks(value)};
    } catch (error) {
        return {accepted: false, reason: error.message};
    }
};
const normalizeInput = input => {
    if (!input || !Number.isSafeInteger(input.cursor) || input.cursor < 0 ||
        !input.time || typeof input.time.domain !== 'string' || !input.time.domain ||
        typeof input.producer !== 'string' || !input.producer) {
        throw new TypeError('timed replay input requires cursor, time, and producer');
    }
    return Object.freeze({...clone(input), time: Object.freeze({...clone(input.time), ticks: ticks(input.time.ticks)})});
};

/** Suppress historical external effects and publish one complete state afterwards. */
export function createHistoricalOutputGate ({publishState}) {
    if (typeof publishState !== 'function') throw new TypeError('output gate requires publishState');
    let historical = false;
    let synchronized = false;
    let suppressed = 0;
    return Object.freeze({
        begin () {
            if (historical) return refusal('historical-output-active', 'historical output suppression is already active');
            historical = true;
            synchronized = false;
            suppressed = 0;
            return Object.freeze({accepted: true});
        },
        emit (effect) {
            if (historical) {
                suppressed++;
                return Object.freeze({accepted: true, suppressed: true});
            }
            publishState(clone(effect), {complete: false});
            return Object.freeze({accepted: true, suppressed: false});
        },
        resynchronize (completeState) {
            if (!historical) return refusal('historical-output-inactive', 'no historical replay awaits resynchronization');
            if (synchronized) return refusal('output-already-synchronized', 'output state was already synchronized');
            // Flip before invoking user code: a throwing sink cannot cause a
            // second publication of a partially applied external state.
            historical = false;
            synchronized = true;
            publishState(clone(completeState), {complete: true});
            return Object.freeze({accepted: true, suppressedEffects: suppressed});
        },
        status: () => Object.freeze({historical, synchronized, suppressedEffects: suppressed})
    });
}

/**
 * Replay timestamped inputs at exact target-declared boundaries. The target's
 * `replayToInputBoundary` must advance its external time even while its CPU is
 * in HALT/WAI; returning an instruction boundary at a different time is a
 * visible refusal, never an approximation.
 */
export function createTimedInputReplay ({target, inputs, outputGate, normalizeTimeDomain = value => value}) {
    if (!target || typeof target.debugTime !== 'function' ||
        typeof target.replayToInputBoundary !== 'function' ||
        typeof target.applyReplayInput !== 'function') {
        throw new TypeError('timed input replay requires debugTime, replayToInputBoundary, and applyReplayInput');
    }
    if (!outputGate || typeof outputGate.begin !== 'function' || typeof outputGate.resynchronize !== 'function') {
        throw new TypeError('timed input replay requires a historical output gate');
    }
    const queue = (Array.isArray(inputs) ? inputs : []).map(normalizeInput);
    for (let index = 1; index < queue.length; index++) {
        if (queue[index].cursor <= queue[index - 1].cursor) {
            throw new TypeError('recorded input cursors must be strictly increasing');
        }
        const prior = queue[index - 1].time;
        const next = queue[index].time;
        if (normalizeTimeDomain(prior.domain) === normalizeTimeDomain(next.domain) && next.ticks < prior.ticks) {
            throw new TypeError('recorded input time must not decrease within a clock domain');
        }
    }
    let index = 0;
    let active = false;
    let finished = false;

    const outcomeReason = (value, operation) => {
        if (promiseLike(value)) return `${operation} must be synchronous`;
        if (value === false || value?.accepted === false || value?.refused) {
            return value?.reason || value?.refused || `${operation} was refused`;
        }
        return null;
    };

    return Object.freeze({
        start () {
            if (active || finished) return refusal('timed-replay-lifecycle', 'timed replay cannot be started again');
            const started = outputGate.begin();
            if (!started?.accepted) return started;
            active = true;
            return Object.freeze({accepted: true, remaining: queue.length});
        },
        replayNextBoundary () {
            if (!active) return refusal('timed-replay-inactive', 'start timed replay before applying inputs');
            if (index >= queue.length) return Object.freeze({accepted: true, complete: true, applied: 0});
            const first = queue[index];
            let now;
            try {
                now = target.debugTime();
            } catch (error) {
                return refusal('input-clock-unavailable', 'target time could not be read',
                    {cursor: first.cursor, cause: error.message});
            }
            if (promiseLike(now) || !now || normalizeTimeDomain(now.domain) !==
                normalizeTimeDomain(first.time.domain)) {
                return refusal('input-clock-mismatch', 'target time cannot be ordered against the next recorded input',
                    {cursor: first.cursor});
            }
            const normalizedNow = safeTicks(now.ticks);
            if (!normalizedNow.accepted) {
                return refusal('input-clock-invalid', 'target returned an invalid debug time',
                    {cursor: first.cursor, cause: normalizedNow.reason});
            }
            if (normalizedNow.value > first.time.ticks) {
                return refusal('input-boundary-passed', 'target is already past the next recorded input',
                    {cursor: first.cursor});
            }
            let advanced;
            try {
                advanced = target.replayToInputBoundary(clone(first.time));
            } catch (error) {
                return refusal('input-boundary-error', 'target failed while advancing to the recorded input',
                    {cursor: first.cursor, cause: error.message});
            }
            const advanceRefusal = outcomeReason(advanced, 'input-boundary advance');
            if (advanceRefusal) return refusal('input-boundary-refused', advanceRefusal, {cursor: first.cursor});
            let boundary;
            try {
                boundary = advanced?.time ?? target.debugTime();
            } catch (error) {
                return refusal('input-boundary-error', 'target time could not be read after boundary advance',
                    {cursor: first.cursor, cause: error.message});
            }
            const boundaryTicks = safeTicks(boundary?.ticks);
            if (promiseLike(boundary) || normalizeTimeDomain(boundary?.domain) !==
                normalizeTimeDomain(first.time.domain) || !boundaryTicks.accepted ||
                boundaryTicks.value !== first.time.ticks) {
                return refusal('input-boundary-inexact', 'target did not stop at the exact recorded input time',
                    {cursor: first.cursor, expected: clone(first.time), actual: clone(boundary)});
            }
            let applied = 0;
            while (index < queue.length && normalizeTimeDomain(queue[index].time.domain) ===
                normalizeTimeDomain(first.time.domain) && queue[index].time.ticks === first.time.ticks) {
                const input = queue[index];
                let result;
                try {
                    result = target.applyReplayInput(clone(input));
                } catch (error) {
                    return refusal('timed-input-error', 'target failed while applying a recorded input',
                        {cursor: input.cursor, applied, cause: error.message});
                }
                const applyRefusal = outcomeReason(result, 'recorded input application');
                if (applyRefusal) return refusal('timed-input-refused', applyRefusal,
                    {cursor: input.cursor, applied});
                index++;
                applied++;
            }
            return Object.freeze({accepted: true, complete: index === queue.length,
                applied, boundary: clone(first.time), nextCursor: queue[index]?.cursor ?? null});
        },
        restoreAndResume (completeOutputState) {
            if (!active) return refusal('timed-replay-inactive', 'no historical replay awaits resume');
            if (index !== queue.length) return refusal('timed-replay-inputs-pending',
                'all retained inputs must be replayed before output resynchronization', {remaining: queue.length - index});
            const result = outputGate.resynchronize(completeOutputState);
            if (!result?.accepted) return result;
            active = false;
            finished = true;
            return Object.freeze({...result, resumed: true});
        },
        status: () => Object.freeze({active, finished, nextCursor: queue[index]?.cursor ?? null,
            remaining: queue.length - index})
    });
}

export default createTimedInputReplay;
