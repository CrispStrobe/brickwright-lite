/**
 * Bounded storage for immutable facts about debugger halt occurrences.
 *
 * This deliberately stores summaries rather than events, breakpoint specs or
 * machine state. Eviction is explicit so a recording owner can align it with
 * a retained checkpoint boundary; reaching capacity never silently discards
 * an occurrence.
 */

const DEFAULT_MAX_OCCURRENCES = 4096;
const FIELDS = new Set([
    'boundaryCursor', 'triggerEventSeq', 'matchingIds', 'generation', 'stopSide', 'source'
]);

export class HaltOccurrenceLedgerError extends Error {
    constructor (code, message, details = {}) {
        super(message);
        this.name = 'HaltOccurrenceLedgerError';
        this.code = code;
        this.details = details;
    }
}

const fail = (code, message, details) => {
    throw new HaltOccurrenceLedgerError(code, message, details);
};

const safeNonNegative = (value, label) => {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
    }
};

const upperBound = (items, value, select) => {
    let low = 0;
    let high = items.length;
    while (low < high) {
        const middle = low + ((high - low) >> 1);
        if (select(items[middle]) < value) low = middle + 1;
        else high = middle;
    }
    return low;
};

export function createHaltOccurrenceLedger ({maxOccurrences = DEFAULT_MAX_OCCURRENCES} = {}) {
    safeNonNegative(maxOccurrences, 'maxOccurrences');
    if (maxOccurrences < 1) throw new RangeError('maxOccurrences must be at least one');
    let occurrences = [];
    let nextOccurrenceCursor = 0;
    let evictedOccurrences = 0;
    let lastBoundaryCursor = null;

    const copy = occurrence => ({...occurrence, matchingIds: [...occurrence.matchingIds]});

    return {
        append (summary) {
            if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
                throw new TypeError('Halt occurrence summary must be an object');
            }
            const unexpected = Object.keys(summary).filter(key => !FIELDS.has(key));
            if (unexpected.length) {
                fail('UNSUPPORTED_FIELD', 'Halt occurrence ledger accepts summaries only', {fields: unexpected});
            }
            safeNonNegative(summary.boundaryCursor, 'boundaryCursor');
            if (summary.triggerEventSeq !== null) {
                safeNonNegative(summary.triggerEventSeq, 'triggerEventSeq');
            }
            safeNonNegative(summary.generation, 'generation');
            if (summary.stopSide !== 'before' && summary.stopSide !== 'after') {
                throw new TypeError("stopSide must be 'before' or 'after'");
            }
            if (typeof summary.source !== 'string' || summary.source.length === 0) {
                throw new TypeError('source must be a non-empty string');
            }
            if (!Array.isArray(summary.matchingIds)) {
                throw new TypeError('matchingIds must be an array');
            }
            const matchingIds = [];
            const seen = new Set();
            for (const id of summary.matchingIds) {
                if (typeof id !== 'string' || id.length === 0) {
                    throw new TypeError('matchingIds must contain non-empty strings');
                }
                if (!seen.has(id)) {
                    seen.add(id);
                    matchingIds.push(id);
                }
            }
            if (lastBoundaryCursor !== null && summary.boundaryCursor < lastBoundaryCursor) {
                fail('BOUNDARY_ORDER', 'Halt occurrence boundaries must be monotonic', {
                    previous: lastBoundaryCursor,
                    actual: summary.boundaryCursor
                });
            }
            if (occurrences.length >= maxOccurrences) {
                fail('CAPACITY_EXCEEDED', 'Evict at a retained checkpoint boundary before appending', {
                    maxOccurrences
                });
            }
            const occurrence = Object.freeze({
                occurrenceCursor: nextOccurrenceCursor++,
                boundaryCursor: summary.boundaryCursor,
                triggerEventSeq: summary.triggerEventSeq,
                matchingIds: Object.freeze(matchingIds),
                generation: summary.generation,
                stopSide: summary.stopSide,
                source: summary.source
            });
            occurrences.push(occurrence);
            lastBoundaryCursor = occurrence.boundaryCursor;
            return copy(occurrence);
        },

        /** Return the occurrence strictly before an absolute occurrence cursor. */
        previousByOccurrenceCursor (fromCursor) {
            safeNonNegative(fromCursor, 'fromCursor');
            const firstRetained = occurrences.length ? occurrences[0].occurrenceCursor : nextOccurrenceCursor;
            if (fromCursor < firstRetained || fromCursor > nextOccurrenceCursor) {
                fail('INVALID_CURSOR', 'Occurrence cursor is outside the retained range', {
                    cursor: fromCursor,
                    min: firstRetained,
                    max: nextOccurrenceCursor
                });
            }
            const index = upperBound(occurrences, fromCursor, item => item.occurrenceCursor) - 1;
            return index < 0 ? null : copy(occurrences[index]);
        },

        /** Return the newest occurrence whose boundary is strictly before `boundaryCursor`. */
        previousBeforeBoundary (boundaryCursor) {
            safeNonNegative(boundaryCursor, 'boundaryCursor');
            const index = upperBound(occurrences, boundaryCursor, item => item.boundaryCursor) - 1;
            return index < 0 ? null : copy(occurrences[index]);
        },

        /** Drop only occurrences preceding a retained checkpoint boundary. */
        evictBeforeCheckpoint (boundaryCursor) {
            safeNonNegative(boundaryCursor, 'boundaryCursor');
            const count = upperBound(occurrences, boundaryCursor, item => item.boundaryCursor);
            occurrences = occurrences.slice(count);
            evictedOccurrences += count;
            return count;
        },

        summaries () {
            return occurrences.map(copy);
        },

        retention () {
            return {
                maxOccurrences,
                retainedOccurrences: occurrences.length,
                evictedOccurrences,
                nextOccurrenceCursor,
                firstOccurrenceCursor: occurrences.length ? occurrences[0].occurrenceCursor : null
            };
        },

        clear () {
            occurrences = [];
            nextOccurrenceCursor = 0;
            evictedOccurrences = 0;
            lastBoundaryCursor = null;
        }
    };
}
