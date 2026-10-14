const refusal = (code, reason) => ({accepted: false, code, reason});

/** Coordinate halt-occurrence selection with an already verified replay path. */
export function createReverseContinueCoordinator ({canReverse, haltOccurrences, reverseToEvent}) {
    let occurrenceCursor = null;

    const status = beforeCursor => {
        const capability = canReverse();
        if (!capability.accepted) return capability;
        let occurrence;
        try {
            occurrence = occurrenceCursor === null ?
                haltOccurrences.previousBeforeBoundary(beforeCursor) :
                haltOccurrences.previousByOccurrenceCursor(occurrenceCursor);
        } catch (error) {
            return refusal('reverse-history-unavailable', error?.message || String(error));
        }
        return occurrence === null ?
            refusal('no-previous-breakpoint', 'No earlier recorded breakpoint halt is retained') : {
                accepted: true,
                beforeCursor,
                eventCursor: occurrence.boundaryCursor,
                occurrenceCursor: occurrence.occurrenceCursor,
                matchingIds: occurrence.matchingIds,
                generation: occurrence.generation
            };
    };

    return {
        status,
        reverse (beforeCursor) {
            const selected = status(beforeCursor);
            if (!selected.accepted) return selected;
            const result = reverseToEvent(selected.eventCursor);
            if (!result.accepted) return result;
            occurrenceCursor = selected.occurrenceCursor;
            return {...result, matchingIds: selected.matchingIds,
                occurrenceCursor: selected.occurrenceCursor, generation: selected.generation};
        },
        reset () { occurrenceCursor = null; }
    };
}

export default createReverseContinueCoordinator;
